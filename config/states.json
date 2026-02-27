import hashlib, logging, time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
}
EXTS = {".xlsx", ".xls", ".csv", ".pdf"}
DOWNLOAD_DIR = Path("data/downloads")
DIAGNOSTICS_DIR = Path("data/diagnostics")


def checksum(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _fetch_html(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30, allow_redirects=True)
        r.raise_for_status()

        # Detect Cloudflare / WAF interstitials
        ct = r.headers.get("Content-Type", "")
        if "text/html" not in ct:
            log.warning(f"Unexpected content-type {ct} for {url}")
            return None

        body = r.text
        cf_signals = ["cf-browser-verification", "challenge-platform", "Attention Required"]
        if any(s in body for s in cf_signals):
            log.warning(f"Cloudflare/WAF challenge detected at {url}")
            _save_diagnostic(url, body)
            return None

        # Detect JS-only shells (minimal HTML with no links)
        if len(body) < 500 and "<a" not in body.lower():
            log.warning(f"Suspiciously small/empty HTML ({len(body)} chars) at {url}")
            _save_diagnostic(url, body)

        return body

    except requests.exceptions.HTTPError as e:
        log.warning(f"HTTP {e.response.status_code} for {url}: {e}")
        return None
    except Exception as e:
        log.warning(f"HTML fetch failed {url}: {e}")
        return None


def _save_diagnostic(url: str, body: str):
    """Save raw HTML for debugging dead/blocked pages."""
    DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
    slug = url.replace("https://", "").replace("http://", "").replace("/", "_")[:80]
    p = DIAGNOSTICS_DIR / f"{slug}.html"
    p.write_text(body[:50_000], encoding="utf-8")
    log.info(f"  Diagnostic HTML saved to {p}")


def _download(url: str) -> bytes | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=60, allow_redirects=True)
        r.raise_for_status()
        # Guard against downloading HTML error pages instead of real files
        ct = r.headers.get("Content-Type", "")
        if "text/html" in ct and len(r.content) < 5000:
            log.warning(f"Download returned HTML instead of file: {url}")
            return None
        return r.content
    except Exception as e:
        log.warning(f"Download failed {url}: {e}")
        return None


def _file_links(html: str, base: str, keywords: list[str]) -> list[str]:
    """Extract all links ending in target extensions, optionally filtered by keywords."""
    soup = BeautifulSoup(html, "lxml")
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"]
        # Check extension — also handle query params like file.xlsx?v=2
        clean = href.split("?")[0].split("#")[0].lower()
        if not any(clean.endswith(ext) for ext in EXTS):
            continue
        if keywords:
            text = (a.get_text(" ") + " " + href).lower()
            if not any(kw.lower() in text for kw in keywords):
                continue
        full = href if href.startswith("http") else urljoin(base, href)
        links.append(full)
    return list(dict.fromkeys(links))


def scrape_state(state: dict, stored: dict) -> list[dict]:
    abbr, name = state["abbr"], state["state"]
    dest_dir = DOWNLOAD_DIR / abbr
    dest_dir.mkdir(parents=True, exist_ok=True)

    changes = []

    html = _fetch_html(state["url"])
    if not html:
        log.error(f"{abbr}: FAILED to fetch {state['url']} — skipping state entirely")
        return []

    links = _file_links(html, state["url"], state.get("keywords", []))
    if not links:
        log.warning(f"{abbr}: No file links found at {state['url']}")
        _save_diagnostic(state["url"], html)
        return []

    log.info(f"{abbr}: Found {len(links)} file link(s)")

    for url in links:
        fname = url.split("/")[-1].split("?")[0] or "file"
        content = _download(url)
        if not content:
            continue

        new_hash = checksum(content)
        old_hash = stored.get(url)

        if old_hash != new_hash:
            dest = dest_dir / fname
            dest.write_bytes(content)
            changes.append({
                "state":    name,
                "abbr":     abbr,
                "url":      url,
                "filename": fname,
                "old_hash": old_hash,
                "new_hash": new_hash,
                "content":  content,
                "is_new":   old_hash is None,
            })
            log.info(f"  CHANGED: {fname}")
        else:
            log.info(f"  unchanged: {fname}")

        time.sleep(0.4)

    return changes
