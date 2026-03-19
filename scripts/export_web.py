#!/usr/bin/env python3
"""
Export scraped Medicaid fee schedule data into compact JSON for the web dashboard.

Reads from:
  - data/prev_rates/     (current rates by state, stored by differ.py)
  - data/base_rates.json (company × state × code report from exposure.py)
  - data/rate_comparison.json (cross-state matrix)
  - config/companies.json

Writes to data/web/:
  - rates.json       — all current rates: {state: {code: {rate, desc}}}
  - changes.json     — recent rate changes with old/new/delta
  - companies.json   — company config + matched rates
  - cross_state.json — key codes across states
  - meta.json        — update timestamp, coverage stats
"""

import json
import logging
from datetime import datetime
from pathlib import Path
from statistics import median

logging.basicConfig(level=logging.INFO)
log = logging.getLogger(__name__)

PREV_RATES_DIR = Path("data/prev_rates")
BASE_RATES_PATH = Path("data/base_rates.json")
RATE_TABLE_PATH = Path("data/rate_comparison.json")
COMPANIES_PATH = Path("config/companies.json")
WEB_DIR = Path("data/web")

# Key CPT codes to always include in cross-state view
KEY_CODES = [
    ("99211", "Office Visit - Minimal"),
    ("99212", "Office Visit - Straightforward"),
    ("99213", "Office Visit - Low"),
    ("99214", "Office Visit - Moderate"),
    ("99215", "Office Visit - High"),
    ("99281", "ED Visit - Minimal"),
    ("99282", "ED Visit - Low"),
    ("99283", "ED Visit - Moderate"),
    ("99284", "ED Visit - High"),
    ("99285", "ED Visit - Critical"),
    ("90832", "Psychotherapy 30min"),
    ("90834", "Psychotherapy 45min"),
    ("90837", "Psychotherapy 60min"),
    ("90791", "Psychiatric Eval"),
    ("90847", "Family Psychotherapy"),
    ("90853", "Group Psychotherapy"),
    ("97153", "ABA Therapy"),
    ("97110", "Therapeutic Exercise 15min"),
    ("97140", "Manual Therapy 15min"),
    ("97530", "Therapeutic Activities 15min"),
    ("97116", "Gait Training 15min"),
    ("97535", "Self-Care Training 15min"),
    ("T1019", "Personal Care 15min"),
    ("T1020", "Personal Care Per Diem"),
    ("S5125", "Attendant Care 15min"),
    ("S5130", "Homemaker Services 15min"),
    ("G0299", "Home Health Skilled Nursing"),
    ("G0151", "Home Health PT"),
    ("G0156", "Home Health Aide"),
    ("90960", "ESRD Monthly 4+ Visits"),
    ("90961", "ESRD Monthly 2-3 Visits"),
    ("90935", "Hemodialysis One Eval"),
    ("99304", "SNF Initial - Low"),
    ("99305", "SNF Initial - Moderate"),
    ("99306", "SNF Initial - High"),
    ("99307", "SNF Subsequent - Low"),
    ("99308", "SNF Subsequent - Moderate"),
    ("99309", "SNF Subsequent - High"),
    ("99221", "Hospital Initial - Low"),
    ("99222", "Hospital Initial - Moderate"),
    ("99223", "Hospital Initial - High"),
    ("99231", "Hospital Subsequent - Low"),
    ("99232", "Hospital Subsequent - Moderate"),
    ("99233", "Hospital Subsequent - High"),
    ("96365", "IV Infusion 1st Hr"),
    ("H0015", "SUD Intensive Outpatient"),
    ("A0080", "NEMT Transport"),
    ("T2003", "NEMT Encounter/Trip"),
    ("99468", "Neonatal Critical Care Initial"),
    ("99469", "Neonatal Critical Care Subsequent"),
    ("29881", "Knee Arthroscopy"),
    ("45380", "Colonoscopy w/ Biopsy"),
    ("66984", "Cataract Surgery"),
]


def load_all_rates() -> dict:
    """Load all current rates from prev_rates directory.
    Returns: {state: {code: {"rate": float, "desc": str}}}
    """
    rates = {}
    if not PREV_RATES_DIR.exists():
        log.warning("No prev_rates directory found")
        return rates

    for state_dir in sorted(PREV_RATES_DIR.iterdir()):
        if not state_dir.is_dir():
            continue
        abbr = state_dir.name
        rates[abbr] = {}

        for json_file in state_dir.glob("*.json"):
            try:
                data = json.loads(json_file.read_text())
                for entry in data:
                    code = entry.get("code", "")
                    rate = entry.get("rate", 0)
                    desc = entry.get("desc", "")
                    if code and rate is not None:
                        # Keep highest rate if dupes (some states have multiple files)
                        if code not in rates[abbr] or rate > rates[abbr][code].get("rate", 0):
                            rates[abbr][code] = {"rate": rate, "desc": desc}
            except Exception as e:
                log.warning("Error reading %s: %s", json_file, e)

        log.info("  %s: %d codes loaded", abbr, len(rates[abbr]))

    return rates


def compute_medians(rates: dict) -> dict:
    """Compute national median for each code across states."""
    code_vals = {}
    for state, codes in rates.items():
        for code, info in codes.items():
            r = info["rate"]
            if r and r > 0:
                code_vals.setdefault(code, []).append(r)

    medians = {}
    for code, vals in code_vals.items():
        if len(vals) >= 2:
            medians[code] = round(median(vals), 2)
        elif vals:
            medians[code] = round(vals[0], 2)

    return medians


def build_cross_state(rates: dict, medians: dict) -> list:
    """Build cross-state comparison for key codes."""
    states = sorted(rates.keys())
    rows = []

    for code, desc in KEY_CODES:
        state_rates = {}
        for st in states:
            r = rates.get(st, {}).get(code, {}).get("rate")
            if r and r > 0:
                state_rates[st] = round(r, 2)

        if not state_rates:
            continue

        vals = list(state_rates.values())
        mn, mx = min(vals), max(vals)
        spread = round((mx / mn - 1) * 100, 1) if mn > 0 else 0
        med = medians.get(code)

        rows.append({
            "code": code,
            "desc": desc,
            "states": state_rates,
            "min": mn,
            "max": mx,
            "median": med,
            "spread": spread,
            "n_states": len(state_rates),
        })

    return rows


def build_company_data(rates: dict, medians: dict) -> list:
    """Enrich company config with matched rates from scraped states."""
    if not COMPANIES_PATH.exists():
        return []

    companies = json.loads(COMPANIES_PATH.read_text())
    enriched = []

    for co in companies:
        key_codes = co.get("key_cpt_codes", {})
        state_exp = co.get("state_exposure", {})
        matches = []
        flags = []

        for code, info in key_codes.items():
            for state, st_rates in rates.items():
                if state not in state_exp:
                    continue

                entry = st_rates.get(code)
                if not entry or entry["rate"] <= 0:
                    continue

                r = entry["rate"]
                med = medians.get(code)
                vs_med = round((r / med - 1) * 100, 1) if med and med > 0 else None

                match = {
                    "code": code,
                    "desc": info.get("desc", entry.get("desc", "")),
                    "state": state,
                    "rate": round(r, 2),
                    "median": med,
                    "vs_median": vs_med,
                    "rev_pct": info.get("rev_pct", 0),
                    "volume": info.get("annual_volume_est", 0),
                    "state_pct": state_exp.get(state, 0),
                }

                est_vol = int(match["volume"] * match["state_pct"])
                match["est_state_rev"] = round(r * est_vol)
                matches.append(match)

                if vs_med is not None and abs(vs_med) > 15:
                    flags.append({
                        "code": code,
                        "state": state,
                        "rate": round(r, 2),
                        "median": med,
                        "vs_median": vs_med,
                        "direction": "ABOVE" if vs_med > 0 else "BELOW",
                        "risk": "Cut risk" if vs_med > 0 else "Upside",
                    })

        matches.sort(key=lambda x: x.get("est_state_rev", 0), reverse=True)
        flags.sort(key=lambda x: abs(x.get("vs_median", 0)), reverse=True)

        enriched.append({
            "ticker": co["ticker"],
            "name": co["name"],
            "segment": co.get("segment", ""),
            "medicaid_pct": co.get("medicaid_pct", 0),
            "annual_medicaid_rev_mm": co.get("annual_medicaid_rev_mm", 0),
            "state_exposure": state_exp,
            "key_cpt_codes": key_codes,
            "matches": matches[:30],
            "flags": flags[:15],
            "n_matches": len(matches),
            "n_flags": len(flags),
            "total_matched_rev": sum(m.get("est_state_rev", 0) for m in matches),
        })

    enriched.sort(key=lambda x: x["total_matched_rev"], reverse=True)
    return enriched


def load_changes() -> list:
    """Load recent rate changes from differ output files."""
    # Look for the report output
    changes = []
    report_path = Path("data/report_changes.json")
    if report_path.exists():
        try:
            changes = json.loads(report_path.read_text())
        except Exception:
            pass

    # Also scan prev_rates for any stored change history
    # (future: maintain a changelog file)
    return changes


def main():
    WEB_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    log.info("=== Exporting web data ===")

    # 1. Load all rates
    rates = load_all_rates()
    total_codes = sum(len(v) for v in rates.values())
    log.info("Loaded %d codes across %d states", total_codes, len(rates))

    # 2. Compute medians
    medians = compute_medians(rates)
    log.info("Computed medians for %d codes", len(medians))

    # 3. Rates JSON (compact: only include codes that have rates > 0)
    compact_rates = {}
    for state, codes in rates.items():
        compact_rates[state] = {
            code: {"r": round(info["rate"], 2), "d": info.get("desc", "")[:60]}
            for code, info in codes.items()
            if info["rate"] and info["rate"] > 0
        }
    Path(WEB_DIR / "rates.json").write_text(json.dumps(compact_rates))
    log.info("Wrote rates.json (%d states)", len(compact_rates))

    # 4. Cross-state comparison
    cross = build_cross_state(rates, medians)
    Path(WEB_DIR / "cross_state.json").write_text(json.dumps(cross))
    log.info("Wrote cross_state.json (%d codes)", len(cross))

    # 5. Company data
    cos = build_company_data(rates, medians)
    Path(WEB_DIR / "companies.json").write_text(json.dumps(cos))
    log.info("Wrote companies.json (%d companies)", len(cos))

    # 6. Medians
    Path(WEB_DIR / "medians.json").write_text(json.dumps(medians))

    # 7. Changes (if available)
    changes = load_changes()
    Path(WEB_DIR / "changes.json").write_text(json.dumps(changes))

    # 8. Meta
    meta = {
        "updated": now,
        "states": sorted(rates.keys()),
        "n_states": len(rates),
        "n_codes": total_codes,
        "n_companies": len(cos),
        "n_medians": len(medians),
        "n_key_codes": len(KEY_CODES),
    }
    Path(WEB_DIR / "meta.json").write_text(json.dumps(meta, indent=2))
    log.info("Wrote meta.json")

    log.info("=== Export complete ===")


if __name__ == "__main__":
    main()
