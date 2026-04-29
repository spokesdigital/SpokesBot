from fastapi import HTTPException, status

from supabase import Client


def create_thread(
    dataset_id: str,
    title: str,
    user_id: str,
    org_id: str,
    supabase: Client,
) -> dict:
    """Insert a new thread. Uses the user-scoped client so RLS validates the write."""
    response = (
        supabase.table("threads")
        .insert(
            {
                "dataset_id": dataset_id,
                "title": title,
                "user_id": user_id,
                "organization_id": org_id,
            }
        )
        .execute()
    )
    return response.data[0]


def list_threads(supabase: Client, dataset_id: str | None = None) -> list[dict]:
    """
    List threads for the current user, sorted newest first.
    Optionally filter by dataset_id. RLS enforces user_id = auth.uid().
    """
    query = supabase.table("threads").select("*").order("created_at", desc=True)
    if dataset_id:
        query = query.eq("dataset_id", dataset_id)
    return query.execute().data


def get_thread(thread_id: str, supabase: Client) -> dict:
    """Fetch a single thread. RLS enforced."""
    response = supabase.table("threads").select("*").eq("id", thread_id).maybe_single().execute()
    if not response.data:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.")
    return response.data


def get_messages(thread_id: str, supabase: Client) -> list[dict]:
    """Fetch message history for a thread. RLS enforced."""
    response = (
        supabase.table("messages")
        .select("*")
        .eq("thread_id", thread_id)
        .order("created_at")
        .execute()
    )
    return response.data


def save_message(
    thread_id: str, role: str, content: str, service_client: Client, metadata: dict | None = None
) -> dict:
    """Persist a message. Service client used — called from agent streaming context."""
    insert_data = {"thread_id": thread_id, "role": role, "content": content}
    if metadata is not None:
        insert_data["metadata"] = metadata

    response = service_client.table("messages").insert(insert_data).execute()
    return response.data[0]
