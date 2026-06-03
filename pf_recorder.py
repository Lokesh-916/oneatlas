path = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\eval\recorder.py"
with open(path, encoding="utf-8") as f:
    content = f.read()

# Add repair_strategies_used to auto_metrics
old = '"workflow_stubs_generated": len(getattr(session, "workflow_stubs", None) or [])'
new = ('"workflow_stubs_generated": len(getattr(session, "workflow_stubs", None) or []),\n'
       '            "repair_strategies_used": list(set(\n'
       '                entry.get("strategy", "UNKNOWN")\n'
       '                for entry in (getattr(session, "repair_log", None) or [])\n'
       '                if isinstance(entry, dict)\n'
       '            )),\n'
       '            "repair_log": getattr(session, "repair_log", [])')

if old in content:
    content = content.replace(old, new)
    print("PATCHED: repair_strategies_used in recorder")
else:
    print("WARN: target not found in recorder.py")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("Done")