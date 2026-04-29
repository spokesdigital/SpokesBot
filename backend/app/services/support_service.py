"""Service layer for support messages."""

from supabase import Client


def create_message(
    user_id: str,
    org_id: str,
    email: str,
    message: str,
    service_client: Client,
    source: str = "manual",
    thread_id: str | None = None,
) -> dict:
    """Insert a new support message."""
    result = (
        service_client.table("support_messages")
        .insert(
            {
                "user_id": user_id,
                "organization_id": org_id,
                "email": email,
                "message": message,
                "status": "open",
                "source": source,
                "thread_id": thread_id,
            }
        )
        .execute()
    )
    return result.data[0]


def get_open_chat_escalation(
    *,
    user_id: str,
    org_id: str,
    thread_id: str,
    service_client: Client,
) -> dict | None:
    """
    Return an existing OPEN chat escalation for this user/thread if present.

    This makes escalation idempotent from the API perspective so repeated clicks
    or retries do not create duplicate unresolved tickets.
    """
    result = (
        service_client.table("support_messages")
        .select("*")
        .eq("user_id", user_id)
        .eq("organization_id", org_id)
        .eq("status", "open")
        .eq("source", "chat_escalation")
        .eq("thread_id", thread_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    if not result.data:
        return None
    return result.data[0]


def list_messages(service_client: Client, status_filter: str | None = None) -> list[dict]:
    """List all support messages (admin only). Newest first."""
    query = service_client.table("support_messages").select("*").order("created_at", desc=True)
    if status_filter:
        query = query.eq("status", status_filter)
    return query.execute().data


def update_status(message_id: str, new_status: str, service_client: Client) -> dict:
    """Update the status of a support message."""
    result = (
        service_client.table("support_messages")
        .update({"status": new_status})
        .eq("id", message_id)
        .execute()
    )
    if not result.data:
        raise ValueError(f"Support message '{message_id}' not found.")
    return result.data[0]
