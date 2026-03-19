"""
Parse downloaded fee-schedule files into structured rate data.
Handles xlsx, xls, and csv with messy headers, dollar signs, junk rows, etc.

Enhanced: better column name matching for cross-state compatibility,
modifier handling, and description column extraction.
"""

import io
import logging
import re

import pandas as pd

log = logging.getLogger(__name__)

# ── Column matching patterns (ranked by specificity) ──────────

# Rate/dollar columns — first match wins
RATE_PATTERNS = [
    # Most specific first
    r"\bmax\w*\s*(?:fee|allow|rate|reimburse|payment)\b",
    r"\bcapped\s*(?:fee|rate|amount)\b",
    r"\bmedicaid\s*(?:rate|fee|allow|reimburse|payment|amount)\b",
    r"\b(?:fee\s*schedule|fs)\s*(?:rate|amount)\b",
    r"\bmaximum\s*(?:allow|fee|rate|amount|reimburse)\b",
    r"\ballowable\b",
    r"\breimburse\w*(?:\s*rate|\s*amount)?\b",
    r"\b(?:payment|pay)\s*(?:rate|amount)\b",
    r"\bunit\s*(?:rate|price|cost|amount)\b",
    r"\bpricing\s*(?:amount|rate)\b",
    r"\bfee\b",
    r"\brate\b(?!\s*code)",  # "rate" but not "rate code"
    r"\bamount\b",
    r"\bprice\b",
]

# CPT/HCPCS code columns
CODE_PATTERNS = [
    r"\bcpt\s*(?:code|/hcpcs)?\b",
    r"\bhcpcs\s*(?:code)?\b",
    r"\bprocedure\s*code\b",
    r"\bservice\s*code\b",
    r"\bbilling\s*code\b",
    r"\brevenue\s*code\b",
    r"\bcode\b",
]

# Modifier columns
MOD_PATTERNS = [
    r"\bmodifier\b",
    r"\bmod\b",
]

# Description columns
DESC_PATTERNS = [
    r"\bdescription\b",
    r"\bservice\s*desc\b",
    r"\bprocedure\s*desc\b",
    r"\bcode\s*desc\b",
    r"\bnarrative\b",
    r"\bshort\s*desc\b",
    r"\blong\s*desc\b",
]

# Values that look like "no data" in rate columns
NA_STRINGS = {
    "", "n/a", "na", "nan", "none", "-", "--", ".", 
    "by report", "br", "ic", "manual price", "manual",
    "individual consideration", "negotiated", "varies",
    "per contract", "contact", "see note", "see notes",
}


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
            result = _analyze(df, change.get("abbr", ""))
            change.update(result)
    except Exception as e:
        log.warning("Parse error %s: %s", fname, e)

    return change


def _read_file(fname: str, content: bytes) -> pd.DataFrame | None:
    """Read file into a DataFrame, auto-detecting the real header row."""
    try:
        if fname.endswith(".csv"):
            return _read_with_header_detection(
                lambda h: pd.read_csv(io.BytesIO(content), header=h, dtype=str,
                                       on_bad_lines="skip", encoding_errors="replace")
            )
        elif fname.endswith((".xlsx", ".xls")):
            xl = pd.ExcelFile(io.BytesIO(content))
            frames = []
            for sheet in xl.sheet_names[:8]:  # check more sheets
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
    """Try rows 0–15 as potential header rows. Pick best match."""
    best_df, best_score = None, 0

    for header_row in range(15):
        try:
            df = read_fn(header_row)
        except Exception:
            continue

        if df.empty or len(df.columns) < 2:
            continue

        cols_lower = [str(c).lower().strip() for c in df.columns]
        
        # Score: prioritize finding BOTH a code col AND a rate col
        has_code = any(_match_patterns(c, CODE_PATTERNS) for c in cols_lower)
        has_rate = any(_match_patterns(c, RATE_PATTERNS) for c in cols_lower)
        
        score = 0
        if has_code and has_rate:
            score = 10  # big bonus for finding both
        score += sum(1 for c in cols_lower if _match_patterns(c, CODE_PATTERNS))
        score += sum(1 for c in cols_lower if _match_patterns(c, RATE_PATTERNS))
        
        # Penalize if columns look like data values (not headers)
        if any(c.replace(".", "").replace(",", "").isdigit() for c in cols_lower[:3]):
            score -= 5

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
            if re.search(pattern, col.lower().strip()):
                return col
    return None


def _clean_rate(val) -> float | None:
    """Convert a messy rate string to a float, or None."""
    if pd.isna(val):
        return None

    s = str(val).strip().lower()
    if s in NA_STRINGS:
        return None

    # Strip dollar signs, commas, whitespace, leading/trailing junk
    s = re.sub(r"[$ ,\t]", "", s)
    s = s.strip()

    # Handle parenthetical negatives: (123.45) → -123.45
    m = re.match(r"^\(([0-9.]+)\)$", s)
    if m:
        s = f"-{m.group(1)}"

    # Handle percentage signs (some states show % of Medicare)
    if s.endswith("%"):
        return None  # skip percentages, not actual dollar rates

    try:
        v = float(s)
        # Medicaid rates: $0.01 – $500,000 is sane range
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
    
    # Remove .0 from codes read as floats (e.g., "99213.0")
    s = re.sub(r"\.0+$", "", s)
    
    # Remove leading zeros that shouldn't be there
    # but preserve 5-digit codes that start with 0 (e.g., 00100 anesthesia)
    
    # Standard CPT: 5 digits
    if re.match(r"^[0-9]{5}$", s):
        return s
    
    # HCPCS Level II: letter + 4 digits
    if re.match(r"^[A-Za-z][0-9]{4}$", s):
        return s.upper()
    
    # Code with modifier: 99213-26 or 99213 26
    m = re.match(r"^([0-9]{5})[\s-]+([0-9A-Za-z]{1,2})$", s)
    if m:
        return f"{m.group(1)}-{m.group(2).upper()}"
    
    # HCPCS with modifier
    m = re.match(r"^([A-Za-z][0-9]{4})[\s-]+([0-9A-Za-z]{1,2})$", s)
    if m:
        return f"{m.group(1).upper()}-{m.group(2).upper()}"
    
    # Relaxed: if it's 4-5 chars and mostly alphanumeric, accept it
    if 4 <= len(s) <= 7 and re.match(r"^[A-Za-z0-9-]+$", s):
        return s.upper()
    
    return None


def _analyze(df: pd.DataFrame, state_abbr: str = "") -> dict:
    """Extract structured rate data from a parsed DataFrame."""
    # Strip whitespace from column names
    df.columns = [str(c).strip() for c in df.columns]

    code_col = _find_best_column(df.columns.tolist(), CODE_PATTERNS)
    rate_col = _find_best_column(df.columns.tolist(), RATE_PATTERNS)
    desc_col = _find_best_column(df.columns.tolist(), DESC_PATTERNS)
    mod_col = _find_best_column(df.columns.tolist(), MOD_PATTERNS)

    # Find all rate-like columns
    all_rate_cols = [
        c for c in df.columns
        if _match_patterns(c.lower(), RATE_PATTERNS)
    ]

    result = {
        "code_col": code_col,
        "rate_col": rate_col,
        "desc_col": desc_col,
        "mod_col": mod_col,
        "rate_cols": all_rate_cols[:8],
        "rates": [],
        "rate_sample": [],
    }

    total_rows = len(df)

    if code_col and rate_col:
        # Build working DataFrame with all useful columns
        work_cols = [code_col, rate_col]
        if desc_col:
            work_cols.append(desc_col)
        if mod_col:
            work_cols.append(mod_col)
        
        work = df[work_cols].copy()
        work["__code"] = work[code_col].apply(_clean_code)
        work["__rate"] = work[rate_col].apply(_clean_rate)
        
        if desc_col:
            work["__desc"] = work[desc_col].apply(
                lambda v: str(v).strip()[:100] if pd.notna(v) else ""
            )
        else:
            work["__desc"] = ""
        
        if mod_col:
            work["__mod"] = work[mod_col].apply(
                lambda v: str(v).strip().upper() if pd.notna(v) and str(v).strip() not in ("nan", "", "0") else ""
            )
        else:
            work["__mod"] = ""

        # Drop rows where code is missing
        valid = work.dropna(subset=["__code"])
        
        # For rows with no rate, still include them with rate=None
        # (this captures the base rate even if $0 or missing)
        
        # Build composite key: code + modifier
        valid = valid.copy()
        valid["__key"] = valid.apply(
            lambda r: f"{r['__code']}-{r['__mod']}" if r["__mod"] else r["__code"],
            axis=1
        )
        
        # Deduplicate — keep first occurrence
        valid = valid.drop_duplicates(subset=["__key"], keep="first")

        rates = []
        for _, row in valid.iterrows():
            rate_val = row["__rate"]
            if rate_val is None and pd.isna(row.get(rate_col)):
                continue  # truly empty
            rates.append({
                "code": row["__code"],
                "rate": rate_val if rate_val is not None else 0.0,
                "desc": row["__desc"],
                "modifier": row["__mod"],
            })
        
        result["rates"] = rates
        result["rate_sample"] = rates[:15]

        # Stats
        n_valid = len(rates)
        n_with_rate = sum(1 for r in rates if r["rate"] and r["rate"] > 0)
        n_zero = sum(1 for r in rates if r["rate"] == 0.0)
        avg_rate = (
            sum(r["rate"] for r in rates if r["rate"] and r["rate"] > 0)
            / max(1, n_with_rate)
        )

        result["summary"] = (
            f"{state_abbr} | {total_rows:,} rows | {n_valid:,} codes | "
            f"{n_with_rate:,} with rates | "
            f"avg ${avg_rate:,.2f} | "
            f"cols: {code_col} → {rate_col}"
            + (f" + {desc_col}" if desc_col else "")
        )

        if n_with_rate < n_valid * 0.3:
            log.warning(
                "  ⚠ %s: Only %d/%d codes have rates — possible wrong rate column. "
                "All rate cols found: %s",
                state_abbr, n_with_rate, n_valid, all_rate_cols[:5],
            )
            
            # Try alternate rate columns
            if len(all_rate_cols) > 1:
                for alt_col in all_rate_cols[1:4]:
                    if alt_col == rate_col:
                        continue
                    test_rates = df[alt_col].apply(_clean_rate)
                    n_test = test_rates.notna().sum()
                    if n_test > n_with_rate * 1.5:
                        log.info(
                            "  → Switching to '%s' (%d valid vs %d)",
                            alt_col, n_test, n_with_rate
                        )
                        # Re-run with better column
                        result2 = _analyze_with_cols(df, code_col, alt_col, desc_col, mod_col, state_abbr)
                        if result2:
                            return result2
                        break
    else:
        result["summary"] = (
            f"{state_abbr} | {total_rows:,} rows | "
            f"code col: {code_col or '⚠ NOT FOUND'} | "
            f"rate col: {rate_col or '⚠ NOT FOUND'} | "
            f"columns: {list(df.columns[:15])}"
        )
        log.warning(
            "  ⚠ %s: Missing columns — found: %s", 
            state_abbr, list(df.columns[:15])
        )

    return result


def _analyze_with_cols(df, code_col, rate_col, desc_col, mod_col, state_abbr):
    """Re-analyze with explicitly specified columns."""
    work = df[[code_col, rate_col]].copy()
    work["__code"] = work[code_col].apply(_clean_code)
    work["__rate"] = work[rate_col].apply(_clean_rate)
    
    valid = work.dropna(subset=["__code"])
    valid = valid.drop_duplicates(subset=["__code"], keep="first")
    
    rates = [
        {"code": row["__code"], "rate": row["__rate"] or 0.0, "desc": "", "modifier": ""}
        for _, row in valid.iterrows()
        if row["__rate"] is not None
    ]
    
    if not rates:
        return None
    
    n_with = sum(1 for r in rates if r["rate"] > 0)
    avg = sum(r["rate"] for r in rates if r["rate"] > 0) / max(1, n_with)
    
    return {
        "code_col": code_col,
        "rate_col": rate_col,
        "desc_col": desc_col,
        "mod_col": mod_col,
        "rates": rates,
        "rate_sample": rates[:15],
        "summary": (
            f"{state_abbr} | {len(df):,} rows | {len(rates):,} codes | "
            f"{n_with:,} with rates | avg ${avg:,.2f} | "
            f"cols: {code_col} → {rate_col} (auto-switched)"
        ),
    }
