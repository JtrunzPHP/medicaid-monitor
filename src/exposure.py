"""
Company exposure engine with CPT-level dollar-weighted impact analysis.

For each company:
1. Identifies which states in their footprint had fee schedule changes
2. Matches changed CPT codes against the company's key_cpt_codes
3. Computes:
   - Base rate (current Medicaid reimbursement for that code in that state)
   - Rate change (old → new if available, or just current level)
   - Dollar-weighted revenue impact using: rate_change × volume × state_exposure
4. Flags codes where the base rate is significantly below/above national median
"""

import logging
from statistics import median

log = logging.getLogger(__name__)


def compute(changes: list[dict], companies: list[dict]) -> list[dict]:
    """
    Main entry point. Returns enriched company list sorted by impact.
    
    Each company gets:
      - exposed_states: dict of state_abbr → exposure_pct
      - impact_weight: simple state-level exposure score (backward compat)
      - cpt_impacts: list of per-code impact details
      - total_revenue_impact_mm: estimated annual revenue impact in $M
      - base_rate_flags: codes where state rate is far from median
    """
    # Build rate lookup: state → code → rate
    rate_db = _build_rate_db(changes)
    
    # Build national median rates across all states for comparison
    national_medians = _compute_national_medians(rate_db)
    
    changed_states = {c["abbr"] for c in changes}
    
    results = []
    for co in companies:
        hit_states = {
            abbr: pct for abbr, pct in co.get("state_exposure", {}).items()
            if abbr in changed_states and abbr != "OTHER"
        }
        
        if not hit_states:
            continue
        
        # Simple state-level weight (backward compat)
        medicaid_pct = co.get("medicaid_pct", 0)
        impact_weight = round(
            sum(p * medicaid_pct for p in hit_states.values()) * 100, 2
        )
        
        # CPT-level analysis
        cpt_impacts = []
        total_impact_dollars = 0
        base_rate_flags = []
        annual_rev = co.get("annual_medicaid_rev_mm", 0) * 1_000_000
        key_codes = co.get("key_cpt_codes", {})
        
        for state_abbr, state_pct in hit_states.items():
            state_rates = rate_db.get(state_abbr, {})
            
            for code, code_info in key_codes.items():
                current_rate = state_rates.get(code)
                if current_rate is None:
                    continue
                
                desc = code_info.get("desc", "")
                rev_pct = code_info.get("rev_pct", 0)
                volume = code_info.get("annual_volume_est", 0)
                
                # Estimated volume in this specific state
                state_volume = int(volume * state_pct)
                
                # Revenue from this code in this state at current rate
                state_code_rev = current_rate * state_volume
                
                # Compare to national median
                nat_med = national_medians.get(code)
                vs_median = None
                vs_median_pct = None
                if nat_med and nat_med > 0:
                    vs_median = round(current_rate - nat_med, 2)
                    vs_median_pct = round((current_rate / nat_med - 1) * 100, 1)
                
                impact_rec = {
                    "state": state_abbr,
                    "code": code,
                    "desc": desc,
                    "base_rate": round(current_rate, 2),
                    "national_median": round(nat_med, 2) if nat_med else None,
                    "vs_median_pct": vs_median_pct,
                    "state_volume_est": state_volume,
                    "state_revenue_est": round(state_code_rev),
                    "rev_pct_of_company": rev_pct,
                    "state_exposure_pct": state_pct,
                }
                cpt_impacts.append(impact_rec)
                
                # Flag significant deviations from national median
                if vs_median_pct is not None and abs(vs_median_pct) > 15:
                    direction = "ABOVE" if vs_median_pct > 0 else "BELOW"
                    base_rate_flags.append({
                        "state": state_abbr,
                        "code": code,
                        "desc": desc,
                        "base_rate": round(current_rate, 2),
                        "national_median": round(nat_med, 2),
                        "deviation_pct": vs_median_pct,
                        "direction": direction,
                        "risk": "Rate cut risk" if direction == "ABOVE" else "Upside potential",
                    })
        
        # Sort CPT impacts by estimated revenue contribution
        cpt_impacts.sort(key=lambda x: x["state_revenue_est"], reverse=True)
        base_rate_flags.sort(key=lambda x: abs(x["deviation_pct"]), reverse=True)
        
        # Total revenue at risk in changed states
        total_state_rev = sum(ci["state_revenue_est"] for ci in cpt_impacts)
        
        result = {
            **co,
            "exposed_states": hit_states,
            "impact_weight": impact_weight,
            "cpt_impacts": cpt_impacts,
            "cpt_impacts_top10": cpt_impacts[:10],
            "total_matched_revenue": round(total_state_rev),
            "total_matched_revenue_mm": round(total_state_rev / 1_000_000, 1),
            "base_rate_flags": base_rate_flags[:10],
            "n_codes_matched": len(cpt_impacts),
            "n_flags": len(base_rate_flags),
            "state_changes": [c for c in changes if c["abbr"] in hit_states],
        }
        results.append(result)
    
    return sorted(results, key=lambda x: x["total_matched_revenue"], reverse=True)


def _build_rate_db(changes: list[dict]) -> dict:
    """
    Build lookup: {state_abbr: {cpt_code: rate}} from parsed change data.
    If multiple files per state, merge (last write wins per code).
    """
    db = {}
    for change in changes:
        abbr = change.get("abbr", "")
        rates = change.get("rates", [])
        if not abbr or not rates:
            continue
        
        if abbr not in db:
            db[abbr] = {}
        
        for entry in rates:
            code = entry.get("code")
            rate = entry.get("rate")
            if code and rate is not None and rate > 0:
                db[abbr][code] = rate
        
        log.info("  Rate DB: %s has %d codes", abbr, len(db[abbr]))
    
    return db


def _compute_national_medians(rate_db: dict) -> dict:
    """
    For each CPT code that appears in 2+ states, compute the median rate.
    This becomes the benchmark for identifying over/under-reimbursed states.
    """
    code_rates = {}  # code → [rate1, rate2, ...]
    
    for state_abbr, codes in rate_db.items():
        for code, rate in codes.items():
            if rate > 0:
                if code not in code_rates:
                    code_rates[code] = []
                code_rates[code].append(rate)
    
    medians = {}
    for code, rates in code_rates.items():
        if len(rates) >= 2:
            medians[code] = median(rates)
        elif len(rates) == 1:
            medians[code] = rates[0]  # only 1 state, use as-is
    
    log.info("  National medians computed for %d codes", len(medians))
    return medians


def build_rate_comparison_table(changes: list[dict], codes: list[str] = None) -> dict:
    """
    Build a cross-state rate comparison for specified CPT codes.
    Returns: {code: {state: rate, ...}, ...}
    
    Useful for standalone base rate analysis even without company mapping.
    Can be called independently from the email pipeline.
    """
    rate_db = _build_rate_db(changes)
    
    # If no codes specified, find the most commonly appearing ones
    if not codes:
        code_counts = {}
        for state_rates in rate_db.values():
            for code in state_rates:
                code_counts[code] = code_counts.get(code, 0) + 1
        # Top 50 most common codes
        codes = sorted(code_counts, key=code_counts.get, reverse=True)[:50]
    
    table = {}
    for code in codes:
        table[code] = {}
        for state, rates in rate_db.items():
            if code in rates:
                table[code][state] = rates[code]
    
    return table


def summarize_base_rates(changes: list[dict], companies: list[dict]) -> list[dict]:
    """
    Generate a base rate summary report — shows current $ reimbursement
    per key CPT code per state for each company. This is the "what is the 
    existing base?" view the user wants.
    
    Returns a flat list of records suitable for a report:
    [{ticker, company, code, desc, state, base_rate, national_median, vs_median_pct}, ...]
    """
    rate_db = _build_rate_db(changes)
    medians = _compute_national_medians(rate_db)
    
    records = []
    for co in companies:
        key_codes = co.get("key_cpt_codes", {})
        state_exp = co.get("state_exposure", {})
        
        for code, info in key_codes.items():
            for state in rate_db:
                if state not in state_exp and state not in ("OTHER",):
                    continue
                
                rate = rate_db[state].get(code)
                if rate is None:
                    continue
                
                nat_med = medians.get(code)
                vs_med = round((rate / nat_med - 1) * 100, 1) if nat_med and nat_med > 0 else None
                
                records.append({
                    "ticker": co["ticker"],
                    "company": co["name"],
                    "segment": co.get("segment", ""),
                    "code": code,
                    "desc": info.get("desc", ""),
                    "state": state,
                    "state_exposure_pct": state_exp.get(state, 0),
                    "base_rate": round(rate, 2),
                    "national_median": round(nat_med, 2) if nat_med else None,
                    "vs_median_pct": vs_med,
                    "rev_pct": info.get("rev_pct", 0),
                    "volume_est": info.get("annual_volume_est", 0),
                })
    
    records.sort(key=lambda x: (x["ticker"], -x["rev_pct"], x["state"]))
    return records
