import io

import pandas as pd
from fastapi import HTTPException, status

from supabase import Client

BUCKET = "datasets"


def list_datasets(supabase: Client) -> list[dict]:
    """List all datasets for the authenticated user's org. RLS enforced."""
    response = (
        supabase.table("datasets")
        .select("*")
        .order("uploaded_at", desc=True)
        .execute()
    )
    return response.data


def get_dataset(dataset_id: str, supabase: Client) -> dict:
    """Fetch a single dataset. RLS enforced — 404 if not found or wrong org."""
    response = (
        supabase.table("datasets")
        .select("*")
        .eq("id", dataset_id)
        .maybe_single()
        .execute()
    )
    if not response.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Dataset '{dataset_id}' not found.",
        )
    return response.data


def delete_dataset(dataset_id: str, supabase: Client, service_client: Client) -> None:
    """Delete dataset record and its parquet from storage (admin-only via RLS)."""
    record = get_dataset(dataset_id, supabase)
    storage_path = record.get("storage_path")
    if storage_path:
        service_client.storage.from_(BUCKET).remove([storage_path])
    supabase.table("datasets").delete().eq("id", dataset_id).execute()


def load_dataframe(storage_path: str, service_client: Client) -> pd.DataFrame:
    """Download parquet from Supabase Storage and return as DataFrame."""
    file_bytes: bytes = service_client.storage.from_(BUCKET).download(storage_path)
    return pd.read_parquet(io.BytesIO(file_bytes))
