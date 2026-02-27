"""
Medicaid fee-schedule scraper.

Strategies:
  - html_links:   parse <a> tags from a static HTML page (most states)
  - direct_files:  download a known list of URLs directly (fallback for JS-heavy sites)
  - sitemap:       parse a sitemap XML for file links
"""

import hashlib
import logging
import re
import time
from pathlib import Path
from urllib.parse import urljoin, urlparse, unquote

import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

# Extensions we care about — also match inside query strings
FILE_EXTS = {".xlsx", ".xls", ".csv"}
# Also grab PDFs for completeness, but flag them
OPTIONAL_EXTS = {".pdf"}
ALL_EXTS = FILE_EXTS | OPTIONAL_EXTS

DOWNLOAD_DIR = Path("data/downloads")
DIAGNOSTICS_DIR = Path("data/diagnostics")

MAX_RETRIES = 3
RETRY_BACKOFF = 2  # seconds, doubled each retry
RATE_LIMIT = 0.5   # seconds between downloads


def checksum(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


# ── HTTP helpers ──────────────────────────────────────────────

def _request_with_retry(url: str, timeout: int = 60, stream: bool = False) -> requests.Response | None:
    """GET with exponential backoff retries."""
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(
                url, headers=HEADERS, timeout=timeout,
                allow_redirects=True, stream=stream,
            )
            r.raise_for_status()
            return r
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code if e.response else 0
            if status == 429 or status >= 500:
                wait = RETRY_BACKOFF * (2 ** attempt)
                log.warning("  HTTP %d for %s — retrying in %ds", status, url, wait)
                time.sleep(wait)
                continue
            log.warning("  HTTP %d for %s — not retrying", status, url)
            return None
        except requests.exceptions.ConnectionError:
            wait = RETRY_BACKOFF * (2 ** attempt)
            log.warning("  Connection error for %s — retrying in %ds", url, wait)
            time.sleep(wait)
        except Exception as e:
            log.warning("  Request failed %s: %s", url, e)
            return None
    log.error("  All %d retries exhausted for %s", MAX_RETRIES, url)
    return None


def _fetch_html(url: str) -> str | None:
    """Fetch and validate an HTML page."""
    r = _request_with_retry(url, timeout=30)
    if not r:
        return None

    ct = r.headers.get("Content-Type", "")
    if "text/html" not in ct:
        log.warning("  Unexpected content-type %s for %s", ct, url)
        return None

    body = r.text

    # Detect Cloudflare / WAF / bot challenges
    block_signals = [
        "cf-browser-verification", "challenge-platform",
        "Attention Required", "Just a moment", "captcha",
    ]
    if any(s.lower() in body.lower() for s in block_signals):
        log.warning("  WAF/bot challenge detected at %s", url)
        _save_diagnostic(url, body)
        return None

    # Detect JS-only shells
    if len(body) < 1000 and body.lower().count("<a") < 2:
        log.warning("  Page looks JS-rendered or empty (%d chars) at %s", len(body), url)
        _save_diagnostic(url, body)
        # Don't return None — some small pages are legitimate
        # Let the link extraction decide if there's anything useful

    return body


def _download(url: str) -> bytes | None:
    """Download a file, validating it's not an HTML error page."""
    r = _request_with_retry(url, timeout=90)
    if not r:
        return None

    ct = r.headers.get("Content-Type", "")
    content = r.content

    # Guard: HTML error page masquerading as a file download
    if "text/html" in ct and len(content) < 10_000:
        log.warning("  Download returned HTML instead of file: %s", url)
        return None

    # Guard: empty or suspiciously small files
    if len(content) < 100:
        log.warning("  Download too small (%d bytes), skipping: %s", len(content), url)
        return None

    return content


def _save_diagnostic(url: str, body: str):
    """Save raw HTML for debugging blocked/broken pages."""
    DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
    slug = re.sub(r"[^a-zA-Z0-9_.-]", "_", urlparse(url).netloc + urlparse(url).path)[:80]
    p = DIAGNOSTICS_DIR / f"{slug}.html"
    p.write_text(body[:50_000], encoding="utf-8")
    log.info("  Diagnostic saved: %s", p)


# ── Link extraction ──────────────────────────────────────────

def _get_extension(href: str) -> str | None:
    """Extract file extension, handling query params and URL encoding."""
    # Strip query string and fragment
    clean = href.split("?")[0].split("#")[0]
    clean = unquote(clean).lower()
    # Check for known extensions
    for ext in ALL_EXTS:
        if clean.endswith(ext):
            return ext
    return None


def _extract_filename(url: str) -> str:
    """Pull a reasonable filename from a URL."""
    path = unquote(urlparse(url).path)
    fname = path.split("/")[-1]
    # Clean up encoded spaces and special chars
    fname = re.sub(r"[+%20]+", "_", fname)
    return fname or "file"


def _file_links(html: str, base_url: str, state_cfg: dict) -> list[str]:
    """
    Extract file download links from HTML.
    Handles cross-domain links (e.g., Ohio's dam.assets.ohio.gov).
    """
    soup = BeautifulSoup(html, "lxml")
    keywords = state_cfg.get("keywords", [])
    target_format = state_cfg.get("format", [])
    if isinstance(target_format, str):
        target_format = [target_format]

    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        ext = _get_extension(href)
        if not ext:
            continue

        # If format specified, filter to those extensions
        if target_format:
            wanted_exts = {f".{f.lstrip('.')}" for f in target_format}
            if ext not in wanted_exts:
                continue

        # Keyword filtering: check link text + href + parent text
        if keywords:
            searchable = " ".join([
                a.get_text(" ", strip=True),
                href,
                (a.parent.get_text(" ", strip=True) if a.parent else ""),
            ]).lower()
            if not any(kw.lower() in searchable for kw in keywords):
                continue

        # Resolve relative URLs
        full_url = href if href.startswith("http") else urljoin(base_url, href)
        links.append(full_url)

    # Deduplicate preserving order
    seen = set()
    unique = []
    for link in links:
        if link not in seen:
            seen.add(link)
            unique.append(link)

    return unique


def _find_subpage_links(html: str, base_url: str, state_cfg: dict) -> list[str]:
    """
    For states with nested pages (fee schedule index → category pages → files),
    find links to subpages that might contain file downloads.
    """
    if not state_cfg.get("follow_subpages"):
        return []

    soup = BeautifulSoup(html, "lxml")
    subpage_keywords = state_cfg.get("subpage_keywords", ["fee", "rate", "schedule"])
    subpages = []

    base_domain = urlparse(base_url).netloc

    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        full = href if href.startswith("http") else urljoin(base_url, href)

        # Stay on same domain
        if urlparse(full).netloc != base_domain:
            continue

        # Don't re-visit the same page
        if full.rstrip("/") == base_url.rstrip("/"):
            continue

        text = (a.get_text(" ", strip=True) + " " + href).lower()
        if any(kw in text for kw in subpage_keywords):
            subpages.append(full)

    return list(dict.fromkeys(subpages))[:20]  # cap at 20


# ── Scrape strategies ────────────────────────────────────────

def _scrape_html_links(state: dict, stored: dict) -> list[dict]:
    """Strategy: parse links from one or more HTML pages."""
    html = _fetch_html(state["url"])
    if not html:
        return []

    # Collect file links from main page
    links = _file_links(html, state["url"], state)

    # Optionally follow subpages
    for subpage_url in _find_subpage_links(html, state["url"], state):
        log.info("  Following subpage: %s", subpage_url)
        sub_html = _fetch_html(subpage_url)
        if sub_html:
            links.extend(_file_links(sub_html, subpage_url, state))
        time.sleep(RATE_LIMIT)

    # Deduplicate again after subpages
    links = list(dict.fromkeys(links))

    if not links:
        log.warning("  %s: No file links found", state["abbr"])
        if html:
            _save_diagnostic(state["url"], html)
        return []

    log.info("  %s: Found %d file link(s)", state["abbr"], len(links))
    return _download_links(state, links, stored)


def _scrape_direct_files(state: dict, stored: dict) -> list[dict]:
    """Strategy: download from a pre-configured list of URLs (for JS-heavy sites)."""
    urls = state.get("direct_urls", [])
    if not urls:
        log.warning("  %s: No direct_urls configured", state["abbr"])
        return []
    log.info("  %s: %d direct URL(s) configured", state["abbr"], len(urls))
    return _download_links(state, urls, stored)


# ── Download & diff ──────────────────────────────────────────

def _download_links(state: dict, links: list[str], stored: dict) -> list[dict]:
    """Download files, check against stored checksums, return changes."""
    abbr = state["abbr"]
    dest_dir = DOWNLOAD_DIR / abbr
    dest_dir.mkdir(parents=True, exist_ok=True)

    changes = []
    downloaded = 0
    skipped = 0

    for url in links:
        fname = _extract_filename(url)
        content = _download(url)
        if not content:
            skipped += 1
            continue

        downloaded += 1
        new_hash = checksum(content)
        old_hash = stored.get(url)

        if old_hash != new_hash:
            dest = dest_dir / fname
            dest.write_bytes(content)
            changes.append({
                "state": state["state"],
                "abbr": abbr,
                "url": url,
                "filename": fname,
                "old_hash": old_hash,
                "new_hash": new_hash,
                "content": content,
                "size_bytes": len(content),
                "is_new": old_hash is None,
            })
            status = "NEW" if old_hash is None else "CHANGED"
            log.info("  %s: %s (%s bytes)", status, fname, f"{len(content):,}")
        else:
            log.debug("  unchanged: %s", fname)

        time.sleep(RATE_LIMIT)

    log.info(
        "  %s: %d downloaded, %d changed, %d skipped",
        abbr, downloaded, len(changes), skipped,
    )
    return changes


# ── Dispatcher ────────────────────────────────────────────────

STRATEGIES = {
    "html_links": _scrape_html_links,
    "direct_files": _scrape_direct_files,
}


def scrape_state(state: dict, stored: dict) -> list[dict]:
    """
    Scrape a single state using the configured strategy.
    Falls back to direct_files if html_links yields nothing and direct_urls exist.
    """
    strategy = state.get("type", "html_links")
    fn = STRATEGIES.get(strategy)

    if not fn:
        log.error("  %s: Unknown scrape type '%s'", state["abbr"], strategy)
        return []

    results = fn(state, stored)

    # Fallback: if html_links found nothing but direct_urls are configured
    if not results and strategy == "html_links" and state.get("direct_urls"):
        log.info("  %s: html_links found nothing — falling back to direct_files", state["abbr"])
        results = _scrape_direct_files(state, stored)

    return results
