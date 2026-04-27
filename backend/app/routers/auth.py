from typing import Any

from fastapi import APIRouter, Depends

from app.dependencies import (
    get_current_user,
    get_optional_org_id,
    get_optional_role,
    get_service_client,
)
from supabase import Client

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def get_me(
    service_client: Client = Depends(get_service_client),
    user: Any = Depends(get_current_user),
    org_id: str | None = Depends(get_optional_org_id),
    role: str | None = Depends(get_optional_role),
):
    # Use service client — the `organizations` RLS policy allows members to SELECT their own org,
    # but service client avoids any edge-case failures during auth lookup.
    org = None
    if org_id:
        org_response = (
            service_client.table("organizations")
            .select("*")
            .eq("id", org_id)
            .maybe_single()
            .execute()
        )
        org = org_response.data

    return {
        "id": str(user.id),
        "email": user.email,
        "organization": org,
        "role": role,
    }
