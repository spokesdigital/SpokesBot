import os
import sys

# Ensure backend app is in PYTHONPATH
sys.path.append(os.path.join(os.getcwd()))

from app.dependencies import get_service_client


def main():
    supa = get_service_client()
    try:
        user = supa.auth.admin.create_user({
            "email": "client@test.com",
            "password": "password123",
            "email_confirm": True
        })
        user_id = user.user.id
        print(f"Created user: {user_id}")
    except Exception as e:
        print(f"User creation failed: {e}")
        return

    org = supa.table("organizations").select("id").eq("name", "Acme Corp QA").execute()
    if org.data:
        org_id = org.data[0]['id']
        try:
            supa.table("user_organizations").insert({
                "user_id": user_id,
                "organization_id": org_id,
                "role": "user"
            }).execute()
            print("Successfully linked user to org")
        except Exception as e:
            print(f"Failed to link to org: {e}")

if __name__ == "__main__":
    main()
