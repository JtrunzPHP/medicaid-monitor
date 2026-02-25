import os, smtplib, logging, json
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from datetime import date

log = logging.getLogger(__name__)

CODE_MAP_PATH = Path("config/code_company_map.json")


def _load_code_map() -> dict:
    """Build a flat dict: procedure_code -> {tickers, label}"""
    raw = json.loads(CODE_MAP_PATH.read_text())
    flat = {}
    for segment, data in raw.items():
        if segment.startswith("_"):
            continue
        for code in data["codes"]:
            flat[code.upper()] = {
                "tickers": data["tickers"],
                "label":   data["label"]
            }
    return flat


def _fmt_rate(val) -> str:
    if val is None:
        return "—"
    return f"${val:,.2f}"


def _delta_cell(pct) -> str:
    if pct is None:
        return "—"
    color = "#27ae60" if pct > 0 else "#c0392b"
    arrow = "▲" if pct > 0 else "▼"
    return f"<span style='color:{color};font-weight:bold'>{arrow} {abs(pct):.2f}%</span>"


def _ticker_badges(tickers: list[str]) -> str:
    colors = {
        "ADUS": "#2980b9", "AMED": "#8e44ad", "ENSG": "#16a085",
        "SEM":  "#d35400", "ACHC": "#c0392b", "UHS":  "#2c3e50",
        "BKD":  "#7f8c8d", "LNTH": "#27ae60", "OPCH": "#f39c12"
    }
    out = ""
    for t in tickers:
        c = colors.get(t, "#555")
        out += f"<span style='background:{c};color:white;padding:2px 6px;border-radius:3px;font-size:11px;margin-right:3px'>${t}</span>"
    return out


def build_html(changes: list[dict], cos: list[dict], all_diffs: list[dict]) -> str:
    today    = date.today().strftime("%B %d, %Y")
    code_map = _load_code_map()
    th       = "style='background:#1a252f;color:white;padding:8px;text-align:left;white-space:nowrap'"
    td       = "style='padding:7px 9px;border-bottom:1px solid #eee;vertical-align:middle'"

    # ── Summary banner ───────────────────────────────────────────────────────
    n_states  = len({d["abbr"] for d in all_diffs})
    n_codes   = len([d for d in all_diffs if d["delta_pct"] is not None])
    n_inc     = len([d for d in all_diffs if (d["delta_pct"] or 0) > 0])
    n_dec     = len([d for d in all_diffs if (d["delta_pct"] or 0) < 0])

    # ── Per-state diff tables ─────────────────────────────────────────────────
    state_sections = ""
    states_seen = {}
    for d in all_diffs:
        states_seen.setdefault(d["abbr"], {"state": d["state"], "diffs": []})
        states_seen[d["abbr"]]["diffs"].append(d)

    for abbr, info in states_seen.items():
        rows = ""
        for d in info["diffs"][:100]:  # cap at 100 rows per state per email
            code    = d["code"].upper()
            matched = code_map.get(code, None)
            company_html = _ticker_badges(matched["tickers"]) if matched else "<span style='color:#bbb;font-size:11px'>—</span>"
            seg_label    = matched["label"] if matched else ""

            rows += f"""<tr>
              <td {td} style='padding:7px 9px;border-bottom:1px solid #eee;font-family:monospace;font-weight:bold'>{code}</td>
              <td {td}><span style='font-size:11px;color:#666'>{d['desc'][:60] if d['desc'] else seg_label}</span></td>
              <td {td}>{d['direction']}</td>
              <td {td}>{_fmt_rate(d['old_rate'])}</td>
              <td {td}>{_fmt_rate(d['new_rate'])}</td>
              <td {td}>{_delta_cell(d['delta_pct'])}</td>
              <td {td}>{company_html}</td>
            </tr>"""

        if not rows:
            continue

        state_sections += f"""
        <h3 style='margin:30px 0 8px;color:#2c3e50;border-bottom:2px solid #2c3e50;padding-bottom:4px'>
          {info['state']} ({abbr})
        </h3>
        <table style='border-collapse:collapse;width:100%;font-size:13px'>
          <tr>
            <th {th}>Code</th>
            <th {th}>Description / Segment</th>
            <th {th}>Direction</th>
            <th {th}>Old Rate</th>
            <th {th}>New Rate</th>
            <th {th}>% Change</th>
            <th {th}>Companies</th>
          </tr>
          {rows}
        </table>"""

    # ── Company impact summary ────────────────────────────────────────────────
    co_rows = ""
    for co in cos:
        # Find which codes changed for this company
        co_tickers = {co["ticker"]}
        matched_codes = [
            d for d in all_diffs
            if d["abbr"] in co["exposed_states"]
            and co["ticker"] in (code_map.get(d["code"].upper(), {}).get("tickers") or [])
            and d["delta_pct"] is not None
        ]
        inc = [d for d in matched_codes if d["delta_pct"] > 0]
        dec = [d for d in matched_codes if d["delta_pct"] < 0]
        states_str = ", ".join(f"{a}({p*100:.0f}%)" for a, p in co["exposed_states"].items())
        color = "#c0392b" if co["impact_weight"] > 3 else "#e67e22" if co["impact_weight"] > 1 else "#555"

        co_rows += f"""<tr>
          <td {td} style='padding:7px 9px;border-bottom:1px solid #eee;font-weight:bold'>${co['ticker']}</td>
          <td {td}>{co['name']}</td>
          <td {td} style='padding:7px 9px;border-bottom:1px solid #eee;font-size:12px'>{co['segment'].replace('_',' ').title()}</td>
          <td {td}>{co['medicaid_pct']*100:.0f}%</td>
          <td {td} style='padding:7px 9px;border-bottom:1px solid #eee;font-size:12px'>{states_str}</td>
          <td {td} style='padding:7px 9px;border-bottom:1px solid #eee;color:{color};font-weight:bold'>~{co['impact_weight']:.1f}% rev</td>
          <td {td}><span style='color:#27ae60'>▲ {len(inc)}</span> / <span style='color:#c0392b'>▼ {len(dec)}</span> codes</td>
        </tr>"""

    return f"""
    <html><body style='font-family:Arial,sans-serif;max-width:980px;margin:40px auto;color:#333'>

      <div style='background:#1a252f;color:white;padding:20px 30px;border-radius:6px 6px 0 0'>
        <h2 style='margin:0'>🏥 Medicaid Fee Schedule Monitor</h2>
        <p style='margin:6px 0 0;opacity:0.7'>{today} — Daily Digest</p>
      </div>

      <div style='display:flex;gap:0;border:1px solid #ddd;border-top:none'>
        <div style='flex:1;padding:15px 20px;background:#f8f9fa;border-right:1px solid #ddd'>
          <div style='font-size:22px;font-weight:bold;color:#2c3e50'>{n_states}</div>
          <div style='font-size:12px;color:#888'>States with changes</div>
        </div>
        <div style='flex:1;padding:15px 20px;background:#f8f9fa;border-right:1px solid #ddd'>
          <div style='font-size:22px;font-weight:bold;color:#2c3e50'>{n_codes}</div>
          <div style='font-size:12px;color:#888'>Codes changed</div>
        </div>
        <div style='flex:1;padding:15px 20px;background:#f8f9fa;border-right:1px solid #ddd'>
          <div style='font-size:22px;font-weight:bold;color:#27ae60'>▲ {n_inc}</div>
          <div style='font-size:12px;color:#888'>Rate increases</div>
        </div>
        <div style='flex:1;padding:15px 20px;background:#f8f9fa'>
          <div style='font-size:22px;font-weight:bold;color:#c0392b'>▼ {n_dec}</div>
          <div style='font-size:12px;color:#888'>Rate decreases</div>
        </div>
      </div>

      <h3 style='margin:30px 0 10px'>📈 Public Company Exposure Summary</h3>
      {'<table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th ' + th + '>Ticker</th><th ' + th + '>Company</th><th ' + th + '>Segment</th><th ' + th + '>Medicaid Mix</th><th ' + th + '>Exposed States</th><th ' + th + '>Est. Rev Exposure</th><th ' + th + '>Code Moves</th></tr>' + co_rows + '</table>'
       if co_rows else '<p style="color:#888">No tracked companies matched changed codes today.</p>'}

      <h3 style='margin:35px 0 10px'>📋 Rate Changes by State</h3>
      {state_sections or '<p style="color:#888">No structured rate diffs available — files may be first-run or unparseable.</p>'}

      <p style='font-size:11px;color:#aaa;margin-top:40px;border-top:1px solid #eee;padding-top:10px'>
        Automated signal — not investment advice. Company code matching based on typical billing patterns;
        verify against actual company billing mix. Green states only (26 of 50). Max 100 code changes shown per state.
      </p>
    </body></html>"""


def send(subject: str, html: str):
    host = os.environ["SMTP_HOST"]
    port = int(os.environ["SMTP_PORT"])
    user = os.environ["SMTP_USER"]
    pwd  = os.environ["SMTP_PASS"]
    to   = os.environ["EMAIL_TO"]

    msg = MIMEMultipart("alternative")
    msg["Subject"], msg["From"], msg["To"] = subject, user, to
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP_SSL(host, port) if port == 465 else smtplib.SMTP(host, port) as s:
        if port != 465:
            s.starttls()
        s.login(user, pwd)
        s.sendmail(user, to, msg.as_string())
    log.info(f"Sent to {to}")
