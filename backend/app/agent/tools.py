import json

import pandas as pd
from langchain_core.tools import tool

from app.services.analytics_service import _sanitize, infer_metric_mappings


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

    return [get_dataset_schema, get_sample_rows, run_analysis, filter_and_describe]
