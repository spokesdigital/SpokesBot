"""
tests/test_premise_validation.py

Tests for the get_trend tool that powers premise validation.
Verifies that the tool correctly detects up/down/stable directions so the
chatbot can correct wrong user assumptions (e.g. "why is revenue down?"
when revenue is actually up).
"""

import json

import pandas as pd
import pytest

from app.agent.tools import make_tools


# ── helpers ───────────────────────────────────────────────────────────────────

def _trend(df: pd.DataFrame) -> dict:
    tools = make_tools(df)
    get_trend = next(t for t in tools if t.name == "get_trend")
    return json.loads(get_trend.invoke({}))


# ── direction detection ───────────────────────────────────────────────────────

class TestGetTrendDirection:
    def test_detects_upward_revenue(self):
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10, freq="D"),
            "revenue": [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
        })
        result = _trend(df)
        assert result["revenue"]["direction"] == "up"
        assert result["revenue"]["pct_change"] > 0

    def test_detects_downward_revenue(self):
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10, freq="D"),
            "revenue": [190, 180, 170, 160, 150, 140, 130, 120, 110, 100],
        })
        result = _trend(df)
        assert result["revenue"]["direction"] == "down"
        assert result["revenue"]["pct_change"] < 0

    def test_detects_stable_revenue(self):
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10, freq="D"),
            "revenue": [100, 101, 99, 100, 102, 100, 99, 101, 100, 100],
        })
        result = _trend(df)
        assert result["revenue"]["direction"] == "stable"

    def test_sorts_chronologically_by_date(self):
        """Even if rows arrive out of order, get_trend splits chronologically."""
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10, freq="D")[::-1],
            "revenue": [190, 180, 170, 160, 150, 140, 130, 120, 110, 100],
        })
        # After sorting by date ascending the values become 100..190 → should be "up"
        result = _trend(df)
        assert result["revenue"]["direction"] == "up"

    def test_uses_mean_for_ratio_metrics(self):
        """CTR/ROAS are averaged, not summed, so direction reflects rate change."""
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=10, freq="D"),
            "ctr": [0.02, 0.02, 0.02, 0.02, 0.02, 0.05, 0.05, 0.05, 0.05, 0.05],
        })
        result = _trend(df)
        assert result["ctr"]["direction"] == "up"

    def test_no_numeric_columns_returns_error(self):
        df = pd.DataFrame({"name": ["Alice", "Bob"], "category": ["A", "B"]})
        result = _trend(df)
        assert "error" in result

    def test_works_without_date_column(self):
        """Falls back to row order when no date column exists."""
        df = pd.DataFrame({
            "revenue": [100, 110, 120, 130, 140, 150, 160, 170, 180, 190],
        })
        result = _trend(df)
        assert result["revenue"]["direction"] == "up"

    def test_returns_earlier_and_recent_values(self):
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=6, freq="D"),
            "revenue": [100, 100, 100, 200, 200, 200],
        })
        result = _trend(df)
        assert result["revenue"]["earlier_period"] == 300.0  # sum of first 3
        assert result["revenue"]["recent_period"] == 600.0   # sum of last 3
        assert result["revenue"]["direction"] == "up"

    def test_prioritises_mapped_metrics_first(self):
        """Metric-mapped columns (revenue, cost, clicks…) appear before generic ones."""
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=4, freq="D"),
            "Purchase conversion value": [10.0, 20.0, 30.0, 40.0],
            "zzz_metric": [1.0, 1.0, 1.0, 1.0],
        })
        result = _trend(df)
        keys = list(result.keys())
        assert "Purchase conversion value" in keys
        # Revenue-mapped column should appear before the unmapped one
        assert keys.index("Purchase conversion value") < keys.index("zzz_metric")

    def test_single_row_returns_error(self):
        df = pd.DataFrame({"revenue": [100.0]})
        result = _trend(df)
        # Too few rows to split reliably — must return an error, not a wrong direction
        assert "error" in result

    def test_two_rows_returns_error(self):
        df = pd.DataFrame({"revenue": [100.0, 50.0]})
        result = _trend(df)
        assert "error" in result

    def test_three_rows_returns_error(self):
        df = pd.DataFrame({"revenue": [100.0, 50.0, 200.0]})
        result = _trend(df)
        assert "error" in result

    def test_four_rows_has_enough_data(self):
        df = pd.DataFrame({
            "date": pd.date_range("2024-01-01", periods=4, freq="D"),
            "revenue": [100.0, 100.0, 200.0, 200.0],
        })
        result = _trend(df)
        assert "revenue" in result
        assert result["revenue"]["direction"] == "up"
