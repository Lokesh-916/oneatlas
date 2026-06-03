# Patch PipelineSession, pipeline_complete, /result, and eval recorder
import json

# --- crew.py ---
path_crew = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\crew.py"
with open(path_crew, encoding="utf-8") as f:
    content = f.read()

# Add repair_log to PipelineSession.__init__
old = "        self.stage_costs: dict[str, float] = {}  # stage -> estimated USD cost"
new = ("        self.stage_costs: dict[str, float] = {}  # stage -> estimated USD cost\n"
       "        self.repair_log: list = []               # Feature F: per-attempt repair log")
if old in content:
    content = content.replace(old, new)
    print("PATCHED: repair_log in PipelineSession")

# Add repair_log to final_schema in pipeline_complete
old2 = '"app_spec": session.app_spec,'
new2 = ('"app_spec": session.app_spec,\n'
        '        "repair_log": getattr(session, "repair_log", []),')
if old2 in content:
    content = content.replace(old2, new2)
    print("PATCHED: repair_log in pipeline_complete final_schema")

with open(path_crew, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)

# --- main.py ---
path_main = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\main.py"
with open(path_main, encoding="utf-8") as f:
    cm = f.read()

old3 = '"app_spec": getattr(session, "app_spec", None),'
new3 = ('"app_spec": getattr(session, "app_spec", None),\n'
        '        "repair_log": getattr(session, "repair_log", []),')
if old3 in cm:
    cm = cm.replace(old3, new3)
    print("PATCHED: repair_log in /result endpoint")
else:
    print("WARN: app_spec not found in main.py result")

with open(path_main, "w", encoding="utf-8", newline="\n") as f:
    f.write(cm)

print("Done")