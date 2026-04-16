import json

import pandas as pd
from langchain_core.tools import tool

from app.services.analytics_service import _sanitize


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
                - 'groupby': Average of 'column' grouped by 'group_by'. Requires both.
                - 'correlation': Correlation matrix of all numeric columns.
                - 'auto': Full dashboard-oriented analysis with totals, metric breakdowns, and time series.
            column: Target column name (required for value_counts and groupby).
            group_by: Column to group by (required for groupby).
        """
        from app.services.analytics_service import compute

        try:
            result = compute(
                df,
                operation=operation,
                column=column or None,
                group_by=group_by or None,
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
        if filter_column not in df.columns:
            return f"Error: Column '{filter_column}' not found."
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
