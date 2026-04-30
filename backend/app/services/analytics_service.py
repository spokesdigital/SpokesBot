import math
import re
import time as monotonic_time
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import pandas as pd
from pandas.api.types import is_datetime64_any_dtype, is_numeric_dtype

METRIC_PATTERNS: dict[str, tuple[str, ...]] = {
    "impressions": ("impression", "impr", "view"),
    "clicks": ("click",),
    "conversions": ("conversion", "transaction", "purchase", "order", "acquisition", "lead"),
    # "link click-through" preferred over the aggregate "CTR (all)" column.
    "ctr": ("link click-through", "ctr", "click through rate"),
    # "cost per link" preferred over the aggregate "CPC (all)" column.
    "avg_cpc": ("cost per link", "cpc", "cost per click"),
    "cost": ("cost", "spend", "spent", "expense"),
    "revenue": ("revenue", "sales", "gmv", "income", "purchase value", "conversion value"),
    "roas": ("roas", "return on ad spend", "return on spend", "roas (", "/ spend"),
}

# Metrics are mapped sequentially in this order; once a column is claimed by
# an earlier metric it is excluded from later ones.  This prevents ambiguous
# columns like "CPC (cost per link click)" from being double-assigned to both
# avg_cpc AND clicks.
_METRIC_MAPPING_ORDER = [
    "cost",
    "revenue",
    "roas",
    "avg_cpc",
    "ctr",
    "impressions",
    "clicks",
]

DATA_CAST_TIMEOUT_SECONDS = 30.0
_MISSING_NUMERIC_VALUES = {
    "",
    "-",
    "--",
    "n/a",
    "na",
    "nan",
    "none",
    "null",
    "nil",
}


class DataCastingTimeoutError(TimeoutError):
    """Raised when ingestion/analytics data casting exceeds the hard timeout."""


def _check_cast_timeout(started_at: float, context: str) -> None:
    elapsed = monotonic_time.monotonic() - started_at
    if elapsed > DATA_CAST_TIMEOUT_SECONDS:
        raise DataCastingTimeoutError(
            f"Data casting exceeded {DATA_CAST_TIMEOUT_SECONDS:.0f}s while {context}."
        )


def _sanitize(obj: Any) -> Any:
    """Recursively convert NaN/Inf and numpy types to JSON-safe Python types."""
    if isinstance(obj, dict):
        return {str(k): _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    # Handle numpy scalars (they have an .item() method)
    if hasattr(obj, "item"):
        val = obj.item()
        if isinstance(val, float) and (math.isnan(val) or math.isinf(val)):
            return None
        return val
    return obj


def _looks_like_date_column_name(col: str) -> bool:
    """
    Heuristic for likely date columns based on the column name.

    Uses word-boundary matching so that "timestamp", "ad_date", and
    "campaign_time" all match, while "category" or "realtime_bid" do not.
    """
    name = col.lower()
    return bool(
        re.search(r"\b(date|time|timestamp|day|month|year)\b", name)
        or name.endswith(("_date", "_time", "_at"))
        or name in {"created_at", "updated_at", "timestamp", "date", "time"}
    )


def _looks_like_metric_column_name(col: str) -> bool:
    lowered = col.strip().lower()
    if _looks_like_date_column_name(lowered):
        return False

    if any(
        token in lowered
        for patterns in METRIC_PATTERNS.values()
        for token in patterns
    ):
        return True

    return bool(
        re.search(
            r"\b("
            r"impressions?|impr|views?|clicks?|cost|spend|spent|expense|"
            r"revenue|sales|gmv|income|purchase[\s_-]*value|conversion[\s_-]*value|"
            r"conversions?|transactions?|purchases?|orders?|leads?|"
            r"ctr|cpc|cpa|cpm|roas|aov|rate|ratio|average"
            r")\b",
            lowered,
        )
    )


def _clean_numeric_text(series: pd.Series) -> pd.Series:
    text = series.astype("string").str.strip()
    lowered = text.str.lower()
    text = text.mask(lowered.isin(_MISSING_NUMERIC_VALUES), pd.NA)
    return (
        text.str.replace(",", "", regex=False)
        .str.replace("$", "", regex=False)
        .str.replace("%", "", regex=False)
        .str.replace("€", "", regex=False)
        .str.replace("£", "", regex=False)
        .str.replace(r"^\((.*)\)$", r"-\1", regex=True)
    )


def _coerce_metric_column(series: pd.Series) -> pd.Series:
    return pd.to_numeric(_clean_numeric_text(series), errors="coerce").fillna(0)


def _strict_parse_date_column(df: pd.DataFrame, date_column: str) -> tuple[pd.DataFrame, int]:
    if date_column not in df.columns:
        return df, 0

    parsed = pd.to_datetime(df[date_column], errors="coerce", utc=True)
    valid_mask = parsed.notna()
    dropped_rows = int((~valid_mask).sum())
    if dropped_rows:
        df = df.loc[valid_mask].copy()
        parsed = parsed.loc[valid_mask]
    else:
        df = df.copy()

    df[date_column] = parsed
    return df, dropped_rows


def _coerce_numeric_like_columns(df: pd.DataFrame) -> tuple[pd.DataFrame, list[str]]:
    """
    Convert object/string columns that mostly contain numeric-looking values
    into real numeric columns.

    This handles common CSV exports that store metrics like "Impressions",
    "Cost", or "Revenue" as strings with commas, currency symbols, or
    percentages.
    """
    converted = df.copy()
    coerced_columns: list[str] = []
    started_at = monotonic_time.monotonic()

    for col in converted.columns:
        _check_cast_timeout(started_at, f"casting column '{col}'")
        series = converted[col]
        if _looks_like_date_column_name(col):
            continue

        if _looks_like_metric_column_name(col):
            converted[col] = _coerce_metric_column(series)
            coerced_columns.append(col)
            continue

        if is_numeric_dtype(series):
            continue
        if not pd.api.types.is_object_dtype(series) and not pd.api.types.is_string_dtype(series):
            continue

        non_null = series.dropna()
        if non_null.empty:
            continue

        cleaned = (
            non_null.astype(str)
            .str.strip()
            .replace({"": None, "nan": None, "None": None, "null": None})
        )
        cleaned = cleaned.dropna()
        if cleaned.empty:
            continue

        normalized = _clean_numeric_text(cleaned)

        numeric = pd.to_numeric(normalized, errors="coerce")
        parse_ratio = numeric.notna().sum() / len(cleaned)

        if parse_ratio >= 0.8:
            converted[col] = pd.to_numeric(_clean_numeric_text(series), errors="coerce")
            coerced_columns.append(col)

    return converted, coerced_columns


def normalize_chunk(
    chunk: pd.DataFrame,
    coerced_columns: list[str],
    date_columns: list[str] | None = None,
) -> pd.DataFrame:
    """
    Apply the numeric coercions determined during profile inference to a single
    DataFrame chunk. Mirrors the transformations in _coerce_numeric_like_columns
    so every streaming chunk has the same dtypes as the profiled sample.

    Used by _process_csv to convert CSVs to Parquet in a streaming fashion
    without loading the entire file into RAM at once.
    """
    result = chunk.copy()
    started_at = monotonic_time.monotonic()
    metric_columns = [
        col for col in dict.fromkeys([*coerced_columns, *result.columns.tolist()])
        if col in result.columns and _looks_like_metric_column_name(col)
    ]

    for col in metric_columns:
        _check_cast_timeout(started_at, f"normalizing column '{col}'")
        result[col] = _coerce_metric_column(result[col])

    for col in coerced_columns:
        _check_cast_timeout(started_at, f"normalizing inferred numeric column '{col}'")
        if col not in result.columns:
            continue
        if col in metric_columns:
            continue
        result[col] = pd.to_numeric(_clean_numeric_text(result[col]), errors="coerce")

    if date_columns:
        for date_col in date_columns[:1]:
            _check_cast_timeout(started_at, f"parsing date column '{date_col}'")
            result, _ = _strict_parse_date_column(result, date_col)

    return result


def _detect_date_columns(df: pd.DataFrame) -> list[str]:
    date_columns: list[str] = []
    row_count = max(len(df), 1)

    for col in df.columns:
        try:
            series = df[col]
            if is_datetime64_any_dtype(series):
                date_columns.append(col)
                continue
            if is_numeric_dtype(series):
                continue

            # Try standard parsing first (fast)
            parsed = pd.to_datetime(series, errors="coerce", utc=True)
            if parsed.isna().sum() > row_count * 0.5:
                # Fallback to mixed only if the standard parser fails most rows
                parsed = pd.to_datetime(series, errors="coerce", utc=True, format="mixed")

            if _looks_like_date_column_name(col) or parsed.notna().sum() > row_count * 0.5:
                date_columns.append(col)
        except Exception:
            continue

    return date_columns


def _pick_metric_mapping(columns: list[str], patterns: tuple[str, ...]) -> str | None:
    def score_match(column: str, token: str) -> tuple[int, str] | None:
        lowered = column.strip().lower()
        normalized_token = token.strip().lower()

        if lowered == normalized_token:
            return 0, lowered

        flexible_token = re.escape(normalized_token).replace(r"\ ", r"[\s_-]+")
        if re.search(rf"(?<![a-z0-9]){flexible_token}(?![a-z0-9])", lowered):
            return 1, lowered

        if lowered.startswith(normalized_token) or lowered.endswith(normalized_token):
            return 2, lowered

        if normalized_token in lowered:
            return 3, lowered

        return None

    candidates: list[tuple[int, str, str]] = []
    for original in columns:
        for token in patterns:
            match = score_match(original, token)
            if match is None:
                continue
            priority, lowered = match
            candidates.append((priority, lowered, original))

    if not candidates:
        return None

    # Deprioritize "(all)" aggregate columns that Meta Ads exports alongside
    # more specific ones (e.g. "Clicks (all)" vs "Link Clicks", "CTR (all)"
    # vs "CTR (link click-through rate)").  Adding 1 to the raw score makes
    # an "(all)" column effectively one tier worse than a same-scoring
    # non-"(all)" column, and the boolean secondary key breaks remaining ties.
    def _sort_key(x: tuple[int, str, str]) -> tuple[int, bool, str]:
        is_all = "(all)" in x[1]
        return (x[0] + int(is_all), is_all, x[1])

    candidates.sort(key=_sort_key)
    return candidates[0][2]


def _pick_conversion_metric_mapping(columns: list[str]) -> str | None:
    candidates: list[str] = []
    excluded_patterns = (
        r"\brate\b",
        r"\bcvr\b",
        r"\bctr\b",
        r"\bcpa\b",
        r"\bcpc\b",
        r"\bcpm\b",
        r"\broas\b",
        r"cost[\s_-]*per",
        r"value",
        r"revenue",
    )

    for col in columns:
        lowered = col.lower()
        if not any(token in lowered for token in METRIC_PATTERNS["conversions"]):
            continue
        if any(re.search(pattern, lowered) for pattern in excluded_patterns):
            continue
        candidates.append(col)

    if not candidates:
        return None

    def score(col: str) -> tuple[int, str]:
        lowered = col.strip().lower()
        priorities = [
            (r"^conversions?$", 0),
            (r"^transactions?$", 1),
            (r"^purchases?$", 2),
            (r"^orders?$", 3),
            (r"^acquisitions?$", 4),
            (r"^leads?$", 5),
            (r"\bconversions?\b", 10),
            (r"\btransactions?\b", 11),
            (r"\bpurchases?\b", 12),
            (r"\borders?\b", 13),
            (r"\bacquisitions?\b", 14),
            (r"\bleads?\b", 15),
        ]
        for pattern, priority in priorities:
            if re.search(pattern, lowered):
                return priority, lowered
        return 99, lowered

    return min(candidates, key=score)


def infer_conversion_metric_mapping(columns: list[str]) -> str | None:
    """Public wrapper for the safest conversion-count inference rule."""
    return _pick_conversion_metric_mapping(columns)


def infer_metric_mappings(df: pd.DataFrame) -> dict[str, str | None]:
    numeric_columns = df.select_dtypes(include="number").columns.tolist()
    metric_mappings: dict[str, str | None] = {}
    claimed: set[str] = set()

    # Map metrics in priority order, excluding already-claimed columns so that
    # an ambiguous column (e.g. "CPC (cost per link click)") is only assigned
    # to the most-specific metric and never double-counted.
    for metric_key in _METRIC_MAPPING_ORDER:
        patterns = METRIC_PATTERNS.get(metric_key)
        if patterns is None:
            continue
        available = [c for c in numeric_columns if c not in claimed]
        col = _pick_metric_mapping(available, patterns)
        metric_mappings[metric_key] = col
        if col:
            claimed.add(col)

    # Map any remaining metrics not covered by the ordered pass.
    # Skip "conversions" — it is handled below with a stricter heuristic.
    for metric_key, patterns in METRIC_PATTERNS.items():
        if metric_key in metric_mappings or metric_key == "conversions":
            continue
        available = [c for c in numeric_columns if c not in claimed]
        col = _pick_metric_mapping(available, patterns)
        metric_mappings[metric_key] = col
        if col:
            claimed.add(col)

    # Conversions use a separate, stricter heuristic that excludes rate/value
    # columns (Conv. rate, Conversion value, etc.) which the general matcher
    # would incorrectly pick.  Run after all other metrics are claimed so the
    # same column is never double-assigned.
    available = [c for c in numeric_columns if c not in claimed]
    metric_mappings["conversions"] = infer_conversion_metric_mapping(available)
    return metric_mappings


def build_dataset_profile(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    normalized_df, coerced_columns = _coerce_numeric_like_columns(df)
    date_columns = _detect_date_columns(normalized_df)
    dropped_invalid_date_rows = 0
    if date_columns:
        normalized_df, dropped_invalid_date_rows = _strict_parse_date_column(
            normalized_df,
            date_columns[0],
        )
    numeric_columns = normalized_df.select_dtypes(include="number").columns.tolist()
    metric_mappings = infer_metric_mappings(normalized_df)
    warnings: list[str] = []

    if not date_columns:
        warnings.append("No date column was detected during ingestion.")
    elif dropped_invalid_date_rows:
        warnings.append(
            f"Dropped {dropped_invalid_date_rows} rows with invalid dates in "
            f"'{date_columns[0]}' during ingestion."
        )
    if not metric_mappings.get("revenue"):
        warnings.append("No revenue metric was detected during ingestion.")
    if not metric_mappings.get("cost"):
        warnings.append("No cost metric was detected during ingestion.")
    if not metric_mappings.get("clicks"):
        warnings.append("No clicks metric was detected during ingestion.")

    profile = {
        "detected_date_column": date_columns[0] if date_columns else None,
        "metric_mappings": _sanitize(metric_mappings),
        "schema_profile": _sanitize(
            {
                "numeric_columns": numeric_columns,
                "date_columns": date_columns,
                "coerced_numeric_columns": coerced_columns,
                "dropped_invalid_date_rows": dropped_invalid_date_rows,
                "dtypes": {col: str(dtype) for col, dtype in normalized_df.dtypes.items()},
            }
        ),
        "ingestion_warnings": warnings,
    }
    return normalized_df, profile


def _pick_metric_column(df: pd.DataFrame) -> str | None:
    """
    Pick the numeric metric column used for time-series aggregation.

    Prefer common business metrics like amount when present; otherwise fall
    back to the first numeric column.
    """
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    if not numeric_cols:
        return None

    preferred = ("amount", "value", "total", "revenue", "price", "count")
    for name in preferred:
        for col in numeric_cols:
            if col.lower() == name:
                return col
    return numeric_cols[0]


def _metric_priority(col: str) -> tuple[int, str]:
    name = col.lower()
    priorities = [
        ("impression", 0),
        ("click", 1),
        ("ctr", 2),
        ("cpc", 3),
        ("cost", 4),
        ("spend", 4),
        ("revenue", 5),
        ("sales", 5),
        ("conversion", 6),
        ("transaction", 6),
        ("purchase", 6),
        ("order", 6),
        ("roas", 7),
        ("amount", 8),
        ("value", 9),
        ("total", 10),
        ("count", 11),
    ]
    for token, priority in priorities:
        if token in name:
            return priority, name
    return 99, name


def _pick_metric_columns(df: pd.DataFrame, limit: int = 20) -> list[str]:
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    return sorted(numeric_cols, key=_metric_priority)[:limit]


def _uses_average_basis(col: str) -> bool:
    name = col.lower()
    return any(
        token in name
        for token in ("ctr", "rate", "ratio", "roas", "cpc", "cpm", "cpa", "avg", "average")
    )


def _is_finite_number(value: Any) -> bool:
    if value is None:
        return False
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return False
    return math.isfinite(numeric)


def _safe_pct_change(current: Any, previous: Any) -> float | None:
    """
    Return percentage change without ever dividing by zero/NaN.

    A missing or zero previous value makes the comparison undefined in ad
    dashboards, so the API returns null and lets the UI show a missing-prior
    state instead of inventing growth from a zero baseline.
    """
    if not _is_finite_number(current) or not _is_finite_number(previous):
        return None

    current_float = float(current)
    previous_float = float(previous)
    if previous_float == 0:
        return None

    return ((current_float - previous_float) / abs(previous_float)) * 100


def _safe_ratio(numerator: Any, denominator: Any) -> float | None:
    if not _is_finite_number(numerator) or not _is_finite_number(denominator):
        return None
    denominator_float = float(denominator)
    if denominator_float == 0:
        return None
    return float(numerator) / denominator_float


def _round_number(value: Any, decimals: int = 2) -> Any:
    if not _is_finite_number(value):
        return _sanitize(value)
    rounded = round(float(value), decimals)
    if decimals == 0 and rounded.is_integer():
        return int(rounded)
    return rounded


def _round_metric_output(metric_key: str, value: Any) -> Any:
    if not _is_finite_number(value):
        return _sanitize(value)

    key = metric_key.lower()
    if key in {"impressions", "clicks", "conversions"}:
        return _round_number(value, 0)
    if key in {"cost", "revenue", "avg_cpc", "cpc", "cpa", "aov"}:
        return _round_number(value, 2)
    # Ratios are stored as base ratios. Four decimals renders as exactly two
    # percentage decimals on the frontend without changing the formula.
    if key in {"ctr", "roas", "conversion_rate"}:
        return _round_number(value, 4)

    return _round_number(value, 2)


def _round_column_output(column: str, value: Any) -> Any:
    lowered = column.lower()
    if any(token in lowered for token in ("impression", "click", "conversion", "transaction", "purchase", "order", "lead")) and not any(
        token in lowered for token in ("rate", "cpc", "cpa", "cost per", "value", "revenue")
    ):
        return _round_number(value, 0)
    if any(token in lowered for token in ("cost", "spend", "spent", "revenue", "sales", "gmv", "value", "cpc", "cpa", "cpm", "aov", "avg", "average")):
        return _round_number(value, 2)
    if any(token in lowered for token in ("ctr", "roas", "rate", "ratio")):
        return _round_number(value, 4)
    return _round_number(value, 2)


def _period_label(start: datetime, end: datetime) -> str:
    def fmt(dt: datetime) -> str:
        return f"{dt.strftime('%b')} {dt.day}"

    if start.date() == end.date():
        return f"vs {fmt(start)}"
    return f"vs {fmt(start)} - {fmt(end)}"


def _period_numeric_totals(result: dict[str, Any] | None) -> dict[str, Any]:
    return (result or {}).get("numeric_totals", {}) or {}


def _period_metric_mappings(result: dict[str, Any] | None) -> dict[str, str | None]:
    return (result or {}).get("metric_mappings", {}) or {}


def _mapped_total(result: dict[str, Any] | None, metric_key: str) -> float | None:
    mappings = _period_metric_mappings(result)
    totals = _period_numeric_totals(result)
    col = mappings.get(metric_key)
    if not col or col not in totals or not _is_finite_number(totals[col]):
        return None
    return float(totals[col])


def _build_period_kpi_data(result: dict[str, Any] | None) -> dict[str, float | None]:
    impressions = _mapped_total(result, "impressions")
    clicks = _mapped_total(result, "clicks")
    cost = _mapped_total(result, "cost")
    revenue = _mapped_total(result, "revenue")
    conversions = _mapped_total(result, "conversions")

    data = {
        "impressions": impressions,
        "clicks": clicks,
        "cost": cost,
        "revenue": revenue,
        "conversions": conversions,
        "ctr": _safe_ratio(clicks, impressions),
        "avg_cpc": _safe_ratio(cost, clicks),
        "roas": _safe_ratio(revenue, cost),
        "cpa": _safe_ratio(cost, conversions),
        "conversion_rate": _safe_ratio(conversions, clicks),
        "aov": _safe_ratio(revenue, conversions),
    }
    return _sanitize(
        {
            key: _round_metric_output(key, value)
            for key, value in data.items()
        }
    )


def _derived_comparison_value(col: str, result: dict[str, Any]) -> tuple[str, float | None] | None:
    mappings = _period_metric_mappings(result)
    lower = col.lower()
    period_data = _build_period_kpi_data(result)

    if col == mappings.get("ctr"):
        return "derived_ratio", period_data["ctr"]
    if col == mappings.get("avg_cpc"):
        return "derived_ratio", period_data["avg_cpc"]
    if col == mappings.get("roas"):
        return "derived_ratio", period_data["roas"]
    if "cpa" in lower or "cost per conversion" in lower or "cost per action" in lower:
        return "derived_ratio", period_data["cpa"]
    if "conversion" in lower and ("rate" in lower or "cvr" in lower):
        return "derived_ratio", period_data["conversion_rate"]
    if "aov" in lower or "average order value" in lower:
        return "derived_ratio", period_data["aov"]

    return None


def build_auto_comparison(
    current_result: dict[str, Any],
    previous_result: dict[str, Any] | None,
) -> dict[str, Any]:
    if not previous_result:
        return {}

    current_totals = current_result.get("numeric_totals", {}) or {}
    previous_totals = previous_result.get("numeric_totals", {}) or {}
    current_summary = current_result.get("numeric_summary", {}) or {}
    previous_summary = previous_result.get("numeric_summary", {}) or {}

    comparison: dict[str, dict[str, Any]] = {}
    all_columns = (
        set(current_totals.keys())
        | set(previous_totals.keys())
        | set(current_summary.keys())
        | set(previous_summary.keys())
    )

    for col in all_columns:
        derived_current = _derived_comparison_value(col, current_result)
        derived_previous = _derived_comparison_value(col, previous_result)

        if derived_current is not None and derived_previous is not None:
            basis = derived_current[0]
            current_value = derived_current[1]
            previous_value = derived_previous[1]
        elif _uses_average_basis(col):
            basis = "mean"
            current_value = (current_summary.get(col) or {}).get("mean")
            previous_value = (previous_summary.get(col) or {}).get("mean")
        else:
            basis = "total"
            current_value = current_totals.get(col)
            previous_value = previous_totals.get(col)

        if current_value is None:
            continue

        comparison[col] = {
            "basis": basis,
            "current": _sanitize(_round_column_output(col, current_value)),
            "previous": _sanitize(_round_column_output(col, previous_value)),
            "delta_pct": _sanitize(_round_number(_safe_pct_change(current_value, previous_value), 2)),
        }

    return comparison


def build_period_comparison_payload(
    current_result: dict[str, Any],
    previous_result: dict[str, Any] | None,
    current_start: datetime,
    current_end: datetime,
    previous_start: datetime,
    previous_end: datetime,
) -> dict[str, Any]:
    current_data = _build_period_kpi_data(current_result)
    previous_data = _build_period_kpi_data(previous_result)
    previous_label = _period_label(previous_start, previous_end)

    comparisons: dict[str, Any] = {
        "previous_period_label": previous_label,
    }
    for key, current_value in current_data.items():
        comparisons[f"{key}_pct_change"] = _round_number(
            _safe_pct_change(current_value, previous_data.get(key)),
            2,
        )

    return _sanitize(
        {
            "current_period": {
                "start": current_start.date().isoformat(),
                "end": current_end.date().isoformat(),
                "data": current_data,
            },
            "previous_period": {
                "start": previous_start.date().isoformat(),
                "end": previous_end.date().isoformat(),
                "data": previous_data,
            },
            "comparisons": comparisons,
        }
    )


def resolve_date_range(
    preset: str,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[datetime, datetime]:
    """
    Convert a DatePreset string to a UTC-aware (start, end) datetime pair.

    Preset boundaries:
      today        → 00:00:00 … 23:59:59.999999 UTC today
      last_7_days  → 00:00:00 six days ago … now
      last_30_days → 00:00:00 twenty-nine days ago … now
      this_month   → 00:00:00 first of current month … now
      custom       → start_date 00:00:00 … end_date 23:59:59.999999 UTC
    """
    now = datetime.now(UTC)
    today = now.date()

    if preset == "today":
        start = datetime.combine(today, time.min, tzinfo=UTC)
        end = datetime.combine(today, time.max, tzinfo=UTC)
    elif preset == "yesterday":
        yesterday = today - timedelta(days=1)
        start = datetime.combine(yesterday, time.min, tzinfo=UTC)
        end = datetime.combine(yesterday, time.max, tzinfo=UTC)
    elif preset == "last_7_days":
        start = datetime.combine(today - timedelta(days=6), time.min, tzinfo=UTC)
        end = now
    elif preset == "last_30_days":
        start = datetime.combine(today - timedelta(days=29), time.min, tzinfo=UTC)
        end = now
    elif preset == "last_90_days":
        start = datetime.combine(today - timedelta(days=89), time.min, tzinfo=UTC)
        end = now
    elif preset == "last_180_days":
        start = datetime.combine(today - timedelta(days=179), time.min, tzinfo=UTC)
        end = now
    elif preset == "this_month":
        start = datetime.combine(today.replace(day=1), time.min, tzinfo=UTC)
        end = now
    elif preset == "ytd":
        start = datetime.combine(today.replace(month=1, day=1), time.min, tzinfo=UTC)
        end = now
    elif preset == "custom":
        # Schema-level validation guarantees start_date and end_date are present
        # and that start_date <= end_date; no defensive checks needed here.
        start = datetime.combine(start_date, time.min, tzinfo=UTC)
        end = datetime.combine(end_date, time.max, tzinfo=UTC)
    else:
        raise ValueError(f"Unknown date_preset: '{preset}'.")

    return start, end


def apply_date_filter(
    df: pd.DataFrame,
    date_column: str,
    start: datetime,
    end: datetime,
) -> pd.DataFrame:
    """
    Parse date_column as UTC datetimes and return rows within [start, end].

    Raises ValueError if the column is absent or entirely unparseable.
    An empty result (valid range, no matching rows) is NOT an error here —
    the router checks for that and returns a 422 with a user-facing message.
    """
    if date_column not in df.columns:
        raise ValueError(
            f"date_column '{date_column}' not found in dataset. "
            f"Available columns: {list(df.columns)}"
        )

    parsed = pd.to_datetime(df[date_column], errors="coerce", utc=True)

    if parsed.notna().sum() == 0:
        raise ValueError(
            f"Column '{date_column}' could not be parsed as dates. "
            "Ensure it contains recognizable date or datetime values."
        )

    mask = (parsed >= start) & (parsed <= end)
    return df[mask].copy()


def _build_coercion_warnings(
    pre_null_counts: dict[str, int],
    coerced_df: pd.DataFrame,
    coerced_columns: list[str],
) -> list[str]:
    """
    Return human-readable warnings for columns where numeric coercion silently
    dropped values (i.e. strings that could not be parsed became NaN).

    These warnings are injected into every tool result so the agent knows
    that some rows were excluded and can communicate that uncertainty to the user.
    """
    warnings: list[str] = []
    total_rows = len(coerced_df)
    for col in coerced_columns:
        post_nulls = int(coerced_df[col].isnull().sum())
        pre_nulls = pre_null_counts.get(col, 0)
        lost = post_nulls - pre_nulls
        if lost > 0:
            pct = (lost / total_rows * 100) if total_rows else 0
            warnings.append(
                f"Column '{col}': {lost} of {total_rows} values ({pct:.1f}%) could not be "
                f"parsed as numbers and were excluded from analysis — results for this column "
                f"may be incomplete."
            )
    return warnings


def _pad_series(
    series: list[dict[str, Any]],
    full_date_index: "pd.DatetimeIndex",
) -> list[dict[str, Any]]:
    """Extend a daily metric series to every date in full_date_index.

    Missing days are filled with 0 so charts render a flat baseline instead of
    a gap.  Sum metrics (clicks, cost, revenue) are correctly 0 for days with no
    activity.  Ratio metrics (CTR, ROAS) are derived on the frontend from their
    underlying sum columns, so their raw-column zeros are never surfaced directly.
    """
    existing = {item["date"]: item["value"] for item in series}
    return [
        {"date": str(d.date()), "value": existing.get(str(d.date()), 0)} for d in full_date_index
    ]


def compute(
    df: pd.DataFrame,
    operation: str,
    column: str | None = None,
    group_by: str | None = None,
    date_range: tuple[datetime, datetime] | None = None,
) -> dict[str, Any]:
    # Snapshot null counts before coercion so we can measure what was silently lost
    pre_null_counts = {col: int(df[col].isnull().sum()) for col in df.columns}
    df, coerced_columns = _coerce_numeric_like_columns(df)
    coercion_warnings = _build_coercion_warnings(pre_null_counts, df, coerced_columns)

    result: dict[str, Any]

    if operation == "describe":
        result = _sanitize(df.describe(include="all").to_dict())

    elif operation == "value_counts":
        if not column or column not in df.columns:
            available = list(df.columns)
            raise ValueError(
                f"Column '{column}' not found. Available columns: {available}. "
                "Call get_dataset_schema to see exact column names."
            )
        result = _sanitize(df[column].value_counts().head(20).to_dict())

    elif operation == "groupby":
        if not column or not group_by:
            raise ValueError("Both 'column' and 'group_by' are required for groupby.")
        missing = [c for c in [column, group_by] if c not in df.columns]
        if missing:
            available = list(df.columns)
            raise ValueError(
                f"Column(s) not found: {missing}. Available columns: {available}. "
                "Call get_dataset_schema to see exact column names."
            )
        # Rate/ratio columns (CTR, ROAS, CPC…) must be averaged across groups;
        # additive metrics (revenue, spend, conversions…) must be summed.
        # Using mean() for revenue gives the average revenue per row — not the
        # total — which is mathematically wrong for a "revenue by campaign" query.
        agg_fn = "mean" if _uses_average_basis(column) else "sum"
        result = _sanitize(df.groupby(group_by)[column].agg(agg_fn).to_dict())

    elif operation == "correlation":
        numeric = df.select_dtypes(include="number")
        result = _sanitize(numeric.corr().to_dict())

    elif operation == "auto":
        result = _auto_analyze(df, date_range=date_range)

    else:
        raise ValueError(
            f"Unknown operation: '{operation}'. Use describe, value_counts, groupby, correlation, or auto."
        )

    # Attach coercion warnings to every result so the agent can factor them
    # into its answer rather than presenting potentially incomplete numbers
    # as if they were complete.
    if coercion_warnings:
        result["data_quality_warnings"] = coercion_warnings

    return result


def _auto_analyze(
    df: pd.DataFrame,
    date_range: tuple[datetime, datetime] | None = None,
) -> dict[str, Any]:
    """All-in-one analysis for the dashboard. Returns KPI data + chart data.

    When date_range is provided the time-series data is reindexed against a
    continuous pd.date_range so charts always show every day in the selected
    window — days with no CSV data appear as zero instead of a gap.
    """
    shape = {"rows": int(len(df)), "cols": int(len(df.columns))}
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    selected_metric_columns = _pick_metric_columns(df)

    # Summary stats for numeric columns → KPI cards
    raw_numeric_summary = df.describe(include="number").to_dict()
    numeric_summary = _sanitize(
        {
            col: {stat: _round_column_output(col, value) for stat, value in stats.items()}
            for col, stats in raw_numeric_summary.items()
        }
    )
    # Rate/ratio metrics (CTR, ROAS, CPC, etc.) must be averaged, not summed.
    # Summing them produces nonsense KPI values (e.g. CTR of 12.3 instead of 0.08).
    numeric_totals = _sanitize(
        {
            col: _round_column_output(
                col,
                df[col].mean() if _uses_average_basis(col) else df[col].sum(),
            )
            for col in numeric_cols
        }
    )

    # Detect date columns
    date_columns = _detect_date_columns(df)

    # Build the absolute boundary index when a date range is requested.
    # Every metric series will be reindexed against this, ensuring the frontend
    # always receives exactly N days of data (N = days in the selected preset).
    granularity = "daily"
    freq = "D"
    full_date_index: pd.DatetimeIndex | None = None

    if date_range is not None:
        delta = date_range[1] - date_range[0]
        if delta.days > 90:
            granularity = "monthly"
            freq = "MS"
            start_date_for_index = date_range[0].date().replace(day=1)
        else:
            start_date_for_index = date_range[0].date()

        full_date_index = pd.date_range(
            start=start_date_for_index, end=date_range[1].date(), freq=freq
        )

    # Try to parse potential date columns
    parsed_dates: dict[str, list] = {}
    metric_time_series: dict[str, dict[str, list[dict[str, Any]]]] = {}

    # Pre-compute metric mappings for recalculated ratios
    metric_mappings = infer_metric_mappings(df)

    for col in df.columns:
        try:
            series = df[col]
            if is_datetime64_any_dtype(series):
                parsed = pd.to_datetime(series, errors="coerce", utc=True)
            elif not is_numeric_dtype(series):
                parsed = pd.to_datetime(series, errors="coerce", utc=True, format="mixed")
                if col not in date_columns:
                    continue
            else:
                continue

            sorted_df = df.copy()
            sorted_df[col] = parsed
            sorted_df = sorted_df.sort_values(col)

            # Use Grouper for resampling
            grouper = pd.Grouper(key=col, freq=freq)
            grouped = sorted_df.groupby(grouper)
            summed = grouped.sum(numeric_only=True)

            # Re-calculate averages based on sums
            def get_aggregated_series(metric_col: str, grouped=grouped, summed=summed):
                if _uses_average_basis(metric_col):
                    if metric_col == metric_mappings.get("ctr"):
                        clicks_col = metric_mappings.get("clicks")
                        impr_col = metric_mappings.get("impressions")
                        if clicks_col in summed.columns and impr_col in summed.columns:
                            return summed[clicks_col] / summed[impr_col].replace(0, pd.NA)
                    elif metric_col == metric_mappings.get("avg_cpc"):
                        cost_col = metric_mappings.get("cost")
                        clicks_col = metric_mappings.get("clicks")
                        if cost_col in summed.columns and clicks_col in summed.columns:
                            return summed[cost_col] / summed[clicks_col].replace(0, pd.NA)
                    elif metric_col == metric_mappings.get("roas"):
                        rev_col = metric_mappings.get("revenue")
                        cost_col = metric_mappings.get("cost")
                        if rev_col in summed.columns and cost_col in summed.columns:
                            return summed[rev_col] / summed[cost_col].replace(0, pd.NA)
                    elif "cpa" in metric_col.lower():
                        cost_col = metric_mappings.get("cost")
                        conv_col = metric_mappings.get("conversions")
                        if cost_col in summed.columns and conv_col in summed.columns:
                            return summed[cost_col] / summed[conv_col].replace(0, pd.NA)
                    return grouped[metric_col].mean()
                else:
                    return (
                        summed[metric_col]
                        if metric_col in summed.columns
                        else grouped[metric_col].sum()
                    )

            metric_col = _pick_metric_column(df)
            if metric_col:
                agg = get_aggregated_series(metric_col)
                raw_series = [
                    {"date": str(k.date()), "value": _sanitize(_round_column_output(metric_col, v))}
                    for k, v in agg.items()
                    if pd.notna(k)
                ]
                parsed_dates[col] = (
                    _pad_series(raw_series, full_date_index)
                    if full_date_index is not None
                    else raw_series
                )

            metric_series_for_col: dict[str, list[dict[str, Any]]] = {}
            for m_col in selected_metric_columns:
                agg = get_aggregated_series(m_col)
                raw_series = [
                    {"date": str(k.date()), "value": _sanitize(_round_column_output(m_col, v))}
                    for k, v in agg.items()
                    if pd.notna(k)
                ]
                metric_series_for_col[m_col] = (
                    _pad_series(raw_series, full_date_index)
                    if full_date_index is not None
                    else raw_series
                )
            if metric_series_for_col:
                metric_time_series[col] = metric_series_for_col
        except Exception:
            pass

    # Pattern to detect campaign-like column names (ad group, ad set, campaign, etc.).
    # These need a higher cardinality threshold because a dataset can easily have
    # dozens of campaigns; the old limit of 8 would silently produce an empty table.
    _CAMPAIGN_COL_RE = re.compile(
        r"\b(campaign|ad[\s_\-]*group|ad[\s_\-]*set|adgroup|adset|ad[\s_\-]*name|ad\s*title)\b",
        re.IGNORECASE,
    )

    # Categorical value counts for bar charts
    categorical_charts: dict[str, dict] = {}
    metric_breakdowns: dict[str, dict[str, dict[str, Any]]] = {}
    for col in df.select_dtypes(include=["object", "category", "string"]).columns:
        if col in date_columns:
            continue
        n_unique = df[col].nunique()
        if n_unique <= 20:
            categorical_charts[col] = _sanitize(df[col].value_counts().head(10).to_dict())

        # Threshold for metric breakdowns:
        #   - Campaign-like columns: up to 200 unique values (head(8) limits output).
        #   - All other categoricals: up to 50 unique values.
        # This prevents UUID / free-text columns from triggering expensive groupbys
        # while ensuring campaign tables never go blank for real-world datasets.
        is_campaign_col = bool(_CAMPAIGN_COL_RE.search(col))
        breakdown_limit = 200 if is_campaign_col else 50
        if 1 < n_unique <= breakdown_limit:
            for metric_col in selected_metric_columns:
                metric_breakdowns.setdefault(metric_col, {})
                agg_fn = "mean" if _uses_average_basis(metric_col) else "sum"
                grouped = (
                    df.groupby(col, dropna=True)[metric_col]
                    .agg(agg_fn)
                    .sort_values(ascending=False)
                )
                if not is_campaign_col:
                    grouped = grouped.head(8)
                if not grouped.empty:
                    metric_breakdowns[metric_col][col] = _sanitize(
                        {
                            key: _round_column_output(metric_col, value)
                            for key, value in grouped.to_dict().items()
                        }
                    )

    # Column dtype map
    dtypes = {col: str(dtype) for col, dtype in df.dtypes.items()}

    # Sample rows
    sample = _sanitize(df.head(5).to_dict(orient="records"))

    return {
        "shape": shape,
        "numeric_summary": numeric_summary,
        "numeric_totals": numeric_totals,
        "categorical_charts": categorical_charts,
        "time_series": parsed_dates,
        "metric_time_series": metric_time_series,
        "metric_breakdowns": metric_breakdowns,
        "selected_metric_columns": selected_metric_columns,
        "metric_mappings": _sanitize(metric_mappings),
        "date_columns": date_columns,
        "dtypes": dtypes,
        "sample": sample,
        "granularity": granularity,
    }
