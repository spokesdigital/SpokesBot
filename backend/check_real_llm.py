import asyncio
import sys
import os

sys.path.append(os.path.join(os.getcwd()))
from app.config import settings
from app.dependencies import get_service_client
from app.services import dataset_service, thread_service
from app.agent.graph import stream_agent
from unittest.mock import patch

async def main():
    supa = get_service_client()
    threads_resp = supa.table("threads").select("id, dataset_id").limit(1).execute()
    if not threads_resp.data: return
    thread = threads_resp.data[0]
    dataset = supa.table("datasets").select("storage_path").eq("id", thread["dataset_id"]).single().execute().data
    df = dataset_service.load_dataframe(dataset["storage_path"], supa)
    
    # We will mock the heuristics so it MUST fall back to the agent
    with patch('app.agent.graph._try_build_period_metric_response', return_value=None), \
         patch('app.agent.graph._try_build_comparison_response', return_value=None):
        try:
            print("Forcing agent evaluation for 'what is the last week's sale'...")
            async for token in stream_agent(df, [], "what is the last week's sale"):
                print(token, end='')
            print()
        except Exception as e:
            import traceback
            traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
