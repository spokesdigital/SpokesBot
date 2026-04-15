import math
import re
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

import pandas as pd
from pandas.api.types import is_datetime64_any_dtype, is_numeric_dtype

METRIC_PATTERNS: dict[str, tuple[str, ...]] = {
    "impressions": ("impression", "impr", "view"),
    "clicks": ("click",),
    "conversions": ("conversion", "transaction", "purchase", "order", "acquisition", "lead"),
    "ctr": ("ctr", "click through rate"),
    "avg_cpc": ("cpc", "cost per click"),
    "cost": ("cost", "spend", "expense"),
    "revenue": ("revenue", "sales", "gmv", "income", "amount"),
    "roas": ("roas", "return on ad spend"),
}


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

    for col in converted.columns:
        series = converted[col]
        if is_numeric_dtype(series) or _looks_like_date_column_name(col):
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

        normalized = (
            cleaned.str.replace(",", "", regex=False)
            .str.replace("$", "", regex=False)
            .str.replace("%", "", regex=False)
            .str.replace("€", "", regex=False)
            .str.replace("£", "", regex=False)
            .str.replace(r"^\((.*)\)$", r"-\1", regex=True)
        )

        numeric = pd.to_numeric(normalized, errors="coerce")
        parse_ratio = numeric.notna().sum() / len(cleaned)

        if parse_ratio >= 0.8:
            full_cleaned = (
                series.astype(str)
                .str.strip()
                .replace({"": None, "nan": None, "None": None, "null": None})
                .str.replace(",", "", regex=False)
                .str.replace("$", "", regex=False)
                .str.replace("%", "", regex=False)
                .str.replace("€", "", regex=False)
                .str.replace("£", "", regex=False)
                .str.replace(r"^\((.*)\)$", r"-\1", regex=True)
            )
            converted[col] = pd.to_numeric(full_cleaned, errors="coerce")
            coerced_columns.append(col)

    return converted, coerced_columns


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
    normalized_columns = [(col, col.lower()) for col in columns]
    for token in patterns:
        for original, lowered in normalized_columns:
            if token in lowered:
                return original
    return None


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


def infer_metric_mappings(df: pd.DataFrame) -> dict[str, str | None]:
    numeric_columns = df.select_dtypes(include="number").columns.tolist()
    metric_mappings = {
        metric_key: _pick_metric_mapping(numeric_columns, patterns)
        for metric_key, patterns in METRIC_PATTERNS.items()
    }
    metric_mappings["conversions"] = _pick_conversion_metric_mapping(numeric_columns)
    return metric_mappings


def build_dataset_profile(df: pd.DataFrame) -> tuple[pd.DataFrame, dict[str, Any]]:
    normalized_df, coerced_columns = _coerce_numeric_like_columns(df)
    date_columns = _detect_date_columns(normalized_df)
    numeric_columns = normalized_df.select_dtypes(include="number").columns.tolist()
    metric_mappings = infer_metric_mappings(normalized_df)
    warnings: list[str] = []

    if not date_columns:
        warnings.append("No date column was detected during ingestion.")
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
        basis = "mean" if _uses_average_basis(col) else "total"
        if basis == "mean":
            current_value = (current_summary.get(col) or {}).get("mean")
            previous_value = (previous_summary.get(col) or {}).get("mean")
        else:
            current_value = current_totals.get(col)
            previous_value = previous_totals.get(col)

        if current_value is None:
            continue

        delta_pct = None
        if previous_value not in (None, 0):
            delta_pct = ((current_value - previous_value) / abs(previous_value)) * 100
        elif previous_value == 0 and current_value > 0:
            delta_pct = 100.0  # Treat 0 -> positive as 100% growth for UX
        elif previous_value == 0 and current_value < 0:
            delta_pct = -100.0

        comparison[col] = {
            "basis": basis,
            "current": _sanitize(current_value),
            "previous": _sanitize(previous_value),
            "delta_pct": _sanitize(delta_pct),
        }

    return comparison


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


def compute(
    df: pd.DataFrame,
    operation: str,
    column: str | None = None,
    group_by: str | None = None,
) -> dict[str, Any]:
    df, _ = _coerce_numeric_like_columns(df)

    if operation == "describe":
        return _sanitize(df.describe(include="all").to_dict())

    if operation == "value_counts":
        if not column or column not in df.columns:
            raise ValueError(f"Column '{column}' not found for value_counts.")
        return _sanitize(df[column].value_counts().head(20).to_dict())

    if operation == "groupby":
        if not column or not group_by:
            raise ValueError("Both 'column' and 'group_by' are required for groupby.")
        if column not in df.columns or group_by not in df.columns:
            raise ValueError("Specified columns not found in dataset.")
        result = df.groupby(group_by)[column].mean().to_dict()
        return _sanitize(result)

    if operation == "correlation":
        numeric = df.select_dtypes(include="number")
        return _sanitize(numeric.corr().to_dict())

    if operation == "auto":
        return _auto_analyze(df)

    raise ValueError(
        f"Unknown operation: '{operation}'. Use describe, value_counts, groupby, correlation, or auto."
    )


def _auto_analyze(df: pd.DataFrame) -> dict[str, Any]:
    """All-in-one analysis for the dashboard. Returns KPI data + chart data."""
    shape = {"rows": int(len(df)), "cols": int(len(df.columns))}
    numeric_cols = df.select_dtypes(include="number").columns.tolist()
    selected_metric_columns = _pick_metric_columns(df)

    # Summary stats for numeric columns → KPI cards
    numeric_summary = _sanitize(df.describe(include="number").to_dict())
    # Rate/ratio metrics (CTR, ROAS, CPC, etc.) must be averaged, not summed.
    # Summing them produces nonsense KPI values (e.g. CTR of 12.3 instead of 0.08).
    numeric_totals = _sanitize(
        {col: df[col].mean() if _uses_average_basis(col) else df[col].sum() for col in numeric_cols}
    )

    # Detect date columns
    date_columns = _detect_date_columns(df)

    # Try to parse potential date columns
    parsed_dates: dict[str, list] = {}
    metric_time_series: dict[str, dict[str, list[dict[str, Any]]]] = {}
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
            metric_col = _pick_metric_column(df)
            if metric_col:
                grp = sorted_df.groupby(sorted_df[col].dt.date)[metric_col]
                agg = grp.mean() if _uses_average_basis(metric_col) else grp.sum()
                parsed_dates[col] = [
                    {"date": str(k), "value": _sanitize(v)} for k, v in agg.items()
                ]
            metric_series_for_col: dict[str, list[dict[str, Any]]] = {}
            for metric_col in selected_metric_columns:
                grp = sorted_df.groupby(sorted_df[col].dt.date)[metric_col]
                agg = grp.mean() if _uses_average_basis(metric_col) else grp.sum()
                metric_series_for_col[metric_col] = [
                    {"date": str(k), "value": _sanitize(v)} for k, v in agg.items()
                ]
            if metric_series_for_col:
                metric_time_series[col] = metric_series_for_col
        except Exception:
            pass

    # Categorical value counts for bar charts
    categorical_charts: dict[str, dict] = {}
    metric_breakdowns: dict[str, dict[str, dict[str, Any]]] = {}
    for col in df.select_dtypes(include=["object", "category", "string"]).columns:
        if col in date_columns:
            continue
        if df[col].nunique() <= 20:
            categorical_charts[col] = _sanitize(df[col].value_counts().head(10).to_dict())
        if 1 < df[col].nunique() <= 8:
            for metric_col in selected_metric_columns:
                metric_breakdowns.setdefault(metric_col, {})
                agg_fn = "mean" if _uses_average_basis(metric_col) else "sum"
                grouped = (
                    df.groupby(col, dropna=True)[metric_col]
                    .agg(agg_fn)
                    .sort_values(ascending=False)
                    .head(8)
                )
                if not grouped.empty:
                    metric_breakdowns[metric_col][col] = _sanitize(grouped.to_dict())

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
        "date_columns": date_columns,
        "dtypes": dtypes,
        "sample": sample,
    }
