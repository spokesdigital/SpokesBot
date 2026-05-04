import asyncio
import os
import sys

sys.path.append(os.path.join(os.getcwd()))
from app.dependencies import get_service_client
from app.services import dataset_service
from app.agent.graph import stream_agent

QUERIES = [
    "What is the total revenue for the last 30 days?",
    "How does last week's ROAS compare to the previous week?",
    "How does last week's revenue compare to the previous week?",
    "Which platform had the most impressions yesterday?",
    "Are there any campaigns that are underperforming?",
    "Summarize our overall performance for the current month."
]

async def main():
    supa = get_service_client()
    threads_resp = supa.table("threads").select("id, dataset_id").limit(1).execute()
    if not threads_resp.data:
        print("No threads found. Make sure data is seeded.")
        return
    thread = threads_resp.data[0]
    dataset = supa.table("datasets").select("storage_path").eq("id", thread["dataset_id"]).single().execute().data
    print(f"Loading dataset from {dataset['storage_path']}...")
    df = dataset_service.load_dataframe(dataset["storage_path"], supa)
    
    print("\n--- Starting Evaluation ---")
    for idx, query in enumerate(QUERIES, 1):
        print(f"\nQuery {idx}: {query}")
        print("Response: ", end='', flush=True)
        try:
            async for token in stream_agent(df, [], query):
                print(token, end='', flush=True)
            print("\n" + "-"*40)
        except Exception as e:
            print(f"\nError processing query: {e}")

if __name__ == '__main__':
    asyncio.run(main())
