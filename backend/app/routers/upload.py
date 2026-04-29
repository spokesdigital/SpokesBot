import io
import logging
import os
import tempfile
import uuid as uuid_lib
from pathlib import Path
from uuid import UUID

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
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

from app.cache import invalidate_org
from app.dependencies import get_service_client, get_supabase_client, require_admin
from app.main import limiter
from app.services import analytics_service
from supabase import Client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/upload", tags=["admin_upload"])

SUPABASE_BUCKET = "datasets"
MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024  # 100 MB hard limit

ACCEPTED_EXTENSIONS = {".csv", ".xlsx", ".xls"}

# Rows read for schema/metric inference (fast, low-RAM)
PROFILE_SAMPLE_ROWS = 10_000
# Rows per chunk when streaming CSV → Parquet
STREAM_CHUNK_ROWS = 50_000


# ── Background worker ───────────────────────────────────────────────────────


def _is_excel(file_path: str) -> bool:
    return Path(file_path).suffix.lower() in {".xlsx", ".xls"}


def _process_file(
    dataset_id: str,
    file_path: str,
    organization_id: str,
) -> None:
    """
    Runs in a background task. Full lifecycle:
      queued → processing → completed | failed

    Supports both CSV (streaming chunks) and Excel (full read).
    Any crash writes 'failed' + error_message so the UI never hangs.
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
        _set_status("processing")

        excel = _is_excel(file_path)

        # ── Phase 1: Sample read for schema / metric inference ──────────────
        if excel:
            sample_df = pd.read_excel(file_path, nrows=PROFILE_SAMPLE_ROWS, engine="openpyxl")
        else:
            sample_df = pd.read_csv(file_path, nrows=PROFILE_SAMPLE_ROWS)

        if sample_df.empty:
            raise ValueError("File contained no rows.")

        _, profile = analytics_service.build_dataset_profile(sample_df)
        column_headers = list(sample_df.columns)
        coerced_columns: list[str] = profile["schema_profile"].get("coerced_numeric_columns", [])

        # ── Phase 2: Convert full file → Parquet ────────────────────────────
        buf = io.BytesIO()
        pq_writer: pq.ParquetWriter | None = None
        arrow_schema: pa.Schema | None = None
        row_count = 0

        if excel:
            # Excel doesn't support chunked reads — load the full sheet at once.
            # Excel files are binary (compressed) so a 100 MB .xlsx typically
            # expands to 2–5× in memory; acceptable for our 100 MB file limit.
            full_df = pd.read_excel(file_path, engine="openpyxl")
            full_df = analytics_service.normalize_chunk(full_df, coerced_columns)
            table = pa.Table.from_pandas(full_df, preserve_index=False)
            arrow_schema = table.schema
            pq_writer = pq.ParquetWriter(buf, arrow_schema)
            pq_writer.write_table(table)
            row_count = len(full_df)
        else:
            for chunk_df in pd.read_csv(file_path, chunksize=STREAM_CHUNK_ROWS):
                chunk_df = analytics_service.normalize_chunk(chunk_df, coerced_columns)
                table = pa.Table.from_pandas(chunk_df, preserve_index=False)

                if pq_writer is None:
                    arrow_schema = table.schema
                    pq_writer = pq.ParquetWriter(buf, arrow_schema)
                elif table.schema != arrow_schema:
                    table = table.cast(arrow_schema, safe=False)

                pq_writer.write_table(table)
                row_count += len(chunk_df)

        if pq_writer is None or row_count == 0:
            raise ValueError("File contained no rows.")
        pq_writer.close()

        parquet_bytes = buf.getvalue()

        # ── Phase 3: Upload Parquet to Supabase Storage ──────────────────────
        storage_path = f"{organization_id}/{dataset_id}.parquet"
        supabase.storage.from_(SUPABASE_BUCKET).upload(
            path=storage_path,
            file=parquet_bytes,
            file_options={"content-type": "application/octet-stream", "upsert": "true"},
        )

        # ── Phase 4: Persist success metadata ────────────────────────────────
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

        # ── Phase 5: Invalidate analytics cache for this org ─────────────────
        # Ensures clients never see stale aggregations after a new CSV lands.
        invalidate_org(organization_id)

    except Exception as exc:
        _set_status("failed", error=str(exc))
    finally:
        if os.path.exists(file_path):
            os.remove(file_path)


# ── Upload endpoint ─────────────────────────────────────────────────────────


@router.post("/", status_code=202)
@limiter.limit("10/minute")
async def upload_file(
    request: Request,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    org_id: UUID = Form(...),
    report_name: str | None = Form(None),
    report_type: str = Form("google_ads"),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    _admin: None = Depends(require_admin),
):
    """
    Admin-only endpoint. Assigns the uploaded file to the specified client org.
    Accepts CSV (.csv) and Excel (.xlsx, .xls) files up to 100 MB.

    1. Validates file type and size.
    2. Confirms the target org exists.
    3. Writes a 'queued' dataset row immediately.
    4. Returns 202 Accepted with the new dataset_id.
    5. Background task converts to Parquet, uploads to Storage, updates status.
    """
    # ── Validate file type ───────────────────────────────────────────────────
    if not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No filename provided.",
        )
    ext = Path(file.filename).suffix.lower()
    if ext not in ACCEPTED_EXTENSIONS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only .csv, .xlsx, and .xls files are accepted.",
        )

    # ── Validate report_type ────────────────────────────────────────────────
    valid_report_types = {"google_ads", "meta_ads"}
    if report_type not in valid_report_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid report_type '{report_type}'. Must be one of: {', '.join(sorted(valid_report_types))}.",
        )

    # ── Stream content to disk + validate size ───────────────────────────────
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=ext)
    tmp_path = tmp.name
    total_size = 0

    try:
        while chunk := await file.read(1024 * 1024):  # 1 MB chunks
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
        _process_file,
        dataset_id,
        tmp_path,
        org_id_str,
    )

    return {
        "status": "queued",
        "dataset_id": dataset_id,
        "message": f"'{file.filename}' queued for org '{org_id_str}'. Poll GET /datasets/{dataset_id} for status.",
    }
