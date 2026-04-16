import urllib.request
import json
import time

url = "https://bfviftsmlvfntefvlxha.supabase.co/auth/v1/token?grant_type=password"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmdmlmdHNtbHZmbnRlZnZseGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMzAzNTUsImV4cCI6MjA5MDYwNjM1NX0._HAqLk6uUr6-7qvgiD6EgEB1x55U-N-8vTDKwhiXqMI"

# 1. Login
req = urllib.request.Request(
    url,
    data=json.dumps({"email": "client@gmail.com", "password": "pass@123"}).encode('utf-8'),
    headers={"Content-Type": "application/json", "apikey": key}
)
try:
    with urllib.request.urlopen(req) as response:
        data = json.loads(response.read())
        token = data["access_token"]
except Exception as e:
    print("Login failed:", e)
    exit(1)

# 2. Get Datasets to find a valid dataset_id
req_ds = urllib.request.Request(
    "https://spokesbot-backend.onrender.com/datasets/",
    headers={"Authorization": f"Bearer {token}", "Origin": "https://spokesbot.vercel.app"}
)
try:
    with urllib.request.urlopen(req_ds) as response:
        datasets = json.loads(response.read())["datasets"]
        valid_datasets = [d for d in datasets if d["status"] == "completed"]
        if not valid_datasets:
            print("No datasets found")
            exit(1)
        dataset_id = valid_datasets[0]["id"]
        org_id = valid_datasets[0]["organization_id"]
        print("Using dataset_id:", dataset_id)
except Exception as e:
    print("Datasets failed:", e)
    exit(1)

# 3. Call insights
print("Calling /analytics/insights...")
req_in = urllib.request.Request(
    f"https://spokesbot-backend.onrender.com/analytics/insights?org_id={org_id}",
    data=json.dumps({"dataset_id": dataset_id, "date_preset": "last_30_days", "date_column": "Date"}).encode('utf-8'),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Origin": "https://spokesbot.vercel.app"}
)
start = time.time()
try:
    with urllib.request.urlopen(req_in) as response:
        print("Success!", response.status)
        print("Time taken:", time.time() - start)
        print("Headers:", dict(response.headers))
        print(response.read()[:200])
except Exception as e:
    print("Error:", e.code if hasattr(e, 'code') else e)
    print("Time taken:", time.time() - start)
    if hasattr(e, 'headers'):
        print("Headers:", dict(e.headers))
    if hasattr(e, 'read'):
        print("Body:", e.read())
