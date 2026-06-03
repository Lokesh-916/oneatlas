path = r"C:\Users\lokes\Coding\AI\AgenticAI\oneatlas-appspec-engine\src\compiler\main.py"
with open(path, encoding="utf-8") as f:
    content = f.read()

# Add RepairRequest model near other request models
old_models = "class ModifyResponse(BaseModel):\n    status: str\n    message: str"
new_models = """class RepairRequest(BaseModel):
    stage: str
    error_hint: str = ""


class RepairResponse(BaseModel):
    status: str
    session_id: str
    repair_attempt: int


class ModifyResponse(BaseModel):
    status: str
    message: str"""

if old_models in content:
    content = content.replace(old_models, new_models)
    print("PATCHED: RepairRequest/RepairResponse models added")
else:
    print("WARN: ModifyResponse not found, appending models before /modify route")

# Add repair endpoint before the /modify route
repair_route = '''

@app.post("/generate/{session_id}/repair", response_model=RepairResponse)
async def manual_repair(session_id: str, req: RepairRequest):
    """
    Manually trigger a repair pass on a specific stage output.
    Accepts { stage, error_hint } — useful for testing the repair engine directly.
    Injects the error_hint into the repair task as an additional validation error
    and re-runs the repair stage. Does not restart the full pipeline.
    """
    session = await _get_session(session_id)

    if not session.validation_report:
        raise HTTPException(
            status_code=422,
            detail="No validation report available. Run the pipeline first."
        )

    # Build a synthetic error from the hint and inject it into the repair loop
    hint_error = {"layer": req.stage, "field": "manual", "description": req.error_hint or f"Manual repair triggered for stage: {req.stage}"}
    existing_errors = (session.validation_report or {}).get("errors", [])
    if req.error_hint:
        existing_errors = existing_errors + [hint_error]
        session.validation_report["errors"] = existing_errors

    logger.info("[manual_repair] session=%s stage=%s hint=%r", session_id, req.stage, req.error_hint)

    # Fire repair stage as a background task
    asyncio.create_task(_run_pipeline_safe(session))

    return RepairResponse(
        status="repair_queued",
        session_id=session_id,
        repair_attempt=session.repair_count + 1,
    )

'''

# Insert before /modify route
target = '\n@app.post("/modify", response_model=ModifyResponse)'
if target in content:
    content = content.replace(target, repair_route + target)
    print("PATCHED: /generate/{session_id}/repair route added")
else:
    # fallback: append before /result
    target2 = '\n@app.get("/result/{session_id}")'
    if target2 in content:
        content = content.replace(target2, repair_route + target2)
        print("PATCHED: repair route added before /result")
    else:
        print("WARN: could not find insertion point")

with open(path, "w", encoding="utf-8", newline="\n") as f:
    f.write(content)
print("main.py updated")