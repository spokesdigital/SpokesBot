import asyncio
from langchain_openai import ChatOpenAI
import os
os.environ["OPENAI_API_KEY"] = "sk-invalid-key"

llm = ChatOpenAI(model="gpt-4o", streaming=True)

async def run():
    try:
        await llm.ainvoke("hi")
    except Exception as e:
        print(type(e).__name__)

asyncio.run(run())
