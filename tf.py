print("=== TEST 1: RepairStrategy + RepairLogEntry models ===")
from compiler.schemas.contracts import RepairLogEntry, RepairReport

entry = RepairLogEntry(
    attempt_number=1,
    strategy="STRUCTURAL",
    error_input="JSON parse failure on validator output",
    outcome="repaired",
    errors_before=3,
    errors_after=0
)
assert entry.strategy == "STRUCTURAL"
assert entry.outcome == "repaired"
print("PASS: RepairLogEntry model OK")

rr = RepairReport(
    repairs=[], updated_schemas={}, repair_attempt_number=1, unresolved_errors=[],
    repair_log=[entry]
)
assert len(rr.repair_log) == 1
assert rr.repair_log[0].strategy == "STRUCTURAL"
print("PASS: RepairReport.repair_log field OK")

print("=== TEST 2: _classify_repair_strategy deterministic rules ===")
from compiler.crew import _classify_repair_strategy

# STRUCTURAL: empty/parse-fail report
s1 = _classify_repair_strategy([], {}, attempt=1)
assert s1 == "STRUCTURAL", f"Got {s1}"
print("PASS: empty report -> STRUCTURAL")

# STRUCTURAL: json error keywords
s2 = _classify_repair_strategy(
    [{"description": "JSON parse failure in validator output"}], 
    {"validated_at": "2026", "errors": [{"description": "JSON parse failure"}]},
    attempt=1
)
assert s2 == "STRUCTURAL", f"Got {s2}"
print("PASS: JSON keyword -> STRUCTURAL")

# CONSISTENCY: cross-layer reference error
s3 = _classify_repair_strategy(
    [{"description": "Page /deals references entity Deal which does not exist in schema"}],
    {"validated_at": "2026", "errors": [{"description": "references entity not found"}]},
    attempt=1
)
assert s3 == "CONSISTENCY", f"Got {s3}"
print("PASS: reference keyword -> CONSISTENCY")

# FIELD: missing required field
s4 = _classify_repair_strategy(
    [{"description": "Column email is required but missing in users table"}],
    {"validated_at": "2026", "errors": [{"description": "required but missing"}]},
    attempt=1
)
assert s4 == "FIELD", f"Got {s4}"
print("PASS: missing field -> FIELD")

# ESCALATED: attempt >= 2 with errors
s5 = _classify_repair_strategy(
    [{"description": "still broken after repair"}],
    {"validated_at": "2026", "errors": [{"description": "still broken"}]},
    attempt=2
)
assert s5 == "ESCALATED", f"Got {s5}"
print("PASS: attempt>=2 with errors -> ESCALATED")

print("=== TEST 3: PipelineSession has repair_log ===")
from compiler.crew import PipelineSession
sess = PipelineSession("s1", "test")
assert hasattr(sess, "repair_log")
assert sess.repair_log == []
print("PASS: PipelineSession.repair_log initialized as []")

print("=== TEST 4: /result endpoint includes repair_log ===")
import inspect
from compiler.main import result as result_fn
src = inspect.getsource(result_fn)
assert "repair_log" in src
print("PASS: repair_log in /result endpoint")

print("=== TEST 5: eval recorder has repair_strategies_used ===")
from compiler.eval.recorder import record_auto_metrics
src2 = inspect.getsource(record_auto_metrics)
assert "repair_strategies_used" in src2
assert "repair_log" in src2
print("PASS: repair_strategies_used and repair_log in recorder")

print("=== TEST 6: strategy covers all four labels ===")
labels = set()
for errors, report, attempt in [
    ([], {}, 1),
    ([{"description": "json parse error"}], {"validated_at":"t","errors":[{"description":"json parse"}]}, 1),
    ([{"description": "entity references missing table"}], {"validated_at":"t","errors":[{"description":"references missing"}]}, 1),
    ([{"description": "required field email missing"}], {"validated_at":"t","errors":[{"description":"required field"}]}, 1),
    ([{"description": "still broken"}], {"validated_at":"t","errors":[{"description":"broken"}]}, 2),
]:
    labels.add(_classify_repair_strategy(errors, report, attempt))
assert labels == {"STRUCTURAL", "CONSISTENCY", "FIELD", "ESCALATED"}, f"Got {labels}"
print("PASS: all four strategy labels produced:", labels)

print()
print("ALL FEATURE F TESTS PASSED")