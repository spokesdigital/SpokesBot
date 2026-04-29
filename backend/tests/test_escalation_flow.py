from unittest.mock import MagicMock

from fastapi.testclient import TestClient

from app.dependencies import (
    get_current_org_id,
    get_current_role,
    get_current_user,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
)
from app.main import app


def _mock_supabase():
    mock = MagicMock()
    mock.postgrest = MagicMock()
    mock.postgrest.auth = MagicMock()
    mock.auth = MagicMock()
    mock.rpc = MagicMock()
    mock.table = MagicMock()
    mock.storage = MagicMock()
    return mock


def test_escalate_thread_reuses_existing_open_ticket(monkeypatch):
    from app.routers import threads as threads_router

    app.dependency_overrides[get_supabase_client] = lambda: _mock_supabase()
    app.dependency_overrides[get_service_client] = lambda: _mock_supabase()
    app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    app.dependency_overrides[get_current_org_id] = lambda: "org-1"
    app.dependency_overrides[get_current_role] = lambda: "user"
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"email": "u@example.com"})()

    monkeypatch.setattr(
        threads_router.thread_service,
        "get_thread",
        lambda thread_id, supabase: {
            "id": thread_id,
            "title": "Revenue Thread",
            "organization_id": "org-1",
        },
    )
    monkeypatch.setattr(
        threads_router.thread_service,
        "get_messages",
        lambda thread_id, supabase: [{"role": "user", "content": "help"}],
    )
    monkeypatch.setattr(
        threads_router.support_service,
        "get_open_chat_escalation",
        lambda **kwargs: {"id": "support-existing"},
    )

    create_called = {"value": False}

    def _create_message(**kwargs):
        create_called["value"] = True
        return {"id": "should-not-happen"}

    monkeypatch.setattr(threads_router.support_service, "create_message", _create_message)

    with TestClient(app) as client:
        response = client.post("/threads/thread-1/escalate")
        assert response.status_code == 200
        assert response.json() == {"escalated": True, "support_message_id": "support-existing"}
        assert create_called["value"] is False

    app.dependency_overrides.clear()


def test_escalate_thread_creates_chat_escalation_when_missing(monkeypatch):
    from app.routers import threads as threads_router

    app.dependency_overrides[get_supabase_client] = lambda: _mock_supabase()
    app.dependency_overrides[get_service_client] = lambda: _mock_supabase()
    app.dependency_overrides[get_current_user_id] = lambda: "user-1"
    app.dependency_overrides[get_current_org_id] = lambda: "org-1"
    app.dependency_overrides[get_current_role] = lambda: "user"
    app.dependency_overrides[get_current_user] = lambda: type("U", (), {"email": "u@example.com"})()

    monkeypatch.setattr(
        threads_router.thread_service,
        "get_thread",
        lambda thread_id, supabase: {
            "id": thread_id,
            "title": "Revenue Thread",
            "organization_id": "org-1",
        },
    )
    monkeypatch.setattr(
        threads_router.thread_service,
        "get_messages",
        lambda thread_id, supabase: [{"role": "user", "content": "Need deeper help"}],
    )
    monkeypatch.setattr(
        threads_router.support_service,
        "get_open_chat_escalation",
        lambda **kwargs: None,
    )

    captured = {}

    def _create_message(**kwargs):
        captured.update(kwargs)
        return {"id": "support-new"}

    monkeypatch.setattr(threads_router.support_service, "create_message", _create_message)

    with TestClient(app) as client:
        response = client.post("/threads/thread-1/escalate")
        assert response.status_code == 200
        assert response.json() == {"escalated": True, "support_message_id": "support-new"}
        assert captured["source"] == "chat_escalation"
        assert captured["thread_id"] == "thread-1"
        assert "Thread ID: thread-1" in captured["message"]

    app.dependency_overrides.clear()
