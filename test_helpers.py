import json
from compiler.crew import _compact
from compiler.tools.json_repair_tool import extract_json

db_schema = {
    "tables": [
        {
            "name": "Menu",
            "columns": [{"name": "id", "type": "int"}],
            "primary_key": "id",
            "foreign_keys": [],
            "indexes": [],
            "relations": []
        }
    ]
}

print("Original db_schema:")
print(json.dumps(db_schema, indent=2))

compacted = _compact(db_schema)
print("\nCompacted db_schema:")
print(compacted)

# Test extracting lists
raw_list = '[{"method": "GET", "path": "/test"}]'
print("\nExtracting list:")
parsed = extract_json(raw_list)
print(parsed)

# Test extracting prose
raw_prose = "I apologize, but I cannot generate this schema."
print("\nExtracting prose:")
try:
    parsed = extract_json(raw_prose)
    print(parsed)
except Exception as e:
    print(f"Exception: {e}")
