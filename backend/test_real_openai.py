import asyncio
from langchain_openai import ChatOpenAI
from dotenv import load_dotenv
import os

load_dotenv(".env")
llm = ChatOpenAI(model="gpt-4o", streaming=True)

async def run():
    try:
        response = await llm.ainvoke("hi")
        print("Success:", response.content)
    except Exception as e:
        print(type(e).__name__, ":", e)

asyncio.run(run())
