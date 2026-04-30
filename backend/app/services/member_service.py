"""Service layer for organisation member management."""

from supabase import Client


def list_members(org_id: str, service_client: Client) -> list[dict]:
    """Return all members of an org with email, role, and joined_at."""
    result = service_client.rpc("get_org_members", {"p_org_id": org_id}).execute()
    return result.data or []


def invite_member(
    org_id: str,
    email: str,
    role: str,
    service_client: Client,
) -> dict:
    """
    Add a user to an org by email address.

    - Existing Supabase account → links directly to the org.
    - No account yet → sends an invite email via Supabase Auth then links.

    Raises ValueError for duplicate memberships.
    """
    email = email.strip().lower()

    lookup = service_client.rpc("lookup_user_by_email", {"p_email": email}).execute()
    existing_user_id: str | None = lookup.data

    if existing_user_id:
        already = (
            service_client.table("user_organizations")
            .select("user_id")
            .eq("user_id", existing_user_id)
            .eq("organization_id", org_id)
            .maybe_single()
            .execute()
        )
        if already.data:
            raise ValueError("This user is already a member of this organisation.")
        user_id = existing_user_id
    else:
        invited = service_client.auth.admin.invite_user_by_email(email)
        user_id = str(invited.user.id)

    service_client.table("user_organizations").insert(
        {"user_id": user_id, "organization_id": org_id, "role": role}
    ).execute()

    for member in list_members(org_id, service_client):
        if str(member["user_id"]) == str(user_id):
            return member

    return {"user_id": user_id, "email": email, "role": role, "joined_at": None}


def remove_member(org_id: str, user_id: str, service_client: Client) -> None:
    """Remove a user from an org. Raises ValueError if membership doesn't exist."""
    result = (
        service_client.table("user_organizations")
        .delete()
        .eq("user_id", user_id)
        .eq("organization_id", org_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Member '{user_id}' not found in this organisation.")
