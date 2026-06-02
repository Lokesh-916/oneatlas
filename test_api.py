import urllib.request
import json

data = json.dumps({"prompt": "Build a simple to-do list app."}).encode('utf-8')
req = urllib.request.Request('http://localhost:8000/generate', data=data, headers={'Content-Type': 'application/json'})
with urllib.request.urlopen(req) as response:
    for line in response:
        print(line.decode('utf-8').strip())
