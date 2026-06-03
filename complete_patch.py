"""
complete_backend_patch.py
All remaining tier 1/2/3 patches for OneAtlas AppSpec Engine backend.
"""
import os, re

ROOT = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine"

def rf(p): 
    with open(os.path.join(ROOT, p), encoding="utf-8") as f: return f.read()

def wf(p, c):
    with open(os.path.join(ROOT, p), "w", encoding="utf-8", newline="\n") as f: f.write(c)

def ok(msg): print(f"  OK: {msg}")
def warn(msg): print(f"  WARN: {msg}")

# ─────────────────────────────────────────────────────────────────────────────
# 1. crew.py — fix _build_app_spec to extract app_name, add layout to pages,
#    add handler_description/rate_limit_flag to endpoints, add stage_start SSE
# ─────────────────────────────────────────────────────────────────────────────
print("=== Patching crew.py ===")
crew = rf("src/compiler/crew.py")

# 1a. app_name extraction in _build_app_spec
if 'app_name=str(app_type).replace("_", " ").title(),' in crew:
    crew = crew.replace(
        'app_name=str(app_type).replace("_", " ").title(),',
        'app_name=(intent.get("app_name", "") if isinstance(intent, dict) else getattr(intent, "app_name", "")) or str(app_type).replace("_", " ").title(),'
    )
    ok("app_name extraction from intent")
else:
    warn("app_name line not found in _build_app_spec")

# 1b. Add layout field to AppSpecPage assembly (in pages loop)
# Find "bound = None" and add layout derivation after the bound_entity logic
old_bound = '''            pages.append(AppSpecPage(path=pth, title=ttl, role_required=role, bound_entity=bound))'''
new_bound = '''            # Derive layout from page path heuristics
            layout = "list"
            if any(kw in pth.lower() for kw in [":id", "/detail", "/view", "/edit"]):
                layout = "detail"
            elif any(kw in pth.lower() for kw in ["/dashboard", "/analytics", "/report", "/overview"]):
                layout = "dashboard"
            elif any(kw in pth.lower() for kw in ["/settings", "/profile", "/config", "/preferences"]):
                layout = "settings"
            pages.append(AppSpecPage(path=pth, title=ttl, role_required=role, bound_entity=bound, layout=layout))'''
if old_bound in crew:
    crew = crew.replace(old_bound, new_bound)
    ok("layout field added to AppSpecPage assembly")
else:
    warn("AppSpecPage append line not found")

# 1c. Add handler_description and rate_limit_flag to AppSpecEndpoint assembly
old_ep = '''            if pth:
                api_endpoints.append(AppSpecEndpoint(method=str(m), path=str(pth), auth_required=bool(ar), required_role=rr))'''
new_ep = '''            if pth:
                # Derive handler description from method + path
                handler_desc = ep.get("description", "") if isinstance(ep, dict) else getattr(ep, "description", "")
                if not handler_desc:
                    handler_desc = f"{m} {pth}"
                # Rate limit flag: POST/PUT endpoints or paths with /upload /export
                rate_limit = any(kw in str(pth).lower() for kw in ["/upload", "/export", "/bulk", "/import"])
                if str(m).upper() in ("POST", "PUT", "PATCH") and "admin" in str(rr or "").lower():
                    rate_limit = True
                api_endpoints.append(AppSpecEndpoint(
                    method=str(m), path=str(pth), auth_required=bool(ar),
                    required_role=rr, handler_description=handler_desc,
                    rate_limit_flag=rate_limit
                ))'''
if old_ep in crew:
    crew = crew.replace(old_ep, new_ep)
    ok("handler_description and rate_limit_flag added to endpoints")
else:
    warn("AppSpecEndpoint append line not found")

# 1d. Add stage_start as distinct SSE event (emit running status BEFORE the stage coro runs)
# In _run_stage, the first emit has status="running" — add event_type="stage_start" alias
old_running_emit = '''    await _emit(session, "stage_update", {
        "stage": stage_name,
        "status": "running",
        "model": model,
        "latency_ms": 0,
        "output_summary": "",
    })'''
new_running_emit = '''    await _emit(session, "stage_update", {
        "stage": stage_name,
        "status": "running",
        "model": model,
        "latency_ms": 0,
        "output_summary": "",
    })
    # Also emit stage_start as a distinct event type (assignment requirement)
    await _emit(session, "stage_start", {
        "stage": stage_name,
        "model": model,
        "timestamp": int(time.monotonic() * 1000),
    })'''
if old_running_emit in crew:
    crew = crew.replace(old_running_emit, new_running_emit)
    ok("stage_start SSE event added")
else:
    warn("_run_stage running emit block not found")

# 1e. Add stage_complete and generation_complete SSE events
old_complete_emit = '''        await _emit(session, "stage_update", {
            "stage": stage_name,
            "status": "complete",
            "model": model,
            "latency_ms": latency_ms,
            "output_summary": summary,
        })'''
new_complete_emit = '''        await _emit(session, "stage_update", {
            "stage": stage_name,
            "status": "complete",
            "model": model,
            "latency_ms": latency_ms,
            "output_summary": summary,
        })
        # Also emit stage_complete as distinct event type
        await _emit(session, "stage_complete", {
            "stage": stage_name,
            "latency_ms": latency_ms,
            "model": model,
        })'''
if old_complete_emit in crew:
    crew = crew.replace(old_complete_emit, new_complete_emit)
    ok("stage_complete SSE event added")
else:
    warn("_run_stage complete emit block not found")

# 1f. Add generation_complete alias to pipeline_complete event
old_pipe_complete = '''    await _emit(session, "pipeline_complete", {'''
new_pipe_complete = '''    # Emit generation_complete as alias (assignment requirement)
    await _emit(session, "generation_complete", {
        "total_latency_ms": total_ms,
        "session_id": session.session_id,
    })
    await _emit(session, "pipeline_complete", {'''
if old_pipe_complete in crew:
    crew = crew.replace(old_pipe_complete, new_pipe_complete, 1)
    ok("generation_complete SSE event added")
else:
    warn("pipeline_complete emit not found")

# 1g. Field repair: add narrow re-prompt logic in _stage_repair
# After the repair result is obtained, if strategy==FIELD and unresolved, re-prompt the specific field
old_repair_count = '''            session.repair_count += 1

            # --- Feature F: classify repair strategy and log outcome ---'''
new_repair_count = '''            session.repair_count += 1

            # --- Feature F: classify repair strategy and log outcome ---
            # FIELD repair: if errors are field-type, attempt narrow re-prompt
            _field_errors = [e for e in (session.validation_report or {}).get("errors", [])
                             if isinstance(e, dict) and "field" in e.get("layer", "").lower() + e.get("description", "").lower()]
            if _field_errors and attempt == 1:
                for _fe in _field_errors[:2]:  # re-prompt up to 2 field errors in isolation
                    _field_desc = _fe.get("description", "")
                    _field_name = _fe.get("field", "unknown_field")
                    logger.info("[session:%s] FIELD repair: re-prompting field=%s", session.session_id, _field_name)
                    try:
                        _narrow_result = await _kickoff_task(
                            "task_repair_schemas",
                            {
                                "validation_report": f'{{"errors": [{json.dumps(_fe)}]}}',
                                "all_schemas": _compact({
                                    "db_schema": session.db_schema,
                                    "api_schema": session.api_schema,
                                }),
                                "repair_attempt_number": attempt,
                                "user_prompt": f"Fix only this field error: {_field_desc}",
                            }
                        )
                        _narrow_updated = _narrow_result.get("updated_schemas", {})
                        for _k in {"db_schema", "api_schema"} & set(_narrow_updated.keys()):
                            if isinstance(_narrow_updated[_k], dict):
                                setattr(session, _k, _narrow_updated[_k])
                                logger.info("[session:%s] FIELD repair applied to %s", session.session_id, _k)
                    except Exception as _fe_exc:
                        logger.warning("[session:%s] FIELD narrow re-prompt failed: %s", session.session_id, _fe_exc)'''
if old_repair_count in crew:
    crew = crew.replace(old_repair_count, new_repair_count)
    ok("FIELD repair narrow re-prompt added")
else:
    warn("repair_count block not found for field repair")

wf("src/compiler/crew.py", crew)
print("crew.py saved")

# ─────────────────────────────────────────────────────────────────────────────
# 2. main.py — add stage_start/stage_complete/generation_complete to SSE handlers
#    and update the static MODEL_MAP to reflect routing config
# ─────────────────────────────────────────────────────────────────────────────
print("=== Patching main.py ===")
main = rf("src/compiler/main.py")

# Add new SSE event types to useSSE frontend client awareness comment
old_sse_types = '''# All route handlers are async. All file I/O uses aiofiles.
# All LLM calls go through Groq via crewai LiteLLM routing.'''
new_sse_types = '''# All route handlers are async. All file I/O uses aiofiles.
# All LLM calls go through routing.yaml (Groq/Gemini/OpenRouter).
# SSE event types: stage_update, stage_start, stage_complete, stage_failed,
#                  generation_complete, pipeline_complete, pipeline_failed,
#                  hitl_required, log_update, ping, modification_applied'''
if old_sse_types in main:
    main = main.replace(old_sse_types, new_sse_types)
    ok("SSE event types documented in main.py")

# Update the static MODEL_MAP to say "from routing.yaml"  
old_model_map = '''_MODEL_MAP = {
    "intent_extractor":  "groq/llama-3.3-70b-versatile",'''
new_model_map = '''# Model map is now driven by routing.yaml via _llm_for_agent()
# This dict is kept for startup logging only
_MODEL_MAP = {
    "intent_extractor":  "groq/llama-3.3-70b-versatile (routing.yaml)",'''
if old_model_map in main:
    main = main.replace(old_model_map, new_model_map)
    ok("MODEL_MAP comment updated")

wf("src/compiler/main.py", main)
print("main.py saved")

# ─────────────────────────────────────────────────────────────────────────────
# 3. routing.yaml — add GEMINI_API_KEY note and update fallback note
# ─────────────────────────────────────────────────────────────────────────────
print("=== Patching routing.yaml ===")
routing = rf("src/compiler/config/routing.yaml")
old_gemini = '''  gemini:
    api_key_env: GEMINI_API_KEY'''
new_gemini = '''  gemini:
    api_key_env: GEMINI_API_KEY   # Set GEMINI_API_KEY in .env (not GOOGLE_API_KEY)'''
if old_gemini in routing:
    routing = routing.replace(old_gemini, new_gemini)
    ok("GEMINI_API_KEY note added to routing.yaml")
wf("src/compiler/config/routing.yaml", routing)
print("routing.yaml saved")

# ─────────────────────────────────────────────────────────────────────────────
# 4. .env.example — add GEMINI_API_KEY
# ─────────────────────────────────────────────────────────────────────────────
print("=== Patching .env.example ===")
env_ex = rf(".env.example")
if "GEMINI_API_KEY" not in env_ex:
    env_ex = env_ex.replace(
        "GROQ_API_KEY=",
        "GROQ_API_KEY=\nGEMINI_API_KEY=\nOPENROUTER_API_KEY="
    )
    # Remove duplicates if any
    lines_env = []
    seen = set()
    for line in env_ex.splitlines():
        key = line.split("=")[0].strip()
        if key and key in seen:
            continue
        if key:
            seen.add(key)
        lines_env.append(line)
    env_ex = "\n".join(lines_env)
    wf(".env.example", env_ex)
    ok("GEMINI_API_KEY added to .env.example")
else:
    ok("GEMINI_API_KEY already in .env.example")

# ─────────────────────────────────────────────────────────────────────────────
# 5. registry.py — update the implemented count in docstring (google_sheets now implemented)
# ─────────────────────────────────────────────────────────────────────────────
print("=== Checking registry.py docstring ===")
registry = rf("src/compiler/integrations/registry.py")
implemented_count = len([k for k in ["slack","gmail","stripe","whatsapp","webhook","google_sheets"]
                          if f'id="{k}"' in registry and 'is_stub=False' in registry[registry.find(f'id="{k}"'):registry.find(f'id="{k}"')+200]])
ok(f"Implemented integrations in registry: {implemented_count}")

# ─────────────────────────────────────────────────────────────────────────────
# 6. tasks.yaml — confirm app_name in intent task
# ─────────────────────────────────────────────────────────────────────────────
print("=== Checking tasks.yaml ===")
tasks = rf("src/compiler/config/tasks.yaml")
if "app_name" in tasks:
    ok("app_name in task_extract_intent YAML")
else:
    warn("app_name NOT in tasks.yaml — adding...")
    tasks = tasks.replace(
        "    - app_type: the category of application",
        "    - app_name: a short human-readable name for the application (e.g. Real Estate CRM)\n    - app_type: the category of application - must be one of: crm | project_management | ecommerce | hr_tool | inventory | content_platform | analytics | custom"
    )
    wf("src/compiler/config/tasks.yaml", tasks)
    ok("app_name added to tasks.yaml")

print()
print("ALL PATCHES COMPLETE")