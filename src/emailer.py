import os, smtplib, logging
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from datetime import date

log = logging.getLogger(__name__)


def build_html(changes: list[dict], cos: list[dict]) -> str:
    today = date.today().strftime("%B %d, %Y")

    # ── State changes table ──────────────────────────────────────────────────
    state_rows = ""
    for c in changes:
        badge = "🆕 NEW" if c.get("is_new") else "🔄 UPDATED"
        sample_html = ""
        if c.get("rate_sample"):
            rows = "".join(f"<tr><td>{s['code']}</td><td>{s['rate']}</td></tr>"
                           for s in c["rate_sample"])
            sample_html = (
                "<table style='font-size:11px;border-collapse:collapse'>"
                "<tr><th>Code</th><th>Rate</th></tr>"
                f"{rows}</table>"
            )
        state_rows += f"""
        <tr>
          <td style='font-weight:bold;padding:7px;border:1px solid #ddd'>{c['state']} ({c['abbr']})</td>
          <td style='padding:7px;border:1px solid #ddd'>{badge}</td>
          <td style='padding:7px;border:1px solid #ddd;font-size:12px;color:#555'>{c['filename']}</td>
          <td style='padding:7px;border:1px solid #ddd;font-size:12px'>{c.get('summary', '—')}</td>
          <td style='padding:7px;border:1px solid #ddd'>{sample_html or '—'}</td>
          <td style='padding:7px;border:1px solid #ddd'><a href='{c['url']}' style='color:#2980b9'>↓ File</a></td>
        </tr>"""

    # ── Company impact table ─────────────────────────────────────────────────
    co_rows = ""
    for co in cos:
        states_str = ", ".join(f"{a}({p*100:.0f}%)" for a, p in co["exposed_states"].items())
        color = "#c0392b" if co["impact_weight"] > 3 else "#e67e22" if co["impact_weight"] > 1 else "#27ae60"
        co_rows += f"""
        <tr>
          <td style='font-weight:bold;padding:7px;border:1px solid #ddd'>${co['ticker']}</td>
          <td style='padding:7px;border:1px solid #ddd'>{co['name']}</td>
          <td style='padding:7px;border:1px solid #ddd;font-size:12px'>{co['segment'].replace('_', ' ').title()}</td>
          <td style='padding:7px;border:1px solid #ddd'>{co['medicaid_pct']*100:.0f}%</td>
          <td style='padding:7px;border:1px solid #ddd;font-size:12px'>{states_str}</td>
          <td style='padding:7px;border:1px solid #ddd;color:{color};font-weight:bold'>~{co['impact_weight']:.1f}% rev</td>
        </tr>"""

    th = "style='background:#1a252f;color:white;padding:8px;text-align:left'"

    return f"""
    <html><body style='font-family:Arial,sans-serif;max-width:960px;margin:40px auto;color:#333'>
      <div style='background:#1a252f;color:white;padding:20px 30px;border-radius:6px 6px 0 0'>
        <h2 style='margin:0'>🏥 Medicaid Fee Schedule Monitor</h2>
        <p style='margin:5px 0 0;opacity:0.7'>{today} — Daily Digest</p>
      </div>
      <div style='background:#f8f9fa;padding:15px 30px;border:1px solid #ddd'>
        <b>{len(changes)} fee schedule change(s)</b> across
        <b>{len({c['abbr'] for c in changes})} state(s)</b> detected today.
      </div>

      <h3 style='margin:25px 0 10px'>📋 Changed Fee Schedules</h3>
      <table style='border-collapse:collapse;width:100%;font-size:13px'>
        <tr>
          <th {th}>State</th>
          <th {th}>Status</th>
          <th {th}>File</th>
          <th {th}>Content</th>
          <th {th}>Rate Sample</th>
          <th {th}>Link</th>
        </tr>
        {state_rows}
      </table>

      <h3 style='margin:30px 0 10px'>📈 Public Company Exposure</h3>
      {'<table style="border-collapse:collapse;width:100%;font-size:13px"><tr><th ' + th + '>Ticker</th><th ' + th + '>Company</th><th ' + th + '>Segment</th><th ' + th + '>Medicaid Mix</th><th ' + th + '>Exposed States</th><th ' + th + '>Est. Rev Impact</th></tr>' + co_rows + '</table>'
       if co_rows else '<p style="color:#888">No tracked companies with exposure to changed states today.</p>'}

      <p style='font-size:11px;color:#aaa;margin-top:40px;border-top:1px solid #eee;padding-top:10px'>
        Automated signal — not investment advice. Rate direction requires file-level review.
        State exposure from latest 10-K filings. Green states only (26 of 50).
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
