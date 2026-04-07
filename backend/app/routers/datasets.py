from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import (
    ROLE_ADMIN,
    get_current_org_id,
    get_current_role,
    get_service_client,
    get_supabase_client,
)
from app.schemas.dataset import DatasetListResponse, DatasetResponse
from app.services import dataset_service
from supabase import Client

router = APIRouter(prefix="/datasets", tags=["datasets"])


_DATASET_COLS = (
    "id, organization_id, report_name, detected_date_column, metric_mappings, "
    "schema_profile, ingestion_warnings, file_name, file_size, row_count, "
    "column_headers, storage_path, status, error_message, "
    "uploaded_at, updated_at"
)


@router.get("/", response_model=DatasetListResponse)
def list_datasets(
    org_id: UUID | None = Query(None),
    all_orgs: bool = Query(False),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    """
    Returns datasets sorted newest first.

    - Regular users omit org_id — their own org is used automatically (RLS enforced).
    - Admins pass ?org_id=<uuid> to list a specific client's datasets (service client,
      bypasses RLS).
    - Admins pass ?all_orgs=true to list every dataset across the platform (service
      client, no org filter). Non-admins receive 403.
    """
    if all_orgs:
        if role != ROLE_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only admins can list datasets across all organizations.",
            )
        resp = (
            service_client.table("datasets")
            .select(_DATASET_COLS)
            .order("uploaded_at", desc=True)
            .execute()
        )
        return {"datasets": resp.data}

    target_org_id = str(org_id) if org_id else caller_org_id
    client = service_client if role == ROLE_ADMIN else supabase

    resp = (
        client.table("datasets")
        .select(_DATASET_COLS)
        .eq("organization_id", target_org_id)
        .order("uploaded_at", desc=True)
        .execute()
    )
    return {"datasets": resp.data}


@router.get("/{dataset_id}", response_model=DatasetResponse)
def get_dataset(
    dataset_id: str,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    """
    Returns the full detail and current status of a single dataset.
    Used by the frontend to poll ingestion state after upload.

    Admins use the service client (no org filter) so they can poll datasets
    belonging to any client org — e.g. after uploading a CSV to a client org.
    Regular users use the user-scoped client with an explicit org filter on
    top of RLS for belt-and-suspenders isolation.
    """
    if role == ROLE_ADMIN:
        resp = (
            service_client.table("datasets")
            .select("*")
            .eq("id", dataset_id)
            .maybe_single()
            .execute()
        )
    else:
        resp = (
            supabase.table("datasets")
            .select("*")
            .eq("id", dataset_id)
            .eq("organization_id", caller_org_id)
            .maybe_single()
            .execute()
        )
    if not resp.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{dataset_id}' not found.",
        )
    return resp.data


@router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(
    dataset_id: str,
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    role: str = Depends(get_current_role),
):
    """
    Deletes a dataset record and its parquet file from storage.
    RLS on the supabase client ensures users can only delete their own org's datasets.
    """
    dataset_service.delete_dataset(
        dataset_id,
        service_client if role == ROLE_ADMIN else supabase,
        service_client,
    )
