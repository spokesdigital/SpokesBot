import json

import pandas as pd
from langchain_core.tools import tool

from app.services.analytics_service import (
    _detect_date_columns,
    _sanitize,
    _uses_average_basis,
    infer_metric_mappings,
)


def _resolve_column(df: pd.DataFrame, name: str) -> str:
    """
    Return the exact DataFrame column that best matches `name`.

    Resolution order:
    1. Exact match (case-sensitive)
    2. Case-insensitive exact match
    3. Metric alias match via infer_metric_mappings (e.g. "revenue" → "Purchase conversion value")
    4. Substring match (first column whose lower-cased name contains `name`)

    Returns the original `name` unchanged if no match is found — the caller
    will surface a clear error with available columns.
    """
    if name in df.columns:
        return name

    lowered = name.strip().lower()

    # Case-insensitive exact
    for col in df.columns:
        if col.strip().lower() == lowered:
            return col

    # Metric alias (handles "revenue", "clicks", "cost", etc.)
    mappings = infer_metric_mappings(df)
    for metric_key, mapped_col in mappings.items():
        if mapped_col and lowered in (metric_key, metric_key.replace("_", " ")):
            return mapped_col

    # Substring fallback
    for col in df.columns:
        if lowered in col.strip().lower():
            return col

    return name  # unresolved — let compute() raise the informative error


def make_tools(df: pd.DataFrame):
    """
    Factory that creates LangChain tools with the DataFrame captured in closure scope.
    Call once per chat request: tools = make_tools(loaded_df)
    """

    @tool
    def get_dataset_schema() -> str:
        """
        Returns the dataset schema: column names, data types, row count, and null counts.
        Call this first to understand what data is available before running any analysis.
        """
        info = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": {
                col: {
                    "dtype": str(df[col].dtype),
                    "null_count": int(df[col].isna().sum()),
                    "unique_count": int(df[col].nunique()),
                }
                for col in df.columns
            },
        }
        return json.dumps(info, indent=2)

    @tool
    def get_sample_rows(n: int = 5) -> str:
        """
        Returns the first n rows of the dataset as a JSON array.
        Useful for understanding the data format and sample values.
        Args:
            n: Number of rows to return (max 20).
        """
        n = min(n, 20)
        sample = _sanitize(df.head(n).to_dict(orient="records"))
        return json.dumps(sample, indent=2, default=str)

    @tool
    def run_analysis(operation: str, column: str = "", group_by: str = "") -> str:
        """
        Run a statistical analysis operation on the dataset.
        Args:
            operation: One of: 'describe', 'value_counts', 'groupby', 'correlation', 'auto'.
                - 'describe': Summary stats (mean, std, min, max) for all numeric columns.
                - 'value_counts': Frequency count of unique values in a single column. Requires 'column'.
                - 'groupby': Aggregates 'column' grouped by 'group_by'. Additive metrics (revenue, cost, clicks, impressions, conversions) are SUMMED; ratio/rate metrics (CTR, CPC, ROAS, CPA) are averaged. Requires both 'column' and 'group_by'.
                - 'correlation': Correlation matrix of all numeric columns.
                - 'auto': Full dashboard-oriented analysis with totals, metric breakdowns, and time series.
            column: Target column name (required for value_counts and groupby).
            group_by: Column to group by (required for groupby).
        """
        from app.services.analytics_service import compute

        resolved_column = _resolve_column(df, column) if column else None
        resolved_group_by = _resolve_column(df, group_by) if group_by else None
        try:
            result = compute(
                df,
                operation=operation,
                column=resolved_column,
                group_by=resolved_group_by,
            )
            if operation == "auto" and isinstance(result, dict):
                # The agent doesn't need thousands of daily data points, which blow past the 128k token limit.
                result.pop("time_series", None)
                result.pop("metric_time_series", None)

            return json.dumps(result, indent=2, default=str)
        except ValueError as e:
            return f"Error: {e}"

    @tool
    def filter_and_describe(filter_column: str, filter_value: str) -> str:
        """
        Filter the dataset to rows where filter_column equals filter_value,
        then return descriptive statistics of the filtered subset.
        Args:
            filter_column: Column to filter on.
            filter_value: Value to match (string comparison, case-insensitive).
        """
        filter_column = _resolve_column(df, filter_column)
        if filter_column not in df.columns:
            available = list(df.columns)
            return f"Error: Column '{filter_column}' not found. Available columns: {available}. Call get_dataset_schema to see exact column names."
        mask = df[filter_column].astype(str).str.lower() == filter_value.lower()
        subset = df[mask]
        if subset.empty:
            return f"No rows found where {filter_column} = '{filter_value}'."
        result = {
            "matched_rows": len(subset),
            "stats": _sanitize(subset.describe(include="all").to_dict()),
        }
        return json.dumps(result, indent=2, default=str)

    @tool
    def get_trend() -> str:
        """
        Verify whether key metrics are actually trending up, down, or staying stable
        across the full dataset timespan.

        Call this FIRST whenever the user's question contains a directional assumption
        — e.g. "why is revenue down?", "why did CTR drop?", "why is performance
        declining?", "why is my business not growing?", "how to improve X?" — so you
        can confirm or correct the premise before explaining it.

        Method: splits the dataset in two halves (chronological if a date column exists,
        row-order otherwise) and computes earlier-half vs recent-half for each metric.
        Additive metrics (revenue, cost, clicks, impressions) use sums; ratio metrics
        (CTR, ROAS, CPC) use means.

        Returns per-metric: direction ("up" | "down" | "stable"), pct_change (rounded %),
        earlier_period value, recent_period value.
        """
        numeric_cols = df.select_dtypes(include="number").columns.tolist()
        if not numeric_cols:
            return json.dumps({"error": "No numeric columns found in dataset."})

        # Sort chronologically when a date column is available so "recent" is reliable.
        date_cols = _detect_date_columns(df)
        if date_cols:
            try:
                parsed = pd.to_datetime(df[date_cols[0]], errors="coerce", utc=True)
                sorted_df = df.copy()
                sorted_df["_sort_date"] = parsed
                sorted_df = sorted_df.sort_values("_sort_date").drop(columns=["_sort_date"])
            except Exception:
                sorted_df = df
        else:
            sorted_df = df

        if len(sorted_df) < 4:
            return json.dumps({"error": "Not enough data for trend analysis — dataset has too few rows to split."})

        midpoint = len(sorted_df) // 2
        first_half = sorted_df.iloc[:midpoint]
        second_half = sorted_df.iloc[midpoint:]

        # Cap to 12 most relevant metrics so the response stays compact.
        metric_mappings = infer_metric_mappings(df)
        priority_cols = [c for c in metric_mappings.values() if c and c in numeric_cols]
        remaining = [c for c in numeric_cols if c not in priority_cols]
        cols_to_check = (priority_cols + remaining)[:12]

        result: dict = {}
        for col in cols_to_check:
            try:
                use_mean = _uses_average_basis(col)
                earlier = float(
                    first_half[col].mean() if use_mean else first_half[col].sum()
                )
                recent = float(
                    second_half[col].mean() if use_mean else second_half[col].sum()
                )
                if earlier != 0:
                    pct = round(((recent - earlier) / abs(earlier)) * 100, 1)
                else:
                    pct = None

                if pct is None:
                    direction = "stable"
                elif pct > 3:
                    direction = "up"
                elif pct < -3:
                    direction = "down"
                else:
                    direction = "stable"

                result[col] = _sanitize(
                    {
                        "direction": direction,
                        "pct_change": pct,
                        "earlier_period": round(earlier, 2),
                        "recent_period": round(recent, 2),
                    }
                )
            except Exception:
                continue

        if not result:
            return json.dumps({"error": "Could not compute trend — insufficient data."})

        return json.dumps(result, indent=2, default=str)

    @tool
    def compare_timeframes(metric_column: str, current_preset: str, previous_preset: str) -> str:
        """
        Compare a specific metric between two different time periods.
        Args:
            metric_column: The metric to compare (e.g., 'Revenue', 'ROAS', 'Cost').
            current_preset: The primary timeframe to analyze (e.g., 'last_7_days', 'this_month', 'last_30_days', 'today', 'yesterday').
            previous_preset: The secondary timeframe to compare against (e.g., 'previous_7_days', 'last_month', 'previous_30_days').
        """
        from datetime import UTC, datetime, time, timedelta
        from app.services.analytics_service import apply_date_filter, resolve_date_range, _detect_date_columns, _uses_average_basis
        
        date_columns = _detect_date_columns(df)
        if not date_columns:
            return "Error: No date column found in dataset."
        date_column = date_columns[0]
        
        resolved_metric = _resolve_column(df, metric_column)
        if resolved_metric not in df.columns:
            return f"Error: Metric column '{metric_column}' not found."
            
        def get_range(preset):
            if preset == "previous_7_days":
                now = datetime.now(UTC)
                today = now.date()
                end = datetime.combine(today - timedelta(days=7), time.max, tzinfo=UTC)
                start = datetime.combine(today - timedelta(days=13), time.min, tzinfo=UTC)
                return start, end
            if preset == "previous_30_days":
                now = datetime.now(UTC)
                today = now.date()
                end = datetime.combine(today - timedelta(days=30), time.max, tzinfo=UTC)
                start = datetime.combine(today - timedelta(days=59), time.min, tzinfo=UTC)
                return start, end
            if preset == "last_month":
                now = datetime.now(UTC)
                today = now.date()
                first_of_this_month = today.replace(day=1)
                last_day_of_last_month = first_of_this_month - timedelta(days=1)
                first_of_last_month = last_day_of_last_month.replace(day=1)
                start = datetime.combine(first_of_last_month, time.min, tzinfo=UTC)
                end = datetime.combine(last_day_of_last_month, time.max, tzinfo=UTC)
                return start, end
            return resolve_date_range(preset)

        try:
            cur_start, cur_end = get_range(current_preset)
            prev_start, prev_end = get_range(previous_preset)
            
            cur_df = apply_date_filter(df, date_column, cur_start, cur_end)
            prev_df = apply_date_filter(df, date_column, prev_start, prev_end)
        except Exception as e:
            return f"Error resolving date ranges: {str(e)}"
            
        def get_val(subset):
            series = subset[resolved_metric].dropna()
            if series.empty: return 0.0
            return float(series.mean()) if _uses_average_basis(resolved_metric) else float(series.sum())

        cur_val = get_val(cur_df)
        prev_val = get_val(prev_df)
        
        diff = cur_val - prev_val
        pct = (diff / prev_val * 100) if prev_val != 0 else 0
        
        result = {
            "metric": resolved_metric,
            "current_period": current_preset,
            "current_value": cur_val,
            "previous_period": previous_preset,
            "previous_value": prev_val,
            "difference": diff,
            "percentage_change": pct
        }
        return json.dumps(result, indent=2, default=str)

    return [get_dataset_schema, get_sample_rows, run_analysis, filter_and_describe, get_trend, compare_timeframes]

