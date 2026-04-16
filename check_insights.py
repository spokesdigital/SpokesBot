import urllib.request
import json
import os

# 1. Login
url = "https://bfviftsmlvfntefvlxha.supabase.co/auth/v1/token?grant_type=password"
key = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmdmlmdHNtbHZmbnRlZnZseGhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwMzAzNTUsImV4cCI6MjA5MDYwNjM1NX0._HAqLk6uUr6-7qvgiD6EgEB1x55U-N-8vTDKwhiXqMI"

req = urllib.request.Request(
    url,
    data=json.dumps({"email": "client@gmail.com", "password": "pass@123"}).encode('utf-8'),
    headers={"Content-Type": "application/json", "apikey": key}
)
with urllib.request.urlopen(req) as response:
    token = json.loads(response.read())["access_token"]

# 2. Get Insights
dataset_id = "af99aa54-9643-45f0-9dac-36e70fbe97ac"
org_id = "8f141203-04e4-44ed-852a-9e20a455a2c4" # From previous run_test.py

req_in = urllib.request.Request(
    f"https://spokesbot-backend.onrender.com/analytics/insights?org_id={org_id}",
    data=json.dumps({"dataset_id": dataset_id, "date_preset": "last_30_days", "date_column": "Date"}).encode('utf-8'),
    headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json", "Origin": "https://spokesbot.vercel.app"}
)
try:
    with urllib.request.urlopen(req_in) as response:
        data = json.loads(response.read())
        print(f"Total insights returned: {len(data['insights'])}")
        for i, insight in enumerate(data['insights']):
            print(f"{i}: [{insight['type']}] {insight['text']}")
except Exception as e:
    if hasattr(e, 'read'):
        print("Error:", e.read())
    else:
        print("Error:", e)
