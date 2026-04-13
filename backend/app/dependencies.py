from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.config import settings
from supabase import Client, create_client

security = HTTPBearer()

# Role constants — the two roles in this system.
ROLE_ADMIN = "admin"
ROLE_USER = "user"


# ── Supabase clients ─────────────────────────────────────────────────────────

def get_supabase_client(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> Client:
    """
    User-scoped Supabase client.
    Sets the caller's JWT on the PostgREST connection so all queries
    run under that user's identity and RLS policies are enforced.
    """
    client: Client = create_client(settings.SUPABASE_URL, settings.SUPABASE_ANON_KEY)
    client.postgrest.auth(credentials.credentials)
    return client


def get_service_client() -> Client:
    """
    Service-role Supabase client — bypasses ALL RLS.
    Use ONLY for server-initiated writes where no user JWT is available:
      - Background ingestion task status updates
      - LangGraph agent message persistence during SSE streaming
      - Event log writes from background contexts
    Never use this for reads that should be tenant-isolated.
    """
    return create_client(settings.SUPABASE_URL, settings.SUPABASE_SERVICE_KEY)


# ── Auth helpers ─────────────────────────────────────────────────────────────

def get_current_user_id(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    supabase: Client = Depends(get_supabase_client),
) -> str:
    """
    Decodes and verifies the caller's JWT against Supabase Auth.
    Returns the authenticated user's UUID.
    Raises 401 on any invalid or expired token.
    """
    try:
        result = supabase.auth.get_user(credentials.credentials)
        return result.user.id
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token.",
        ) from exc


def get_current_org_id(supabase: Client = Depends(get_supabase_client)) -> str:
    """
    Resolves the caller's organization by calling the SQL helper get_my_org_id()
    (SECURITY DEFINER — reads user_organizations scoped to auth.uid()).

    Raises:
      403 — user is authenticated but not a member of any org.
      500 — unexpected DB error.
    """
    try:
        resp = supabase.rpc("get_my_org_id").execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resolve organization: {e}",
        ) from e

    org_id = resp.data
    if not org_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User is not a member of any organization.",
        )
    return org_id


def get_current_role(supabase: Client = Depends(get_supabase_client)) -> str:
    """
    Resolves the caller's role by calling the SQL helper get_my_role()
    (SECURITY DEFINER — reads user_organizations scoped to auth.uid()).

    Returns ROLE_ADMIN ('admin') or ROLE_USER ('user').
    Never silently defaults — raises 403 if the user has no role.

    Raises:
      403 — user has no role (not in any org).
      500 — unexpected DB error.
    """
    try:
        resp = supabase.rpc("get_my_role").execute()
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to resolve role: {e}",
        ) from e

    role = resp.data
    if not role:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User has no role in any organization.",
        )
    return role


# ── Optional auth helpers (for /auth/me — do not raise on missing org/role) ──

def get_optional_org_id(supabase: Client = Depends(get_supabase_client)) -> Optional[str]:
    """
    Like get_current_org_id but returns None instead of raising 403.
    Safe to use on bootstrap endpoints where the user may not yet be assigned
    to an organisation (e.g. /auth/me called immediately after first sign-up).
    """
    try:
        resp = supabase.rpc("get_my_org_id").execute()
        return resp.data or None
    except Exception:
        return None


def get_optional_role(supabase: Client = Depends(get_supabase_client)) -> Optional[str]:
    """
    Like get_current_role but returns None instead of raising 403.
    """
    try:
        resp = supabase.rpc("get_my_role").execute()
        return resp.data or None
    except Exception:
        return None


# ── Role enforcement guards ──────────────────────────────────────────────────

def require_admin(role: str = Depends(get_current_role)) -> None:
    """
    Dependency guard for admin-only routes.
    Usage: add `_: None = Depends(require_admin)` to any admin-only endpoint.
    Raises 403 for any caller whose role is not ROLE_ADMIN ('admin').
    """
    if role != ROLE_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action requires the 'admin' role.",
        )
