import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture(autouse=True)
def cleanup_overrides():
    """Clear dependency overrides after each test."""
    yield
    app.dependency_overrides.clear()


class TestAuthDependencies:
    """Test JWT and auth dependency behavior."""

    def test_missing_token_denies_dataset_access(self):
        """Requests without Authorization header should return 401."""
        with TestClient(app) as client:
            response = client.get("/datasets/")
            assert response.status_code in (401, 403)

    def test_unauthenticated_user_denied_dataset_access(self):
        """Unauthenticated users should be denied dataset access."""
        with TestClient(app) as client:
            response = client.get("/datasets/")
            assert response.status_code in (401, 403)

    def test_unauthenticated_user_denied_thread_access(self):
        """Unauthenticated users should be denied thread access."""
        with TestClient(app) as client:
            response = client.get("/threads/")
            assert response.status_code in (401, 403)

    def test_unauthenticated_user_denied_analytics_access(self):
        """Unauthenticated users should be denied analytics access."""
        with TestClient(app) as client:
            response = client.post("/analytics/compute", json={"dataset_id": "test-id", "operation": "sum", "column": "amount"})
            assert response.status_code in (401, 403)

    def test_unauthenticated_user_denied_upload_access(self):
        """Unauthenticated users should be denied upload access."""
        with TestClient(app) as client:
            response = client.post("/upload/")
            assert response.status_code in (401, 403)

    def test_health_endpoint_is_public(self):
        """Health endpoint should be accessible without auth."""
        with TestClient(app) as client:
            response = client.get("/health")
            assert response.status_code == 200
            assert response.json()["status"] == "ok"
