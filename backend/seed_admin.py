import os
import sys

sys.path.append(os.path.join(os.getcwd()))

from app.dependencies import get_service_client


def main():
    supa = get_service_client()
    try:
        user = supa.auth.admin.create_user({
            "email": "admin@test.com",
            "password": "password123",
            "email_confirm": True
        })
        user_id = user.user.id
        print(f"Created user: {user_id}")
    except Exception as e:
        print(f"User creation might have failed (maybe exists): {e}")
        try:
            # Try to get user if already exists
            users = supa.auth.admin.list_users()
            for u in users:
                if u.email == "admin@test.com":
                    user_id = u.id
                    break
        except Exception as e2:
            print(f"list_users failed: {e2}")
            return

    org = supa.table("organizations").select("id").eq("name", "Acme Corp QA").execute()
    if not org.data:
        print("Organization not found, creating...")
        org = supa.table("organizations").insert({"name": "Acme Corp QA"}).execute()
    
    if org.data:
        org_id = org.data[0]['id']
        print(f"Linking user {user_id} to org {org_id}")
        try:
            supa.table("user_organizations").upsert({
                "user_id": user_id,
                "organization_id": org_id,
                "role": "admin"
            }).execute()
            print("Successfully linked admin to org")
        except Exception as e:
            print(f"Failed to link to org: {e}")

if __name__ == "__main__":
    main()
