import sys
import os
import uuid
import tempfile
import io
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from pathlib import Path
from dotenv import load_dotenv

# Load env variables
load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(__file__))

from supabase import create_client
from app.services import analytics_service

def main():
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_SERVICE_KEY")
    client = create_client(supabase_url, supabase_key)
    
    # 1. Finding Wholesome Organization
    response = client.table("organizations").select("id, name").execute()
    orgs = response.data
    wholesome_org = None
    for org in orgs:
        if "wholesome" in org["name"].lower():
            wholesome_org = org
            break
            
    if not wholesome_org:
        print("Wholesome organization not found!")
        return
        
    print(f"Found organization: {wholesome_org['name']} (ID: {wholesome_org['id']})")
    
    # 2. Prepare file
    project_dir = os.path.dirname(os.path.dirname(__file__))
    file_name = "(Meta)Wholesomeco New Template - Raw Data - wholesome Facebook campaign data.csv"
    file_path = os.path.join(project_dir, file_name)
    if not os.path.exists(file_path):
        print(f"File not found: {file_path}")
        return
        
    dataset_id = str(uuid.uuid4())
    org_id = wholesome_org['id']
    total_size = os.path.getsize(file_path)
    
    print(f"Queueing dataset {dataset_id}")
    client.table("datasets").insert({
        "id": dataset_id,
        "organization_id": org_id,
        "report_name": "Meta Ads Target Data",
        "report_type": "meta_ads",
        "file_name": file_name,
        "file_size": total_size,
        "status": "processing",
        "metric_mappings": {},
        "schema_profile": {},
        "ingestion_warnings": [],
    }).execute()
    
    print("Processing CSV...")
    # Replicate _process_csv logic without importing routers
    try:
        sample_df = pd.read_csv(file_path, nrows=10000)
        if sample_df.empty:
            raise ValueError("Empty CSV")
            
        _, profile = analytics_service.build_dataset_profile(sample_df)
        column_headers = list(sample_df.columns)
        coerced_columns = profile["schema_profile"].get("coerced_numeric_columns", [])
        
        buf = io.BytesIO()
        pq_writer = None
        arrow_schema = None
        row_count = 0
        
        for chunk_df in pd.read_csv(file_path, chunksize=50000):
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
            raise ValueError("Empty DB")
        pq_writer.close()
        
        parquet_bytes = buf.getvalue()
        storage_path = f"{org_id}/{dataset_id}.parquet"
        
        print(f"Uploading parquet to {storage_path}")
        client.storage.from_("datasets").upload(
            path=storage_path,
            file=parquet_bytes,
            file_options={"content-type": "application/octet-stream", "upsert": "true"}
        )
        
        client.table("datasets").update({
            "status": "completed",
            "row_count": row_count,
            "column_headers": column_headers,
            "storage_path": storage_path,
            "metric_mappings": profile["metric_mappings"],
            "detected_date_column": profile["detected_date_column"],
            "schema_profile": profile["schema_profile"],
            "ingestion_warnings": profile["ingestion_warnings"],
        }).eq("id", dataset_id).execute()
        
        print("Upload completed successfully!")
    except Exception as e:
        print("Error:", e)
        client.table("datasets").update({
            "status": "failed",
            "error_message": str(e)
        }).eq("id", dataset_id).execute()
        
if __name__ == '__main__':
    main()
