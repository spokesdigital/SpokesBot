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
    threads_resp = supa.table("threads").select("id, dataset_id").limit(1).execute()
    if not threads_resp.data:
        print("No threads found")
        return
    thread = threads_resp.data[0]
    dataset = supa.table("datasets").select("storage_path").eq("id", thread["dataset_id"]).single().execute().data
    print(f"Loading {dataset['storage_path']}")
    df = dataset_service.load_dataframe(dataset["storage_path"], supa)
    history = thread_service.get_messages(thread["id"], supa)
    print("Testing stream_agent...")
    try:
        async for token in stream_agent(df, history, "what is the last week's sale"):
            print(token, end='')
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
