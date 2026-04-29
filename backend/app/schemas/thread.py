from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class ThreadCreate(BaseModel):
    dataset_id: UUID
    title: str = "New Conversation"
    user_id: UUID | None = None


class ThreadResponse(BaseModel):
    id: UUID
    organization_id: UUID
    dataset_id: UUID
    user_id: UUID
    title: str
    created_at: datetime


class MessageResponse(BaseModel):
    id: UUID
    thread_id: UUID
    role: str  # 'user' | 'assistant' | 'system'
    content: str
    metadata: dict | None = None
    created_at: datetime


class ChatRequest(BaseModel):
    message: str
    page_context: str | None = None


class ProactiveInsightResponse(BaseModel):
    thread_id: UUID
    message_id: UUID
    insight: str
