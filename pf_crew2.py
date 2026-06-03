path = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\crew.py"
with open(path, encoding="utf-8") as f:
    content = f.read()

# Find where session.repair_count += 1 is in _stage_repair
# and insert classification + logging after result is obtained
old = "            session.repair_report = result\n            session.repair_count += 1"
new = """            session.repair_report = result
            session.repair_count += 1

            # --- Feature F: classify repair strategy and log outcome ---
            errors_before = len((session.validation_report or {}).get("errors", []))
            strategy = _classify_repair_strategy(
                errors=(session.validation_report or {}).get("errors", []),
                validation_report=session.validation_report or {},
                attempt=attempt,
            )
            unresolved = result.get("unresolved_errors", [])
            errors_after = len(unresolved)
            outcome = (
                "escalated" if strategy == "ESCALATED"
                else "repaired" if errors_after < errors_before
                else "failed"
            )
            log_entry = {
                "attempt_number": attempt,
                "strategy": strategy,
                "error_input": "; ".join(
                    e.get("description", str(e)) if isinstance(e, dict) else str(e)
                    for e in (session.validation_report or {}).get("errors", [])[:3]
                ),
                "outcome": outcome,
                "errors_before": errors_before,
                "errors_after": errors_after,
            }
            if not hasattr(session, "repair_log"):
                session.repair_log = []
            session.repair_log.append(log_entry)
            logger.info(
                "[session:%s] Repair attempt=%d strategy=%s outcome=%s errors=%d->%d",
                session.session_id, attempt, strategy, outcome, errors_before, errors_after,
            )"""

if old in content:
    content = content.replace(old, new)
    print("PATCHED: repair classification and logging wired into _stage_repair")
else:
    print("WARN: target string not found")
    idx = content.find("session.repair_count += 1")
    print(repr(content[idx-100:idx+50]))

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Done")