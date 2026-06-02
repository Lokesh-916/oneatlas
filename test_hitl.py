import urllib.request
import json

data = json.dumps({
    "session_id": "db7e2288-d401-4f79-93bc-b46963bc9310",
    "answers": ["Yes", "Yes", "Yes"]
}).encode('utf-8')
req = urllib.request.Request('http://localhost:8000/clarify', data=data, headers={'Content-Type': 'application/json'})
try:
    with urllib.request.urlopen(req) as response:
        print(response.read().decode('utf-8'))
except Exception as e:
    print(e)
