import asyncio
import os
import sys

sys.path.append(os.path.join(os.getcwd()))
from app.config import settings
from app.dependencies import get_service_client
from app.services import dataset_service, thread_service
from app.agent.graph import stream_agent

async def main():
    supa = get_service_client()
    threads_resp = supa.table("threads").select("id, dataset_id").execute()
    threads = threads_resp.data
    print(f"Found {len(threads)} threads")
    for thread in threads:
        try:
            dataset = supa.table("datasets").select("storage_path").eq("id", thread["dataset_id"]).single().execute().data
            if not dataset:
                continue
            df = dataset_service.load_dataframe(dataset["storage_path"], supa)
            history = thread_service.get_messages(thread["id"], supa)
            
            print(f"-- Testing thread {thread['id']} (dataset {thread['dataset_id']}) --")
            tokens = []
            async for token in stream_agent(df, history, "what is the last week's sale"):
                tokens.append(token)
            print("".join(tokens))
        except Exception as e:
            print(f"EXCEPTION for {thread['id']}: {type(e).__name__} - {e}")

if __name__ == '__main__':
    asyncio.run(main())
