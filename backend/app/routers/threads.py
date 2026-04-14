import asyncio
import json
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse

from app.agent.graph import generate_insight, stream_agent
from app.dependencies import (
    ROLE_ADMIN,
    get_current_org_id,
    get_current_role,
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
from app.services import dataset_service, thread_service
from supabase import Client

router = APIRouter(prefix="/threads", tags=["threads"])


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
    """
    if role == ROLE_ADMIN:
        target_org_id = str(org_id) if org_id else caller_org_id
        query = (
            service_client.table("threads")
            .select("*")
            .eq("organization_id", target_org_id)
            .order("created_at", desc=True)
        )
        if dataset_id:
            query = query.eq("dataset_id", str(dataset_id))
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
            service_client.table("threads")
            .select("*")
            .eq("id", thread_id)
            .maybe_single()
            .execute()
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
            service_client.table("threads")
            .select("*")
            .eq("id", thread_id)
            .maybe_single()
            .execute()
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
            service_client.table("threads")
            .select("*")
            .eq("id", thread_id)
            .maybe_single()
            .execute()
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
    # Exclude the last user message — stream_agent() receives it separately
    history = [m for m in all_messages if not (m["role"] == "user" and m["content"] == body.message)]

    # ── 5. Stream generator ───────────────────────────────────────────────────
    async def event_stream():
        accumulated = ""
        try:
            async for token in stream_agent(df, history, body.message, page_context=body.page_context):
                accumulated += token
                yield f"data: {json.dumps({'token': token})}\n\n"

            # ── 6. Persist full assembled response ────────────────────────────
            if accumulated:
                thread_service.save_message(thread_id, "assistant", accumulated, service_client)

            yield f"data: {json.dumps({'done': True})}\n\n"

        except asyncio.CancelledError:
            # Client disconnected mid-stream — save whatever accumulated
            if accumulated:
                thread_service.save_message(thread_id, "assistant", accumulated, service_client)

        except Exception:
            # C5: Never expose raw exception details to the client over SSE
            # Save a failure placeholder so the thread isn't left in a broken state
            if not accumulated:
                thread_service.save_message(thread_id, "assistant", "I encountered an error while processing your request. Please try again.", service_client)
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
    _ENDPOINT_TIMEOUT = 14.5  # seconds — leaves buffer under the 15 s client timeout

    # ── 1. Validate thread & dataset access ──────────────────────────────────
    if role == ROLE_ADMIN:
        thread = (
            service_client.table("threads")
            .select("*")
            .eq("id", thread_id)
            .maybe_single()
            .execute()
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
