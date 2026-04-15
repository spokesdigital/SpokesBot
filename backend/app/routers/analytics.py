import logging
from datetime import timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status

from app.agent.graph import generate_structured_insights
from app.dependencies import (
    ROLE_ADMIN,
    get_current_org_id,
    get_current_role,
    get_service_client,
    get_supabase_client,
)

# limiter imported from app.main to avoid circular imports
from app.main import limiter
from app.schemas import AnalyticsRequest, AnalyticsResponse, InsightsRequest, InsightsResponse
from app.services import analytics_service, dataset_service
from supabase import Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.post("/compute", response_model=AnalyticsResponse)
@limiter.limit("60/minute")
def compute_analytics(
    request: Request,
    body: AnalyticsRequest,
    org_id: UUID | None = Query(None),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    """
    Compute analytics for a dataset.

    Isolation: explicit org filter + RLS on the user-scoped client — two independent
    barriers preventing cross-tenant data access.

    Date filtering: if date_preset is provided, the DataFrame is sliced to the
    requested range before any computation runs. compute() always receives an
    already-filtered DataFrame; its logic is unchanged.
    """
    # ── 1. Dataset lookup with explicit org isolation ────────────────────────
    target_org_id = str(org_id) if role == ROLE_ADMIN and org_id else caller_org_id
    client = service_client if role == ROLE_ADMIN else supabase

    resp = (
        client.table("datasets")
        .select("*")
        .eq("id", str(body.dataset_id))
        .eq("organization_id", target_org_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{body.dataset_id}' not found.",
        )
    dataset = resp.data

    # ── 2. Status guard ──────────────────────────────────────────────────────
    if dataset.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Dataset is not ready (status: '{dataset.get('status')}')."
                " Wait for ingestion to complete before running analytics."
            ),
        )

    # ── 3. Load parquet into DataFrame ───────────────────────────────────────
    df = dataset_service.load_dataframe(dataset["storage_path"], service_client)
    full_df = df.copy()
    start = end = None

    # ── 4. Apply date filter (pre-processing step) ───────────────────────────
    if body.date_preset is not None:
        start, end = analytics_service.resolve_date_range(
            body.date_preset.value,
            body.start_date,
            body.end_date,
        )
        try:
            df = analytics_service.apply_date_filter(df, body.date_column, start, end)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            ) from e
        if df.empty:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"No rows found in the selected date range "
                    f"({body.date_preset.value}). Try a wider filter."
                ),
            )

    # ── 5. Compute analytics on the (possibly filtered) DataFrame ────────────
    try:
        result = analytics_service.compute(
            df,
            operation=body.operation,
            column=body.column,
            group_by=body.group_by,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    if body.operation == "auto" and body.date_preset is not None and start and end:
        range_duration = end - start
        prior_end = start - timedelta(seconds=1)
        prior_start = prior_end - range_duration
        try:
            previous_df = analytics_service.apply_date_filter(
                full_df,
                body.date_column,
                prior_start,
                prior_end,
            )
        except ValueError:
            previous_df = full_df.iloc[0:0]

        previous_result = None
        if not previous_df.empty:
            previous_result = analytics_service.compute(
                previous_df,
                operation="auto",
            )

        result["comparison"] = analytics_service.build_auto_comparison(result, previous_result)
        result["comparison_window"] = {
            "current_start": start.isoformat(),
            "current_end": end.isoformat(),
            "previous_start": prior_start.isoformat(),
            "previous_end": prior_end.isoformat(),
        }

    return AnalyticsResponse(
        dataset_id=body.dataset_id,
        operation=body.operation,
        result=result,
    )


@router.post("/insights", response_model=InsightsResponse)
@limiter.limit("20/minute")
async def get_overall_insights(
    request: Request,
    body: InsightsRequest,
    org_id: UUID | None = Query(None),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    target_org_id = str(org_id) if role == ROLE_ADMIN and org_id else caller_org_id
    client = service_client if role == ROLE_ADMIN else supabase

    resp = (
        client.table("datasets")
        .select("*")
        .eq("id", str(body.dataset_id))
        .eq("organization_id", target_org_id)
        .maybe_single()
        .execute()
    )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{body.dataset_id}' not found.",
        )
    dataset = resp.data

    if dataset.get("status") != "completed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Dataset is not ready (status: '{dataset.get('status')}')."
                " Wait for ingestion to complete before requesting insights."
            ),
        )

    try:
        df = dataset_service.load_dataframe(dataset["storage_path"], service_client)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to load dataset for analysis: {exc}",
        ) from exc

    if body.date_preset is not None:
        start, end = analytics_service.resolve_date_range(
            body.date_preset.value,
            body.start_date,
            body.end_date,
        )
        try:
            df = analytics_service.apply_date_filter(df, body.date_column, start, end)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        if df.empty:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"No rows found in the selected date range "
                    f"({body.date_preset.value}). Try a wider filter."
                ),
            )

    try:
        insights = await generate_structured_insights(df)
    except TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=(
                "Insight generation timed out. The dataset may be too large "
                "or the AI service is slow. Please try again."
            ),
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        # Catches OpenAI API errors (RateLimitError, AuthenticationError,
        # APIConnectionError, etc.) that are not TimeoutError or ValueError.
        logger.error(
            "[insights] AI generation failed for dataset_id=%s: %s: %s",
            body.dataset_id,
            type(exc).__name__,
            exc,
            exc_info=True,
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                f"AI service error ({type(exc).__name__}): {exc}. "
                "Check your OpenAI API key and quota, then try again."
            ),
        ) from exc

    return InsightsResponse(dataset_id=body.dataset_id, insights=insights)
