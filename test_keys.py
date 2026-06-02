import os
from dotenv import load_dotenv
import litellm

load_dotenv()

keys = [v for k, v in os.environ.items() if k.startswith("GROQ_API_KEY") and v.strip()]

for i, key in enumerate(keys):
    print(f"\n--- Testing Key {i+1} ---")
    try:
        response = litellm.completion(
            model="groq/llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": "hello"}],
            api_key=key
        )
        print("SUCCESS! This key has quota.")
    except Exception as e:
        print(f"FAILED: {e}")
