import os
import json
import urllib.request
from supabase import create_client, Client

url: str = os.environ.get("SUPABASE_URL", "https://hnglyovwexfxxoaqvjzh.supabase.co")
key: str = os.environ.get("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...") # Wait, I don't have the explicit anon key here, I should read it from backend/.env.production
