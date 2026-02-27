"""
Compares old vs new fee schedule files at the procedure-code level.

Uses the structured rates already extracted by parser.py rather than
re-parsing the raw file. Falls back to snapshot on first run.

IMPORTANT: main.py must call diff_files() BEFORE writing the new file
to disk, otherwise we'd be comparing the file against itself.
"""

import io
import logging
from pathlib import Path

import pandas as pd

from src.parser import _clean_code, _clean_rate, _read_file, _find_best_column, CODE_PATTERNS, RATE_PATTERNS

log = logging.getLogger(__name__)

DOWNLOAD_DIR = Path("data/downloads")
PRIOR_DIR = Path("data/prior")  # separate dir for last-known-good copies


def diff_files(change: dict) -> list[dict]:
    """
    Compare old vs new file at procedure-code level.

    Uses change["rates"] from parser if available, otherwise parses raw content.
    Returns list of diff dicts sorted by absolute delta.
    """
    abbr = change["abbr"]
    fname = change["filename"]
    prior_path = PRIOR_DIR / abbr / fname

    # ── Get new rates ─────────────────────────────────────────
    new_rates = change.get("rates", [])
    if not new_rates:
        log.info("  %s: No parsed rates for %s — skipping diff", abbr, fname)
        return []

    new_map = _build_rate_map(new_rates)

    # ── First run — no prior file → snapshot ──────────────────
    if not prior_path.exists():
        log.info("  %s: No prior file — returning snapshot (%d codes)", abbr, len(new_map))
        _save_prior(change, prior_path)
        return _snapshot(new_map, change)

    # ── Load prior file and extract rates ─────────────────────
    old_map = _load_prior_rates(prior_path, fname)
    if not old_map:
        log.warning("  %s: Could not parse prior file — returning snapshot", abbr)
        _save_prior(change, prior_path)
        return _snapshot(new_map, change)

    # ── Compute diffs ─────────────────────────────────────────
    diffs = _compute_diffs(old_map, new_map, change)

    # Save new file as the prior for next run
    _save_prior(change, prior_path)

    if diffs:
        increases = sum(1 for d in diffs if d["direction"] == "▲ INCREASE")
        decreases = sum(1 for d in diffs if d["direction"] == "▼ DECREASE")
        new_codes = sum(1 for d in diffs if d["direction"] == "🆕 NEW CODE")
        removed = sum(1 for d in diffs if d["direction"] == "🗑 REMOVED")
        log.info(
            "  %s: %d changes — %d↑ %d↓ %d new %d removed",
            abbr, len(diffs), increases, decreases, new_codes, removed,
        )

    return diffs


def _build_rate_map(rates: list[dict]) -> dict[str, float]:
    """
    Build {code: rate} map from parsed rates list.
    For duplicate codes, keep the first non-zero value.
    """
    rate_map = {}
    for r in rates:
        code = r.get("code")
        rate = r.get("rate")
        if code and rate is not None and code not in rate_map:
            rate_map[code] = rate
    return rate_map


def _load_prior_rates(path: Path, fname: str) -> dict[str, float] | None:
    """Parse the prior saved file and extract a code→rate map."""
    try:
        content = path.read_bytes()
        df = _read_file(fname.lower(), content)
        if df is None or df.empty:
            return None

        df.columns = [str(c).strip() for c in df.columns]
        code_col = _find_best_column(df.columns.tolist(), CODE_PATTERNS)
        rate_col = _find_best_column(df.columns.tolist(), RATE_PATTERNS)

        if not code_col or not rate_col:
            return None

        rate_map = {}
        for _, row in df.iterrows():
            code = _clean_code(row.get(code_col))
            rate = _clean_rate(row.get(rate_col))
            if code and rate is not None and code not in rate_map:
                rate_map[code] = rate

        return rate_map if rate_map else None

    except Exception as e:
        log.warning("  Failed to load prior %s: %s", path, e)
        return None


def _save_prior(change: dict, prior_path: Path) -> None:
    """Save current file as the prior version for next comparison."""
    try:
        prior_path.parent.mkdir(parents=True, exist_ok=True)
        prior_path.write_bytes(change["content"])
    except Exception as e:
        log.warning("  Failed to save prior file: %s", e)


def _compute_diffs(
    old_map: dict[str, float],
    new_map: dict[str, float],
    change: dict,
) -> list[dict]:
    """Compute code-level rate changes between old and new maps."""
    diffs = []
    base = {
        "state": change["state"],
        "abbr": change["abbr"],
        "filename": change["filename"],
    }

    all_codes = set(old_map) | set(new_map)

    for code in all_codes:
        old_val = old_map.get(code)
        new_val = new_map.get(code)

        # Unchanged
        if old_val is not None and new_val is not None and old_val == new_val:
            continue

        # Changed rate
        if old_val is not None and new_val is not None:
            if old_val == 0:
                # Can't compute % change from zero
                delta_pct = None
                direction = "▲ INCREASE" if new_val > 0 else "—"
            else:
                delta_pct = round(((new_val - old_val) / old_val) * 100, 2)
                if abs(delta_pct) < 0.01:
                    continue
                direction = "▲ INCREASE" if delta_pct > 0 else "▼ DECREASE"

            diffs.append({
                **base,
                "code": code,
                "old_rate": old_val,
                "new_rate": new_val,
                "delta_pct": delta_pct,
                "delta_abs": round(new_val - old_val, 4),
                "direction": direction,
            })

        # New code
        elif old_val is None and new_val is not None:
            diffs.append({
                **base,
                "code": code,
                "old_rate": None,
                "new_rate": new_val,
                "delta_pct": None,
                "delta_abs": None,
                "direction": "🆕 NEW CODE",
            })

        # Removed code
        elif old_val is not None and new_val is None:
            diffs.append({
                **base,
                "code": code,
                "old_rate": old_val,
                "new_rate": None,
                "delta_pct": None,
                "delta_abs": None,
                "direction": "🗑 REMOVED",
            })

    # Sort: largest absolute % changes first, then new/removed at end
    diffs.sort(key=lambda x: (
        0 if x["delta_pct"] is not None else 1,
        -(abs(x["delta_pct"]) if x["delta_pct"] is not None else 0),
    ))

    return diffs


def _snapshot(rate_map: dict[str, float], change: dict) -> list[dict]:
    """Return all current rates as snapshot entries (first run)."""
    base = {
        "state": change["state"],
        "abbr": change["abbr"],
        "filename": change["filename"],
    }
    return [
        {
            **base,
            "code": code,
            "old_rate": None,
            "new_rate": rate,
            "delta_pct": None,
            "delta_abs": None,
            "direction": "📋 SNAPSHOT",
        }
        for code, rate in sorted(rate_map.items())
    ]
