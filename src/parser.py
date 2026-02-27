"""
Parse downloaded fee-schedule files into structured rate data.
Handles xlsx, xls, and csv with messy headers, dollar signs, junk rows, etc.
"""

import io
import logging
import re

import pandas as pd

log = logging.getLogger(__name__)

# Ranked by specificity — first match wins within each category
RATE_PATTERNS = [
    r"\bmax\w*\s*(?:fee|allow|rate|reimburse)\b",
    r"\b(?:fee|rate|allow\w*|reimburse\w*|pay\w*|price|amount)\b",
]
CODE_PATTERNS = [
    r"\bcpt\b",
    r"\bhcpcs\b",
    r"\bprocedure\s*code\b",
    r"\b(?:service|billing|revenue)\s*code\b",
    r"\bcode\b",
]

# Values that look like "no data" in rate columns
NA_STRINGS = {"", "n/a", "na", "nan", "none", "-", "--", ".", "by report", "br", "ic", "manual price"}


def parse(change: dict) -> dict:
    """Enrich a change dict with parsed rate data."""
    fname = change.get("filename", "").lower()
    content = change.get("content", b"")

    change.setdefault("summary", "Unable to parse")
    change.setdefault("rates", [])
    change.setdefault("rate_sample", [])

    try:
        df = _read_file(fname, content)
        if df is not None and not df.empty:
            result = _analyze(df)
            change.update(result)
    except Exception as e:
        log.warning("Parse error %s: %s", fname, e)

    return change


def _read_file(fname: str, content: bytes) -> pd.DataFrame | None:
    """Read file into a DataFrame, auto-detecting the real header row."""
    try:
        if fname.endswith(".csv"):
            return _read_with_header_detection(
                lambda h: pd.read_csv(io.BytesIO(content), header=h, dtype=str)
            )
        elif fname.endswith((".xlsx", ".xls")):
            xl = pd.ExcelFile(io.BytesIO(content))
            frames = []
            for sheet in xl.sheet_names[:6]:
                try:
                    df = _read_with_header_detection(
                        lambda h, s=sheet: xl.parse(s, header=h, dtype=str)
                    )
                    if df is not None:
                        df["__sheet__"] = sheet
                        frames.append(df)
                except Exception:
                    continue
            return pd.concat(frames, ignore_index=True) if frames else None
    except Exception as e:
        log.warning("Read error %s: %s", fname, e)
    return None


def _read_with_header_detection(read_fn) -> pd.DataFrame | None:
    """
    Try rows 0–10 as potential header rows.
    Pick the one that yields the most code/rate column matches.
    """
    best_df, best_score = None, 0

    for header_row in range(10):
        try:
            df = read_fn(header_row)
        except Exception:
            continue

        if df.empty or len(df.columns) < 2:
            continue

        cols_lower = [str(c).lower() for c in df.columns]
        score = sum(
            1 for c in cols_lower
            if _match_patterns(c, CODE_PATTERNS) or _match_patterns(c, RATE_PATTERNS)
        )

        if score > best_score:
            best_score = score
            best_df = df

    return best_df


def _match_patterns(col_name: str, patterns: list[str]) -> bool:
    return any(re.search(p, col_name) for p in patterns)


def _find_best_column(columns: list[str], patterns: list[str]) -> str | None:
    """Return the best-matching column name, preferring earlier patterns."""
    for pattern in patterns:
        for col in columns:
            if re.search(pattern, col.lower()):
                return col
    return None


def _clean_rate(val) -> float | None:
    """Convert a messy rate string to a float, or None."""
    if pd.isna(val):
        return None

    s = str(val).strip().lower()
    if s in NA_STRINGS:
        return None

    # Strip dollar signs, commas, whitespace
    s = re.sub(r"[$ ,]", "", s)

    # Handle parenthetical negatives: (123.45) → -123.45
    m = re.match(r"^\(([0-9.]+)\)$", s)
    if m:
        s = f"-{m.group(1)}"

    try:
        v = float(s)
        # Sanity check: Medicaid rates are typically $0.01 – $100,000
        if 0 < v < 500_000:
            return round(v, 4)
        elif v == 0:
            return 0.0
        else:
            return None
    except (ValueError, OverflowError):
        return None


def _clean_code(val) -> str | None:
    """Normalize a CPT/HCPCS code string."""
    if pd.isna(val):
        return None
    s = str(val).strip()
    # Remove .0 from codes read as floats (e.g., "99213.0" → "99213")
    s = re.sub(r"\.0+$", "", s)
    # Basic validation: CPT is 5 digits, HCPCS is letter + 4 digits
    if re.match(r"^[0-9]{5}$", s) or re.match(r"^[A-Z][0-9]{4}$", s, re.IGNORECASE):
        return s.upper()
    # Also accept codes with modifiers like "99213-26"
    if re.match(r"^[0-9]{5}-[0-9A-Z]{1,2}$", s, re.IGNORECASE):
        return s.upper()
    return s if len(s) >= 3 else None


def _analyze(df: pd.DataFrame) -> dict:
    """Extract structured rate data from a parsed DataFrame."""
    # Strip whitespace from column names
    df.columns = [str(c).strip() for c in df.columns]

    code_col = _find_best_column(df.columns.tolist(), CODE_PATTERNS)
    rate_col = _find_best_column(df.columns.tolist(), RATE_PATTERNS)

    # Find all rate-like columns for metadata
    all_rate_cols = [
        c for c in df.columns
        if _match_patterns(c.lower(), RATE_PATTERNS)
    ]

    result = {
        "code_col": code_col,
        "rate_col": rate_col,
        "rate_cols": all_rate_cols[:5],
        "rates": [],
        "rate_sample": [],
    }

    total_rows = len(df)

    if code_col and rate_col:
        work = df[[code_col, rate_col]].copy()
        work["__code"] = work[code_col].apply(_clean_code)
        work["__rate"] = work[rate_col].apply(_clean_rate)

        # Drop rows where either is missing
        valid = work.dropna(subset=["__code", "__rate"])

        # Deduplicate — keep first occurrence of each code
        valid = valid.drop_duplicates(subset=["__code"], keep="first")

        rates = [
            {"code": row["__code"], "rate": row["__rate"]}
            for _, row in valid.iterrows()
        ]
        result["rates"] = rates
        result["rate_sample"] = rates[:10]

        # Stats
        n_valid = len(rates)
        n_zero = sum(1 for r in rates if r["rate"] == 0.0)
        avg_rate = (
            sum(r["rate"] for r in rates if r["rate"] > 0)
            / max(1, n_valid - n_zero)
        )

        result["summary"] = (
            f"{total_rows:,} rows | {n_valid:,} valid codes | "
            f"avg ${avg_rate:,.2f} | "
            f"cols: {code_col} → {rate_col}"
        )

        if n_zero > n_valid * 0.5:
            log.warning(
                "  ⚠ >50%% zero rates (%d/%d) — possible wrong rate column",
                n_zero, n_valid,
            )
    else:
        result["summary"] = (
            f"{total_rows:,} rows | "
            f"code col: {code_col or '⚠ NOT FOUND'} | "
            f"rate col: {rate_col or '⚠ NOT FOUND'} | "
            f"columns: {list(df.columns[:10])}"
        )
        log.warning("  ⚠ Missing columns — found: %s", list(df.columns[:15]))

    return result
