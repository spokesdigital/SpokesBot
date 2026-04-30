from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.dependencies import (
    get_current_org_id,
    get_current_user_id,
    get_service_client,
    require_admin,
)
from app.schemas.support import SupportMessageCreate, SupportMessageResponse
from app.services import support_service
from supabase import Client

router = APIRouter(prefix="/support", tags=["support"])


@router.post("/", response_model=SupportMessageResponse, status_code=201)
def send_support_message(
    body: SupportMessageCreate,
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    org_id: str = Depends(get_current_org_id),
):
    """Client submits a support message to the admin team."""
    return support_service.create_message(
        user_id=user_id,
        org_id=org_id,
        email=body.email,
        message=body.message,
        service_client=service_client,
    )


_VALID_STATUSES = {"open", "resolved"}


@router.get("/", response_model=list[SupportMessageResponse])
def list_support_messages(
    status_filter: str | None = Query(None, alias="status"),
    service_client: Client = Depends(get_service_client),
    _: None = Depends(require_admin),
):
    """Admin-only: list all support messages, optionally filtered by status."""
    if status_filter is not None and status_filter not in _VALID_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Invalid status '{status_filter}'. Must be one of: {sorted(_VALID_STATUSES)}",
        )
    return support_service.list_messages(service_client, status_filter=status_filter)


@router.patch("/{message_id}", response_model=SupportMessageResponse)
def update_support_message_status(
    message_id: str,
    service_client: Client = Depends(get_service_client),
    _: None = Depends(require_admin),
):
    """Admin-only: mark a support message as resolved."""
    try:
        return support_service.update_status(message_id, "resolved", service_client)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e),
        ) from e
