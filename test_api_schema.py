import asyncio
import os
import json
from compiler.crew import ProtoFlowCrew
from crewai import Crew, Agent, Task

async def main():
    crew_instance = ProtoFlowCrew()
    
    # Mock data
    prompt = "Restaurant management system with menu management by admins, table QR code ordering by customers, kitchen display system showing live order queue, order status tracking (received, preparing, ready, delivered), staff roles (admin, kitchen, waiter), daily sales reports, and integration with a third-party payment terminal via webhook."
    arch_json = "{}"
    db_schema = '{"tables": [{"name": "Menu", "columns": [{"name": "id", "type": "int"}]}]}'
    
    # Try to kickoff the api schema task
    print("Kicking off API Schema task...")
    
    # Fake session
    class FakeSession:
        session_id = "test_session_123"
        total_tokens = 0
    
    import compiler.crew
    # We can't easily mock the internal _kickoff_task properly since it relies on session.
    # Let's just create a raw Crew execution
    agent = crew_instance.api_schema_agent()
    task = getattr(crew_instance, "task_generate_api_schema")()
    task.agent = agent
    
    inputs = {
        "architecture_schema": arch_json,
        "db_schema": db_schema,
        "user_prompt": prompt,
    }
    
    temp_crew = Crew(
        agents=[agent],
        tasks=[task],
        verbose=True,
        memory=False
    )
    
    print("Running crew...")
    result = temp_crew.kickoff(inputs=inputs)
    print("RAW OUTPUT:")
    print(result.raw)

if __name__ == "__main__":
    asyncio.run(main())
