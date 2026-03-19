"""
Diff engine: compares current fee schedule against the previously stored version.
Now captures BOTH the base rate (current $) and the delta (change from prior).

Output per code:
  - code, desc, state
  - old_rate: prior fee schedule $
  - new_rate: current fee schedule $ (this IS the base rate)
  - delta: new - old
  - delta_pct: % change
  - direction: UP / DOWN / NEW / REMOVED / UNCHANGED
"""

import json
import logging
from pathlib import Path

log = logging.getLogger(__name__)

PREV_RATES_DIR = Path("data/prev_rates")


def diff_files(change: dict) -> list[dict]:
    """
    Compare current parsed rates against previously stored rates.
    Saves current rates for next run's comparison.
    Returns list of per-code diffs.
    """
    abbr = change.get("abbr", "")
    fname = change.get("filename", "unknown")
    rates = change.get("rates", [])

    if not rates or not abbr:
        return []

    # Build current lookup: code → {rate, desc}
    current = {}
    for r in rates:
        code = r.get("code")
        rate = r.get("rate")
        if code and rate is not None:
            current[code] = {
                "rate": rate,
                "desc": r.get("desc", ""),
                "modifier": r.get("modifier", ""),
            }

    # Load previous rates for this file
    safe_fname = fname.replace("/", "_").replace("\\", "_")
    prev_path = PREV_RATES_DIR / abbr / f"{safe_fname}.json"
    previous = {}
    if prev_path.exists():
        try:
            prev_data = json.loads(prev_path.read_text())
            previous = {r["code"]: r for r in prev_data}
        except Exception as e:
            log.warning("  Could not load previous rates %s: %s", prev_path, e)

    # Save current for next run
    prev_path.parent.mkdir(parents=True, exist_ok=True)
    prev_path.write_text(json.dumps(
        [{"code": k, "rate": v["rate"], "desc": v["desc"]} for k, v in current.items()],
        indent=1
    ))

    # Compute diffs
    all_codes = set(current.keys()) | set(previous.keys())
    diffs = []

    for code in sorted(all_codes):
        cur = current.get(code)
        prev = previous.get(code)

        new_rate = cur["rate"] if cur else None
        old_rate = prev["rate"] if prev else None
        desc = (cur or prev or {}).get("desc", "")

        # Determine direction
        if cur and not prev:
            direction = "NEW"
            delta = None
            delta_pct = None
        elif prev and not cur:
            direction = "REMOVED"
            delta = None
            delta_pct = None
        elif new_rate is not None and old_rate is not None:
            delta = round(new_rate - old_rate, 4)
            if old_rate > 0:
                delta_pct = round((new_rate - old_rate) / old_rate * 100, 2)
            else:
                delta_pct = None

            if abs(delta) < 0.005:
                direction = "UNCHANGED"
            elif delta > 0:
                direction = "UP"
            else:
                direction = "DOWN"
        else:
            direction = "UNCHANGED"
            delta = None
            delta_pct = None

        # Only include meaningful changes + always include base rate
        diff_rec = {
            "code": code,
            "desc": desc,
            "state": abbr,
            "filename": fname,
            "old_rate": old_rate,
            "new_rate": new_rate,  # THIS is the base rate
            "delta": delta,
            "delta_pct": delta_pct,
            "direction": direction,
        }

        # Include all records for base rate visibility,
        # but flag which ones actually changed
        if direction != "UNCHANGED":
            diff_rec["changed"] = True
            diffs.append(diff_rec)
        # For base rate report, we still want unchanged codes
        # but don't clutter the diff list with them

    # Summary stats
    n_up = sum(1 for d in diffs if d["direction"] == "UP")
    n_down = sum(1 for d in diffs if d["direction"] == "DOWN")
    n_new = sum(1 for d in diffs if d["direction"] == "NEW")
    n_removed = sum(1 for d in diffs if d["direction"] == "REMOVED")

    if diffs:
        log.info(
            "  %s/%s: %d changes (↑%d ↓%d +%d -%d)",
            abbr, fname, len(diffs), n_up, n_down, n_new, n_removed
        )

        # Log biggest rate moves
        rate_moves = [d for d in diffs if d["delta_pct"] is not None]
        if rate_moves:
            rate_moves.sort(key=lambda x: abs(x["delta_pct"]), reverse=True)
            for d in rate_moves[:5]:
                arrow = "↑" if d["delta"] > 0 else "↓"
                log.info(
                    "    %s %s: $%.2f → $%.2f (%s%.1f%%)",
                    arrow, d["code"],
                    d["old_rate"] or 0, d["new_rate"] or 0,
                    "+" if d["delta_pct"] > 0 else "", d["delta_pct"]
                )

    return diffs
