"""
MCO Plan Profitability Tracker v2
=================================
Fixed: Field name detection now handles DKAN API numeric keys and
all known CMS column name variants. Adds debug logging of actual
API response structure on first run.
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


def load_mco_config() -> dict:
    if MCO_PLANS_PATH.exists():
        return json.loads(MCO_PLANS_PATH.read_text())
    log.warning("mco_plans.json not found — run with default config")
    return {"parents": {}}


def fetch_mlr_data(use_cache: bool = True) -> list[dict]:
    cache_path = DATA_DIR / "mlr_raw.json"

    if use_cache and cache_path.exists():
        age_hours = (datetime.now().timestamp() - cache_path.stat().st_mtime) / 3600
        if age_hours < 168:
            log.info("Using cached MLR data (%.1f hours old)", age_hours)
            return json.loads(cache_path.read_text())

    if requests is None:
        log.error("requests library not available")
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
    if not plan_name:
        return None
    name_lower = plan_name.lower().strip()
    for ticker, parent in config.get("parents", {}).items():
        for pattern in parent.get("plan_name_patterns", []):
            if pattern.lower() in name_lower:
                return ticker
    return None


def _detect_field_names(records: list[dict]) -> dict:
    """
    Detect column names from the CMS API response.
    Handles: exact matches, partial matches, numeric DKAN keys, and
    various CMS naming conventions across data releases.
    """
    if not records:
        return {}

    sample = records[0]
    actual_keys = list(sample.keys())

    # DEBUG: Log the actual keys so we can see what the API returns
    log.info("  MLR data sample keys: %s", actual_keys)
    log.info("  MLR data sample values (first 3): %s",
             {k: str(v)[:80] for k, v in list(sample.items())[:6]})

    # Build case-insensitive lookup: lowered_key -> original_key
    keys_lower = {k.lower().strip().replace(" ", "_").replace("-", "_"): k for k in actual_keys}

    # Also build a lookup stripping ALL non-alphanumeric chars
    keys_stripped = {}
    for k in actual_keys:
        stripped = re.sub(r'[^a-z0-9]', '', k.lower())
        keys_stripped[stripped] = k

    mapping = {}

    def _find(field_name, candidates):
        """Try each candidate against both lookup dicts."""
        for c in candidates:
            c_lower = c.lower().strip().replace(" ", "_").replace("-", "_")
            c_stripped = re.sub(r'[^a-z0-9]', '', c.lower())
            # Exact match on normalized key
            if c_lower in keys_lower:
                mapping[field_name] = keys_lower[c_lower]
                return
            # Stripped match
            if c_stripped in keys_stripped:
                mapping[field_name] = keys_stripped[c_stripped]
                return
        # Partial match: check if any candidate is a substring of any key
        for c in candidates:
            c_low = c.lower()
            for k_low, k_orig in keys_lower.items():
                if c_low in k_low or k_low in c_low:
                    mapping[field_name] = k_orig
                    return

    # State
    _find("state", [
        "state", "state_name", "state_abbreviation", "st",
        "State", "State Name", "state_or_territory"
    ])

    # Plan name
    _find("plan_name", [
        "plan_name", "mco_name", "health_plan_name",
        "managed_care_plan_name", "organization_name",
        "plan", "Plan Name", "MCO Name", "Health Plan Name",
        "managed_care_organization_name"
    ])

    # MLR
    _find("mlr", [
        "mlr", "adjusted_mlr", "mlr_percentage",
        "medical_loss_ratio", "adjusted_mlr_percentage",
        "MLR", "Adjusted MLR", "MLR Percentage",
        "mlr_pct", "adjusted_mlr_pct"
    ])

    # Numerator
    _find("numerator", [
        "numerator", "mlr_numerator",
        "total_incurred_claims_and_expenditures",
        "MLR Numerator", "Numerator",
        "incurred_claims", "claims_and_quality"
    ])

    # Denominator
    _find("denominator", [
        "denominator", "mlr_denominator",
        "adjusted_premium_revenue",
        "MLR Denominator", "Denominator",
        "premium_revenue", "capitation_revenue"
    ])

    # Member months
    _find("member_months", [
        "member_months", "total_member_months",
        "enrolled_member_months",
        "Member Months", "Total Member Months"
    ])

    # Periods
    _find("period_start", [
        "reporting_period_start", "period_start",
        "rating_period_start_date", "start_date",
        "Reporting Period Start", "Rating Period Start Date"
    ])

    _find("period_end", [
        "reporting_period_end", "period_end",
        "rating_period_end_date", "end_date",
        "Reporting Period End", "Rating Period End Date"
    ])

    # Remittance
    _find("remittance", [
        "remittance", "remittance_amount", "total_remittance",
        "Remittance", "Remittance Amount"
    ])

    # Report year
    _find("report_year", [
        "report_year", "year", "rating_period_year",
        "Report Year", "Year"
    ])

    log.info("  Field mapping result: %s", mapping)

    # Warn about unmapped critical fields
    critical = ["state", "plan_name"]
    for f in critical:
        if f not in mapping:
            log.warning("  ⚠ CRITICAL: Could not map field '%s' — MLR processing will fail", f)
            log.warning("    Available keys: %s", actual_keys)

    return mapping


def _get_field(record: dict, field_map: dict, field_name: str):
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


def compute_state_profitability(mlr_records: list[dict], config: dict) -> dict:
    results = {}
    field_map = _detect_field_names(mlr_records)

    if "state" not in field_map or "plan_name" not in field_map:
        log.error("Cannot process MLR data — missing critical field mappings")
        log.error("  Need 'state' and 'plan_name'. Got: %s", list(field_map.keys()))
        return {}

    skipped_no_state = 0
    skipped_no_plan = 0
    skipped_no_mlr = 0
    processed = 0

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

        if not state:
            skipped_no_state += 1
            continue
        if not plan_name:
            skipped_no_plan += 1
            continue

        state_abbr = _normalize_state(state)
        if not state_abbr:
            skipped_no_state += 1
            continue

        ticker = match_plan_to_parent(plan_name, config)

        mlr_pct = _safe_float(mlr_raw)
        if mlr_pct is None and numerator and denominator and denominator > 0:
            mlr_pct = round((numerator / denominator) * 100, 2)

        # If MLR > 1 but < 100, it might already be a percentage
        # If MLR < 1, it's likely a decimal (e.g., 0.89 = 89%)
        if mlr_pct is not None and mlr_pct < 1:
            mlr_pct = round(mlr_pct * 100, 2)

        if mlr_pct is None:
            skipped_no_mlr += 1
            continue

        processed += 1
        margin = round(100 - mlr_pct, 2)
        est_pl = round((denominator - numerator) / 1_000_000, 1) if numerator and denominator else None

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
        results[state_abbr][plan_name] = entry

    log.info("  MLR processing: %d processed, %d skipped (no state=%d, no plan=%d, no MLR=%d)",
             processed, skipped_no_state + skipped_no_plan + skipped_no_mlr,
             skipped_no_state, skipped_no_plan, skipped_no_mlr)

    return results


def compute_parent_rollup(state_data: dict) -> list[dict]:
    parent_agg = {}
    for state_abbr, plans in state_data.items():
        for plan_name, data in plans.items():
            ticker = data.get("parent_ticker") or "UNMATCHED"
            if ticker not in parent_agg:
                parent_agg[ticker] = {
                    "ticker": ticker, "states": set(),
                    "total_numerator_mm": 0, "total_denominator_mm": 0,
                    "total_member_months": 0, "total_est_pl_mm": 0,
                    "plan_count": 0, "mlr_values": [],
                    "distress_states": [], "rate_adj_states": [],
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
    results.sort(key=lambda x: x.get("total_premium_rev_mm", 0), reverse=True)
    return results


def generate_rate_adjustment_alerts(state_data: dict, config: dict) -> list[dict]:
    alerts = []
    threshold = config.get("_mlr_thresholds", {}).get("rate_adjustment_trigger", 90)
    frequent = set(config.get("state_rate_adjustment_history", {}).get("frequent_adjusters", []))

    for state_abbr, plans in state_data.items():
        mlrs = [d["mlr_pct"] for d in plans.values() if d.get("mlr_pct")]
        denoms = [d["denominator_mm"] for d in plans.values() if d.get("denominator_mm")]
        nums = [d["numerator_mm"] for d in plans.values() if d.get("numerator_mm")]
        if not mlrs:
            continue
        total_denom = sum(d for d in denoms if d)
        total_num = sum(n for n in nums if n)
        weighted_mlr = round((total_num / total_denom * 100), 2) if total_denom > 0 else mean(mlrs)
        n_above = sum(1 for m in mlrs if m >= threshold)

        if weighted_mlr >= threshold:
            severity = "HIGH" if weighted_mlr >= 95 else "MEDIUM"
            if state_abbr in frequent:
                severity = "CRITICAL" if severity == "HIGH" else "HIGH"
            est_pl = round(total_denom - total_num, 0)
            alerts.append({
                "state": state_abbr,
                "severity": severity,
                "weighted_mlr": weighted_mlr,
                "plans_above_90": n_above,
                "total_plans": len(mlrs),
                "est_loss_mm": abs(est_pl) if est_pl < 0 else 0,
                "frequent_adjuster": state_abbr in frequent,
                "affected_tickers": sorted(set(
                    d.get("parent_ticker") for d in plans.values()
                    if d.get("parent_ticker") and d.get("mlr_pct", 0) >= threshold
                )),
                "signal": f"MLR at {weighted_mlr}% — {'historic adjuster, rate increase likely' if state_abbr in frequent else 'monitor for mid-year adjustment'}"
            })

    alerts.sort(key=lambda x: (
        {"CRITICAL": 0, "HIGH": 1, "MEDIUM": 2}.get(x["severity"], 3),
        -x["weighted_mlr"]
    ))
    return alerts


def build_quarterly_tracker(config: dict) -> list[dict]:
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


def run(output_json: bool = True) -> dict:
    config = load_mco_config()
    mlr_records = fetch_mlr_data()

    if not mlr_records:
        log.warning("No MLR data available — skipping MCO profitability")
        return {"states_covered": 0, "rate_adjustment_alerts": []}

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
        "state_detail": {k: v for k, v in sorted(state_data.items())}
    }

    if output_json:
        out_path = DATA_DIR / "mco_profitability.json"
        out_path.write_text(json.dumps(results, indent=2, default=str))
        log.info("MCO profitability data saved to %s", out_path)
        alerts_path = DATA_DIR / "rate_adjustment_alerts.json"
        alerts_path.write_text(json.dumps(alerts, indent=2))
        log.info("Rate adjustment alerts saved to %s (%d alerts)", alerts_path, len(alerts))

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
