import io
from collections import OrderedDict
from threading import Lock
from time import monotonic

import pandas as pd
from fastapi import HTTPException, status

from supabase import Client

BUCKET = "datasets"
_DATAFRAME_CACHE_TTL_SECONDS = 300
_DATAFRAME_CACHE_MAX_ITEMS = 4
_dataframe_cache: OrderedDict[str, tuple[float, pd.DataFrame]] = OrderedDict()
_dataframe_cache_lock = Lock()


def _evict_expired_entries(now: float) -> None:
    expired_keys = [
        storage_path
        for storage_path, (loaded_at, _) in _dataframe_cache.items()
        if now - loaded_at > _DATAFRAME_CACHE_TTL_SECONDS
    ]
    for storage_path in expired_keys:
        _dataframe_cache.pop(storage_path, None)


def _get_cached_dataframe(storage_path: str) -> pd.DataFrame | None:
    now = monotonic()
    with _dataframe_cache_lock:
        _evict_expired_entries(now)
        cached_entry = _dataframe_cache.get(storage_path)
        if cached_entry is None:
            return None

        _dataframe_cache.move_to_end(storage_path)
        return cached_entry[1]


def _store_cached_dataframe(storage_path: str, df: pd.DataFrame) -> None:
    now = monotonic()
    with _dataframe_cache_lock:
        _evict_expired_entries(now)
        _dataframe_cache[storage_path] = (now, df)
        _dataframe_cache.move_to_end(storage_path)

        while len(_dataframe_cache) > _DATAFRAME_CACHE_MAX_ITEMS:
            _dataframe_cache.popitem(last=False)


def clear_dataframe_cache() -> None:
    with _dataframe_cache_lock:
        _dataframe_cache.clear()


def list_datasets(supabase: Client) -> list[dict]:
    """List all datasets for the authenticated user's org. RLS enforced."""
    response = supabase.table("datasets").select("*").order("uploaded_at", desc=True).execute()
    return response.data


def get_dataset(dataset_id: str, supabase: Client) -> dict:
    """Fetch a single dataset. RLS enforced — 404 if not found or wrong org."""
    response = supabase.table("datasets").select("*").eq("id", dataset_id).maybe_single().execute()
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
    cached_df = _get_cached_dataframe(storage_path)
    if cached_df is not None:
        return cached_df

    file_bytes: bytes = service_client.storage.from_(BUCKET).download(storage_path)
    df = pd.read_parquet(io.BytesIO(file_bytes))
    _store_cached_dataframe(storage_path, df)
    return df
