import asyncio
import logging
from datetime import datetime, time, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import ORJSONResponse

from app.agent.graph import generate_structured_insights
from app.cache import (
    ANALYTICS_TTL,
    INSIGHTS_TTL,
    cache_get,
    cache_set,
    make_analytics_key,
    make_insights_key,
)
from app.dependencies import (
    ROLE_ADMIN,
    get_current_org_id,
    get_current_role,
    get_service_client,
    get_supabase_client,
)

# limiter imported from app.main to avoid circular imports
from app.main import limiter
from app.schemas import AnalyticsRequest, InsightsRequest
from app.services import analytics_service, dataset_service
from supabase import Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/analytics", tags=["analytics"])
PANDAS_TIMEOUT_SECONDS = 30


async def _run_pandas_work(description: str, func, *args, **kwargs):
    try:
        return await asyncio.wait_for(
            asyncio.to_thread(func, *args, **kwargs),
            timeout=PANDAS_TIMEOUT_SECONDS,
        )
    except TimeoutError as e:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail=(
                f"Analytics calculation exceeded {PANDAS_TIMEOUT_SECONDS}s while {description}. "
                "Try a smaller date range or warm the dataset cache before retrying."
            ),
        ) from e


def _preceding_period(start: datetime, end: datetime) -> tuple[datetime, datetime, int]:
    current_start_date = start.date()
    current_end_date = end.date()
    delta_days = (current_end_date - current_start_date).days + 1
    previous_end_date = current_start_date - timedelta(days=1)
    previous_start_date = current_start_date - timedelta(days=delta_days)
    tzinfo = start.tzinfo

    return (
        datetime.combine(previous_start_date, time.min, tzinfo=tzinfo),
        datetime.combine(previous_end_date, time.max, tzinfo=tzinfo),
        delta_days,
    )


@router.post("/warm")
async def warm_dataset_cache(
    body: dict,
    org_id: UUID | None = Query(None),
    service_client: Client = Depends(get_service_client),
    supabase: Client = Depends(get_supabase_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    """
    Pre-warm the in-memory Parquet DataFrame cache for a dataset.

    Called by the frontend immediately when a dataset becomes active —
    before the user triggers any analytics computation.  The Parquet file
    is downloaded from Supabase Storage and cached in the thread-local
    DataFrame store so subsequent /analytics/compute calls hit the cache
    and respond in < 1 s instead of waiting 15-25 s for a cold download.

    Returns immediately with {"status": "warming"} while the download
    happens in the background thread pool so the request never blocks
    the event loop or the caller.
    """
    target_org_id = str(org_id) if role == ROLE_ADMIN and org_id else caller_org_id
    dataset_id = body.get("dataset_id")
    if not dataset_id:
        return {"status": "skipped", "reason": "no dataset_id"}

    client = service_client if role == ROLE_ADMIN else supabase
    resp = (
        client.table("datasets")
        .select("storage_path, status")
        .eq("id", str(dataset_id))
        .eq("organization_id", target_org_id)
        .maybe_single()
        .execute()
    )
    if not resp.data or resp.data.get("status") != "completed":
        return {"status": "skipped", "reason": "dataset not ready"}

    storage_path = resp.data["storage_path"]

    # Fire-and-forget: schedule the download without awaiting it.
    # asyncio.to_thread returns a coroutine; wrapping in create_task
    # runs it concurrently without blocking this response.
    asyncio.ensure_future(
        asyncio.to_thread(dataset_service.load_dataframe, storage_path, service_client)
    )
    logger.info("warm_cache_triggered dataset_id=%s org_id=%s", dataset_id, target_org_id)
    return {"status": "warming", "dataset_id": str(dataset_id)}


@router.post("/compute")
@limiter.limit("60/minute")
async def compute_analytics(
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

    Pandas work is offloaded to a thread pool via asyncio.to_thread() so the
    FastAPI event loop is never blocked by CPU-bound DataFrame operations.
    Response is serialized with orjson (faster than stdlib json, handles numpy types).
    """
    # ── 0. Cache probe (before any DB work) ─────────────────────────────────
    target_org_id = str(org_id) if role == ROLE_ADMIN and org_id else caller_org_id
    _cache_key = make_analytics_key(
        org_id=target_org_id,
        dataset_id=str(body.dataset_id),
        operation=body.operation,
        date_preset=body.date_preset.value if body.date_preset else None,
        date_column=body.date_column,
        start_date=body.start_date,
        end_date=body.end_date,
        column=body.column,
        group_by=body.group_by,
    )
    _cached = cache_get(_cache_key)
    if _cached is not None:
        return ORJSONResponse(content=_cached, headers={"X-Cache": "HIT"})

    # ── 1. Dataset lookup with explicit org isolation ────────────────────────
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

    # ── 3. Load parquet into DataFrame (offloaded — blocks on I/O + pandas) ─
    df = await asyncio.to_thread(
        dataset_service.load_dataframe, dataset["storage_path"], service_client
    )
    full_df = df.copy()
    start = end = None

    # ── 4. Apply date filter (offloaded — pd.to_datetime is CPU-bound) ──────
    if body.date_preset is not None:
        start, end = analytics_service.resolve_date_range(
            body.date_preset.value,
            body.start_date,
            body.end_date,
        )
        try:
            df = await _run_pandas_work(
                "filtering the selected date range",
                analytics_service.apply_date_filter,
                df,
                body.date_column,
                start,
                end,
            )
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(e),
            ) from e
        if df.empty:
            empty_result = {
                "status": "empty",
                "message": f"No rows found in the selected date range ({body.date_preset.value}).",
                "shape": {"rows": 0, "cols": len(df.columns)},
                "numeric_totals": {},
                "numeric_summary": {},
                "categorical_charts": {},
                "time_series": {},
                "metric_time_series": {},
                "metric_breakdowns": {},
                "metric_mappings": analytics_service.infer_metric_mappings(full_df),
            }
            if body.operation == "auto" and start and end:
                prior_start, prior_end, delta_days = _preceding_period(start, end)
                try:
                    previous_df = await _run_pandas_work(
                        "filtering the preceding comparison period",
                        analytics_service.apply_date_filter,
                        full_df,
                        body.date_column,
                        prior_start,
                        prior_end,
                    )
                except ValueError:
                    previous_df = full_df.iloc[0:0]

                previous_result = None
                if not previous_df.empty:
                    previous_result = await _run_pandas_work(
                        "aggregating the preceding comparison period",
                        analytics_service.compute,
                        previous_df,
                        operation="auto",
                        date_range=(prior_start, prior_end),
                    )

                empty_result["comparison"] = analytics_service.build_auto_comparison(
                    empty_result,
                    previous_result,
                )
                empty_result.update(
                    analytics_service.build_period_comparison_payload(
                        empty_result,
                        previous_result,
                        start,
                        end,
                        prior_start,
                        prior_end,
                    )
                )
                empty_result["comparison_window"] = {
                    "current_start": start.isoformat(),
                    "current_end": end.isoformat(),
                    "previous_start": prior_start.isoformat(),
                    "previous_end": prior_end.isoformat(),
                    "delta_days": delta_days,
                    "previous_period_label": empty_result.get("comparisons", {}).get(
                        "previous_period_label"
                    ),
                }

            return ORJSONResponse(
                content={
                    "dataset_id": str(body.dataset_id),
                    "operation": str(body.operation),
                    "result": empty_result,
                }
            )

    # ── 5. Compute analytics (offloaded — groupbys + aggregations) ──────────
    try:
        result = await _run_pandas_work(
            "aggregating the selected period",
            analytics_service.compute,
            df,
            operation=body.operation,
            column=body.column,
            group_by=body.group_by,
            date_range=(start, end) if start and end else None,
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    # ── 6. Prior-period comparison (offloaded per period) ───────────────────
    if body.operation == "auto" and body.date_preset is not None and start and end:
        prior_start, prior_end, delta_days = _preceding_period(start, end)
        try:
            previous_df = await _run_pandas_work(
                "filtering the preceding comparison period",
                analytics_service.apply_date_filter,
                full_df,
                body.date_column,
                prior_start,
                prior_end,
            )
        except ValueError:
            previous_df = full_df.iloc[0:0]

        previous_result = None
        if not previous_df.empty:
            previous_result = await _run_pandas_work(
                "aggregating the preceding comparison period",
                analytics_service.compute,
                previous_df,
                operation="auto",
                date_range=(prior_start, prior_end),
            )

        # build_auto_comparison is pure dict manipulation — no pandas, stays sync
        result["comparison"] = analytics_service.build_auto_comparison(result, previous_result)
        result.update(
            analytics_service.build_period_comparison_payload(
                result,
                previous_result,
                start,
                end,
                prior_start,
                prior_end,
            )
        )
        result["comparison_window"] = {
            "current_start": start.isoformat(),
            "current_end": end.isoformat(),
            "previous_start": prior_start.isoformat(),
            "previous_end": prior_end.isoformat(),
            "delta_days": delta_days,
            "previous_period_label": result.get("comparisons", {}).get("previous_period_label"),
        }

    # ── 7. Serialize with orjson (faster, handles numpy/NaN natively) ───────
    # _sanitize() in analytics_service already converts NaN/Inf → None before
    # this point, so orjson receives only JSON-safe Python types.
    _content = {
        "dataset_id": str(body.dataset_id),
        "operation": str(body.operation),
        "result": result,
    }
    cache_set(target_org_id, _cache_key, _content, ttl=ANALYTICS_TTL)
    return ORJSONResponse(content=_content, headers={"X-Cache": "MISS"})


@router.post("/insights")
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

    # ── 0. Cache probe ────────────────────────────────────────────────────────
    _cache_key = make_insights_key(
        org_id=target_org_id,
        dataset_id=str(body.dataset_id),
        date_preset=body.date_preset.value if body.date_preset else None,
        date_column=body.date_column,
        start_date=body.start_date,
        end_date=body.end_date,
    )
    _cached = cache_get(_cache_key)
    if _cached is not None:
        return ORJSONResponse(content=_cached, headers={"X-Cache": "HIT"})

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
        df = await asyncio.to_thread(
            dataset_service.load_dataframe, dataset["storage_path"], service_client
        )
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
            df = await asyncio.to_thread(
                analytics_service.apply_date_filter, df, body.date_column, start, end
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        if df.empty:
            return ORJSONResponse(
                content={
                    "dataset_id": str(body.dataset_id),
                    "insights": {
                        "status": "empty",
                        "message": f"No rows found in the selected date range ({body.date_preset.value}).",
                        "overall_summary": "No data available for the selected period.",
                        "key_takeaways": [],
                        "anomalies": [],
                        "opportunities": [],
                    },
                }
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

    _content = {
        "dataset_id": str(body.dataset_id),
        "insights": insights,
    }
    cache_set(target_org_id, _cache_key, _content, ttl=INSIGHTS_TTL)
    return ORJSONResponse(content=_content, headers={"X-Cache": "MISS"})
