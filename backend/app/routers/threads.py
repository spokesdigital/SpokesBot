import asyncio
import json
import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.agent.graph import generate_insight, stream_agent
from app.dependencies import (
    ROLE_ADMIN,
    get_current_org_id,
    get_current_role,
    get_current_user,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
)

# limiter imported from app.main to avoid circular imports
from app.main import limiter
from app.schemas import (
    ChatRequest,
    MessageResponse,
    ProactiveInsightResponse,
    ThreadCreate,
    ThreadResponse,
)
from app.services import dataset_service, support_service, thread_service
from supabase import Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/threads", tags=["threads"])

# Phrases the system prompt instructs the agent to use when it cannot answer.
# Detecting these in the final response triggers the escalation prompt so the
# user can send the query to a human admin instead of hitting a dead end.
_ESCALATION_SIGNALS = (
    "i only have access to the current dashboard dataset",
    "i'm here to help you analyse your dashboard data",
    "i can only share analysed insights from your data",
    "i don't have enough context to answer",
    "i dont have enough context to answer",
    "please share more details",
    "please contact support",
    "send this to an admin",
)


def _needs_escalation(text: str) -> bool:
    lower = text.strip().lower()
    return any(signal in lower for signal in _ESCALATION_SIGNALS)


@router.post("/", response_model=ThreadResponse, status_code=201)
def create_thread(
    body: ThreadCreate,
    org_id: UUID | None = Query(None),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    """
    Creates a new thread linked to a dataset.
    RLS confirms the dataset belongs to the user's org before insert.

    Admins can optionally pass user_id in the body to create a thread
    owned by a specific client user. If omitted, the admin's own user_id
    is used.
    """
    target_org_id = str(org_id) if role == ROLE_ADMIN and org_id else caller_org_id
    dataset_client = service_client if role == ROLE_ADMIN else supabase
    thread_client = service_client if role == ROLE_ADMIN else supabase

    dataset = (
        dataset_client.table("datasets")
        .select("id, organization_id")
        .eq("id", str(body.dataset_id))
        .eq("organization_id", target_org_id)
        .maybe_single()
        .execute()
    )
    if not dataset.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{body.dataset_id}' not found.",
        )

    thread_user_id = str(body.user_id) if role == ROLE_ADMIN and body.user_id else user_id

    return thread_service.create_thread(
        dataset_id=str(body.dataset_id),
        title=body.title,
        user_id=thread_user_id,
        org_id=target_org_id,
        supabase=thread_client,
    )


@router.get("/", response_model=list[ThreadResponse])
def list_threads(
    org_id: UUID | None = Query(None),
    dataset_id: UUID | None = Query(None),
    search: str | None = Query(None, max_length=200),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    """
    Returns threads for the authenticated user, sorted newest first.
    Pass ?dataset_id=<uuid> to filter by a specific dataset.
    RLS enforces user_id = auth.uid() — users only see their own threads.

    Admin-only params:
      search  — case-insensitive substring match on thread title
      limit   — page size (1–200, default 50)
      offset  — pagination offset (default 0)
    """
    if role == ROLE_ADMIN:
        target_org_id = str(org_id) if org_id else caller_org_id
        query = (
            service_client.table("threads")
            .select("*")
            .eq("organization_id", target_org_id)
            .order("created_at", desc=True)
            .range(offset, offset + limit - 1)
        )
        if dataset_id:
            query = query.eq("dataset_id", str(dataset_id))
        if search and search.strip():
            query = query.ilike("title", f"%{search.strip()}%")
        return query.execute().data

    return thread_service.list_threads(supabase, dataset_id=str(dataset_id) if dataset_id else None)


@router.get("/{thread_id}", response_model=ThreadResponse)
def get_thread(
    thread_id: str,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    role: str = Depends(get_current_role),
):
    """
    Returns a single thread by ID. RLS ensures regular users can only
    fetch their own threads; admins use the service client.
    """
    if role == ROLE_ADMIN:
        result = (
            service_client.table("threads").select("*").eq("id", thread_id).maybe_single().execute()
        )
        if not result.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
        return result.data
    return thread_service.get_thread(thread_id, supabase)


@router.get("/{thread_id}/messages", response_model=list[MessageResponse])
def get_messages(
    thread_id: str,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """
    Returns all messages for a thread in chronological order.
    Admins can view messages in any thread (service client bypasses RLS).
    Regular users are scoped to their own threads via RLS.
    """
    if role == ROLE_ADMIN:
        thread = (
            service_client.table("threads").select("*").eq("id", thread_id).maybe_single().execute()
        )
        if not thread.data:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
        return thread_service.get_messages(thread_id, service_client)

    thread_service.get_thread(thread_id, supabase)
    return thread_service.get_messages(thread_id, supabase)


@router.post("/{thread_id}/chat")
@limiter.limit("20/minute")
async def chat(
    request: Request,
    thread_id: str,
    body: ChatRequest,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """
    Live SSE streaming chat endpoint powered by LangGraph + OpenAI.

    Flow:
      1. Validate thread ownership and dataset readiness.
      2. Persist the user message immediately.
      3. Load the dataset parquet into a DataFrame.
      4. Fetch full message history for multi-turn context.
      5. Stream tokens from the ReAct agent as SSE events.
      6. Persist the full assembled response once streaming is done.

    SSE event format:
      data: {"token": "<chunk>"}\\n\\n   — partial token
      data: {"done": true}\\n\\n         — stream complete
      data: {"error": "<msg>"}\\n\\n      — on failure
    """
    # ── 1. Validate thread + dataset ─────────────────────────────────────────
    if role == ROLE_ADMIN:
        thread = (
            service_client.table("threads").select("*").eq("id", thread_id).maybe_single().execute()
        ).data
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")

        dataset = (
            service_client.table("datasets")
            .select("*")
            .eq("id", thread["dataset_id"])
            .eq("organization_id", thread["organization_id"])
            .maybe_single()
            .execute()
        ).data
        if not dataset:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Dataset '{thread['dataset_id']}' not found.",
            )
        history_client = service_client
    else:
        thread = thread_service.get_thread(thread_id, supabase)
        dataset = dataset_service.get_dataset(thread["dataset_id"], supabase)
        history_client = supabase

    if dataset.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Dataset is not ready (status: {dataset.get('status')}). Wait for ingestion to complete.",
        )

    # ── 2. Persist the user message immediately ───────────────────────────────
    thread_service.save_message(thread_id, "user", body.message, service_client)

    # ── 3. Load dataset parquet ───────────────────────────────────────────────
    try:
        df = dataset_service.load_dataframe(dataset["storage_path"], service_client)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load dataset for analysis: {exc}",
        ) from exc

    # ── 4. Fetch message history (excluding the message we just saved) ────────
    all_messages = thread_service.get_messages(thread_id, history_client)
    # Exclude only the LAST occurrence of the just-saved user message so that
    # stream_agent() receives it as `new_message` without it appearing twice.
    # Using content equality across all messages would incorrectly strip every
    # prior turn where the user asked the exact same question (e.g. a retry).
    last_user_idx: int | None = None
    for i in range(len(all_messages) - 1, -1, -1):
        m = all_messages[i]
        if m["role"] == "user" and m["content"] == body.message:
            last_user_idx = i
            break
    history = [m for i, m in enumerate(all_messages) if i != last_user_idx]

    # ── 5. Stream generator ───────────────────────────────────────────────────
    async def event_stream():
        accumulated = ""
        try:
            async for token in stream_agent(
                df, history, body.message, page_context=body.page_context
            ):
                if not token:
                    # Empty token = keep-alive heartbeat from the polling loop.
                    # Send a structured status event so the client can show a
                    # meaningful "thinking" indicator instead of nothing.
                    yield f"data: {json.dumps({'status': 'thinking'})}\n\n"
                    continue
                accumulated += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            # ── 6. Persist full assembled response ────────────────────────────
            if accumulated:
                metadata = {}
                done_payload: dict = {"done": True}
                if _needs_escalation(accumulated):
                    done_payload["requires_escalation"] = True
                    metadata["requires_escalation"] = True
                thread_service.save_message(
                    thread_id,
                    "assistant",
                    accumulated,
                    service_client,
                    metadata=metadata if metadata else None,
                )
                yield f"data: {json.dumps(done_payload)}\n\n"
            else:
                # Agent produced no answer — save a fallback so the thread isn't
                # left without a response, stream it to the client, then signal
                # the client to offer escalation so the button anchors to this message.
                fallback_text = "I wasn't able to find a clear answer based on your data."
                thread_service.save_message(
                    thread_id,
                    "assistant",
                    fallback_text,
                    service_client,
                    metadata={"requires_escalation": True},
                )
                yield f"data: {json.dumps({'token': fallback_text})}\n\n"
                yield f"data: {json.dumps({'done': True, 'requires_escalation': True})}\n\n"

        except asyncio.CancelledError:
            # Client disconnected mid-stream — save whatever accumulated
            if accumulated:
                metadata = {}
                if _needs_escalation(accumulated):
                    metadata["requires_escalation"] = True
                thread_service.save_message(
                    thread_id,
                    "assistant",
                    accumulated,
                    service_client,
                    metadata=metadata if metadata else None,
                )

        except Exception as exc:
            # C5: Never expose raw exception details to the client over SSE
            # Log the full traceback so it appears in Render/server logs for debugging
            logger.error(
                "[chat] stream_agent raised an exception for thread_id=%s: %s",
                thread_id,
                exc,
                exc_info=True,
            )
            # Save whatever we have — partial answer is better than nothing.
            # If we have nothing, save a placeholder so the thread isn't broken.
            if accumulated:
                metadata = {}
                if _needs_escalation(accumulated):
                    metadata["requires_escalation"] = True
                thread_service.save_message(
                    thread_id,
                    "assistant",
                    accumulated,
                    service_client,
                    metadata=metadata if metadata else None,
                )
            else:
                thread_service.save_message(
                    thread_id,
                    "assistant",
                    "I encountered an error while processing your request. Please try again.",
                    service_client,
                )
            yield f"data: {json.dumps({'error': 'The AI agent encountered an error. Please try again.'})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            # Prevent buffering at every layer
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


# ── Escalation endpoint ───────────────────────────────────────────────────────


@router.post("/{thread_id}/escalate", status_code=200)
@limiter.limit("5/minute")
async def escalate_thread(
    request: Request,
    thread_id: str,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
    current_user: Any = Depends(get_current_user),
):
    """
    Flag a thread for admin review.

    Creates a SupportMessage so the escalation surfaces in the admin
    Escalations dashboard.  The last user query is included as context
    so the admin knows exactly what the user was trying to ask.

    Rate-limited to 5/minute per user to prevent spam.
    """
    if role == ROLE_ADMIN:
        thread = (
            service_client.table("threads").select("*").eq("id", thread_id).maybe_single().execute()
        ).data
        if not thread:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
        history_client = service_client
    else:
        thread = thread_service.get_thread(thread_id, supabase)
        history_client = supabase

    # Pull the most recent user message to give the admin full context
    messages = thread_service.get_messages(thread_id, history_client)
    last_user_msg = next((m for m in reversed(messages) if m["role"] == "user"), None)
    query_text = last_user_msg["content"] if last_user_msg else "(no message)"

    thread_title = thread.get("title", thread_id)
    org_id = thread.get("organization_id", caller_org_id)
    email = getattr(current_user, "email", "") or ""

    existing_open = support_service.get_open_chat_escalation(
        user_id=user_id,
        org_id=org_id,
        thread_id=thread_id,
        service_client=service_client,
    )
    if existing_open:
        return {"escalated": True, "support_message_id": existing_open["id"]}

    support_msg = support_service.create_message(
        user_id=user_id,
        org_id=org_id,
        email=email,
        message=(
            f"[Chat Escalation] Thread: {thread_title}\n"
            f"Thread ID: {thread_id}\n\n"
            f"User query: {query_text}"
        ),
        service_client=service_client,
        source="chat_escalation",
        thread_id=thread_id,
    )

    return {"escalated": True, "support_message_id": support_msg["id"]}


# ── Proactive insight endpoint ────────────────────────────────────────────────


@router.post(
    "/{thread_id}/proactive-insight",
    response_model=ProactiveInsightResponse,
    status_code=201,
    summary="Generate a proactive AI insight for a thread",
)
@limiter.limit("5/minute")
async def proactive_insight(
    request: Request,
    thread_id: str,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    role: str = Depends(get_current_role),
):
    """
    Run a quick describe + trend analysis on the thread's dataset and generate
    a validated 1-2 sentence insight.  Persists it as the first assistant message.

    Intended to be called by the frontend the moment a user opens a fresh chat
    thread so the widget shows a data-driven opener without requiring user input.

    The Reflexion critic (built in the previous task) validates every number
    before the insight is persisted — hallucinations are rejected and the agent
    is asked to recalculate.

    Returns:
        thread_id, message_id, and the validated insight text.

    Raises:
        404  — thread or dataset not found
        409  — dataset is not yet in 'completed' status
        408  — insight generation timed out (15 s budget)
        500  — agent produced an empty response or dataset couldn't be loaded
    """
    _ENDPOINT_TIMEOUT = 55.0  # seconds — leaves buffer under the 60 s client timeout

    # ── 1. Validate thread & dataset access ──────────────────────────────────
    if role == ROLE_ADMIN:
        thread = (
            service_client.table("threads").select("*").eq("id", thread_id).maybe_single().execute()
        ).data
        if not thread:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Thread not found.",
            )
        dataset = (
            service_client.table("datasets")
            .select("*")
            .eq("id", thread["dataset_id"])
            .maybe_single()
            .execute()
        ).data
    else:
        thread = thread_service.get_thread(thread_id, supabase)
        dataset = dataset_service.get_dataset(thread["dataset_id"], supabase)

    if not dataset:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dataset not found.",
        )
    if dataset.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Dataset is not ready (status: {dataset.get('status')}). "
                "Wait for ingestion to complete before requesting an insight."
            ),
        )

    # ── 2. Load the dataset parquet ──────────────────────────────────────────
    try:
        df = dataset_service.load_dataframe(dataset["storage_path"], service_client)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load dataset for analysis: {exc}",
        ) from exc

    # ── 3. Generate & validate insight (Reflexion graph, 15 s budget) ────────
    try:
        insight_text = await asyncio.wait_for(
            generate_insight(df),
            timeout=_ENDPOINT_TIMEOUT,
        )
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=(
                "Insight generation timed out. The dataset may be too large "
                "or the AI service is slow. Please try again."
            ),
        ) from exc

    if not insight_text.strip():
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="The agent did not produce a response. Please try again.",
        )

    # ── 4. Persist as the first assistant message ────────────────────────────
    msg = thread_service.save_message(
        thread_id,
        "assistant",
        insight_text.strip(),
        service_client,
    )

    return {
        "thread_id": thread_id,
        "message_id": msg["id"],
        "insight": insight_text.strip(),
    }
