from unittest.mock import MagicMock

from app.services import dataset_service

from conftest import _setup_admin_overrides


class TestDatasetMetadataRepair:
    def test_backfills_missing_conversions_mapping_from_schema_profile(self):
        dataset = {
            "metric_mappings": {
                "clicks": "Link Clicks",
                "cost": "Cost",
            },
            "schema_profile": {
                "numeric_columns": [
                    "Cost",
                    "Cost per Conversion",
                    "Transactions",
                    "Revenue",
                ],
                "date_columns": ["Date"],
            },
            "detected_date_column": None,
        }

        repaired = dataset_service.repair_dataset_metadata(dataset)

        assert repaired["metric_mappings"]["clicks"] == "Link Clicks"
        assert repaired["metric_mappings"]["conversions"] == "Transactions"
        assert repaired["detected_date_column"] == "Date"

    def test_preserves_existing_conversions_mapping(self):
        dataset = {
            "metric_mappings": {
                "conversions": "Purchases",
            },
            "schema_profile": {
                "numeric_columns": ["Transactions", "Purchases"],
            },
            "detected_date_column": "Day",
        }

        repaired = dataset_service.repair_dataset_metadata(dataset)

        assert repaired["metric_mappings"]["conversions"] == "Purchases"
        assert repaired["detected_date_column"] == "Day"


class TestDatasetsEndpoint:
    def test_list_endpoint_returns_repaired_metric_mappings(self, client, mock_supabase):
        org_id = "11111111-1111-1111-1111-111111111111"
        _setup_admin_overrides(mock_supabase, org_id=org_id)

        dataset = {
            "id": "22222222-2222-2222-2222-222222222222",
            "organization_id": org_id,
            "report_name": "Legacy Google Ads",
            "report_type": "google_ads",
            "detected_date_column": None,
            "metric_mappings": {
                "clicks": "Link Clicks",
                "cost": "Cost",
                "impressions": "Impressions",
                "revenue": "Revenue",
            },
            "schema_profile": {
                "numeric_columns": ["Impressions", "Link Clicks", "Cost", "Transactions", "Revenue"],
                "date_columns": ["Date"],
            },
            "ingestion_warnings": [],
            "file_name": "legacy.csv",
            "file_size": 123,
            "row_count": 10,
            "column_headers": ["Date", "Transactions"],
            "storage_path": "org/legacy.parquet",
            "status": "completed",
            "error_message": None,
            "uploaded_at": "2026-04-09T11:08:52.877480+00:00",
            "updated_at": "2026-04-09T11:08:54.970953+00:00",
        }

        dataset_query = MagicMock()
        dataset_query.select.return_value = dataset_query
        dataset_query.eq.return_value = dataset_query
        dataset_query.order.return_value = dataset_query
        dataset_query.execute.return_value = MagicMock(data=[dataset])
        mock_supabase.table.return_value = dataset_query

        response = client.get(f"/datasets/?org_id={org_id}")

        assert response.status_code == 200
        body = response.json()
        assert body["datasets"][0]["metric_mappings"]["conversions"] == "Transactions"
        assert body["datasets"][0]["detected_date_column"] == "Date"
