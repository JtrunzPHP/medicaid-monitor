import json, logging
from pathlib import Path

from src.scraper  import scrape_state
from src.parser   import parse
from src.differ   import diff_files
from src.exposure import compute, summarize_base_rates, build_rate_comparison_table
from src.emailer  import build_html, send
from src.mco_profitability import run as mco_run  # ← ADDED

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger(__name__)

STATES    = json.loads(Path("config/states.json").read_text())
COMPANIES = json.loads(Path("config/companies.json").read_text())
CHECKSUMS = Path("data/checksums.json")
BASE_RATES_OUT = Path("data/base_rates.json")
RATE_TABLE_OUT = Path("data/rate_comparison.json")


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

    # Persist new checksums
    for c in changes:
        cs[c["url"]] = c["new_hash"]
    save_cs(cs)

    # ── Base Rate Analysis (NEW) ──
    # Generate base rate report: current $ per CPT per state per company
    log.info("\n=== BASE RATE ANALYSIS ===")
    base_rate_records = summarize_base_rates(changes, COMPANIES)
    if base_rate_records:
        BASE_RATES_OUT.parent.mkdir(parents=True, exist_ok=True)
        BASE_RATES_OUT.write_text(json.dumps(base_rate_records, indent=2))
        log.info(f"  Base rate report: {len(base_rate_records)} records → {BASE_RATES_OUT}")
        
        # Log summary
        tickers_with_rates = set(r["ticker"] for r in base_rate_records)
        states_with_rates = set(r["state"] for r in base_rate_records)
        codes_with_rates = set(r["code"] for r in base_rate_records)
        log.info(f"  Coverage: {len(tickers_with_rates)} companies × {len(states_with_rates)} states × {len(codes_with_rates)} CPT codes")
        
        # Show top rate flags (significantly above/below national median)
        flags = [r for r in base_rate_records if r.get("vs_median_pct") and abs(r["vs_median_pct"]) > 15]
        if flags:
            log.info(f"\n  === TOP RATE FLAGS ({len(flags)} codes >15% from national median) ===")
            flags.sort(key=lambda x: abs(x.get("vs_median_pct", 0)), reverse=True)
            for f in flags[:20]:
                direction = "ABOVE" if f["vs_median_pct"] > 0 else "BELOW"
                risk = "cut risk" if direction == "ABOVE" else "upside"
                log.info(
                    f"    {f['ticker']:5s} | {f['code']:5s} | {f['state']:2s} | "
                    f"${f['base_rate']:>8.2f} vs median ${f['national_median']:>8.2f} | "
                    f"{f['vs_median_pct']:+.1f}% ({risk})"
                )
    else:
        log.info("  No base rate data extracted")

    # ── Rate Comparison Table (NEW) ──
    # Cross-state comparison for high-volume codes
    high_volume_codes = [
        "99213", "99214", "99215",          # Office visits
        "99281", "99283", "99284", "99285",  # ED visits
        "90834", "90837",                    # Psychotherapy
        "97110", "97140", "97530",           # Rehab therapy
        "T1019", "S5125",                    # Personal care
        "G0299",                             # Home health nursing
        "90960",                             # Dialysis
        "99307", "99308", "99309",           # SNF visits
        "97153",                             # ABA therapy
    ]
    rate_table = build_rate_comparison_table(changes, high_volume_codes)
    if rate_table:
        RATE_TABLE_OUT.write_text(json.dumps(rate_table, indent=2))
        log.info(f"\n  Rate comparison table: {len(rate_table)} codes → {RATE_TABLE_OUT}")
        
        # Print cross-state comparison for key codes
        log.info("\n  === CROSS-STATE RATE COMPARISON ===")
        for code in ["99213", "99214", "90837", "T1019", "97110", "90960"]:
            if code in rate_table and rate_table[code]:
                rates = rate_table[code]
                sorted_states = sorted(rates.items(), key=lambda x: x[1], reverse=True)
                top3 = sorted_states[:3]
                bot3 = sorted_states[-3:] if len(sorted_states) > 3 else []
                log.info(
                    f"    {code}: "
                    f"highest={', '.join(f'{s}=${r:.2f}' for s,r in top3)} | "
                    f"lowest={', '.join(f'{s}=${r:.2f}' for s,r in bot3)}"
                )

    # ── Company Exposure (enhanced with CPT matching) ──
    log.info("\n=== COMPANY EXPOSURE (CPT-WEIGHTED) ===")
    cos = compute(changes, COMPANIES)
    
    for co in cos[:10]:
        log.info(f"\n  {co['ticker']} ({co['name']})")
        log.info(f"    States hit: {list(co['exposed_states'].keys())}")
        log.info(f"    CPT codes matched: {co['n_codes_matched']}")
        log.info(f"    Matched revenue: ${co['total_matched_revenue_mm']}M")
        if co.get("n_flags"):
            log.info(f"    Rate flags: {co['n_flags']} codes significantly above/below median")
        for ci in co.get("cpt_impacts_top10", [])[:5]:
            log.info(
                f"      {ci['code']:5s} in {ci['state']:2s}: "
                f"${ci['base_rate']:>7.2f} "
                f"(vs med {'$'+str(ci['national_median']) if ci['national_median'] else 'N/A'}) "
                f"| est {ci['state_volume_est']:>8,} units → ${ci['state_revenue_est']:>12,}/yr"
            )

    # ── MCO Profitability ──                                                # ← ADDED
    mco_results = mco_run()                                                  # ← ADDED
    log.info("MCO profitability: %d states, %d rate adjustment alerts",      # ← ADDED
             mco_results.get("states_covered", 0),                           # ← ADDED
             len(mco_results.get("rate_adjustment_alerts", [])))             # ← ADDED

    # ── Build & Send Email ──
    n_states = len({c["abbr"] for c in changes})
    n_codes  = len([d for d in all_diffs if d.get("delta_pct") is not None])
    n_base   = len(base_rate_records) if base_rate_records else 0
    n_mco_alerts = len(mco_results.get("rate_adjustment_alerts", []))        # ← ADDED

    subject = (
        f"🏥 Medicaid Monitor: {n_states} state(s) updated"
        + (f", {n_codes} rate moves" if n_codes else "")
        + (f", {n_base} base rates captured" if n_base else "")
        + (f", {n_mco_alerts} MCO rate alerts" if n_mco_alerts else "")      # ← ADDED
    )

    html = build_html(changes, cos, all_diffs)
    send(subject, html)
    log.info("Done.")


if __name__ == "__main__":
    main()
