import asyncio
import pandas as pd
from app.agent.graph import stream_agent

async def main():
    df = pd.read_csv('../test_data.csv') if __import__('os').path.exists('../test_data.csv') else pd.DataFrame({'cost': [10]})
    try:
        async for token in stream_agent(df, [], "what is the last week's sale"):
            print(f"Token: {token}")
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
