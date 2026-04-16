import sys
import os

sys.path.append(os.path.join(os.getcwd(), 'backend'))

from backend.app.dependencies import get_service_client

supa = get_service_client()
res = supa.table("organizations").select("name").execute()
print(res.data)
