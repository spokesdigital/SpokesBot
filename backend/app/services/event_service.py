from typing import Any

from supabase import Client


def log_event(
    event_type: str,
    metadata: dict[str, Any],
    user_id: str,
    org_id: str,
    service_client: Client,
) -> None:
    """Write an event log entry. Uses service client — fire-and-forget safe."""
    try:
        service_client.table("event_logs").insert({
            "event_type": event_type,
            "event_metadata": metadata,
            "user_id": user_id,
            "organization_id": org_id,
        }).execute()
    except Exception as e:
        # Event logging must never crash the calling endpoint
        print(f"[EVENT LOG ERROR] Failed to log '{event_type}': {e}")
