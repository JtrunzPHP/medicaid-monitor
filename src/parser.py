import io, logging
import pandas as pd

log = logging.getLogger(__name__)

RATE_KEYS = ["rate", "fee", "amount", "allow", "reimburse", "price", "payment"]
CODE_KEYS = ["code", "cpt", "hcpcs", "procedure", "revenue"]


def parse(change: dict) -> dict:
    fname = change["filename"].lower()
    content = change["content"]
    change["summary"] = "Unable to parse"
    change["rate_sample"] = []

    try:
        if fname.endswith(".csv"):
            df = pd.read_csv(io.BytesIO(content), nrows=1000, dtype=str)
            change.update(_analyze(df))

        elif fname.endswith((".xlsx", ".xls")):
            xl = pd.ExcelFile(io.BytesIO(content))
            frames = []
            for s in xl.sheet_names[:4]:
                try:
                    frames.append(xl.parse(s, nrows=1000, dtype=str))
                except Exception:
                    pass
            if frames:
                change.update(_analyze(pd.concat(frames, ignore_index=True)))

    except Exception as e:
        log.warning(f"Parse error {fname}: {e}")

    return change


def _analyze(df: pd.DataFrame) -> dict:
    rows, cols = df.shape
    rate_cols = [c for c in df.columns if any(k in c.lower() for k in RATE_KEYS)]
    code_cols = [c for c in df.columns if any(k in c.lower() for k in CODE_KEYS)]

    sample = []
    if code_cols and rate_cols:
        sub = df[[code_cols[0], rate_cols[0]]].dropna().head(5)
        sample = [{"code": r[0], "rate": r[1]} for r in sub.itertuples(index=False)]

    summary = f"{rows:,} rows | {cols} cols"
    if code_cols:
        summary += f" | codes: {code_cols[0]}"
    if rate_cols:
        summary += f" | rates: {', '.join(rate_cols[:2])}"

    return {
        "summary":   summary,
        "rate_sample": sample,
        "code_col":  code_cols[0] if code_cols else None,
        "rate_cols": rate_cols[:3]
    }
