import json, logging
from pathlib import Path
from src.scraper  import scrape_state
from src.parser   import parse
from src.exposure import compute
from src.emailer  import build_html, send

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

STATES    = json.loads(Path("config/states.json").read_text())
COMPANIES = json.loads(Path("config/companies.json").read_text())
CHECKSUMS = Path("data/checksums.json")


def load_cs() -> dict:
    return json.loads(CHECKSUMS.read_text()) if CHECKSUMS.exists() else {}

def save_cs(cs: dict):
    CHECKSUMS.write_text(json.dumps(cs, indent=2))


def main():
    cs = load_cs()
    changes = []

    for state in STATES:
        log.info(f"── {state['state']} ({state['abbr']}) ──")
        for c in scrape_state(state, cs):
            changes.append(parse(c))

    if not changes:
        log.info("No changes detected — no email sent.")
        save_cs(cs)
        return

    for c in changes:
        cs[c["url"]] = c["new_hash"]
    save_cs(cs)

    cos = compute(changes, COMPANIES)
    html = build_html(changes, cos)
    subject = f"🏥 Medicaid Monitor: {len(changes)} change(s) in {len({c['abbr'] for c in changes})} state(s)"
    send(subject, html)
    log.info("Done.")


if __name__ == "__main__":
    main()
