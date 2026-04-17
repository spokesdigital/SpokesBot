import unittest

import pandas as pd

from app.services.analytics_service import build_auto_comparison, build_dataset_profile, compute


class AnalyticsServiceAutoTest(unittest.TestCase):
    def test_auto_analyze_uses_date_amount_category_correctly(self):
        df = pd.DataFrame(
            {
                "date": ["2026-03-30", "2026-03-31", "2026-03-31", "2026-04-01"],
                "amount": [10, 20, 15, 5],
                "category": ["A", "B", "A", "B"],
            }
        )

        result = compute(df, operation="auto")

        self.assertEqual(result["shape"], {"rows": 4, "cols": 3})
        self.assertEqual(result["date_columns"], ["date"])
        self.assertEqual(result["categorical_charts"], {"category": {"A": 2, "B": 2}})
        self.assertEqual(
            result["time_series"],
            {
                "date": [
                    {"date": "2026-03-30", "value": 10},
                    {"date": "2026-03-31", "value": 35},
                    {"date": "2026-04-01", "value": 5},
                ]
            },
        )
        self.assertEqual(result["numeric_totals"]["amount"], 50)
        self.assertEqual(
            result["metric_time_series"]["date"]["amount"],
            [
                {"date": "2026-03-30", "value": 10},
                {"date": "2026-03-31", "value": 35},
                {"date": "2026-04-01", "value": 5},
            ],
        )
        self.assertEqual(result["numeric_summary"]["amount"]["mean"], 12.5)

    def test_auto_analyze_does_not_treat_category_as_date_column(self):
        df = pd.DataFrame(
            {
                "category": ["A", "B", "A"],
                "amount": [100, 50, 25],
            }
        )

        result = compute(df, operation="auto")

        self.assertEqual(result["date_columns"], [])
        self.assertEqual(result["time_series"], {})
        self.assertEqual(result["categorical_charts"], {"category": {"A": 2, "B": 1}})

    def test_build_auto_comparison_uses_totals_for_sum_metrics(self):
        current = {
            "numeric_totals": {"revenue": 1200, "cost": 500},
            "numeric_summary": {
                "revenue": {"mean": 300},
                "cost": {"mean": 125},
                "ctr": {"mean": 0.12},
            },
        }
        previous = {
            "numeric_totals": {"revenue": 1000, "cost": 400},
            "numeric_summary": {
                "revenue": {"mean": 250},
                "cost": {"mean": 100},
                "ctr": {"mean": 0.10},
            },
        }

        comparison = build_auto_comparison(current, previous)

        self.assertEqual(comparison["revenue"]["basis"], "total")
        self.assertEqual(comparison["revenue"]["current"], 1200)
        self.assertEqual(comparison["revenue"]["previous"], 1000)
        self.assertAlmostEqual(comparison["revenue"]["delta_pct"], 20.0)
        self.assertEqual(comparison["ctr"]["basis"], "mean")
        self.assertAlmostEqual(comparison["ctr"]["delta_pct"], 20.0)

    def test_auto_analyze_coerces_numeric_like_text_columns(self):
        df = pd.DataFrame(
            {
                "Day": ["2026-04-01", "2026-04-02"],
                "Impressions": ["1,200", "800"],
                "Clicks": ["100", "50"],
                "Cost": ["$45.50", "$54.50"],
                "Revenue": ["$100.00", "$125.00"],
            }
        )

        result = compute(df, operation="auto")

        self.assertEqual(result["numeric_totals"]["Impressions"], 2000)
        self.assertEqual(result["numeric_totals"]["Clicks"], 150)
        self.assertAlmostEqual(result["numeric_totals"]["Cost"], 100.0)
        self.assertAlmostEqual(result["numeric_totals"]["Revenue"], 225.0)
        self.assertEqual(result["date_columns"], ["Day"])

    def test_build_dataset_profile_detects_canonical_metrics(self):
        df = pd.DataFrame(
            {
                "Day": ["2026-04-01", "2026-04-02"],
                "Impressions": ["1,200", "800"],
                "Clicks": ["100", "50"],
                "Cost": ["$45.50", "$54.50"],
                "Revenue": ["$100.00", "$125.00"],
                "Channel Label": ["Search", "Search"],
            }
        )

        normalized_df, profile = build_dataset_profile(df)

        self.assertTrue(pd.api.types.is_numeric_dtype(normalized_df["Impressions"]))
        self.assertEqual(profile["detected_date_column"], "Day")
        self.assertEqual(profile["metric_mappings"]["impressions"], "Impressions")
        self.assertEqual(profile["metric_mappings"]["clicks"], "Clicks")
        self.assertEqual(profile["metric_mappings"]["cost"], "Cost")
        self.assertEqual(profile["metric_mappings"]["revenue"], "Revenue")
        self.assertIn("Impressions", profile["schema_profile"]["coerced_numeric_columns"])

    def test_build_dataset_profile_prefers_conversion_counts_over_rates(self):
        df = pd.DataFrame(
            {
                "Day": ["2026-04-01", "2026-04-02"],
                "Conversion Rate": [0.04, 0.05],
                "Cost per Conversion": [12.0, 15.0],
                "Conversions": [4, 5],
                "Transactions": [3, 4],
            }
        )

        _, profile = build_dataset_profile(df)

        self.assertEqual(profile["metric_mappings"]["conversions"], "Conversions")

    def test_build_dataset_profile_does_not_treat_amount_spent_as_revenue(self):
        df = pd.DataFrame(
            {
                "Day": ["2026-04-01", "2026-04-02"],
                "Amount Spent": [120.0, 150.0],
                "Clicks": [40, 55],
            }
        )

        _, profile = build_dataset_profile(df)

        self.assertEqual(profile["metric_mappings"]["cost"], "Amount Spent")
        self.assertIsNone(profile["metric_mappings"]["revenue"])


if __name__ == "__main__":
    unittest.main()
