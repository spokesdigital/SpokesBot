from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

from app.agent.graph import (
    STRUCTURED_INSIGHTS_SYSTEM_PROMPT,
    STRUCTURED_INSIGHTS_USER_PROMPT,
    generate_structured_insights,
)
from app.dependencies import (
    get_current_org_id,
    get_current_role,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
)
from app.main import app

STRUCTURED_RESPONSE = """
[
  {"type": "success", "text": "Revenue reached $124,500 with ROAS holding at 4.2x."},
  {"type": "trend", "text": "Clicks climbed 18% week over week while CPC stayed flat at $1.24."},
  {"type": "success", "text": "Conversion rate is holding steady at 3.2% across all campaigns."},
  {"type": "trend", "text": "Top channel accounts for 62% of total impressions this period."}
]
""".strip()

ORG_ID = "00000000-0000-0000-0000-000000000099"


def _make_agent_result(draft: str = STRUCTURED_RESPONSE) -> dict:
    return {
        "messages": [
            SystemMessage(content=STRUCTURED_INSIGHTS_SYSTEM_PROMPT),
            HumanMessage(content=STRUCTURED_INSIGHTS_USER_PROMPT),
            AIMessage(content=draft),
        ]
    }


def _setup_admin_overrides(mock_supabase):
    app.dependency_overrides[get_supabase_client] = lambda: mock_supabase
    app.dependency_overrides[get_service_client] = lambda: mock_supabase
    app.dependency_overrides[get_current_user_id] = lambda: "admin-id"
    app.dependency_overrides[get_current_role] = lambda: "admin"
    app.dependency_overrides[get_current_org_id] = lambda: ORG_ID


class TestGenerateStructuredInsights:
    async def _run(self):
        df = pd.DataFrame({"revenue": [100, 200, 300]})
        mock_agent = AsyncMock()
        mock_agent.ainvoke = AsyncMock(return_value=_make_agent_result())

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            return await generate_structured_insights(df)

    @patch("app.agent.graph._INSIGHT_TIMEOUT", 1.0)
    def test_returns_normalized_structured_items(self):
        import asyncio

        result = asyncio.run(self._run())

        assert len(result) == 4
        assert result[0]["type"] == "success"
        assert "Revenue reached $124,500" in result[0]["text"]


class TestOverallInsightsEndpoint:
    def test_returns_dataset_insights(self, mock_supabase):
        _setup_admin_overrides(mock_supabase)

        dataset = {
            "id": "dataset-1",
            "organization_id": ORG_ID,
            "status": "completed",
            "storage_path": "datasets/test.parquet",
        }

        dataset_query = MagicMock()
        dataset_query.select.return_value = dataset_query
        dataset_query.eq.return_value = dataset_query
        dataset_query.maybe_single.return_value = dataset_query
        dataset_query.execute.return_value = MagicMock(data=dataset)
        mock_supabase.table.return_value = dataset_query

        client = TestClient(app)

        with (
            patch("app.routers.analytics.dataset_service.load_dataframe", return_value=pd.DataFrame({"revenue": [1, 2, 3]})),
            patch(
                "app.routers.analytics.generate_structured_insights",
                AsyncMock(
                    return_value=[
                        {"type": "success", "text": "Revenue reached $124,500 with ROAS holding at 4.2x."},
                        {"type": "trend", "text": "Clicks climbed 18% week over week while CPC stayed flat at $1.24."},
                        {"type": "success", "text": "Conversion rate is holding steady at 3.2% across all campaigns."},
                        {"type": "trend", "text": "Top channel accounts for 62% of total impressions this period."},
                    ]
                ),
            ),
        ):
            response = client.post(
                "/analytics/insights",
                params={"org_id": ORG_ID},
                json={"dataset_id": "00000000-0000-0000-0000-000000000001"},
            )

        assert response.status_code == 200
        body = response.json()
        assert len(body["insights"]) == 4
        assert body["insights"][0]["type"] == "success"
