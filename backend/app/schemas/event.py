from typing import Any

from pydantic import BaseModel


class EventCreate(BaseModel):
    event_type: str
    event_metadata: dict[str, Any] = {}
