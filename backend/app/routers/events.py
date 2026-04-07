from fastapi import APIRouter, Depends

from app.dependencies import (
    get_current_org_id,
    get_current_user_id,
    get_service_client,
)
from app.schemas import EventCreate
from app.services import event_service
from supabase import Client

router = APIRouter(prefix="/events", tags=["events"])


@router.post("/", status_code=204)
def log_event(
    body: EventCreate,
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    org_id: str = Depends(get_current_org_id),
):
    event_service.log_event(
        event_type=body.event_type,
        metadata=body.event_metadata,
        user_id=user_id,
        org_id=org_id,
        service_client=service_client,
    )
