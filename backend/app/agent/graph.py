"""
backend/app/agent/graph.py

Reflexion-pattern LangGraph agent:

  START → agent_node → critic_node → [END | inject_feedback_node → agent_node]

The Critic validates every number in the draft answer against the raw tool
output before anything reaches the user.  If the numbers don't match, the
agent is asked to recalculate.  A hard MAX_RETRIES cap prevents infinite loops.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import TypedDict

import pandas as pd
from langchain_core.messages import (
    AIMessage,
    BaseMessage,
    HumanMessage,
    SystemMessage,
    ToolMessage,
)
from langchain_openai import ChatOpenAI
from langgraph.graph import END, StateGraph
from langgraph.prebuilt import create_react_agent

from app.agent.tools import make_tools
from app.services.analytics_service import METRIC_PATTERNS, compute

# ── Constants ─────────────────────────────────────────────────────────────────

MAX_RETRIES: int = 2            # max critic-triggered corrections per request
_GRAPH_TIMEOUT: float = 120.0  # seconds before we give up on the whole graph
_STREAM_CHUNK: int = 6         # characters per yield when streaming final answer

# ── Answer post-processor ────────────────────────────────────────────────────

def _finalize_answer(text: str) -> str:
    """
    Preserve markdown-rich answers while trimming only excess whitespace.
    """
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _normalize_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.lower())


def _extract_compare_targets(question: str) -> list[str]:
    lowered = question.lower()

    # Common delivery/store comparison phrasing used throughout the product.
    if "in-store" in lowered and "delivery" in lowered:
        return ["In-Store", "Delivery"]

    match = re.search(
        r"compare\s+(.+?)\s+vs\.?\s+(.+?)(?:\s+(?:sales|revenue|cost|orders|spend|and|with|show|for)\b|[?.!,]|$)",
        lowered,
    )
    if not match:
        return []

    return [part.strip(" '\"") for part in match.groups() if part.strip()]


def _score_metric_column(metric_column: str, question: str) -> int:
    lowered_question = question.lower()
    lowered_column = metric_column.lower()
    score = 0

    for metric_name, patterns in METRIC_PATTERNS.items():
        if any(pattern in lowered_question for pattern in patterns):
            score += 4 if any(pattern in lowered_column for pattern in patterns) else 0
            if metric_name == "revenue" and any(term in lowered_question for term in ("sales", "sell-through")):
                score += 2 if any(pattern in lowered_column for pattern in METRIC_PATTERNS["revenue"]) else 0

    if score == 0 and any(term in lowered_question for term in ("sales", "revenue", "gmv")):
        score += 1 if any(pattern in lowered_column for pattern in METRIC_PATTERNS["revenue"]) else 0

    return score


def _format_metric_value(metric_column: str, value: float) -> str:
    lowered_column = metric_column.lower()
    if any(pattern in lowered_column for pattern in METRIC_PATTERNS["revenue"]) or any(
        pattern in lowered_column for pattern in METRIC_PATTERNS["cost"]
    ):
        return f"${value:,.2f}"

    if float(value).is_integer():
        return f"{int(value):,}"

    return f"{value:,.2f}"


def _try_build_comparison_response(df: pd.DataFrame, question: str) -> str | None:
    lowered_question = question.lower()
    if not any(term in lowered_question for term in ("compare", "vs", "versus")):
        return None
    if not any(term in lowered_question for term in ("table", "chart", "graph", "trend", "show me")):
        return None

    targets = _extract_compare_targets(question)
    if len(targets) < 2:
        return None

    analysis = compute(df, operation="auto")
    metric_breakdowns = analysis.get("metric_breakdowns", {})
    if not isinstance(metric_breakdowns, dict):
        return None

    target_keys = [_normalize_key(target) for target in targets]
    best_match: tuple[int, int, str, list[tuple[str, float]]] | None = None

    for metric_column, dimension_breakdowns in metric_breakdowns.items():
        if not isinstance(metric_column, str) or not isinstance(dimension_breakdowns, dict):
            continue

        metric_score = _score_metric_column(metric_column, question)

        for dimension, raw_breakdown in dimension_breakdowns.items():
            if not isinstance(raw_breakdown, dict):
                continue

            labels = list(raw_breakdown.keys())
            matched_rows: list[tuple[str, float]] = []
            for target_key in target_keys:
                matched_label = next(
                    (label for label in labels if _normalize_key(str(label)) == target_key),
                    None,
                ) or next(
                    (label for label in labels if target_key in _normalize_key(str(label))),
                    None,
                )
                if matched_label is None:
                    matched_rows = []
                    break
                try:
                    matched_rows.append((str(matched_label), float(raw_breakdown[matched_label])))
                except (TypeError, ValueError):
                    matched_rows = []
                    break

            if len(matched_rows) != len(targets):
                continue

            dimension_score = 1 if any(
                hint in str(dimension).lower()
                for hint in ("channel", "fulfillment", "delivery", "type", "store")
            ) else 0
            candidate = (metric_score, dimension_score, metric_column, matched_rows)

            if best_match is None or candidate[:2] > best_match[:2]:
                best_match = candidate

    if best_match is None:
        return None

    metric_column = best_match[2]
    rows = best_match[3]
    metric_label = metric_column.replace("_", " ").title()
    leader_label, leader_value = max(rows, key=lambda item: item[1])
    trailing_label, trailing_value = min(rows, key=lambda item: item[1])
    delta_value = leader_value - trailing_value
    delta_pct = (delta_value / trailing_value * 100) if trailing_value else None

    summary = (
        f"**{metric_label} Comparison**\n\n"
        f"{leader_label} leads {trailing_label} with {_format_metric_value(metric_column, leader_value)} "
        f"versus {_format_metric_value(metric_column, trailing_value)}."
    )
    if delta_pct is not None:
        summary += (
            f" That is a gap of {_format_metric_value(metric_column, delta_value)} "
            f"({delta_pct:.1f}%)."
        )

    table_lines = [
        f"| Channel | {metric_label} |",
        "| --- | ---: |",
        *[
            f"| {label} | {_format_metric_value(metric_column, value)} |"
            for label, value in rows
        ],
    ]
    chart_payload = {
        "type": "bar",
        "title": f"{metric_label} by Channel",
        "xKey": "label",
        "series": [
            {
                "key": "value",
                "label": metric_label,
                "color": "#f5b800",
            }
        ],
        "data": [
            {"label": label, "value": round(value, 2)}
            for label, value in rows
        ],
    }

    return (
        f"{summary}\n\n"
        + "\n".join(table_lines)
        + f"\n\n<chart>{json.dumps(chart_payload, separators=(',', ':'))}</chart>"
    )


# ── Prompts ───────────────────────────────────────────────────────────────────

SYSTEM_PROMPT = """\
You are SpokesBot, an expert data analyst assistant.
You have access to tools that let you inspect and analyse the user's uploaded dataset.

Guidelines:
- Always call get_dataset_schema first if you haven't already, to understand the data.
- Use run_analysis to compute statistics before drawing conclusions.
- Keep answers concise and useful by default, but use compact markdown when it improves clarity.
- You MAY use markdown tables, bullet lists, and bold text when the user asks for comparisons, structured output, or summaries.
- For comparison or trend questions, prefer using run_analysis(operation='auto') because it returns metric breakdowns and time-series data.
- If the user explicitly asks for a chart, graph, visual, comparison, or trend, append a single chart payload at the very end using this exact format:
  <chart>{"type":"bar"|"line","title":"Short title","xKey":"label","series":[{"key":"value","label":"Revenue","color":"#f5b800"}],"data":[{"label":"A","value":10}]}</chart>
- The <chart> payload must be valid JSON, must match the numbers you mention in the answer, and must appear only once at the end of the response.
- When a chart is not needed or you do not have enough structured data, do not emit a <chart> tag.
- When showing numbers, format them appropriately (e.g. currency, percentages) and ground every claim in data.
- Never fabricate data — only report what the tools return.
"""

# ── Insight-specific prompts (used by generate_insight only) ──────────────────

INSIGHT_SYSTEM_PROMPT = """\
You are SpokesBot, a sharp data analyst generating a PROACTIVE insight.

Your process:
1. Call get_dataset_schema to understand column names and data types.
2. Call run_analysis with operation='describe' to get statistical summaries.
3. Identify the single most noteworthy finding — the dominant metric, a top
   performer, a notable spread, or the strongest signal in the data.
4. Write exactly 1-2 sentences stating that finding with at least one specific number.

Strict constraints:
• Do NOT ask questions or offer to do more analysis.
• Do NOT use hedging phrases like "It appears" or "I notice".
• State the finding directly and confidently.
• Keep the total response under 45 words.
• Include the dataset name or a column name to make it concrete.

Good example:
"Total revenue across all campaigns is $124,500, with 'Branded Search'
contributing 43% of spend at a 4.2× ROAS — the top-performing channel."
"""

INSIGHT_USER_PROMPT = (
    "Give me the single most important data insight from this dataset "
    "in 1-2 sentences with specific numbers."
)

STRUCTURED_INSIGHTS_SYSTEM_PROMPT = """\
You are SpokesBot, a sharp data analyst generating structured dashboard insights.

Your process:
1. Call get_dataset_schema first to understand the available fields.
2. Call run_analysis with operation='describe' to inspect key numeric metrics.
3. If useful, call get_sample_rows or additional analysis tools to confirm trends.
4. Return exactly 3 or 4 concise insights for an executive dashboard.

Strict output rules:
• Return ONLY a JSON array. No markdown, no commentary, no code fences.
• Each item must have this exact schema:
  { "type": "success" | "trend" | "warning" | "alert", "text": "..." }
• Every insight must be grounded in the dataset and mention at least one concrete number when possible.
• Use:
  - "success" for strong positive outcomes or efficient performance
  - "trend" for directional changes or notable momentum
  - "warning" for softer risks, gaps, or inefficiencies
  - "alert" for sharper issues or urgent underperformance
• Keep each text under 160 characters.
"""

STRUCTURED_INSIGHTS_USER_PROMPT = (
    "Generate 3 to 4 overall AI insights for this dashboard as a JSON array "
    "using the required schema."
)

CRITIC_SYSTEM_PROMPT = """\
You are a rigorous data validation critic for a data analytics AI.

You will be given:
  RAW TOOL DATA  — the exact JSON output from the analysis tools (ground truth).
  DRAFT ANSWER   — what the AI agent wrote for the user.

Your task: verify that every specific number, percentage, sum, average, count,
or statistical claim in the Draft Answer is mathematically consistent with
the Raw Tool Data.

Rules:
  • If a number in the draft cannot be traced to the tool data, say NO.
  • Reasonable rounding (e.g. 33.33% for one-third) is acceptable — say YES.
  • Only consider numbers/statistics explicitly stated in the draft.

Respond with EXACTLY one of:
  YES
  NO: <one concise sentence describing the first discrepancy found>
"""

# ── State ─────────────────────────────────────────────────────────────────────


class AgentState(TypedDict):
    messages: list[BaseMessage]   # full conversation (managed explicitly)
    tool_outputs: list[str]       # raw JSON strings from ToolMessages this round
    draft_answer: str             # agent's latest text response
    validation_feedback: str      # critic verdict: "YES" or "NO: …"
    retry_count: int              # critic-triggered retries so far


# ── LLM factory ───────────────────────────────────────────────────────────────


def _get_llm(*, streaming: bool = True) -> ChatOpenAI:
    """Return a ChatOpenAI instance.  Lazy-imported to keep tests fast."""
    from app.config import settings

    return ChatOpenAI(
        model="gpt-4o",
        openai_api_key=settings.OPENAI_API_KEY,
        streaming=streaming,
        temperature=0,
    )


# ── History builder ───────────────────────────────────────────────────────────


def build_history(messages: list[dict]) -> list[BaseMessage]:
    """Convert DB message records → LangChain message objects."""
    result: list[BaseMessage] = [SystemMessage(content=SYSTEM_PROMPT)]
    for msg in messages:
        if msg["role"] == "user":
            result.append(HumanMessage(content=msg["content"]))
        elif msg["role"] == "assistant":
            result.append(AIMessage(content=msg["content"]))
    return result


# ── Node functions (module-level for testability) ─────────────────────────────


async def run_agent_node(
    state: AgentState,
    react_agent,
) -> dict:
    """
    Run the ReAct sub-agent to completion.

    Extracts:
      • All ToolMessage contents   → appended to state["tool_outputs"]
      • The last AIMessage text    → stored as state["draft_answer"]

    Returns a partial state update dict.
    """
    result = await react_agent.ainvoke({"messages": state["messages"]})
    all_messages: list[BaseMessage] = result["messages"]

    # Collect raw tool outputs from this agent run
    tool_outputs = list(state.get("tool_outputs") or [])
    for msg in all_messages:
        if isinstance(msg, ToolMessage) and msg.content:
            tool_outputs.append(str(msg.content))

    # Last AIMessage with text content (no pending tool_calls) is the draft
    draft = ""
    for msg in reversed(all_messages):
        if (
            isinstance(msg, AIMessage)
            and msg.content
            and not getattr(msg, "tool_calls", None)
        ):
            draft = msg.content
            break

    return {
        "messages": all_messages,      # replace with full history from sub-agent
        "tool_outputs": tool_outputs,
        "draft_answer": draft,
    }


def run_critic_node(state: AgentState, llm: ChatOpenAI) -> dict:
    """
    Non-streaming LLM call that validates the draft answer against raw data.

    Sets validation_feedback to "YES" or "NO: <explanation>".
    """
    tool_data = (
        "\n---\n".join(state["tool_outputs"])
        if state["tool_outputs"]
        else "(no tool data — agent answered from schema/sample only)"
    )
    response = llm.invoke(
        [
            SystemMessage(content=CRITIC_SYSTEM_PROMPT),
            HumanMessage(
                content=(
                    f"RAW TOOL DATA:\n{tool_data}\n\n"
                    f"DRAFT ANSWER:\n{state['draft_answer']}"
                )
            ),
        ]
    )
    return {"validation_feedback": response.content.strip()}


def run_inject_feedback_node(state: AgentState) -> dict:
    """
    Append a correction HumanMessage and increment the retry counter.
    Resets tool_outputs so the next agent run collects a fresh set.
    """
    feedback = state.get("validation_feedback", "")
    correction = HumanMessage(
        content=(
            "[SELF-CORRECTION REQUIRED]\n"
            "A data-validation check found an issue with your previous answer:\n"
            f"{feedback}\n\n"
            "Please call the analysis tools again, recheck your calculations, "
            "and provide a corrected answer."
        )
    )
    return {
        "messages": state["messages"] + [correction],
        "retry_count": state.get("retry_count", 0) + 1,
        "tool_outputs": [],  # reset; agent_node will repopulate
    }


def route_after_critic(state: AgentState) -> str:
    """
    YES or retries exhausted → END.
    NO and retries remaining  → inject_feedback (which feeds back into agent).
    """
    if state.get("retry_count", 0) >= MAX_RETRIES:
        return END
    feedback = state.get("validation_feedback", "YES")
    return END if feedback.upper().startswith("YES") else "inject_feedback"


# ── Graph construction ────────────────────────────────────────────────────────


def make_graph(df: pd.DataFrame):
    """
    Build and compile the Reflexion graph for one request.

    Binds the DataFrame at construction time (one graph per chat turn).
    """
    tools = make_tools(df)
    react_agent = create_react_agent(_get_llm(streaming=True), tools)
    critic_llm = _get_llm(streaming=False)

    # Wrap module-level functions to inject the per-request dependencies
    async def agent_node(state: AgentState) -> dict:
        return await run_agent_node(state, react_agent)

    def critic_node(state: AgentState) -> dict:
        return run_critic_node(state, critic_llm)

    def inject_feedback_node(state: AgentState) -> dict:
        return run_inject_feedback_node(state)

    builder = StateGraph(AgentState)
    builder.add_node("agent", agent_node)
    builder.add_node("critic", critic_node)
    builder.add_node("inject_feedback", inject_feedback_node)

    builder.set_entry_point("agent")
    builder.add_edge("agent", "critic")
    builder.add_conditional_edges(
        "critic",
        route_after_critic,
        {END: END, "inject_feedback": "inject_feedback"},
    )
    builder.add_edge("inject_feedback", "agent")

    return builder.compile()


# ── Public streaming interface ────────────────────────────────────────────────


async def stream_agent(
    df: pd.DataFrame,
    history: list[dict],
    new_message: str,
):
    """
    Async generator that yields validated text tokens to the SSE router.

    Unlike a naive streaming approach, we run the full Reflexion graph to
    completion first (agent → critic [→ correction → agent]*) and only
    yield the critic-approved answer.  This guarantees the user never sees
    an unvalidated response.

    The final answer is yielded in small chunks to preserve the typewriter
    streaming UX at the HTTP layer.

    Raises asyncio.TimeoutError if the graph exceeds _GRAPH_TIMEOUT seconds.
    The caller (threads.py event_stream) handles this and surfaces an error SSE.
    """
    fast_answer = _try_build_comparison_response(df, new_message)
    if fast_answer:
        answer = _finalize_answer(fast_answer)
        for i in range(0, len(answer), _STREAM_CHUNK):
            yield answer[i : i + _STREAM_CHUNK]
        return

    graph = make_graph(df)
    messages = build_history(history)
    messages.append(HumanMessage(content=new_message))

    initial_state: AgentState = {
        "messages": messages,
        "tool_outputs": [],
        "draft_answer": "",
        "validation_feedback": "",
        "retry_count": 0,
    }

    final_state = await asyncio.wait_for(
        graph.ainvoke(initial_state),
        timeout=_GRAPH_TIMEOUT,
    )

    answer = final_state.get("draft_answer", "")
    if not answer:
        return

    answer = _finalize_answer(answer)

    # Stream the validated answer in small chunks → typewriter effect in the UI
    for i in range(0, len(answer), _STREAM_CHUNK):
        yield answer[i : i + _STREAM_CHUNK]


# ── Proactive insight interface ───────────────────────────────────────────────

#: Default timeout (seconds) for proactive insight generation.
#: Kept shorter than the chat timeout because insights must return before the
#: browser's own 15 s client-side abort fires.
_INSIGHT_TIMEOUT: float = 14.0
_ALLOWED_INSIGHT_TYPES = {"success", "trend", "warning", "alert"}


def _extract_json_array(raw_text: str) -> list[dict]:
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)

    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, list):
            return parsed
    except json.JSONDecodeError:
        pass

    match = re.search(r"\[[\s\S]*\]", cleaned)
    if not match:
        raise ValueError("Agent did not return a JSON array.")

    parsed = json.loads(match.group(0))
    if not isinstance(parsed, list):
        raise ValueError("Parsed insight payload is not a list.")
    return parsed


def _normalize_structured_insights(raw_items: list[dict]) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []

    for item in raw_items:
        if not isinstance(item, dict):
            continue

        insight_type = str(item.get("type", "")).strip().lower()
        text = str(item.get("text", "")).strip()

        if insight_type not in _ALLOWED_INSIGHT_TYPES or not text:
            continue

        normalized.append({"type": insight_type, "text": text[:160]})

    if len(normalized) < 3:
        raise ValueError("Agent returned fewer than 3 valid structured insights.")

    return normalized[:4]


async def generate_insight(
    df: pd.DataFrame,
    timeout: float = _INSIGHT_TIMEOUT,
) -> str:
    """
    Generate a proactive 1-2 sentence data insight for the given DataFrame.

    Uses the same Reflexion (Critic) graph as the chat endpoint so the numbers
    in the insight are validated before being returned.

    Args:
        df:      The dataset to analyse.
        timeout: Hard timeout in seconds.  Raises asyncio.TimeoutError on breach.

    Returns:
        A concise, validated insight string (1-2 sentences, ≤ ~45 words).

    Raises:
        asyncio.TimeoutError: if the graph takes longer than ``timeout`` seconds.
    """
    graph = make_graph(df)

    initial_state: AgentState = {
        "messages": [
            SystemMessage(content=INSIGHT_SYSTEM_PROMPT),
            HumanMessage(content=INSIGHT_USER_PROMPT),
        ],
        "tool_outputs": [],
        "draft_answer": "",
        "validation_feedback": "",
        "retry_count": 0,
    }

    final_state = await asyncio.wait_for(
        graph.ainvoke(initial_state),
        timeout=timeout,
    )

    return final_state.get("draft_answer", "")


async def generate_structured_insights(
    df: pd.DataFrame,
    timeout: float = _INSIGHT_TIMEOUT,
) -> list[dict[str, str]]:
    """
    Generate 3-4 structured dashboard insights for the given DataFrame.

    Uses the same Reflexion graph as chat/proactive insight generation, then
    parses the final validated draft into a strict JSON array payload.
    """
    graph = make_graph(df)

    initial_state: AgentState = {
        "messages": [
            SystemMessage(content=STRUCTURED_INSIGHTS_SYSTEM_PROMPT),
            HumanMessage(content=STRUCTURED_INSIGHTS_USER_PROMPT),
        ],
        "tool_outputs": [],
        "draft_answer": "",
        "validation_feedback": "",
        "retry_count": 0,
    }

    final_state = await asyncio.wait_for(
        graph.ainvoke(initial_state),
        timeout=timeout,
    )

    draft_answer = final_state.get("draft_answer", "").strip()
    if not draft_answer:
        raise ValueError("The agent did not produce a structured insights response.")

    raw_items = _extract_json_array(draft_answer)
    return _normalize_structured_insights(raw_items)
