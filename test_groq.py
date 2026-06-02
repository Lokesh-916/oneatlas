import asyncio
import json
from compiler.crew import ProtoFlowCrew

async def test_groq():
    print("Testing DB schema generation...")
    crew = ProtoFlowCrew().crew()
    # Find db schema task
    task = next((t for t in crew.tasks if t.name == "task_generate_db_schema"), None)
    if not task:
        print("Task not found.")
        return
        
    print(f"Task found: {task.name}")
    from compiler.crew import _kickoff_task, Session
    
    # Create dummy session
    session = Session(
        session_id="test-123",
        prompt="Build a CRM",
        intent={"app_type": "crm", "features": ["contacts"]},
        architecture={"entities": [{"name": "contacts"}], "relations": []}
    )
    
    try:
        # Mock run stage
        result = await _kickoff_task(
            "task_generate_db_schema",
            {
                "user_prompt": session.prompt,
                "intent_schema": json.dumps(session.intent),
                "architecture_schema": json.dumps(session.architecture),
            },
            session=session
        )
        print("RESULT:")
        print(result)
    except Exception as e:
        print(f"ERROR: {e}")

if __name__ == "__main__":
    asyncio.run(test_groq())
