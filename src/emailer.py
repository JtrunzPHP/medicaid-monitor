"""
Email builder for Medicaid fee schedule monitor.

Generates an HTML email with:
1. Executive summary — key findings, biggest rate moves, company impacts
2. Company impact scorecard — CPT-level detail with base rates + deltas
3. Cross-state rate comparison — key codes across all scraped states
4. Rate flags — codes significantly above/below national median (alpha signals)
5. State-by-state detail — per-file summaries
6. Code-level diffs — every rate change with old→new→delta

The goal: read this email and know exactly which public companies face
revenue headwinds or tailwinds from Medicaid fee schedule changes.
"""

import json
import logging
import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

log = logging.getLogger(__name__)

# ── Styling ──────────────────────────────────────────────────

STYLE = """
<style>
body{font-family:system-ui,-apple-system,sans-serif;background:#0f0f1a;color:#e2e8f0;margin:0;padding:0;font-size:13px}
.wrap{max-width:900px;margin:0 auto;padding:16px}
.hdr{background:linear-gradient(135deg,#1e1b4b,#312e81);padding:20px 24px;border-radius:8px 8px 0 0}
.hdr h1{color:#fff;font-size:20px;margin:0}.hdr p{color:#a5b4fc;font-size:11px;margin-top:4px}
.card{background:#1e1e2e;border-radius:8px;padding:14px;margin:12px 0;border:1px solid #2d2d44}
.card h2{font-size:14px;color:#a5b4fc;margin:0 0 10px;border-bottom:1px solid #3730a3;padding-bottom:6px}
.card h3{font-size:12px;color:#e2e8f0;margin:10px 0 6px}
table{width:100%;border-collapse:collapse;font-size:11px}
th{background:#1a1a2e;color:#94a3b8;font-size:9px;text-transform:uppercase;letter-spacing:0.5px;padding:6px 5px;text-align:left;border-bottom:1px solid #3730a3}
td{padding:5px;border-bottom:1px solid #1a1a2e;color:#e2e8f0}
tr:hover td{background:#1a1a2e}
.pos{color:#10b981}.neg{color:#ef4444}.warn{color:#f59e0b}.dim{color:#64748b}
.tag{display:inline-block;padding:2px 6px;border-radius:4px;font-size:9px;font-weight:600}
.tag-up{background:#064e3b;color:#10b981}.tag-down{background:#450a0a;color:#ef4444}
.tag-new{background:#1e1b4b;color:#a5b4fc}.tag-flag{background:#451a03;color:#f59e0b}
.kpi{display:inline-block;background:#1a1a2e;border-radius:6px;padding:8px 14px;margin:4px;text-align:center;min-width:100px;border-left:3px solid #6366f1}
.kpi-label{font-size:9px;color:#94a3b8;text-transform:uppercase}.kpi-val{font-size:18px;font-weight:700;margin-top:2px}
.footer{font-size:9px;color:#64748b;padding:12px 0;border-top:1px solid #2d2d44;margin-top:16px}
.bar{height:4px;border-radius:2px;display:inline-block;vertical-align:middle}
</style>
"""


def build_html(changes: list[dict], companies: list[dict], diffs: list[dict]) -> str:
    """Build the complete HTML email report."""
    
    # Load supplementary data if available
    base_rates = _load_json("data/base_rates.json")
    rate_table = _load_json("data/rate_comparison.json")
    
    parts = [
        "<!DOCTYPE html><html><head><meta charset='utf-8'>",
        STYLE,
        "</head><body><div class='wrap'>",
        _section_header(changes, diffs, companies),
        _section_executive_summary(changes, diffs, companies),
        _section_company_impacts(companies),
        _section_rate_flags(companies),
        _section_cross_state_comparison(rate_table),
        _section_base_rate_report(base_rates, companies),
        _section_rate_changes(diffs),
        _section_state_detail(changes),
        _section_footer(),
        "</div></body></html>",
    ]
    
    return "\n".join(parts)


def _load_json(path: str) -> list | dict | None:
    p = Path(path)
    if p.exists():
        try:
            return json.loads(p.read_text())
        except Exception:
            pass
    return None


# ── Header ───────────────────────────────────────────────────

def _section_header(changes, diffs, companies):
    n_states = len({c["abbr"] for c in changes})
    n_files = len(changes)
    n_changes = len([d for d in diffs if d.get("direction") not in ("UNCHANGED",)])
    n_companies = len(companies)
    
    return f"""
    <div class="hdr">
        <h1>🏥 Medicaid Fee Schedule Monitor</h1>
        <p>{n_states} states updated | {n_files} files processed | {n_changes} rate changes | {n_companies} companies impacted</p>
    </div>
    """


# ── Executive Summary ────────────────────────────────────────

def _section_executive_summary(changes, diffs, companies):
    # Count ups/downs
    ups = [d for d in diffs if d.get("direction") == "UP"]
    downs = [d for d in diffs if d.get("direction") == "DOWN"]
    
    # Biggest moves
    rate_moves = [d for d in diffs if d.get("delta_pct") is not None and d.get("delta_pct") != 0]
    rate_moves.sort(key=lambda x: abs(x["delta_pct"]), reverse=True)
    top_moves = rate_moves[:8]
    
    # Most impacted companies
    top_cos = companies[:5]
    
    html = '<div class="card"><h2>Executive Summary</h2>'
    
    # KPIs
    html += '<div style="margin-bottom:12px">'
    html += _kpi("Rate Increases", str(len(ups)), "#10b981")
    html += _kpi("Rate Decreases", str(len(downs)), "#ef4444")
    html += _kpi("States", str(len({c["abbr"] for c in changes})), "#6366f1")
    
    total_flags = sum(c.get("n_flags", 0) for c in companies)
    if total_flags:
        html += _kpi("Rate Flags", str(total_flags), "#f59e0b")
    html += '</div>'
    
    # Biggest rate moves
    if top_moves:
        html += '<h3>Largest Rate Moves</h3><table>'
        html += '<tr><th>State</th><th>Code</th><th>Description</th><th>Old Rate</th><th>New Rate</th><th>Change</th><th>%</th></tr>'
        for d in top_moves:
            cls = "pos" if (d.get("delta") or 0) > 0 else "neg"
            tag_cls = "tag-up" if d.get("direction") == "UP" else "tag-down"
            html += f"""<tr>
                <td><b>{d.get('state','')}</b></td>
                <td><b>{d['code']}</b></td>
                <td class="dim">{d.get('desc','')[:50]}</td>
                <td>${d.get('old_rate',0):,.2f}</td>
                <td><b>${d.get('new_rate',0):,.2f}</b></td>
                <td class="{cls}">{'+' if (d.get('delta') or 0) > 0 else ''}{d.get('delta',0):,.2f}</td>
                <td><span class="tag {tag_cls}">{'+' if d.get('delta_pct',0) > 0 else ''}{d.get('delta_pct',0):.1f}%</span></td>
            </tr>"""
        html += '</table>'
    
    # Top impacted companies
    if top_cos:
        html += '<h3>Most Impacted Companies</h3><table>'
        html += '<tr><th>Ticker</th><th>Company</th><th>Segment</th><th>States Hit</th><th>CPT Matches</th><th>Matched Rev</th><th>Flags</th></tr>'
        for co in top_cos:
            states_str = ", ".join(co.get("exposed_states", {}).keys())
            html += f"""<tr>
                <td><b>{co['ticker']}</b></td>
                <td>{co['name']}</td>
                <td class="dim">{co.get('segment','')}</td>
                <td>{states_str}</td>
                <td>{co.get('n_codes_matched',0)}</td>
                <td><b>${co.get('total_matched_revenue_mm',0)}M</b></td>
                <td class="warn">{co.get('n_flags',0)}</td>
            </tr>"""
        html += '</table>'
    
    html += '</div>'
    return html


# ── Company Impact Detail ────────────────────────────────────

def _section_company_impacts(companies):
    if not companies:
        return ""
    
    html = '<div class="card"><h2>Company Impact — CPT-Level Detail</h2>'
    html += '<p class="dim" style="font-size:10px;margin-bottom:10px">Base rate = current Medicaid reimbursement. vs Median = compared to national median across all scraped states. Revenue est = base_rate × state_volume_estimate.</p>'
    
    for co in companies[:10]:
        impacts = co.get("cpt_impacts_top10", [])
        if not impacts:
            continue
        
        html += f'<h3 style="color:{_ticker_color(co["ticker"])}">{co["ticker"]} — {co["name"]} ({co.get("segment","")})</h3>'
        html += f'<p class="dim" style="font-size:10px">Medicaid rev: ${co.get("annual_medicaid_rev_mm",0)}M | Medicaid mix: {co.get("medicaid_pct",0)*100:.0f}% | Matched: ${co.get("total_matched_revenue_mm",0)}M across {co.get("n_codes_matched",0)} codes</p>'
        
        html += '<table>'
        html += '<tr><th>State</th><th>CPT</th><th>Description</th><th>Base Rate</th><th>Natl Median</th><th>vs Median</th><th>Est Volume</th><th>Est Revenue</th></tr>'
        
        for ci in impacts:
            vs_cls = ""
            vs_str = "—"
            if ci.get("vs_median_pct") is not None:
                vs_cls = "pos" if ci["vs_median_pct"] < 0 else ("neg" if ci["vs_median_pct"] > 15 else "")
                vs_str = f'{ci["vs_median_pct"]:+.1f}%'
            
            html += f"""<tr>
                <td><b>{ci['state']}</b></td>
                <td><b>{ci['code']}</b></td>
                <td class="dim">{ci.get('desc','')[:40]}</td>
                <td><b>${ci['base_rate']:,.2f}</b></td>
                <td>${ci['national_median']:,.2f}</td>
                <td class="{vs_cls}">{vs_str}</td>
                <td>{ci['state_volume_est']:,}</td>
                <td>${ci['state_revenue_est']:,}</td>
            </tr>"""
        
        html += '</table>'
        
        # Rate flags for this company
        flags = co.get("base_rate_flags", [])
        if flags:
            html += '<div style="margin:6px 0;padding:6px 10px;background:#1a1a2e;border-radius:4px;border-left:3px solid #f59e0b">'
            html += f'<span class="warn" style="font-size:10px;font-weight:600">⚠ {len(flags)} Rate Flag(s):</span> '
            for f in flags[:5]:
                emoji = "🔴" if f["direction"] == "ABOVE" else "🟢"
                html += f'<span style="font-size:10px">{emoji} {f["code"]} in {f["state"]}: ${f["base_rate"]} ({f["deviation_pct"]:+.0f}% vs median — {f["risk"]}) </span>'
            html += '</div>'
    
    html += '</div>'
    return html


# ── Rate Flags ───────────────────────────────────────────────

def _section_rate_flags(companies):
    all_flags = []
    for co in companies:
        for f in co.get("base_rate_flags", []):
            all_flags.append({**f, "ticker": co["ticker"], "company": co["name"]})
    
    if not all_flags:
        return ""
    
    all_flags.sort(key=lambda x: abs(x.get("deviation_pct", 0)), reverse=True)
    
    html = '<div class="card"><h2>⚠ Rate Flags — Alpha Signals</h2>'
    html += '<p class="dim" style="font-size:10px;margin-bottom:8px">Codes where a state\'s Medicaid rate is >15% above or below the national median. <b>ABOVE median = rate cut risk</b> (state is overpaying relative to peers). <b>BELOW median = upside potential</b> (state may raise rates to align).</p>'
    
    html += '<table>'
    html += '<tr><th>Ticker</th><th>Code</th><th>State</th><th>Base Rate</th><th>Natl Median</th><th>Deviation</th><th>Signal</th><th>Description</th></tr>'
    
    for f in all_flags[:20]:
        if f["direction"] == "ABOVE":
            signal = '<span class="tag tag-down">CUT RISK</span>'
        else:
            signal = '<span class="tag tag-up">UPSIDE</span>'
        
        html += f"""<tr>
            <td><b>{f['ticker']}</b></td>
            <td><b>{f['code']}</b></td>
            <td>{f['state']}</td>
            <td><b>${f['base_rate']:,.2f}</b></td>
            <td>${f['national_median']:,.2f}</td>
            <td class="{'neg' if f['direction']=='ABOVE' else 'pos'}">{f['deviation_pct']:+.1f}%</td>
            <td>{signal}</td>
            <td class="dim">{f.get('desc','')[:35]}</td>
        </tr>"""
    
    html += '</table></div>'
    return html


# ── Cross-State Comparison ───────────────────────────────────

def _section_cross_state_comparison(rate_table):
    if not rate_table:
        return ""
    
    # Get all states that appear
    all_states = set()
    for code, state_rates in rate_table.items():
        all_states.update(state_rates.keys())
    states = sorted(all_states)
    
    if not states:
        return ""
    
    # Key codes to feature
    feature_codes = [
        ("99213", "Office Visit - Low"),
        ("99214", "Office Visit - Moderate"),
        ("99215", "Office Visit - High"),
        ("90837", "Psychotherapy 60min"),
        ("90834", "Psychotherapy 45min"),
        ("97110", "Therapeutic Exercise"),
        ("97153", "ABA Therapy"),
        ("T1019", "Personal Care 15min"),
        ("G0299", "Home Health Nursing"),
        ("90960", "ESRD Monthly 4+ visits"),
        ("99307", "SNF Subsequent - Low"),
        ("99308", "SNF Subsequent - Mod"),
        ("99283", "ED Visit - Moderate"),
        ("99284", "ED Visit - High"),
        ("99285", "ED Visit - Critical"),
    ]
    
    html = '<div class="card"><h2>Cross-State Rate Comparison — Key CPT Codes</h2>'
    html += '<p class="dim" style="font-size:10px;margin-bottom:8px">Current base Medicaid reimbursement by state for high-volume procedure codes. Highest rate in green, lowest in red. Use this to identify states paying above/below peers.</p>'
    
    html += '<table><tr><th>Code</th><th>Description</th>'
    for s in states:
        html += f'<th>{s}</th>'
    html += '<th>Min</th><th>Max</th><th>Spread</th></tr>'
    
    for code, desc in feature_codes:
        if code not in rate_table or not rate_table[code]:
            continue
        
        rates = rate_table[code]
        vals = [v for v in rates.values() if v > 0]
        if not vals:
            continue
        
        min_val, max_val = min(vals), max(vals)
        spread = ((max_val / min_val - 1) * 100) if min_val > 0 else 0
        
        html += f'<tr><td><b>{code}</b></td><td class="dim">{desc}</td>'
        for s in states:
            v = rates.get(s)
            if v and v > 0:
                # Color: green if near min, red if near max
                if max_val > min_val:
                    pct = (v - min_val) / (max_val - min_val)
                    color = f"color:{'#ef4444' if pct > 0.8 else '#10b981' if pct < 0.2 else '#e2e8f0'}"
                else:
                    color = ""
                html += f'<td style="{color}">${v:,.2f}</td>'
            else:
                html += '<td class="dim">—</td>'
        
        html += f'<td class="pos">${min_val:,.2f}</td>'
        html += f'<td class="neg">${max_val:,.2f}</td>'
        spread_cls = "neg" if spread > 50 else "warn" if spread > 25 else ""
        html += f'<td class="{spread_cls}">{spread:.0f}%</td>'
        html += '</tr>'
    
    html += '</table></div>'
    return html


# ── Base Rate Report ─────────────────────────────────────────

def _section_base_rate_report(base_rates, companies):
    if not base_rates:
        return ""
    
    # Group by ticker
    by_ticker = {}
    for r in base_rates:
        tk = r["ticker"]
        if tk not in by_ticker:
            by_ticker[tk] = []
        by_ticker[tk].append(r)
    
    html = '<div class="card"><h2>Base Rate Report — Current $ by Company × State × CPT</h2>'
    html += '<p class="dim" style="font-size:10px;margin-bottom:8px">This is the answer to "what does State X currently pay for Code Y?" for each company\'s key revenue-driving codes. The base rate is the <b>actual current Medicaid fee schedule amount</b> — not a change, but the underlying reimbursement level that drives revenue.</p>'
    
    for tk in list(by_ticker.keys())[:8]:
        records = by_ticker[tk]
        co_name = records[0].get("company", tk)
        
        html += f'<h3 style="color:{_ticker_color(tk)}">{tk} — {co_name}</h3>'
        html += '<table>'
        html += '<tr><th>CPT</th><th>Description</th><th>State</th><th>State Exp%</th><th>Base Rate</th><th>Natl Median</th><th>vs Median</th><th>Rev % of Co</th></tr>'
        
        # Sort by rev_pct descending, then state
        records.sort(key=lambda x: (-x.get("rev_pct", 0), x.get("state", "")))
        
        for r in records[:20]:
            vs_cls = ""
            vs_str = "—"
            if r.get("vs_median_pct") is not None:
                vs_cls = "neg" if r["vs_median_pct"] > 15 else ("pos" if r["vs_median_pct"] < -15 else "")
                vs_str = f'{r["vs_median_pct"]:+.1f}%'
            
            html += f"""<tr>
                <td><b>{r['code']}</b></td>
                <td class="dim">{r.get('desc','')[:35]}</td>
                <td><b>{r['state']}</b></td>
                <td>{r.get('state_exposure_pct',0)*100:.0f}%</td>
                <td><b>${r['base_rate']:,.2f}</b></td>
                <td>{f"${r['national_median']:,.2f}" if r.get('national_median') else "—"}</td>
                <td class="{vs_cls}">{vs_str}</td>
                <td>{r.get('rev_pct',0)*100:.1f}%</td>
            </tr>"""
        
        html += '</table>'
    
    html += '</div>'
    return html


# ── Rate Changes (Diffs) ────────────────────────────────────

def _section_rate_changes(diffs):
    if not diffs:
        return ""
    
    # Only show actual changes
    changes = [d for d in diffs if d.get("direction") in ("UP", "DOWN", "NEW", "REMOVED")]
    if not changes:
        return ""
    
    # Group by state
    by_state = {}
    for d in changes:
        st = d.get("state", "??")
        if st not in by_state:
            by_state[st] = []
        by_state[st].append(d)
    
    html = '<div class="card"><h2>All Rate Changes — Code-Level Detail</h2>'
    
    for state in sorted(by_state.keys()):
        state_diffs = by_state[state]
        state_diffs.sort(key=lambda x: abs(x.get("delta_pct") or 0), reverse=True)
        
        n_up = sum(1 for d in state_diffs if d["direction"] == "UP")
        n_down = sum(1 for d in state_diffs if d["direction"] == "DOWN")
        
        html += f'<h3>{state} — {len(state_diffs)} changes (↑{n_up} ↓{n_down})</h3>'
        html += '<table>'
        html += '<tr><th>Code</th><th>Description</th><th>Old Rate</th><th>New Rate</th><th>Change</th><th>%</th><th>Direction</th></tr>'
        
        for d in state_diffs[:50]:
            old_str = f'${d["old_rate"]:,.2f}' if d.get("old_rate") is not None else "—"
            new_str = f'${d["new_rate"]:,.2f}' if d.get("new_rate") is not None else "—"
            delta_str = f'{d["delta"]:+,.2f}' if d.get("delta") is not None else "—"
            pct_str = f'{d["delta_pct"]:+.1f}%' if d.get("delta_pct") is not None else "—"
            
            dir_map = {
                "UP": '<span class="tag tag-up">↑ UP</span>',
                "DOWN": '<span class="tag tag-down">↓ DOWN</span>',
                "NEW": '<span class="tag tag-new">+ NEW</span>',
                "REMOVED": '<span class="tag tag-down">- REMOVED</span>',
            }
            
            html += f"""<tr>
                <td><b>{d['code']}</b></td>
                <td class="dim">{d.get('desc','')[:40]}</td>
                <td>{old_str}</td>
                <td><b>{new_str}</b></td>
                <td class="{'pos' if (d.get('delta') or 0) > 0 else 'neg'}">{delta_str}</td>
                <td>{pct_str}</td>
                <td>{dir_map.get(d['direction'], d['direction'])}</td>
            </tr>"""
        
        if len(state_diffs) > 50:
            html += f'<tr><td colspan="7" class="dim">... and {len(state_diffs)-50} more</td></tr>'
        
        html += '</table>'
    
    html += '</div>'
    return html


# ── State Detail ─────────────────────────────────────────────

def _section_state_detail(changes):
    if not changes:
        return ""
    
    html = '<div class="card"><h2>State-by-State File Summary</h2>'
    html += '<table>'
    html += '<tr><th>State</th><th>File</th><th>Status</th><th>Size</th><th>Parse Summary</th></tr>'
    
    for c in sorted(changes, key=lambda x: x.get("state", "")):
        status = "🆕 NEW" if c.get("is_new") else "🔄 UPDATED"
        size = f'{c.get("size_bytes",0):,} bytes'
        
        html += f"""<tr>
            <td><b>{c.get('abbr','')}</b></td>
            <td class="dim">{c.get('filename','')[:40]}</td>
            <td>{status}</td>
            <td>{size}</td>
            <td class="dim" style="font-size:10px">{c.get('summary','')[:80]}</td>
        </tr>"""
    
    html += '</table></div>'
    return html


# ── Footer ───────────────────────────────────────────────────

def _section_footer():
    return """
    <div class="footer">
        <b>Medicaid Fee Schedule Monitor</b> — Auto-generated report<br>
        Data sources: State Medicaid agency fee schedule publications<br>
        Rate flags: codes where state reimbursement deviates >15% from national median across scraped states<br>
        Revenue estimates use approximate PMPM and volume assumptions — verify against company filings<br>
        CPT® is a registered trademark of the American Medical Association
    </div>
    """


# ── Helpers ──────────────────────────────────────────────────

def _kpi(label, value, color="#6366f1"):
    return f'<div class="kpi" style="border-left-color:{color}"><div class="kpi-label">{label}</div><div class="kpi-val" style="color:{color}">{value}</div></div>'


def _ticker_color(ticker):
    colors = {
        "ADUS": "#6366f1", "ENSG": "#0ea5e9", "PNTG": "#10b981",
        "ACHC": "#f59e0b", "LFST": "#ec4899", "UHS": "#8b5cf6",
        "THC": "#f97316", "DVA": "#14b8a6", "MODV": "#06b6d4",
        "BTSG": "#84cc16", "MD": "#a855f7", "OPCH": "#e11d48",
        "EHC": "#10b981", "SGRY": "#f59e0b", "NHC": "#6366f1",
        "AMED": "#0ea5e9", "SEM": "#8b5cf6", "BKD": "#f97316",
        "LNTH": "#ec4899",
    }
    return colors.get(ticker, "#94a3b8")


# ── Send ─────────────────────────────────────────────────────

def send(subject: str, html: str):
    """Send HTML email via SMTP. Configure via environment variables."""
    smtp_host = os.environ.get("SMTP_HOST", "")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_USER", "")
    smtp_pass = os.environ.get("SMTP_PASS", "")
    to_addr = os.environ.get("ALERT_EMAIL", "")

    if not all([smtp_host, smtp_user, smtp_pass, to_addr]):
        # Save to file if no email configured
        out = Path("data/report.html")
        out.write_text(html, encoding="utf-8")
        log.info("No email config — report saved to %s", out)
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = smtp_user
    msg["To"] = to_addr
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.starttls()
            server.login(smtp_user, smtp_pass)
            server.send_message(msg)
        log.info("Email sent to %s", to_addr)
    except Exception as e:
        log.error("Email failed: %s", e)
        # Fallback: save to file
        out = Path("data/report.html")
        out.write_text(html, encoding="utf-8")
        log.info("Fallback: report saved to %s", out)
