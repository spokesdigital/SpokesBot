from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials

from app.dependencies import (
    get_current_org_id,
    get_current_role,
    get_current_user_id,
    get_service_client,
    get_supabase_client,
    security,
)
from supabase import Client

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me")
def get_me(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase_client),
    service_client: Client = Depends(get_service_client),
    user_id: str = Depends(get_current_user_id),
    org_id: str = Depends(get_current_org_id),
    role: str = Depends(get_current_role),
):
    try:
        user_response = supabase.auth.get_user(credentials.credentials)
        user = user_response.user
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token.") from exc

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
