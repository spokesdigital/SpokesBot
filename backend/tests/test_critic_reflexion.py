"""
tests/test_critic_reflexion.py

Validates the Reflexion (Critic) loop in the LangGraph agent.

Tests are structured in three layers:
  1. Unit  — routing logic and node functions in isolation (no LLM, no network)
  2. Graph — full StateGraph traversal with mocked LLM and react agent
  3. Timeout — verifies the graph raises asyncio.TimeoutError on a hang
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pandas as pd
import pytest
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langgraph.graph import END

from app.agent.graph import (
    MAX_RETRIES,
    AgentState,
    make_graph,
    route_after_critic,
    run_critic_node,
    run_inject_feedback_node,
    stream_agent,
)

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

TOOL_PAYLOAD = json.dumps(
    {"mean": {"revenue": 233.33}, "count": 3, "sum": {"revenue": 700.0}},
    indent=2,
)


def _make_fake_agent_result(draft: str = "The average revenue is 233.33.") -> dict:
    """Simulate what create_react_agent.ainvoke returns."""
    return {
        "messages": [
            SystemMessage(content="system"),
            HumanMessage(content="What is the average revenue?"),
            AIMessage(
                content="",
                tool_calls=[
                    {"name": "run_analysis", "args": {}, "id": "tc-1", "type": "tool_call"}
                ],
            ),
            ToolMessage(content=TOOL_PAYLOAD, tool_call_id="tc-1"),
            AIMessage(content=draft),
        ]
    }


def _base_state(**overrides) -> AgentState:
    base: AgentState = {
        "messages": [HumanMessage(content="What is average revenue?")],
        "tool_outputs": [],
        "draft_answer": "",
        "validation_feedback": "",
        "retry_count": 0,
    }
    return {**base, **overrides}


# ─────────────────────────────────────────────────────────────────────────────
# 1. Unit tests — routing function
# ─────────────────────────────────────────────────────────────────────────────


class TestRouting:
    """route_after_critic must map states to correct destinations."""

    def test_yes_routes_to_end(self):
        state = _base_state(validation_feedback="YES", retry_count=0)
        assert route_after_critic(state) == END

    def test_yes_case_insensitive(self):
        for verdict in ("yes", "Yes", "YES", "yes — data looks correct"):
            state = _base_state(validation_feedback=verdict)
            assert route_after_critic(state) == END

    def test_no_routes_to_inject_feedback(self):
        state = _base_state(validation_feedback="NO: 233.33 ≠ 200.", retry_count=0)
        assert route_after_critic(state) == "inject_feedback"

    def test_max_retries_forces_end_even_on_no(self):
        """When retries are exhausted, route to END regardless of verdict."""
        state = _base_state(
            validation_feedback="NO: still wrong",
            retry_count=MAX_RETRIES,
        )
        assert route_after_critic(state) == END

    def test_max_retries_boundary(self):
        """retry_count == MAX_RETRIES - 1 should still allow one more retry."""
        state = _base_state(
            validation_feedback="NO: wrong",
            retry_count=MAX_RETRIES - 1,
        )
        assert route_after_critic(state) == "inject_feedback"

    def test_max_retries_constant_is_2(self):
        assert MAX_RETRIES == 2


# ─────────────────────────────────────────────────────────────────────────────
# 2. Unit tests — critic node
# ─────────────────────────────────────────────────────────────────────────────


class TestCriticNode:
    """run_critic_node calls the LLM with the right context."""

    def test_yes_verdict_stored(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="YES")

        state = _base_state(
            tool_outputs=[TOOL_PAYLOAD],
            draft_answer="The average revenue is 233.33.",
        )
        result = run_critic_node(state, mock_llm)

        assert result["validation_feedback"] == "YES"
        mock_llm.invoke.assert_called_once()

    def test_no_verdict_stored(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="NO: 233.33 ≠ 200")

        state = _base_state(
            tool_outputs=[TOOL_PAYLOAD],
            draft_answer="The average revenue is 200.",
        )
        result = run_critic_node(state, mock_llm)

        assert result["validation_feedback"].startswith("NO:")

    def test_critic_prompt_contains_tool_data(self):
        """The LLM must see the raw tool output in its messages."""
        captured: list = []

        def capture_invoke(messages):
            captured.extend(messages)
            return AIMessage(content="YES")

        mock_llm = MagicMock()
        mock_llm.invoke = capture_invoke

        state = _base_state(tool_outputs=["UNIQUE_TOOL_STRING_XYZ"])
        run_critic_node(state, mock_llm)

        full_prompt = " ".join(m.content for m in captured)
        assert "UNIQUE_TOOL_STRING_XYZ" in full_prompt

    def test_critic_prompt_contains_draft(self):
        captured: list = []

        def capture_invoke(messages):
            captured.extend(messages)
            return AIMessage(content="YES")

        mock_llm = MagicMock()
        mock_llm.invoke = capture_invoke

        state = _base_state(draft_answer="UNIQUE_DRAFT_PHRASE_ABC")
        run_critic_node(state, mock_llm)

        full_prompt = " ".join(m.content for m in captured)
        assert "UNIQUE_DRAFT_PHRASE_ABC" in full_prompt

    def test_no_tool_data_does_not_crash(self):
        mock_llm = MagicMock()
        mock_llm.invoke.return_value = AIMessage(content="YES")

        state = _base_state(tool_outputs=[])  # empty — agent answered without tools
        result = run_critic_node(state, mock_llm)
        assert "validation_feedback" in result


# ─────────────────────────────────────────────────────────────────────────────
# 3. Unit tests — inject_feedback node
# ─────────────────────────────────────────────────────────────────────────────


class TestInjectFeedbackNode:
    """run_inject_feedback_node must prepare state for the next agent round."""

    def test_retry_count_incremented(self):
        state = _base_state(retry_count=0, validation_feedback="NO: wrong")
        result = run_inject_feedback_node(state)
        assert result["retry_count"] == 1

    def test_tool_outputs_reset(self):
        state = _base_state(tool_outputs=[TOOL_PAYLOAD], validation_feedback="NO: x")
        result = run_inject_feedback_node(state)
        assert result["tool_outputs"] == []

    def test_correction_message_appended(self):
        original_msg = HumanMessage(content="original question")
        state = _base_state(
            messages=[original_msg],
            validation_feedback="NO: the number is wrong",
        )
        result = run_inject_feedback_node(state)

        # Must have more messages than before
        assert len(result["messages"]) > 1
        # Last message is the correction
        last = result["messages"][-1]
        assert isinstance(last, HumanMessage)
        assert "SELF-CORRECTION" in last.content
        assert "the number is wrong" in last.content


# ─────────────────────────────────────────────────────────────────────────────
# 4. Graph integration tests — full traversal with mocked LLM
# ─────────────────────────────────────────────────────────────────────────────


class TestGraphTraversal:
    """Full StateGraph traversal tests with mocked react agent and critic LLM."""

    def _build_mocked_graph(self, df, critic_responses: list[str]):
        """
        Patch create_react_agent and _get_llm, then build the graph.

        critic_responses: list of strings the critic LLM will return in order.
        Returns (graph, mock_agent, critic_llm).
        """
        mock_agent = AsyncMock()
        mock_agent.ainvoke = AsyncMock(return_value=_make_fake_agent_result())

        critic_call_idx = 0

        def critic_invoke(messages):
            nonlocal critic_call_idx
            verdict = critic_responses[min(critic_call_idx, len(critic_responses) - 1)]
            critic_call_idx += 1
            return AIMessage(content=verdict)

        critic_llm = MagicMock()
        critic_llm.invoke = critic_invoke

        # We patch two things:
        #  • create_react_agent — so the agent node uses our mock_agent
        #  • _get_llm           — so the critic node uses critic_llm
        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            graph = make_graph(df)

        return graph, mock_agent, critic_llm, lambda: critic_call_idx

    @pytest.mark.asyncio
    async def test_critic_node_is_traversed_on_yes(self):
        """
        Core requirement: when critic says YES, validation_feedback is set.
        Proof that the critic node ran.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})

        mock_agent = AsyncMock()
        mock_agent.ainvoke = AsyncMock(return_value=_make_fake_agent_result())

        critic_invoked = False

        def critic_invoke(messages):
            nonlocal critic_invoked
            critic_invoked = True
            return AIMessage(content="YES")

        critic_llm = MagicMock()
        critic_llm.invoke = critic_invoke

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            graph = make_graph(df)

        initial = _base_state(messages=[HumanMessage(content="What is the average revenue?")])
        result = await graph.ainvoke(initial)

        # ── Assertions ─────────────────────────────────────────────────────
        # The critic node ran
        assert critic_invoked, "Critic node was never invoked"

        # validation_feedback is populated
        assert result["validation_feedback"] != ""
        assert result["validation_feedback"].upper().startswith("YES")

        # No retries needed
        assert result["retry_count"] == 0

        # Agent produced a draft
        assert result["draft_answer"] != ""

        # Tool outputs collected
        assert len(result["tool_outputs"]) > 0

    @pytest.mark.asyncio
    async def test_graph_retries_once_on_no_then_yes(self):
        """
        Core Reflexion path: critic rejects once, agent retries, critic approves.
        Verifies retry_count = 1 and critic called twice.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})

        call_count = 0

        def critic_invoke(messages):
            nonlocal call_count
            call_count += 1
            # First call: reject; second call: approve
            if call_count == 1:
                return AIMessage(content="NO: the average stated is incorrect")
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
            graph = make_graph(df)

        initial = _base_state(messages=[HumanMessage(content="What is the average revenue?")])
        result = await graph.ainvoke(initial)

        assert call_count == 2, f"Expected 2 critic calls, got {call_count}"
        assert result["retry_count"] == 1
        assert result["validation_feedback"].upper().startswith("YES")

        # Agent was called twice (original + 1 retry)
        assert mock_agent.ainvoke.call_count == 2

    @pytest.mark.asyncio
    async def test_max_retries_enforced(self):
        """
        When critic says NO every time, the graph must stop after MAX_RETRIES
        corrections and NOT loop forever.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})

        critic_call_count = 0

        def critic_invoke(_messages):
            nonlocal critic_call_count
            critic_call_count += 1
            return AIMessage(content=f"NO: still wrong (call {critic_call_count})")

        mock_agent = AsyncMock()
        mock_agent.ainvoke = AsyncMock(return_value=_make_fake_agent_result())

        critic_llm = MagicMock()
        critic_llm.invoke = critic_invoke

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            graph = make_graph(df)

        initial = _base_state(messages=[HumanMessage(content="What is the average revenue?")])

        # Must complete within 10s (not hang)
        result = await asyncio.wait_for(graph.ainvoke(initial), timeout=10.0)

        # Critic called exactly MAX_RETRIES + 1 times (once per agent run)
        # Agent runs: original + MAX_RETRIES corrections = MAX_RETRIES + 1
        expected_critic_calls = MAX_RETRIES + 1
        assert critic_call_count == expected_critic_calls, (
            f"Expected {expected_critic_calls} critic calls, got {critic_call_count}"
        )
        assert result["retry_count"] == MAX_RETRIES
        # Last feedback is still a NO (graph was forced to stop)
        assert result["validation_feedback"].upper().startswith("NO")

    @pytest.mark.asyncio
    async def test_tool_outputs_collected_by_critic(self):
        """
        Critic must receive the ToolMessage payloads from the agent's tool calls.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})

        critic_received_data: list[str] = []

        def critic_invoke(messages):
            for m in messages:
                critic_received_data.append(m.content)
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
            graph = make_graph(df)

        await graph.ainvoke(
            _base_state(messages=[HumanMessage(content="What is average revenue?")])
        )

        full_prompt = " ".join(critic_received_data)
        # The fake agent result embeds TOOL_PAYLOAD in the ToolMessage
        assert "revenue" in full_prompt, "Critic did not receive tool data"

    @pytest.mark.asyncio
    async def test_correction_message_reaches_agent_on_retry(self):
        """
        When critic says NO, the correction HumanMessage must appear in the
        messages list that the agent receives on its second invocation.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})

        agent_messages_per_call: list[list] = []

        async def mock_ainvoke(state_dict):
            agent_messages_per_call.append(list(state_dict["messages"]))
            return _make_fake_agent_result()

        mock_agent = AsyncMock()
        mock_agent.ainvoke = mock_ainvoke

        critic_call = 0

        def critic_invoke(_messages):
            nonlocal critic_call
            critic_call += 1
            return AIMessage(content="NO: wrong" if critic_call == 1 else "YES")

        critic_llm = MagicMock()
        critic_llm.invoke = critic_invoke

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            graph = make_graph(df)

        await graph.ainvoke(
            _base_state(messages=[HumanMessage(content="What is average revenue?")])
        )

        assert len(agent_messages_per_call) == 2, "Expected 2 agent invocations"
        second_call_messages = agent_messages_per_call[1]
        correction_texts = [
            m.content
            for m in second_call_messages
            if isinstance(m, HumanMessage) and "SELF-CORRECTION" in m.content
        ]
        assert len(correction_texts) == 1, "Correction message not found in retry call"


# ─────────────────────────────────────────────────────────────────────────────
# 5. stream_agent() integration
# ─────────────────────────────────────────────────────────────────────────────


class TestStreamAgent:
    """stream_agent() yields validated answer chunks after graph completion."""

    @pytest.mark.asyncio
    async def test_stream_agent_yields_validated_answer(self):
        """
        stream_agent must yield the final draft_answer in chunks.
        """
        df = pd.DataFrame({"revenue": [100, 200, 400]})
        expected_answer = "The average revenue is 233.33."

        async def fake_astream_events(*args, **kwargs):
            for char in expected_answer:
                yield {
                    "event": "on_chat_model_stream",
                    "data": {"chunk": AIMessage(content=char)}
                }

        mock_agent = AsyncMock()
        mock_agent.astream_events = fake_astream_events

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            chunks = []
            async for chunk in stream_agent(df, [], "What is average revenue?"):
                chunks.append(chunk)

        assembled = "".join(chunks)
        assert assembled == expected_answer, f"Expected '{expected_answer}', got '{assembled}'"
        assert len(chunks) > 1, "Expected multiple chunks (streaming behaviour)"

    @pytest.mark.asyncio
    async def test_stream_agent_standard_path_handles_period_query(self):
        """
        Verify that period queries (which used to be on a fast-path) now flow
        through the standard LLM-validated graph.
        """
        df = pd.DataFrame(
            {
                "Date": pd.date_range(end=pd.Timestamp.now(tz="UTC"), periods=7, freq="D"),
                "Sales": [100, 120, 140, 160, 180, 200, 220],
            }
        )
        expected_answer = "Your sales for the last week were $1,080."

        async def fake_astream_events(*args, **kwargs):
            for char in expected_answer:
                yield {
                    "event": "on_chat_model_stream",
                    "data": {"chunk": AIMessage(content=char)}
                }

        mock_agent = AsyncMock()
        mock_agent.astream_events = fake_astream_events

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
        ):
            chunks = []
            async for chunk in stream_agent(df, [], "what is the last week's sale"):
                chunks.append(chunk)

        assembled = "".join(chunks)
        assert assembled == expected_answer

    @pytest.mark.asyncio
    async def test_stream_agent_timeout_raises(self):
        """
        If the graph hangs, stream_agent must raise asyncio.TimeoutError
        and NOT block indefinitely.
        """
        df = pd.DataFrame({"revenue": [100]})

        async def hanging_astream_events(*args, **kwargs):
            await asyncio.sleep(9999)  # simulate hang
            yield {
                "event": "on_chat_model_stream",
                "data": {"chunk": AIMessage(content="hi")}
            }

        mock_agent = AsyncMock()
        mock_agent.astream_events = hanging_astream_events

        critic_llm = MagicMock()
        critic_llm.invoke.return_value = AIMessage(content="YES")

        with (
            patch("app.agent.graph.create_react_agent", return_value=mock_agent),
            patch("app.agent.graph._get_llm", return_value=MagicMock()),
            patch("app.agent.graph._get_critic_llm", return_value=critic_llm),
            patch("app.agent.graph._GRAPH_TIMEOUT", 1.0),
        ):
            with pytest.raises((asyncio.TimeoutError, TimeoutError)):
                async for _ in stream_agent(df, [], "test"):
                    pass
