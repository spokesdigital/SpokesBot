from uuid import UUID

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

    response = service_client.table("organizations").insert({"name": body.name.strip()}).execute()
    return response.data[0]


@router.delete("/{org_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_organization(
    org_id: UUID,
    service_client: Client = Depends(get_service_client),
    caller_org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    if role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can delete organizations.",
        )
    org_id_str = str(org_id)
    if org_id_str == caller_org_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot delete your own platform organization.",
        )
    result = (
        service_client.table("organizations")
        .select("id")
        .eq("id", org_id_str)
        .maybe_single()
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Organization '{org_id_str}' not found.",
        )
    service_client.table("organizations").delete().eq("id", org_id_str).execute()
