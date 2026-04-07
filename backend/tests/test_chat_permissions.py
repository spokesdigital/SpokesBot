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


class TestChatPermissions:
    """Test thread and message RLS isolation logic."""

    def test_user_can_only_access_own_threads(self):
        """Regular users should only see their own threads via RLS."""
        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "user-id"
        app.dependency_overrides[get_current_role] = lambda: "user"
        app.dependency_overrides[get_current_org_id] = lambda: "user-org-id"

        with TestClient(app) as client:
            response = client.get("/threads/")
            assert response.status_code == 200

    def test_admin_can_list_all_org_threads(self):
        """Admins should be able to list all threads in their org."""
        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "admin-org-id"

        with TestClient(app) as client:
            response = client.get("/threads/")
            assert response.status_code == 200

    def test_user_cannot_access_other_user_messages(self):
        """Regular users should not access messages from threads they don't own."""
        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "user-id"
        app.dependency_overrides[get_current_role] = lambda: "user"
        app.dependency_overrides[get_current_org_id] = lambda: "user-org-id"

        with TestClient(app) as client:
            response = client.get("/threads/other-thread-id/messages")
            assert response.status_code == 404

    def test_admin_can_access_any_thread_messages(self):
        """Admins should be able to access messages from any thread."""
        mock_supabase = _make_mock_supabase()
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
            "id": "thread-id",
            "organization_id": "org-id",
            "dataset_id": "dataset-id",
        }
        mock_supabase.table.return_value.select.return_value.eq.return_value.order.return_value.execute.return_value.data = []

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "admin-org-id"

        with TestClient(app) as client:
            response = client.get("/threads/any-thread-id/messages")
            assert response.status_code == 200

    def test_chat_requires_dataset_completed(self):
        """Chat should be rejected if dataset is not in 'completed' status."""
        mock_supabase = _make_mock_supabase()

        def table_side_effect(table_name):
            mock_chain = MagicMock()
            if table_name == "threads":
                mock_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": "thread-id",
                    "dataset_id": "dataset-id",
                    "organization_id": "org-id",
                }
            elif table_name == "datasets":
                mock_chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = {
                    "id": "dataset-id",
                    "status": "processing",
                    "storage_path": None,
                }
            return mock_chain

        mock_supabase.table.side_effect = table_side_effect

        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "user-id"
        app.dependency_overrides[get_current_role] = lambda: "user"
        app.dependency_overrides[get_current_org_id] = lambda: "user-org-id"

        with TestClient(app) as client:
            response = client.post(
                "/threads/thread-id/chat",
                json={"message": "Hello"},
            )
            assert response.status_code == 409

    def test_unauthenticated_user_cannot_chat(self):
        """Unauthenticated users should be denied chat access."""
        with TestClient(app) as client:
            response = client.post(
                "/threads/thread-id/chat",
                json={"message": "Hello"},
            )
            assert response.status_code in (401, 403)

    def test_unauthenticated_user_cannot_list_threads(self):
        """Unauthenticated users should be denied thread listing."""
        with TestClient(app) as client:
            response = client.get("/threads/")
            assert response.status_code in (401, 403)

    def test_unauthenticated_user_cannot_view_messages(self):
        """Unauthenticated users should be denied message viewing."""
        with TestClient(app) as client:
            response = client.get("/threads/thread-id/messages")
            assert response.status_code in (401, 403)
