from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import app.main as app_main
import app.routers.upload as upload_router
from app.dependencies import (
    get_current_org_id,
    get_current_role,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
)
from app.main import app


@pytest.fixture
def client():
    """Test client with dependency overrides cleared after each test."""
    with TestClient(app) as c:
        yield c


@pytest.fixture
def mock_supabase():
    """Create a fresh mocked Supabase client."""
    mock = MagicMock()
    mock.postgrest = MagicMock()
    mock.postgrest.auth = MagicMock()
    mock.auth = MagicMock()
    mock.rpc = MagicMock()
    mock.table = MagicMock()
    mock.storage = MagicMock()
    return mock


def _setup_admin_overrides(mock_supabase, user_id="admin-id", org_id="org-id"):
    """Configure dependency overrides for an admin user."""
    mock_user = MagicMock()
    mock_user.user.id = user_id
    mock_supabase.auth.get_user.return_value = mock_user

    def mock_rpc_call(func_name):
        mock_result = MagicMock()
        if func_name == "get_my_org_id":
            mock_result.data = org_id
        elif func_name == "get_my_role":
            mock_result.data = "admin"
        return mock_result

    mock_supabase.rpc.side_effect = lambda name: mock_rpc_call(name)

    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_service_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    app.dependency_overrides[get_current_role] = lambda: "admin"
    app.dependency_overrides[get_current_org_id] = lambda: org_id


def _setup_user_overrides(mock_supabase, user_id="user-id", org_id="org-id"):
    """Configure dependency overrides for a regular user."""
    mock_user = MagicMock()
    mock_user.user.id = user_id
    mock_supabase.auth.get_user.return_value = mock_user

    def mock_rpc_call(func_name):
        mock_result = MagicMock()
        if func_name == "get_my_org_id":
            mock_result.data = org_id
        elif func_name == "get_my_role":
            mock_result.data = "user"
        return mock_result

    mock_supabase.rpc.side_effect = lambda name: mock_rpc_call(name)

    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_service_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_user_id] = lambda: user_id
    app.dependency_overrides[get_current_role] = lambda: "user"
    app.dependency_overrides[get_current_org_id] = lambda: org_id


def _clear_overrides():
    """Clear all dependency overrides."""
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def mock_startup_service_client():
    """Clear dependency overrides after each test."""
    original_main_service_client = app_main.get_service_client
    original_upload_service_client = upload_router.get_service_client
    mock_service_client = MagicMock()
    mock_service_client.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    app_main.get_service_client = lambda: mock_service_client
    upload_router.get_service_client = lambda: mock_service_client
    yield
    app_main.get_service_client = original_main_service_client
    upload_router.get_service_client = original_upload_service_client
    _clear_overrides()
