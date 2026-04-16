import requests
import json
import time

url = "https://spokesbot-backend.onrender.com/analytics/insights"
payload = {
  "dataset_id": "00000000-0000-0000-0000-000000000000"
}
try:
    resp = requests.post(url, json=payload)
    print(resp.status_code)
    print(resp.headers)
    print(resp.text)
except Exception as e:
    print(f"Failed: {e}")
