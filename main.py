import json, logging
from pathlib import Path
from src.scraper  import scrape_state
from src.parser   import parse
from src.differ   import diff_files
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
    changes  = []
    all_diffs = []

    for state in STATES:
        log.info(f"── {state['state']} ({state['abbr']}) ──")
        for c in scrape_state(state, cs):
            c = parse(c)

            # Diff against previously stored file before overwriting
            diffs = diff_files(c)
            if diffs:
                log.info(f"  {len(diffs)} code-level changes found")
                all_diffs.extend(diffs)

            changes.append(c)

    if not changes:
        log.info("No changes detected — no email sent.")
        save_cs(cs)
        return

    # Persist new checksums (downloaded files already saved by scraper)
    for c in changes:
        cs[c["url"]] = c["new_hash"]
    save_cs(cs)

    # Company exposure
    cos = compute(changes, COMPANIES)

    # Build and send email
    n_states = len({c["abbr"] for c in changes})
    n_codes  = len([d for d in all_diffs if d["delta_pct"] is not None])
    subject  = (
        f"🏥 Medicaid Monitor: {n_states} state(s) changed"
        + (f", {n_codes} rate moves" if n_codes else "")
    )
    html = build_html(changes, cos, all_diffs)
    send(subject, html)
    log.info("Done.")


if __name__ == "__main__":
    main()
