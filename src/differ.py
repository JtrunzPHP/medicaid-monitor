"""
Compares old vs new fee schedule files at the procedure code level.
Returns a list of rate changes with old value, new value, and % delta.
"""
import io, logging
from pathlib import Path
import pandas as pd

log = logging.getLogger(__name__)

RATE_KEYS = ["rate", "fee", "amount", "allow", "reimburse", "price", "payment"]
CODE_KEYS = ["code", "cpt", "hcpcs", "procedure", "revenue"]
DOWNLOAD_DIR = Path("data/downloads")


def _load_df(content: bytes, filename: str) -> pd.DataFrame | None:
    """Load a fee schedule file into a DataFrame."""
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
    """Auto-detect procedure code column and rate columns."""
    code_col  = next((c for c in df.columns if any(k in c.lower() for k in CODE_KEYS)), None)
    rate_cols = [c for c in df.columns if any(k in c.lower() for k in RATE_KEYS)]
    return code_col, rate_cols


def _to_float(val) -> float | None:
    """Convert a string rate value to float, stripping $ and commas."""
    try:
        return float(str(val).replace("$", "").replace(",", "").strip())
    except Exception:
        return None


def diff_files(change: dict) -> list[dict]:
    """
    Given a change dict (with new content), load the previously stored file
    from data/downloads/ and return a list of per-code rate changes.

    Each item:
    {
        code, description (if available),
        old_rate, new_rate, delta_pct,
        rate_col, state, abbr
    }
    """
    abbr     = change["abbr"]
    filename = change["filename"]
    old_path = DOWNLOAD_DIR / abbr / filename

    # Load new file
    new_df = _load_df(change["content"], filename)
    if new_df is None:
        log.warning(f"{abbr}: Could not parse new file {filename}")
        return []

    # Load old file (previously committed version)
    if not old_path.exists():
        log.info(f"{abbr}: No prior file to diff against — first run")
        return []

    old_df = _load_df(old_path.read_bytes(), filename)
    if old_df is None:
        log.warning(f"{abbr}: Could not parse old file {filename}")
        return []

    code_col, rate_cols = _find_cols(new_df)
    if not code_col or not rate_cols:
        log.warning(f"{abbr}: Could not find code/rate columns in {filename}")
        return []

    # Ensure same columns exist in old file
    if code_col not in old_df.columns:
        log.warning(f"{abbr}: Code column '{code_col}' missing from old file")
        return []

    # Look for optional description column
    desc_col = next((c for c in new_df.columns if "desc" in c.lower()), None)

    diffs = []
    for rate_col in rate_cols:
        if rate_col not in old_df.columns:
            continue

        # Index both dataframes by procedure code
        new_indexed = new_df.set_index(code_col)[rate_col]
        old_indexed = old_df.set_index(code_col)[rate_col]

        # Find codes present in both
        common_codes = new_indexed.index.intersection(old_indexed.index)

        for code in common_codes:
            old_val = _to_float(old_indexed[code])
            new_val = _to_float(new_indexed[code])

            if old_val is None or new_val is None:
                continue
            if old_val == new_val:
                continue
            if old_val == 0:
                continue

            delta_pct = round(((new_val - old_val) / old_val) * 100, 2)

            # Skip trivial floating point noise
            if abs(delta_pct) < 0.01:
                continue

            desc = ""
            if desc_col and desc_col in new_df.columns:
                try:
                    desc = new_df.set_index(code_col)[desc_col].get(code, "")
                except Exception:
                    pass

            diffs.append({
                "code":      str(code).strip(),
                "desc":      str(desc).strip() if desc else "",
                "old_rate":  old_val,
                "new_rate":  new_val,
                "delta_pct": delta_pct,
                "direction": "▲ INCREASE" if delta_pct > 0 else "▼ DECREASE",
                "rate_col":  rate_col,
                "state":     change["state"],
                "abbr":      change["abbr"],
                "filename":  filename,
            })

        # Also catch new codes (added) and removed codes
        new_codes = set(new_indexed.index) - set(old_indexed.index)
        for code in new_codes:
            new_val = _to_float(new_indexed[code])
            if new_val is None:
                continue
            diffs.append({
                "code":      str(code).strip(),
                "desc":      "",
                "old_rate":  None,
                "new_rate":  new_val,
                "delta_pct": None,
                "direction": "🆕 NEW CODE",
                "rate_col":  rate_col,
                "state":     change["state"],
                "abbr":      change["abbr"],
                "filename":  filename,
            })

        removed_codes = set(old_indexed.index) - set(new_indexed.index)
        for code in removed_codes:
            old_val = _to_float(old_indexed[code])
            if old_val is None:
                continue
            diffs.append({
                "code":      str(code).strip(),
                "desc":      "",
                "old_rate":  old_val,
                "new_rate":  None,
                "delta_pct": None,
                "direction": "🗑 REMOVED",
                "rate_col":  rate_col,
                "state":     change["state"],
                "abbr":      change["abbr"],
                "filename":  filename,
            })

    # Sort by absolute delta descending
    diffs.sort(key=lambda x: abs(x["delta_pct"] or 0), reverse=True)
    return diffs
