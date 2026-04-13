from fastapi import APIRouter, Depends, HTTPException, status

from app.dependencies import (
    ROLE_ADMIN,
    get_current_org_id,
    get_current_role,
    get_service_client,
)
from app.schemas import OrganizationCreate, OrganizationResponse
from supabase import Client

router = APIRouter(prefix="/organizations", tags=["organizations"])


@router.get("/", response_model=list[OrganizationResponse])
def list_organizations(
    service_client: Client = Depends(get_service_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    query = service_client.table("organizations").select("*").order("name")
    if role == ROLE_ADMIN:
        # Admins manage client orgs — exclude their own platform org from the list.
        query = query.neq("id", caller_org_id)
    else:
        query = query.eq("id", caller_org_id)
    return query.execute().data


@router.post("/", response_model=OrganizationResponse, status_code=status.HTTP_201_CREATED)
def create_organization(
    body: OrganizationCreate,
    service_client: Client = Depends(get_service_client),
    role: str = Depends(get_current_role),
):
    if role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can create organizations.",
        )

    response = (
        service_client.table("organizations")
        .insert({"name": body.name.strip()})
        .execute()
    )
    return response.data[0]
