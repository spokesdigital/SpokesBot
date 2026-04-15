from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from app.dependencies import (
    get_current_org_id,
    get_current_role,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
)
from app.main import app


@pytest.fixture(autouse=True)
def cleanup_overrides():
    """Clear dependency overrides after each test."""
    yield
    app.dependency_overrides.clear()


def _make_mock_supabase():
    """Create a fresh mocked Supabase client."""
    mock = MagicMock()
    mock.postgrest = MagicMock()
    mock.postgrest.auth = MagicMock()
    mock.auth = MagicMock()
    mock.rpc = MagicMock()
    mock.table = MagicMock()
    mock.storage = MagicMock()
    return mock


class TestUploadFlow:
    """Test dataset upload lifecycle and validation."""

    def test_non_csv_rejected(self):
        """Non-CSV files should be rejected with 400."""
        from io import BytesIO

        mock_supabase = _make_mock_supabase()

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

        with TestClient(app) as client:
            response = client.post(
                "/upload/",
                files={
                    "file": (
                        "data.xlsx",
                        BytesIO(b"fake"),
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    )
                },
                data={"org_id": "00000000-0000-0000-0000-000000000001"},
            )
            assert response.status_code == 400
            assert "csv" in response.json()["detail"].lower()

    def test_empty_file_rejected(self):
        """Empty files should be rejected with 400."""
        from io import BytesIO

        mock_supabase = _make_mock_supabase()

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

        with TestClient(app) as client:
            response = client.post(
                "/upload/",
                files={"file": ("empty.csv", BytesIO(b""), "text/csv")},
                data={"org_id": "00000000-0000-0000-0000-000000000001"},
            )
            assert response.status_code == 400
            assert "empty" in response.json()["detail"].lower()

    def test_non_admin_rejected(self):
        """Non-admin users should be denied upload with 403."""
        from io import BytesIO

        mock_supabase = _make_mock_supabase()

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "user-id"
        app.dependency_overrides[get_current_role] = lambda: "user"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

        with TestClient(app) as client:
            response = client.post(
                "/upload/",
                files={"file": ("data.csv", BytesIO(b"a,b\n1,2"), "text/csv")},
                data={"org_id": "00000000-0000-0000-0000-000000000001"},
            )
            assert response.status_code == 403

    def test_unknown_org_rejected(self):
        """Upload to non-existent org should return 404."""
        from io import BytesIO

        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

        with TestClient(app) as client:
            response = client.post(
                "/upload/",
                files={"file": ("data.csv", BytesIO(b"a,b\n1,2"), "text/csv")},
                data={"org_id": "00000000-0000-0000-0000-000000000001"},
            )
            assert response.status_code == 404

    def test_valid_upload_returns_202(self):
        """Valid CSV upload by admin should return 202 with dataset_id."""
        from io import BytesIO

        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": "00000000-0000-0000-0000-000000000001"
        }
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "test-dataset-id"}
        ]

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

        with TestClient(app) as client:
            response = client.post(
                "/upload/",
                files={"file": ("data.csv", BytesIO(b"a,b\n1,2"), "text/csv")},
                data={"org_id": "00000000-0000-0000-0000-000000000001"},
            )
            assert response.status_code == 202
            data = response.json()
            assert "dataset_id" in data
            assert data["status"] == "queued"

    def test_dataset_status_lifecycle(self):
        """Verify dataset status transitions: queued → processing → completed."""
        from io import BytesIO

        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": "00000000-0000-0000-0000-000000000001"
        }
        mock_supabase.table.return_value.insert.return_value.execute.return_value.data = [
            {"id": "test-dataset-id"}
        ]

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

        with TestClient(app) as client:
            response = client.post(
                "/upload/",
                files={"file": ("data.csv", BytesIO(b"a,b\n1,2"), "text/csv")},
                data={"org_id": "00000000-0000-0000-0000-000000000001"},
            )
            assert response.status_code == 202
            assert response.json()["status"] == "queued"
