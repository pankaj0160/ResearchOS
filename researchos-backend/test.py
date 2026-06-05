import os
from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env", override=True)

from tavily import TavilyClient

key = os.getenv("TAVILY_API_KEYS", "").split(",")[0].strip()
print(f"Using key: {key[:15]}...")

client = TavilyClient(api_key=key)

# Test 1: basic search (no topic)
print("\n--- Test 1: Basic search ---")
try:
    r = client.search(query="AI news", search_depth="basic")
    print(f"✅ Works! Got {len(r.get('results', []))} results")
except Exception as e:
    print(f"❌ Failed: {e}")

# Test 2: with topic=news
print("\n--- Test 2: topic=news ---")
try:
    r = client.search(query="AI news", search_depth="basic", topic="news")
    print(f"✅ Works! Got {len(r.get('results', []))} results")
except Exception as e:
    print(f"❌ Failed: {e}")

# Test 3: with days parameter
print("\n--- Test 3: topic=news + days=7 ---")
try:
    r = client.search(query="AI news", search_depth="basic", topic="news", days=7)
    print(f"✅ Works! Got {len(r.get('results', []))} results")
except Exception as e:
    print(f"❌ Failed: {e}")