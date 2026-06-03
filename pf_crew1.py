path = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\crew.py"
with open(path, encoding="utf-8") as f:
    content = f.read()

# 1. Add _classify_repair_strategy function after _llm_for_agent
classifier_code = '''

def _classify_repair_strategy(errors: list, validation_report: dict, attempt: int) -> str:
    """
    Deterministic repair strategy classifier.
    Returns one of: STRUCTURAL, FIELD, CONSISTENCY, ESCALATED.

    Priority order:
      1. ESCALATED  — attempt >= 2 with errors still present
      2. STRUCTURAL — JSON parse failure indicators
      3. CONSISTENCY — cross-layer reference keywords
      4. FIELD      — everything else (missing/wrong field)
    """
    # ESCALATED: persistent errors after multiple attempts
    if attempt >= 2 and errors:
        return "ESCALATED"

    # Combine all error descriptions into one lowercase string for pattern matching
    all_errors = " ".join(
        e.get("description", str(e)) if isinstance(e, dict) else str(e)
        for e in errors
    ).lower()

    # Also check if the report itself indicates a parse failure (empty report)
    is_empty_report = not validation_report or (
        not validation_report.get("errors") and
        not validation_report.get("warnings") and
        not validation_report.get("validated_at")
    )

    # STRUCTURAL: JSON/parse/format failures
    structural_keywords = [
        "json", "parse", "malformed", "truncated", "invalid json",
        "could not extract", "empty", "syntax error", "decode error",
        "format", "missing json", "not valid"
    ]
    if is_empty_report or any(kw in all_errors for kw in structural_keywords):
        return "STRUCTURAL"

    # CONSISTENCY: cross-layer reference mismatches
    consistency_keywords = [
        "not found in", "references", "does not exist", "missing entity",
        "missing table", "endpoint references", "page references",
        "role not defined", "undefined role", "foreign key", "cross-layer",
        "mismatch", "no corresponding", "no matching", "orphan",
        "inconsistent", "referenced", "not in schema"
    ]
    if any(kw in all_errors for kw in consistency_keywords):
        return "CONSISTENCY"

    # FIELD: default for missing/wrong field type errors
    return "FIELD"

'''

# Insert after _llm_for_agent function definition
old_marker = "def _llm_for_agent(agent_name: str)"
# Find the end of _llm_for_agent (next blank line after its return statement)
idx = content.find(old_marker)
# Find the closing return of _llm_for_agent
return_idx = content.find("return LLM(model=primary, temperature=temp)", idx)
# Find the next double newline after return
end_of_fn = content.find("\n\n", return_idx)
if end_of_fn == -1:
    print("WARN: could not find end of _llm_for_agent")
else:
    content = content[:end_of_fn] + classifier_code + content[end_of_fn:]
    print("PATCHED: _classify_repair_strategy inserted")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

print("Done")
for check in ["_classify_repair_strategy", "STRUCTURAL", "ESCALATED", "CONSISTENCY"]:
    print(f"  {check}: {content.count(check)}x")