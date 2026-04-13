from pydantic import BaseModel, Field


class SupportMessageCreate(BaseModel):
    email: str = Field(..., min_length=1, max_length=320)
    message: str = Field(..., min_length=1, max_length=2000)


class SupportMessageResponse(BaseModel):
    id: str
    user_id: str
    organization_id: str
    email: str
    message: str
    status: str
    created_at: str
