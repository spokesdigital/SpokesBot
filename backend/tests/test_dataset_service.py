from io import BytesIO
from unittest.mock import MagicMock

import pandas as pd

from app.services.dataset_service import clear_dataframe_cache, load_dataframe


def test_load_dataframe_reuses_cached_parquet_download(mock_supabase):
    clear_dataframe_cache()

    source_df = pd.DataFrame(
        {
            "date": ["2026-04-01", "2026-04-02"],
            "revenue": [100, 150],
        }
    )
    parquet_buffer = BytesIO()
    source_df.to_parquet(parquet_buffer, index=False)
    parquet_bytes = parquet_buffer.getvalue()

    bucket = MagicMock()
    bucket.download.return_value = parquet_bytes
    mock_supabase.storage.from_.return_value = bucket

    first = load_dataframe("org-1/report.parquet", mock_supabase)
    second = load_dataframe("org-1/report.parquet", mock_supabase)

    assert first.equals(source_df)
    assert second.equals(source_df)
    assert bucket.download.call_count == 1

    clear_dataframe_cache()
