"""
tests/test_proactive_insight.py

Tests for the proactive-insight endpoint and the generate_insight() graph helper.

Layers:
  1. Unit  — generate_insight() helper in isolation (mocked LLM, no network)
  2. HTTP  — /threads/{id}/proactive-insight endpoint via FastAPI TestClient
"""
from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage

from app.agent.graph import (
    INSIGHT_SYSTEM_PROMPT,
    INSIGHT_USER_PROMPT,
    generate_insight,
)
from app.dependencies import (
    get_current_org_id,
    get_current_role,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
)
from app.main import app

# ─────────────────────────────────────────────────────────────────────────────
# Shared fixtures / helpers
# ─────────────────────────────────────────────────────────────────────────────

TOOL_PAYLOAD = json.dumps({"mean": {"revenue": 233.33}, "count": 3}, indent=2)


def _make_fake_agent_result(draft: str = "Total revenue is $700, averaging $233 per record.") -> dict:
    return {
        "messages": [
            SystemMessage(content=INSIGHT_SYSTEM_PROMPT),
            HumanMessage(content=INSIGHT_USER_PROMPT),
            AIMessage(
                content="",
                tool_calls=[{"name": "run_analysis", "args": {}, "id": "tc-1", "type": "tool_call"}],
            ),
            ToolMessage(content=TOOL_PAYLOAD, tool_call_id="tc-1"),
            AIMessage(content=draft),
        ]
    }


def _make_mock_supabase():
    mock = MagicMock()
    mock.postgrest = MagicMock()
    mock.postgrest.auth = MagicMock()
    mock.auth = MagicMock()
    mock.rpc = MagicMock()
    mock.table = MagicMock()
    mock.storage = MagicMock()
    return mock


@pytest.fixture(autouse=True)
def cleanup_overrides():
    yield
    app.dependency_overrides.clear()


# ─────────────────────────────────────────────────────────────────────────────
# 1. Unit tests — generate_insight()
# ─────────────────────────────────────────────────────────────────────────────


class TestGenerateInsight:
    """generate_insight() must use the Reflexion graph and return validated text."""

    @pytest.mark.asyncio
    async def test_returns_validated_answer(self):
        """
        Core test: generate_insight() invokes the graph and returns draft_answer.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})
        expected = "Total revenue is $700, averaging $233 per record."

        mock_agent = AsyncMock()
        mock_agent.ainvoke = AsyncMock(return_value=_make_fake_agent_result(draft=expected))

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            result = await generate_insight(df)

        assert result == expected

    @pytest.mark.asyncio
    async def test_uses_insight_system_prompt(self):
        """
        The agent must receive the INSIGHT_SYSTEM_PROMPT (not the conversational
        SYSTEM_PROMPT) so the output is compact and declarative.
        """
        df = pd.DataFrame({"revenue": [100, 200]})

        agent_call_messages: list = []

        async def capture_ainvoke(state_dict):
            agent_call_messages.extend(state_dict["messages"])
            return _make_fake_agent_result()

        mock_agent = AsyncMock()
        mock_agent.ainvoke = capture_ainvoke

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            await generate_insight(df)

        system_messages = [m for m in agent_call_messages if isinstance(m, SystemMessage)]
        assert len(system_messages) >= 1
        assert INSIGHT_SYSTEM_PROMPT in system_messages[0].content

    @pytest.mark.asyncio
    async def test_uses_insight_user_prompt(self):
        """The initial HumanMessage must be the focused insight prompt."""
        df = pd.DataFrame({"revenue": [100, 200]})

        agent_call_messages: list = []

        async def capture_ainvoke(state_dict):
            agent_call_messages.extend(state_dict["messages"])
            return _make_fake_agent_result()

        mock_agent = AsyncMock()
        mock_agent.ainvoke = capture_ainvoke

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            await generate_insight(df)

        human_messages = [m for m in agent_call_messages if isinstance(m, HumanMessage)]
        assert any(INSIGHT_USER_PROMPT in m.content for m in human_messages)

    @pytest.mark.asyncio
    async def test_critic_validates_insight(self):
        """Critic must run — validation_feedback should be set to YES."""
        df = pd.DataFrame({"revenue": [100, 200, 400]})

        critic_called = False

        def critic_invoke(_messages):
            nonlocal critic_called
            critic_called = True
            return AIMessage(content="YES")

        mock_agent = AsyncMock()
        mock_agent.ainvoke = AsyncMock(return_value=_make_fake_agent_result())

        critic_llm = MagicMock()
        critic_llm.invoke = critic_invoke

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            await generate_insight(df)

        assert critic_called, "Critic node was never invoked for the insight"

    @pytest.mark.asyncio
    async def test_timeout_raises(self):
        """generate_insight must raise asyncio.TimeoutError when agent hangs."""
        df = pd.DataFrame({"revenue": [100]})

        async def hanging_ainvoke(_state_dict):
            await asyncio.sleep(9999)

        mock_agent = AsyncMock()
        mock_agent.ainvoke = hanging_ainvoke

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            with pytest.raises(asyncio.TimeoutError):
                await generate_insight(df, timeout=0.5)


# ─────────────────────────────────────────────────────────────────────────────
# 2. HTTP endpoint tests — POST /threads/{id}/proactive-insight
# ─────────────────────────────────────────────────────────────────────────────


class TestProactiveInsightEndpoint:
    """HTTP-level tests for POST /threads/{id}/proactive-insight."""

    def _setup_user_deps(self, mock_supabase):
        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "user-id"
        app.dependency_overrides[get_current_role] = lambda: "user"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

    def _setup_admin_deps(self, mock_supabase):
        app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
        app.dependency_overrides[get_service_client] = lambda: mock_supabase
        app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
        app.dependency_overrides[get_current_role] = lambda: "admin"
        app.dependency_overrides[get_current_org_id] = lambda: "org-id"

    def _mock_table(self, mock_supabase, thread_data: dict | None, dataset_data: dict | None):
        """Wire table().select().eq().maybe_single().execute() for thread and dataset."""
        def table_side_effect(table_name: str):
            chain = MagicMock()
            if table_name == "threads":
                chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = thread_data
            elif table_name == "datasets":
                chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = dataset_data
            elif table_name == "messages":
                # save_message insert path
                chain.insert.return_value.execute.return_value.data = [
                    {"id": "msg-uuid", "thread_id": "thread-uuid", "role": "assistant", "content": "insight", "created_at": "2024-01-01T00:00:00"}
                ]
            return chain

        mock_supabase.table.side_effect = table_side_effect

    def test_returns_404_when_thread_not_found(self):
        mock_supabase = _make_mock_supabase()
        self._mock_table(mock_supabase, thread_data=None, dataset_data=None)
        self._setup_user_deps(mock_supabase)

        # For user role, thread access goes via thread_service.get_thread
        # which calls maybe_single().execute() and raises 404 if no data
        mock_supabase.table.return_value.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = None

        with TestClient(app) as client:
            response = client.post(
                "/threads/nonexistent-thread/proactive-insight",
            )
        assert response.status_code == 404

    def test_returns_409_when_dataset_not_completed(self):
        mock_supabase = _make_mock_supabase()
        thread = {
            "id": "thread-uuid",
            "dataset_id": "dataset-uuid",
            "organization_id": "org-id",
            "user_id": "user-id",
        }
        dataset = {
            "id": "dataset-uuid",
            "organization_id": "org-id",
            "status": "processing",
            "storage_path": "some/path.parquet",
        }
        self._mock_table(mock_supabase, thread_data=thread, dataset_data=dataset)
        self._setup_admin_deps(mock_supabase)

        with TestClient(app) as client:
            response = client.post("/threads/thread-uuid/proactive-insight")

        assert response.status_code == 409
        assert "not ready" in response.json()["detail"].lower()

    def test_returns_408_on_insight_timeout(self):
        """When generate_insight times out, the endpoint must return 408."""
        mock_supabase = _make_mock_supabase()
        thread = {
            "id": "thread-uuid",
            "dataset_id": "dataset-uuid",
            "organization_id": "org-id",
            "user_id": "user-id",
        }
        dataset = {
            "id": "dataset-uuid",
            "organization_id": "org-id",
            "status": "completed",
            "storage_path": "some/path.parquet",
        }
        self._mock_table(mock_supabase, thread_data=thread, dataset_data=dataset)
        self._setup_admin_deps(mock_supabase)

        async def hang(_df, timeout=14.0):  # noqa: ARG001
            await asyncio.sleep(9999)

        with (
            patch("app.routers.threads.dataset_service.load_dataframe", return_value=pd.DataFrame({"x": [1]})),
            patch("app.routers.threads.generate_insight", side_effect=asyncio.TimeoutError),
        ):
            with TestClient(app) as client:
                response = client.post("/threads/thread-uuid/proactive-insight")

        assert response.status_code == 408
        assert "timed out" in response.json()["detail"].lower()

    def test_happy_path_returns_insight(self):
        """
        Full happy path:
          • thread found, dataset completed
          • generate_insight returns validated text
          • message persisted
          • response has thread_id, message_id, insight
        """
        EXPECTED_INSIGHT = "Total revenue across all campaigns is $700, with the top channel at 43%."

        THREAD_ID = "00000000-0000-0000-0000-000000000010"
        DATASET_ID = "00000000-0000-0000-0000-000000000020"
        MSG_ID = "00000000-0000-0000-0000-000000000001"

        mock_supabase = _make_mock_supabase()
        thread = {
            "id": THREAD_ID,
            "dataset_id": DATASET_ID,
            "organization_id": "org-id",
            "user_id": "user-id",
        }
        dataset = {
            "id": DATASET_ID,
            "organization_id": "org-id",
            "status": "completed",
            "storage_path": "some/path.parquet",
        }
        self._mock_table(mock_supabase, thread_data=thread, dataset_data=dataset)

        # save_message should return a valid message dict
        mock_supabase.table.side_effect = None
        def multi_table(table_name):
            chain = MagicMock()
            if table_name == "threads":
                chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = thread
            elif table_name == "datasets":
                chain.select.return_value.eq.return_value.maybe_single.return_value.execute.return_value.data = dataset
            elif table_name == "messages":
                chain.insert.return_value.execute.return_value.data = [{
                    "id": MSG_ID,
                    "thread_id": THREAD_ID,
                    "role": "assistant",
                    "content": EXPECTED_INSIGHT,
                    "created_at": "2024-01-01T00:00:00",
                }]
            return chain
        mock_supabase.table.side_effect = multi_table

        self._setup_admin_deps(mock_supabase)

        with (
            patch(
                "app.routers.threads.dataset_service.load_dataframe",
                return_value=pd.DataFrame({"revenue": [100, 200, 400]}),
            ),
            patch(
                "app.routers.threads.generate_insight",
                new=AsyncMock(return_value=EXPECTED_INSIGHT),
            ),
        ):
            with TestClient(app) as client:
                response = client.post(f"/threads/{THREAD_ID}/proactive-insight")

        assert response.status_code == 201
        body = response.json()
        assert body["insight"] == EXPECTED_INSIGHT
        assert "thread_id" in body
        assert "message_id" in body

    def test_unauthenticated_request_is_rejected(self):
        """No auth token → 403 from the HTTPBearer dependency."""
        with TestClient(app) as client:
            response = client.post("/threads/some-thread/proactive-insight")
        assert response.status_code in (401, 403)
