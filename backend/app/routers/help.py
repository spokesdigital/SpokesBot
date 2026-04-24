from datetime import UTC, datetime

from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import get_service_client, require_admin
from app.schemas.help import HelpArticleCreate, HelpArticleResponse, HelpArticleUpdate
from supabase import Client

router = APIRouter(prefix="/help", tags=["help"])


@router.get("/articles", response_model=list[HelpArticleResponse])
def list_articles(
    service_client: Client = Depends(get_service_client),
):
    """Public: return all published help articles ordered by category then sort_order."""
    res = (
        service_client.table("help_articles")
        .select("*")
        .eq("is_published", True)
        .order("category")
        .order("sort_order")
        .execute()
    )
    return res.data or []


@router.get("/articles/all", response_model=list[HelpArticleResponse])
def list_all_articles(
    service_client: Client = Depends(get_service_client),
    _: None = Depends(require_admin),
):
    """Admin-only: return all articles including unpublished."""
    res = (
        service_client.table("help_articles")
        .select("*")
        .order("category")
        .order("sort_order")
        .execute()
    )
    return res.data or []


@router.post("/articles", response_model=HelpArticleResponse, status_code=201)
def create_article(
    body: HelpArticleCreate,
    service_client: Client = Depends(get_service_client),
    _: None = Depends(require_admin),
):
    """Admin-only: create a new help article."""
    now = datetime.now(UTC).isoformat()
    res = (
        service_client.table("help_articles")
        .insert({
            "title": body.title,
            "body": body.body,
            "category": body.category,
            "sort_order": body.sort_order,
            "is_published": body.is_published,
            "created_at": now,
            "updated_at": now,
        })
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create article.")
    return res.data[0]


@router.patch("/articles/{article_id}", response_model=HelpArticleResponse)
def update_article(
    article_id: str,
    body: HelpArticleUpdate,
    service_client: Client = Depends(get_service_client),
    _: None = Depends(require_admin),
):
    """Admin-only: update a help article."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update.")
    updates["updated_at"] = datetime.now(UTC).isoformat()

    res = (
        service_client.table("help_articles")
        .update(updates)
        .eq("id", article_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Article not found.")
    return res.data[0]


@router.delete("/articles/{article_id}", status_code=204)
def delete_article(
    article_id: str,
    service_client: Client = Depends(get_service_client),
    _: None = Depends(require_admin),
):
    """Admin-only: permanently delete a help article."""
    res = (
        service_client.table("help_articles")
        .delete()
        .eq("id", article_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(status_code=404, detail="Article not found.")
