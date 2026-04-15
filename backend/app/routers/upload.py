import io
import os
import tempfile
import uuid as uuid_lib
from pathlib import Path
from uuid import UUID

import pandas as pd
from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    UploadFile,
    status,
)

from app.dependencies import get_service_client, get_supabase_client, require_admin
from app.main import limiter
from app.services import analytics_service
from supabase import Client

router = APIRouter(prefix="/upload", tags=["admin_upload"])

SUPABASE_BUCKET = "datasets"
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB hard limit


# ── Background worker ───────────────────────────────────────────────────────


def _process_csv(
    dataset_id: str,
    file_path: str,
    organization_id: str,
) -> None:
    """
    Runs in a background task. Full lifecycle:
      queued (set by endpoint) → processing → completed | failed

    Uses the service client so processing is not bound to the request's
    JWT lifetime. Any crash writes 'failed' + error_message so the UI
    never hangs on a stuck status.
    """
    supabase = get_service_client()

    def _set_status(s: str, error: str | None = None, extra: dict | None = None):
        payload = {"status": s}
        if error:
            payload["error_message"] = error
        if extra:
            payload.update(extra)
        supabase.table("datasets").update(payload).eq("id", dataset_id).execute()

    try:
        # ── Mark as processing ──────────────────────────────────────────────
        _set_status("processing")

        # ── Parse CSV ───────────────────────────────────────────────────────
        # Using the file path directly is more memory-efficient than io.BytesIO
        df = pd.read_csv(file_path)
        if df.empty:
            raise ValueError("CSV file contained no rows.")

        normalized_df, profile = analytics_service.build_dataset_profile(df)
        row_count = len(normalized_df)
        column_headers = list(normalized_df.columns)

        # ── Convert to Parquet in-memory (no disk, survives redeploys) ──────
        buf = io.BytesIO()
        normalized_df.to_parquet(buf, index=False)
        parquet_bytes = buf.getvalue()

        # ── Upload to Supabase Storage ───────────────────────────────────────
        storage_path = f"{organization_id}/{dataset_id}.parquet"
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=parquet_bytes,
            file_options={"content-type": "application/octet-stream", "upsert": "true"},
        )

        # ── Persist success metadata ─────────────────────────────────────────
        _set_status(
            "completed",
            extra={
                "row_count": row_count,
                "column_headers": column_headers,
                "storage_path": storage_path,
                "metric_mappings": profile["metric_mappings"],
                "detected_date_column": profile["detected_date_column"],
                "schema_profile": profile["schema_profile"],
                "ingestion_warnings": profile["ingestion_warnings"],
            },
        )

    except Exception as exc:
        # ── Persist failure — UI will show 'failed' instead of hanging ──────
        _set_status("failed", error=str(exc))
    finally:
        # ── Housekeeping ────────────────────────────────────────────────────
        if os.path.exists(file_path):
            os.remove(file_path)


# ── Upload endpoint ─────────────────────────────────────────────────────────


@router.post("/", status_code=202)
@limiter.limit("10/minute")
async def upload_csv(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    org_id: UUID = Form(...),
    report_name: str | None = Form(None),
    report_type: str = Form("overview"),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    _admin: None = Depends(require_admin),
):
    """
    Admin-only endpoint. Assigns the uploaded CSV to the specified client org.

    1. Validates file type and size.
    2. Confirms the target org exists.
    3. Writes a 'queued' dataset row immediately.
    4. Returns 202 Accepted with the new dataset_id.
    5. Background task converts to Parquet, uploads to Storage, updates status.
    """
    # ── Validate file type ───────────────────────────────────────────────────
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv files are accepted.",
        )

    # ── Validate report_type ────────────────────────────────────────────────
    valid_report_types = {"overview", "google_ads", "meta_ads"}
    if report_type not in valid_report_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid report_type '{report_type}'. Must be one of: {', '.join(sorted(valid_report_types))}.",
        )

    # ── Stream content to disk + validate size ───────────────────────────────
    # We use a temp file to avoid OOM for large concurrent uploads.
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".csv")
    tmp_path = tmp.name
    total_size = 0

    try:
        while chunk := await file.read(1024 * 1024):  # 1MB chunks
            total_size += len(chunk)
            if total_size > MAX_FILE_SIZE_BYTES:
                tmp.close()
                os.remove(tmp_path)
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=f"File exceeds the {MAX_FILE_SIZE_BYTES // (1024 * 1024)} MB limit.",
                )
            tmp.write(chunk)
        tmp.close()
    except Exception as e:
        if not tmp.closed:
            tmp.close()
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        if isinstance(e, HTTPException):
            raise
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload processing failed: {str(e)}",
        ) from e

    if total_size == 0:
        os.remove(tmp_path)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Uploaded file is empty.",
        )

    # ── Confirm target org exists ────────────────────────────────────────────
    # Uses service client: the admin's RLS scope is their own org, not client orgs.
    org_id_str = str(org_id)
    org_check = (
        service_client.table("organizations")
        .select("id")
        .eq("id", org_id_str)
        .maybe_single()
        .execute()
    )
    if not org_check.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{org_id_str}' not found.",
        )

    # ── Create the dataset row immediately (status = queued) ─────────────────
    # Uses service client: INSERT RLS requires organization_id = get_my_org_id(),
    # which would reject a client org id under the admin's JWT.
    dataset_id = str(uuid_lib.uuid4())
    normalized_report_name = (report_name or "").strip() or Path(file.filename).stem
    service_client.table("datasets").insert(
        {
            "id": dataset_id,
            "organization_id": org_id_str,
            "report_name": normalized_report_name,
            "report_type": report_type,
            "file_name": file.filename,
            "file_size": total_size,
            "status": "queued",
            "metric_mappings": {},
            "schema_profile": {},
            "ingestion_warnings": [],
        }
    ).execute()

    # ── Offload heavy work ───────────────────────────────────────────────────
    background_tasks.add_task(
        _process_csv,
        dataset_id,
        tmp_path,
        org_id_str,
    )

    return {
        "status": "queued",
        "dataset_id": dataset_id,
        "message": f"'{file.filename}' queued for org '{org_id_str}'. Poll GET /datasets/{dataset_id} for status.",
    }
