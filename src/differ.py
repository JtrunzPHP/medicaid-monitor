"""
Compares old vs new fee schedule files at the procedure code level.
On first run (no prior file), returns current rates as a snapshot.
On subsequent runs, returns only changed codes with old/new/delta.
"""
import io, logging
from pathlib import Path
import pandas as pd

log = logging.getLogger(__name__)

RATE_KEYS = ["rate", "fee", "amount", "allow", "reimburse", "price", "payment"]
CODE_KEYS = ["code", "cpt", "hcpcs", "procedure", "revenue"]
DOWNLOAD_DIR = Path("data/downloads")
MAX_SNAPSHOT_ROWS = 100


def _load_df(content: bytes, filename: str) -> pd.DataFrame | None:
    fname = filename.lower()
    try:
        if fname.endswith(".csv"):
            return pd.read_csv(io.BytesIO(content), dtype=str)
        elif fname.endswith((".xlsx", ".xls")):
            xl = pd.ExcelFile(io.BytesIO(content))
            frames = []
            for sheet in xl.sheet_names[:4]:
                try:
                    frames.append(xl.parse(sheet, dtype=str))
                except Exception:
                    pass
            return pd.concat(frames, ignore_index=True) if frames else None
    except Exception as e:
        log.warning(f"Failed to load {filename}: {e}")
    return None


def _find_cols(df: pd.DataFrame) -> tuple[str | None, list[str]]:
    # isinstance check guards against float/NaN column headers from blank Excel columns
    code_col  = next((c for c in df.columns if isinstance(c, str) and any(k in c.lower() for k in CODE_KEYS)), None)
    rate_cols = [c for c in df.columns if isinstance(c, str) and any(k in c.lower() for k in RATE_KEYS)]
    return code_col, rate_cols


def _to_float(val) -> float | None:
    try:
        return float(str(val).replace("$", "").replace(",", "").strip())
    except Exception:
        return None


def _snapshot(df: pd.DataFrame, change: dict) -> list[dict]:
    """Return current rates as a snapshot when no prior file exists."""
    code_col, rate_cols = _find_cols(df)
    if not code_col or not rate_cols:
        return []

    desc_col = next((c for c in df.columns if isinstance(c, str) and "desc" in c.lower()), None)
    rate_col = rate_cols[0]
    rows = []

    for _, row in df.iterrows():
        code = str(row.get(code_col, "")).strip()
        if not code or code.lower() in ("nan", ""):
            continue
        val = _to_float(row.get(rate_col))
        if val is None or val == 0:
            continue
        desc = str(row.get(desc_col, "")).strip() if desc_col else ""
        rows.append({
            "code":      code.upper(),
            "desc":      desc if desc.lower() != "nan" else "",
            "old_rate":  None,
            "new_rate":  val,
            "delta_pct": None,
            "direction": "📋 SNAPSHOT",
            "rate_col":  rate_col,
            "state":     change["state"],
            "abbr":      change["abbr"],
            "filename":  change["filename"],
        })
        if len(rows) >= MAX_SNAPSHOT_ROWS:
            break

    return rows


def diff_files(change: dict) -> list[dict]:
    """
    Compare old vs new file at procedure code level.
    Falls back to snapshot if no prior file exists.
    """
    abbr     = change["abbr"]
    filename = change["filename"]
    old_path = DOWNLOAD_DIR / abbr / filename

    new_df = _load_df(change["content"], filename)
    if new_df is None:
        log.warning(f"{abbr}: Could not parse new file {filename}")
        return []

    # First run — no prior file, return snapshot
    if not old_path.exists():
        log.info(f"{abbr}: No prior file — returning rate snapshot for {filename}")
        return _snapshot(new_df, change)

    # Subsequent runs — diff old vs new
    old_df = _load_df(old_path.read_bytes(), filename)
    if old_df is None:
        log.warning(f"{abbr}: Could not parse old file — falling back to snapshot")
        return _snapshot(new_df, change)

    code_col, rate_cols = _find_cols(new_df)
    if not code_col or not rate_cols:
        log.warning(f"{abbr}: Could not find code/rate columns in {filename}")
        return []

    if code_col not in old_df.columns:
        log.warning(f"{abbr}: Code column '{code_col}' missing from old file")
        return []

    desc_col = next((c for c in new_df.columns if isinstance(c, str) and "desc" in c.lower()), None)
    diffs = []

    for rate_col in rate_cols:
        if rate_col not in old_df.columns:
            continue

        new_idx = new_df.set_index(code_col)[rate_col]
        old_idx = old_df.set_index(code_col)[rate_col]

        # Changed codes
        for code in new_idx.index.intersection(old_idx.index):
            old_val = _to_float(old_idx[code])
            new_val = _to_float(new_idx[code])
            if old_val is None or new_val is None or old_val == new_val or old_val == 0:
                continue
            delta_pct = round(((new_val - old_val) / old_val) * 100, 2)
            if abs(delta_pct) < 0.01:
                continue
            desc = ""
            if desc_col and desc_col in new_df.columns:
                try:
                    desc = str(new_df.set_index(code_col)[desc_col].get(code, ""))
                except Exception:
                    pass
            diffs.append({
                "code":      str(code).strip().upper(),
                "desc":      desc if desc.lower() not in ("nan", "") else "",
                "old_rate":  old_val,
                "new_rate":  new_val,
                "delta_pct": delta_pct,
                "direction": "▲ INCREASE" if delta_pct > 0 else "▼ DECREASE",
                "rate_col":  rate_col,
                "state":     change["state"],
                "abbr":      change["abbr"],
                "filename":  change["filename"],
            })

        # New codes
        for code in set(new_idx.index) - set(old_idx.index):
            new_val = _to_float(new_idx[code])
            if new_val is None:
                continue
            diffs.append({
                "code":      str(code).strip().upper(),
                "desc":      "",
                "old_rate":  None,
                "new_rate":  new_val,
                "delta_pct": None,
                "direction": "🆕 NEW CODE",
                "rate_col":  rate_col,
                "state":     change["state"],
                "abbr":      change["abbr"],
                "filename":  change["filename"],
            })

        # Removed codes
        for code in set(old_idx.index) - set(new_idx.index):
            old_val = _to_float(old_idx[code])
            if old_val is None:
                continue
            diffs.append({
                "code":      str(code).strip().upper(),
                "desc":      "",
                "old_rate":  old_val,
                "new_rate":  None,
                "delta_pct": None,
                "direction": "🗑 REMOVED",
                "rate_col":  rate_col,
                "state":     change["state"],
                "abbr":      change["abbr"],
                "filename":  change["filename"],
            })

    diffs.sort(key=lambda x: abs(x["delta_pct"] or 0), reverse=True)
    return diffs
