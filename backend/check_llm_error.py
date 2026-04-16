import asyncio
import os
import sys

sys.path.append(os.path.join(os.getcwd()))
from app.config import settings
from app.agent.graph import stream_agent
from unittest.mock import patch
import pandas as pd

async def main():
    # Force bypass of fast heuristics
    # Create dummy dataframe
    df = pd.DataFrame({"cost": [10]})
    print("Testing LLM stream_agent...")
    try:
        async for token in stream_agent(df, [], "hello agent"):
            print(token, end='')
    except Exception as e:
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    asyncio.run(main())
