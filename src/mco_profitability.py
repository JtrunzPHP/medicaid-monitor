"""
MCO Plan Profitability Tracker
==============================
Fetches CMS MLR public use data, maps plan names to parent MCO tickers,
computes state-level and national profitability metrics, and flags
states likely to trigger mid-year rate adjustments.

Data sources:
  - CMS MLR Summary Reports (data.medicaid.gov)
  - CMS Managed Care Enrollment Report
  - config/mco_plans.json (plan-to-parent mapping)

Outputs:
  - state_mco_profitability: state × MCO matrix with MLR, margin, member months
  - parent_rollup: national-level P&L by parent MCO ticker
  - rate_adjustment_alerts: states where MLR > threshold
  - quarterly_tracker: Big Five revenue/enrollment/MLR trends
"""

import json, logging, os, re, csv, io
from pathlib import Path
from datetime import datetime
from statistics import mean, median

try:
    import requests
except ImportError:
    requests = None

log = logging.getLogger(__name__)

MCO_PLANS_PATH = Path("config/mco_plans.json")
DATA_DIR = Path("data/mco")
DATA_DIR.mkdir(parents=True, exist_ok=True)

MLR_DATASET_ID = "743f9f04-4473-41e2-9da2-9a89db65ee55"
MLR_API_BASE = f"https://data.medicaid.gov/api/1/datastore/query/{MLR_DATASET_ID}/0"
MLR_CSV_FALLBACK = "https://download.medicaid.gov/data/mlr-public-use-file-07302024final.csv"

ENROLLMENT_API = "https://data.medicaid.gov/api/1/datastore/query"


def load_mco_config() -> dict:
    if MCO_PLANS_PATH.exists():
        return json.loads(MCO_PLANS_PATH.read_text())
    log.warning("mco_plans.json not found — run with default config")
    return {"parents": {}}


def fetch_mlr_data(use_cache: bool = True) -> list[dict]:
    """
    Fetch CMS MLR public use file data.
    Tries the data.medicaid.gov API first, falls back to direct CSV.
    """
    cache_path = DATA_DIR / "mlr_raw.json"
    
    if use_cache and cache_path.exists():
        age_hours = (datetime.now().timestamp() - cache_path.stat().st_mtime) / 3600
        if age_hours < 168:  # 7 days
            log.info("Using cached MLR data (%.1f hours old)", age_hours)
            return json.loads(cache_path.read_text())
    
    if requests is None:
        log.error("requests library not available — cannot fetch MLR data")
        return _load_from_cache_or_empty(cache_path)
    
    records = []
    
    # Try API first
    try:
        log.info("Fetching MLR data from data.medicaid.gov API...")
        offset = 0
        limit = 500
        while True:
            resp = requests.get(
                MLR_API_BASE,
                params={"offset": offset, "limit": limit},
                timeout=30
            )
            if resp.status_code != 200:
                log.warning("API returned %d — falling back to CSV", resp.status_code)
                break
            data = resp.json()
            results = data.get("results", [])
            if not results:
                break
            records.extend(results)
            offset += limit
            if len(results) < limit:
                break
        
        if records:
            log.info("Fetched %d MLR records from API", len(records))
            cache_path.write_text(json.dumps(records, indent=2))
            return records
    except Exception as e:
        log.warning("API fetch failed: %s — trying CSV fallback", e)
    
    # CSV fallback
    try:
        log.info("Fetching MLR CSV from download.medicaid.gov...")
        resp = requests.get(MLR_CSV_FALLBACK, timeout=60)
        if resp.status_code == 200:
            reader = csv.DictReader(io.StringIO(resp.text))
            records = [row for row in reader]
            log.info("Fetched %d MLR records from CSV", len(records))
            cache_path.write_text(json.dumps(records, indent=2))
            return records
    except Exception as e:
        log.warning("CSV fetch also failed: %s", e)
    
    return _load_from_cache_or_empty(cache_path)


def _load_from_cache_or_empty(cache_path: Path) -> list[dict]:
    if cache_path.exists():
        log.info("Using stale cache as fallback")
        return json.loads(cache_path.read_text())
    return []


def match_plan_to_parent(plan_name: str, config: dict) -> str | None:
    """
    Fuzzy-match a plan name from CMS data to a parent MCO ticker.
    Returns ticker string or None.
    """
    if not plan_name:
        return None
    name_lower = plan_name.lower().strip()
    
    for ticker, parent in config.get("parents", {}).items():
        for pattern in parent.get("plan_name_patterns", []):
            if pattern.lower() in name_lower:
                return ticker
    return None


def compute_state_profitability(mlr_records: list[dict], config: dict) -> dict:
    """
    Compute state-level MCO profitability metrics.
    
    Returns:
      {
        state_abbr: {
          ticker: {
            "plan_name": str,
            "mlr_pct": float,
            "numerator": float (claims + QIA),
            "denominator": float (premium rev - taxes),
            "member_months": int,
            "underwriting_margin_pct": float (100 - MLR),
            "est_profit_loss_mm": float,
            "reporting_period": str,
            "rate_risk_flag": str | None
          }
        }
      }
    """
    results = {}
    
    # Normalize field names (CMS data may have varying column names)
    field_map = _detect_field_names(mlr_records)
    
    for rec in mlr_records:
        state = _get_field(rec, field_map, "state")
        plan_name = _get_field(rec, field_map, "plan_name")
        mlr_raw = _get_field(rec, field_map, "mlr")
        numerator = _safe_float(_get_field(rec, field_map, "numerator"))
        denominator = _safe_float(_get_field(rec, field_map, "denominator"))
        member_months = _safe_int(_get_field(rec, field_map, "member_months"))
        period_start = _get_field(rec, field_map, "period_start")
        period_end = _get_field(rec, field_map, "period_end")
        remittance = _safe_float(_get_field(rec, field_map, "remittance"))
        report_year = _get_field(rec, field_map, "report_year")
        
        if not state or not plan_name:
            continue
        
        # Normalize state to 2-letter abbreviation
        state_abbr = _normalize_state(state)
        if not state_abbr:
            continue
        
        ticker = match_plan_to_parent(plan_name, config)
        
        # Compute MLR
        mlr_pct = _safe_float(mlr_raw)
        if mlr_pct is None and numerator and denominator and denominator > 0:
            mlr_pct = round((numerator / denominator) * 100, 2)
        
        if mlr_pct is None:
            continue
        
        margin = round(100 - mlr_pct, 2)
        est_pl = round((denominator - numerator) / 1_000_000, 1) if numerator and denominator else None
        
        # Rate risk flag
        thresholds = config.get("_mlr_thresholds", {})
        flag = None
        if mlr_pct >= thresholds.get("distress_signal", 95):
            flag = "DISTRESS"
        elif mlr_pct >= thresholds.get("rate_adjustment_trigger", 90):
            flag = "RATE_ADJ_LIKELY"
        elif mlr_pct < thresholds.get("federal_minimum", 85):
            flag = "HIGH_MARGIN"
        
        period_str = f"{period_start} to {period_end}" if period_start and period_end else report_year or "unknown"
        
        entry = {
            "plan_name": plan_name,
            "parent_ticker": ticker,
            "mlr_pct": mlr_pct,
            "numerator_mm": round(numerator / 1_000_000, 1) if numerator else None,
            "denominator_mm": round(denominator / 1_000_000, 1) if denominator else None,
            "member_months": member_months,
            "underwriting_margin_pct": margin,
            "est_profit_loss_mm": est_pl,
            "remittance_mm": round(remittance / 1_000_000, 2) if remittance else None,
            "reporting_period": period_str,
            "rate_risk_flag": flag
        }
        
        if state_abbr not in results:
            results[state_abbr] = {}
        
        # Use plan_name as key (there can be multiple plans per ticker in a state)
        results[state_abbr][plan_name] = entry
    
    return results


def compute_parent_rollup(state_data: dict) -> list[dict]:
    """
    Roll up state-level data to parent MCO level.
    Returns sorted list of parent MCO summaries.
    """
    parent_agg = {}
    
    for state_abbr, plans in state_data.items():
        for plan_name, data in plans.items():
            ticker = data.get("parent_ticker")
            if not ticker:
                ticker = "UNMATCHED"
            
            if ticker not in parent_agg:
                parent_agg[ticker] = {
                    "ticker": ticker,
                    "states": set(),
                    "total_numerator_mm": 0,
                    "total_denominator_mm": 0,
                    "total_member_months": 0,
                    "total_est_pl_mm": 0,
                    "plan_count": 0,
                    "mlr_values": [],
                    "distress_states": [],
                    "rate_adj_states": [],
                    "high_margin_states": []
                }
            
            agg = parent_agg[ticker]
            agg["states"].add(state_abbr)
            agg["plan_count"] += 1
            
            if data.get("numerator_mm"):
                agg["total_numerator_mm"] += data["numerator_mm"]
            if data.get("denominator_mm"):
                agg["total_denominator_mm"] += data["denominator_mm"]
            if data.get("member_months"):
                agg["total_member_months"] += data["member_months"]
            if data.get("est_profit_loss_mm") is not None:
                agg["total_est_pl_mm"] += data["est_profit_loss_mm"]
            if data.get("mlr_pct"):
                agg["mlr_values"].append(data["mlr_pct"])
            
            flag = data.get("rate_risk_flag")
            if flag == "DISTRESS":
                agg["distress_states"].append(state_abbr)
            elif flag == "RATE_ADJ_LIKELY":
                agg["rate_adj_states"].append(state_abbr)
            elif flag == "HIGH_MARGIN":
                agg["high_margin_states"].append(state_abbr)
    
    results = []
    for ticker, agg in parent_agg.items():
        weighted_mlr = None
        if agg["total_denominator_mm"] > 0:
            weighted_mlr = round(
                (agg["total_numerator_mm"] / agg["total_denominator_mm"]) * 100, 2
            )
        
        results.append({
            "ticker": ticker,
            "states_count": len(agg["states"]),
            "states": sorted(agg["states"]),
            "plan_count": agg["plan_count"],
            "weighted_mlr_pct": weighted_mlr,
            "avg_mlr_pct": round(mean(agg["mlr_values"]), 2) if agg["mlr_values"] else None,
            "median_mlr_pct": round(median(agg["mlr_values"]), 2) if agg["mlr_values"] else None,
            "total_premium_rev_mm": round(agg["total_denominator_mm"], 0),
            "total_claims_qia_mm": round(agg["total_numerator_mm"], 0),
            "total_est_pl_mm": round(agg["total_est_pl_mm"], 0),
            "total_member_months": agg["total_member_months"],
            "underwriting_margin_pct": round(100 - weighted_mlr, 2) if weighted_mlr else None,
            "distress_states": sorted(agg["distress_states"]),
            "rate_adj_likely_states": sorted(agg["rate_adj_states"]),
            "high_margin_states": sorted(agg["high_margin_states"])
        })
    
    # Sort by total premium revenue descending
    results.sort(key=lambda x: x.get("total_premium_rev_mm", 0), reverse=True)
    return results


def generate_rate_adjustment_alerts(state_data: dict, config: dict) -> list[dict]:
    """
    Generate alerts for states where MCO MLRs signal likely rate adjustments.
    This is the leading indicator for rate increases.
    """
    alerts = []
    threshold = config.get("_mlr_thresholds", {}).get("rate_adjustment_trigger", 90)
    frequent = set(config.get("state_rate_adjustment_history", {}).get("frequent_adjusters", []))
    
    # Aggregate by state
    state_summary = {}
    for state_abbr, plans in state_data.items():
        mlrs = [d["mlr_pct"] for d in plans.values() if d.get("mlr_pct")]
        denoms = [d["denominator_mm"] for d in plans.values() if d.get("denominator_mm")]
        nums = [d["numerator_mm"] for d in plans.values() if d.get("numerator_mm")]
        
        if not mlrs:
            continue
        
        total_denom = sum(d for d in denoms if d)
        total_num = sum(n for n in nums if n)
        weighted_mlr = round((total_num / total_denom * 100), 2) if total_denom > 0 else mean(mlrs)
        
        n_above_threshold = sum(1 for m in mlrs if m >= threshold)
        
        state_summary[state_abbr] = {
            "state": state_abbr,
            "weighted_mlr": weighted_mlr,
            "avg_mlr": round(mean(mlrs), 2),
            "plan_count": len(mlrs),
            "plans_above_threshold": n_above_threshold,
            "total_premium_mm": round(total_denom, 0),
            "total_claims_mm": round(total_num, 0),
            "est_total_pl_mm": round(total_denom - total_num, 0),
            "is_frequent_adjuster": state_abbr in frequent,
            "affected_tickers": sorted(set(
                d.get("parent_ticker") for d in plans.values()
                if d.get("parent_ticker") and d.get("mlr_pct", 0) >= threshold
            ))
        }
    
    # Generate alerts sorted by severity
    for state_abbr, s in state_summary.items():
        if s["weighted_mlr"] >= threshold:
            severity = "HIGH" if s["weighted_mlr"] >= 95 else "MEDIUM"
            if s["is_frequent_adjuster"]:
                severity = "CRITICAL" if severity == "HIGH" else "HIGH"
            
            alerts.append({
                "state": state_abbr,
                "severity": severity,
                "weighted_mlr": s["weighted_mlr"],
                "plans_above_90": s["plans_above_threshold"],
                "total_plans": s["plan_count"],
                "est_loss_mm": abs(s["est_total_pl_mm"]) if s["est_total_pl_mm"] < 0 else 0,
                "frequent_adjuster": s["is_frequent_adjuster"],
                "affected_tickers": s["affected_tickers"],
                "signal": f"MLR at {s['weighted_mlr']}% — {'historic adjuster, rate increase likely' if s['is_frequent_adjuster'] else 'monitor for mid-year adjustment'}"
            })
    
    alerts.sort(key=lambda x: (
        {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}.get(x["severity"], 3),
        -x["weighted_mlr"]
    ))
    
    return alerts


def build_quarterly_tracker(config: dict) -> list[dict]:
    """
    Build a quarterly earnings tracker for the Big Five MCOs.
    Uses data from config/mco_plans.json and supplements with
    scraped earnings data when available.
    
    For now, returns the static reference data from config.
    In production, this would scrape SEC filings / earnings releases.
    """
    tracker = []
    for ticker, parent in config.get("parents", {}).items():
        tracker.append({
            "ticker": ticker,
            "name": parent.get("name"),
            "medicaid_members_mm": parent.get("medicaid_members_mm"),
            "medicaid_rev_2025_bn": parent.get("medicaid_rev_2025_bn"),
            "states_count": parent.get("states_count"),
            "notes": parent.get("notes"),
            "key_states": list(parent.get("key_state_exposure", {}).keys())
        })
    return tracker


# ── Field detection / normalization helpers ──

def _detect_field_names(records: list[dict]) -> dict:
    """Detect which column names the CMS data uses (they vary between releases)."""
    if not records:
        return {}
    
    sample = records[0]
    keys_lower = {k.lower().strip(): k for k in sample.keys()}
    
    mapping = {}
    
    # State
    for candidate in ["state", "state_name", "state_abbreviation", "st"]:
        if candidate in keys_lower:
            mapping["state"] = keys_lower[candidate]
            break
    
    # Plan name
    for candidate in ["plan_name", "mco_name", "health_plan_name", "managed_care_plan_name", "organization_name"]:
        if candidate in keys_lower:
            mapping["plan_name"] = keys_lower[candidate]
            break
    
    # MLR
    for candidate in ["mlr", "adjusted_mlr", "mlr_percentage", "medical_loss_ratio", "adjusted_mlr_percentage"]:
        if candidate in keys_lower:
            mapping["mlr"] = keys_lower[candidate]
            break
    
    # Numerator
    for candidate in ["numerator", "mlr_numerator", "total_incurred_claims_and_expenditures"]:
        if candidate in keys_lower:
            mapping["numerator"] = keys_lower[candidate]
            break
    
    # Denominator
    for candidate in ["denominator", "mlr_denominator", "adjusted_premium_revenue"]:
        if candidate in keys_lower:
            mapping["denominator"] = keys_lower[candidate]
            break
    
    # Member months
    for candidate in ["member_months", "total_member_months", "enrolled_member_months"]:
        if candidate in keys_lower:
            mapping["member_months"] = keys_lower[candidate]
            break
    
    # Periods
    for candidate in ["reporting_period_start", "period_start", "rating_period_start_date"]:
        if candidate in keys_lower:
            mapping["period_start"] = keys_lower[candidate]
            break
    
    for candidate in ["reporting_period_end", "period_end", "rating_period_end_date"]:
        if candidate in keys_lower:
            mapping["period_end"] = keys_lower[candidate]
            break
    
    # Remittance
    for candidate in ["remittance", "remittance_amount", "total_remittance"]:
        if candidate in keys_lower:
            mapping["remittance"] = keys_lower[candidate]
            break
    
    # Report year
    for candidate in ["report_year", "year", "rating_period_year"]:
        if candidate in keys_lower:
            mapping["report_year"] = keys_lower[candidate]
            break
    
    return mapping


def _get_field(record: dict, field_map: dict, field_name: str) -> str | None:
    key = field_map.get(field_name)
    if key and key in record:
        return record[key]
    return None


STATE_ABBRS = {
    "alabama": "AL", "alaska": "AK", "arizona": "AZ", "arkansas": "AR",
    "california": "CA", "colorado": "CO", "connecticut": "CT", "delaware": "DE",
    "district of columbia": "DC", "florida": "FL", "georgia": "GA", "hawaii": "HI",
    "idaho": "ID", "illinois": "IL", "indiana": "IN", "iowa": "IA",
    "kansas": "KS", "kentucky": "KY", "louisiana": "LA", "maine": "ME",
    "maryland": "MD", "massachusetts": "MA", "michigan": "MI", "minnesota": "MN",
    "mississippi": "MS", "missouri": "MO", "montana": "MT", "nebraska": "NE",
    "nevada": "NV", "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
    "new york": "NY", "north carolina": "NC", "north dakota": "ND", "ohio": "OH",
    "oklahoma": "OK", "oregon": "OR", "pennsylvania": "PA", "rhode island": "RI",
    "south carolina": "SC", "south dakota": "SD", "tennessee": "TN", "texas": "TX",
    "utah": "UT", "vermont": "VT", "virginia": "VA", "washington": "WA",
    "west virginia": "WV", "wisconsin": "WI", "wyoming": "WY"
}

ABBR_SET = set(STATE_ABBRS.values())


def _normalize_state(state_str: str) -> str | None:
    if not state_str:
        return None
    s = state_str.strip()
    if len(s) == 2 and s.upper() in ABBR_SET:
        return s.upper()
    return STATE_ABBRS.get(s.lower())


def _safe_float(val) -> float | None:
    if val is None:
        return None
    try:
        cleaned = str(val).replace(",", "").replace("$", "").replace("%", "").strip()
        if not cleaned or cleaned.lower() in ("", "n/a", "null", "none", "-"):
            return None
        return float(cleaned)
    except (ValueError, TypeError):
        return None


def _safe_int(val) -> int | None:
    f = _safe_float(val)
    return int(f) if f is not None else None


# ── Main entry point for pipeline integration ──

def run(output_json: bool = True) -> dict:
    """
    Main entry point. Fetch data, compute everything, return results.
    Also saves to data/mco/ for the dashboard.
    """
    config = load_mco_config()
    mlr_records = fetch_mlr_data()
    
    if not mlr_records:
        log.warning("No MLR data available — skipping MCO profitability")
        return {}
    
    log.info("Processing %d MLR records...", len(mlr_records))
    
    state_data = compute_state_profitability(mlr_records, config)
    parent_rollup = compute_parent_rollup(state_data)
    alerts = generate_rate_adjustment_alerts(state_data, config)
    quarterly = build_quarterly_tracker(config)
    
    results = {
        "generated_at": datetime.now().isoformat(),
        "mlr_records_processed": len(mlr_records),
        "states_covered": len(state_data),
        "parent_rollup": parent_rollup,
        "rate_adjustment_alerts": alerts,
        "quarterly_tracker": quarterly,
        "state_detail": {
            k: v for k, v in sorted(state_data.items())
        }
    }
    
    if output_json:
        out_path = DATA_DIR / "mco_profitability.json"
        out_path.write_text(json.dumps(results, indent=2, default=str))
        log.info("MCO profitability data saved to %s", out_path)
        
        # Also save alerts separately for easy consumption
        alerts_path = DATA_DIR / "rate_adjustment_alerts.json"
        alerts_path.write_text(json.dumps(alerts, indent=2))
        log.info("Rate adjustment alerts saved to %s (%d alerts)", alerts_path, len(alerts))
    
    # Log summary
    log.info("\n=== MCO PROFITABILITY SUMMARY ===")
    for p in parent_rollup[:6]:
        log.info(
            "  %s: MLR=%.1f%% | Margin=%.1f%% | Rev=$%.0fM | P/L=$%.0fM | %d states | %d distress",
            p["ticker"],
            p.get("weighted_mlr_pct") or 0,
            p.get("underwriting_margin_pct") or 0,
            p.get("total_premium_rev_mm") or 0,
            p.get("total_est_pl_mm") or 0,
            p["states_count"],
            len(p.get("distress_states", []))
        )
    
    if alerts:
        log.info("\n=== RATE ADJUSTMENT ALERTS ===")
        for a in alerts[:10]:
            log.info(
                "  %s [%s]: MLR=%.1f%% | %s | Tickers: %s",
                a["state"], a["severity"], a["weighted_mlr"],
                a["signal"], ", ".join(a["affected_tickers"])
            )
    
    return results


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    run()
