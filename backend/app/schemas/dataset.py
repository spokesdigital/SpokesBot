from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class DatasetResponse(BaseModel):
    id: UUID
    organization_id: UUID
    report_name: str | None
    detected_date_column: str | None
    metric_mappings: dict[str, str | None]
    schema_profile: dict
    ingestion_warnings: list[str]
    file_name: str
    file_size: int | None  # set on intake; None if somehow missing
    row_count: int | None  # None until ingestion completes
    column_headers: list[str]  # empty list until ingestion completes
    storage_path: str | None  # None until ingestion completes
    status: str  # queued | processing | completed | failed
    error_message: str | None  # populated on failure, None otherwise
    report_type: str  # google_ads | meta_ads
    uploaded_at: datetime
    updated_at: datetime


class DatasetListResponse(BaseModel):
    datasets: list[DatasetResponse]
