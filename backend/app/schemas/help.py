from pydantic import BaseModel, Field


class HelpArticleCreate(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    body: str = Field(..., min_length=1, max_length=5000)
    category: str = Field(default="general", max_length=50)
    sort_order: int = Field(default=0, ge=0)
    is_published: bool = True


class HelpArticleUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    body: str | None = Field(default=None, min_length=1, max_length=5000)
    category: str | None = Field(default=None, max_length=50)
    sort_order: int | None = Field(default=None, ge=0)
    is_published: bool | None = None


class HelpArticleResponse(BaseModel):
    id: str
    title: str
    body: str
    category: str
    sort_order: int
    is_published: bool
    created_at: str
    updated_at: str
