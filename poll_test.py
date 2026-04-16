import urllib.request
import json
import time

url = "https://bfviftsmlvfntefvlxha.supabase.co/auth/v1/token?grant_type=password"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmdmlmdHNtbHZmbnRlZnZseGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMzAzNTUsImV4cCI6MjA5MDYwNjM1NX0._HAqLk6uUr6-7qvgiD6EgEB1x55U-N-8vTDKwhiXqMI"

req = urllib.request.Request(
    url,
    data=json.dumps({"email": "client@gmail.com", "password": "pass@123"}).encode('utf-8'),
    headers={"Content-Type": "application/json", "apikey": key}
)
with urllib.request.urlopen(req) as response:
    token = json.loads(response.read())["access_token"]

req_ds = urllib.request.Request(
    "https://spokesbot-backend.onrender.com/datasets/",
    headers={"Authorization": f"Bearer {token}", "Origin": "https://spokesbot.vercel.app"}
)
with urllib.request.urlopen(req_ds) as response:
    datasets = json.loads(response.read())["datasets"]
    d = next(d for d in datasets if d["status"] == "completed")
    dataset_id, org_id = d["id"], d["organization_id"]

print("Polling /analytics/insights for updated exception handler...")
while True:
    req_in = urllib.request.Request(
        f"https://spokesbot-backend.onrender.com/analytics/insights?org_id={org_id}",
        data=json.dumps({"dataset_id": dataset_id, "date_preset": "last_30_days", "date_column": "Date"}).encode('utf-8'),
        headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Origin": "https://spokesbot.vercel.app"}
    )
    try:
        with urllib.request.urlopen(req_in) as response:
            print("OK 200 somehow?!", response.read())
            break
    except Exception as e:
        if hasattr(e, 'read'):
            body = e.read()
            if b'detail' in body:
                print("\nNEW DEPLOYMENT DETECTED!")
                print("HEADERS:", dict(e.headers))
                print("BODY:", body)
                break
            else:
                print(".", end="", flush=True)
    time.sleep(10)
