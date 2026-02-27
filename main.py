"""
Medicaid Fee-Schedule Monitor — main pipeline.

Usage:
    python main.py                  # all states
    python main.py --states CO OH   # specific states only
    python main.py --dry-run        # skip email, just log
"""

import argparse
import json
import logging
import time
from pathlib import Path

from src.scraper import scrape_state
from src.parser import parse
from src.differ import diff_files
from src.exposure import compute
from src.emailer import build_html, send

# ── Config paths ──────────────────────────────────────────────
CONFIG_DIR = Path("config")
DATA_DIR = Path("data")
STATES_PATH = CONFIG_DIR / "states.json"
COMPANIES_PATH = CONFIG_DIR / "companies.json"
CHECKSUMS_PATH = DATA_DIR / "checksums.json"

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger(__name__)


def load_json(path: Path) -> dict | list:
    return json.loads(path.read_text()) if path.exists() else {}


def save_json(path: Path, data: dict | list) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2))


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Medicaid fee-schedule monitor")
    p.add_argument(
        "--states", nargs="*", default=None,
        help="State abbreviations to process (default: all)",
    )
    p.add_argument(
        "--dry-run", action="store_true",
        help="Run pipeline but skip sending email",
    )
    p.add_argument(
        "--verbose", "-v", action="store_true",
        help="Enable debug logging",
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)

    t0 = time.monotonic()

    states = load_json(STATES_PATH)
    companies = load_json(COMPANIES_PATH)
    checksums = load_json(CHECKSUMS_PATH)

    if not states:
        log.error("No states configured in %s", STATES_PATH)
        return

    # Filter to requested states if specified
    if args.states:
        filter_set = {s.upper() for s in args.states}
        states = [s for s in states if s["abbr"] in filter_set]
        if not states:
            log.error("No matching states found for: %s", args.states)
            return

    changes: list[dict] = []
    all_diffs: list[dict] = []
    errors: list[str] = []

    for state in states:
        abbr = state["abbr"]
        log.info("── %s (%s) ──", state["state"], abbr)

        try:
            for item in scrape_state(state, checksums):
                item = parse(item)
                diffs = diff_files(item)
                if diffs:
                    log.info("  %d code-level change(s) in %s", len(diffs), item.get("filename", "?"))
                    all_diffs.extend(diffs)
                changes.append(item)

        except Exception:
            log.exception("  ✗ Failed processing %s", abbr)
            errors.append(abbr)
            continue

    # ── Summary ───────────────────────────────────────────────
    elapsed = time.monotonic() - t0
    changed_states = {c["abbr"] for c in changes}
    rate_moves = [d for d in all_diffs if d.get("delta_pct") is not None]

    log.info(
        "── Summary: %d state(s) changed, %d file(s), %d rate move(s), "
        "%d error(s), %.1fs elapsed ──",
        len(changed_states), len(changes), len(rate_moves),
        len(errors), elapsed,
    )

    if not changes:
        log.info("No changes detected — no email sent.")
        save_json(CHECKSUMS_PATH, checksums)
        return

    # ── Persist checksums ─────────────────────────────────────
    for c in changes:
        checksums[c["url"]] = c["new_hash"]
    save_json(CHECKSUMS_PATH, checksums)

    # ── Notify ────────────────────────────────────────────────
    exposures = compute(changes, companies)

    subject = f"🏥 Medicaid Monitor: {len(changed_states)} state(s) changed"
    if rate_moves:
        subject += f", {len(rate_moves)} rate moves"
    if errors:
        subject += f" ⚠ {len(errors)} error(s)"

    html = build_html(changes, exposures, all_diffs)

    if args.dry_run:
        log.info("Dry run — email not sent. Subject: %s", subject)
        # Optionally write HTML to file for inspection
        (DATA_DIR / "last_email.html").write_text(html)
        log.info("Email preview saved to data/last_email.html")
    else:
        try:
            send(subject, html)
            log.info("Email sent successfully.")
        except Exception:
            log.exception("Failed to send email — checksums already saved!")


if __name__ == "__main__":
    main()
