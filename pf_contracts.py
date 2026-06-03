path = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\schemas\contracts.py"
with open(path, encoding="utf-8") as f:
    lines = f.readlines()

# Find DiffEntry class (line 488, 0-indexed 487)
diff_entry_line = None
repair_report_line = None
for i, line in enumerate(lines):
    if "class DiffEntry(BaseModel):" in line:
        diff_entry_line = i
    if "class RepairReport(BaseModel):" in line:
        repair_report_line = i

print(f"DiffEntry at line {diff_entry_line+1}, RepairReport at line {repair_report_line+1}")

# Insert RepairStrategy enum and RepairLogEntry BEFORE DiffEntry
insert_before_diff = diff_entry_line

new_classes = [
    "\n",
    "# ---------------------------------------------------------------------------\n",
    "# Repair Strategy Classification (Feature F)\n",
    "# ---------------------------------------------------------------------------\n",
    "\n",
    "class RepairStrategy(str):\n",
    '    """Repair strategy label. One of: STRUCTURAL, FIELD, CONSISTENCY, ESCALATED."""\n',
    "    STRUCTURAL  = \"STRUCTURAL\"   # JSON parse failure, malformed/truncated output\n",
    "    FIELD       = \"FIELD\"        # Missing required field, wrong type\n",
    "    CONSISTENCY = \"CONSISTENCY\"  # Cross-layer reference mismatch\n",
    "    ESCALATED   = \"ESCALATED\"    # Unresolved errors after 2+ attempts -> HITL\n",
    "\n",
    "\n",
    "class RepairLogEntry(BaseModel):\n",
    '    """One repair attempt log entry — logged whether repair succeeded or failed."""\n',
    "    attempt_number: int = Field(description=\"Repair attempt number (1-indexed).\")\n",
    "    strategy: str = Field(\n",
    "        description=\"Classified strategy: STRUCTURAL | FIELD | CONSISTENCY | ESCALATED.\"\n",
    "    )\n",
    "    error_input: str = Field(\n",
    "        description=\"The error description that triggered this repair attempt.\"\n",
    "    )\n",
    "    outcome: str = Field(\n",
    "        description=\"Result of this attempt: repaired | escalated | failed.\"\n",
    "    )\n",
    "    errors_before: int = Field(default=0, description=\"Number of errors before repair.\")\n",
    "    errors_after: int = Field(default=0, description=\"Number of errors after repair.\")\n",
    "\n",
    "\n",
]

for i, line in enumerate(new_classes):
    lines.insert(insert_before_diff + i, line)

# Re-scan for RepairReport after insertion
for i, line in enumerate(lines):
    if "class RepairReport(BaseModel):" in line:
        repair_report_line = i
        break

# Find the closing ) of unresolved_errors field in RepairReport to add repair_log after it
# Look for the last field in RepairReport
unresolved_close = None
for i in range(repair_report_line, min(repair_report_line + 30, len(lines))):
    if "unresolved_errors" in lines[i]:
        # Find closing )
        for j in range(i, min(i + 5, len(lines))):
            if lines[j].strip() == ")":
                unresolved_close = j
                break
        break

if unresolved_close:
    print(f"unresolved_errors closes at line {unresolved_close+1}")
    repair_log_field = [
        "    repair_log: List[RepairLogEntry] = Field(\n",
        "        default_factory=list,\n",
        "        description=\"Per-attempt repair log with strategy, error, and outcome.\"\n",
        "    )\n",
    ]
    for i, line in enumerate(repair_log_field):
        lines.insert(unresolved_close + 1 + i, line)
    print("repair_log field added to RepairReport")
else:
    print("WARN: could not find unresolved_errors closing paren")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.writelines(lines)

print("contracts.py updated")
with open(path, encoding="utf-8") as f:
    content = f.read()
for check in ["class RepairStrategy", "class RepairLogEntry", "repair_log"]:
    print(f"  {check}: {'FOUND' if check in content else 'MISSING'}")