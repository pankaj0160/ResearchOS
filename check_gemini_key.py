import urllib.request, json, sys

API_KEY = input("Paste your GOOGLE_API_KEY: ").strip()

print("\nChecking available models for your key...")
url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}"
try:
    with urllib.request.urlopen(url, timeout=10) as r:
        data = json.loads(r.read())
    embedding_models = [
        m["name"] for m in data.get("models", [])
        if "embedContent" in m.get("supportedGenerationMethods", [])
    ]
    print("\nEmbedding models available for your key:")
    for m in embedding_models:
        print(f"  {m}")
except Exception as e:
    print(f"Error: {e}")