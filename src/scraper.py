import hashlib, logging, time
from pathlib import Path
from urllib.parse import urljoin
import requests
from bs4 import BeautifulSoup

log = logging.getLogger(__name__)

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MedicaidMonitor/1.0)"
}
EXTS = {".xlsx", ".xls", ".csv"}
DOWNLOAD_DIR = Path("data/downloads")


def checksum(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def _fetch_html(url: str) -> str | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=30)
        r.raise_for_status()
        return r.text
    except Exception as e:
        log.warning(f"HTML fetch failed {url}: {e}")
        return None


def _download(url: str) -> bytes | None:
    try:
        r = requests.get(url, headers=HEADERS, timeout=60)
        r.raise_for_status()
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
        if not any(href.lower().endswith(ext) for ext in EXTS):
            continue
        if keywords:
            text = (a.get_text(" ") + " " + href).lower()
            if not any(kw.lower() in text for kw in keywords):
                continue
        full = href if href.startswith("http") else urljoin(base, href)
        links.append(full)
    return list(dict.fromkeys(links))  # dedupe preserving order


def scrape_state(state: dict, stored: dict) -> list[dict]:
    abbr, name = state["abbr"], state["state"]
    dest_dir = DOWNLOAD_DIR / abbr
    dest_dir.mkdir(parents=True, exist_ok=True)
    changes = []

    html = _fetch_html(state["url"])
    if not html:
        return []

    links = _file_links(html, state["url"], state.get("keywords", []))
    if not links:
        log.warning(f"{abbr}: No file links found at {state['url']}")
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
