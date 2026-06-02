import asyncio
import os
import json
from compiler.crew import ProtoFlowCrew
import litellm
litellm.drop_params = True
from crewai import Crew, Agent, Task

async def main():
    crew_instance = ProtoFlowCrew()
    
    prompt = "Build a personal Task Management web application. Users can sign up, log in, create projects, and add tasks to those projects. Each task has a title, description, due date, and status (todo, in-progress, done). Users can only see and edit their own projects and tasks. There is no premium tier, no billing, and no admin dashboard—the app is completely free and self-serve. Use JWT for authentication."
    arch_json = "{}"
    
    print("Kicking off DB Schema task...")
    
    agent = crew_instance.db_schema_agent()
    task = getattr(crew_instance, "task_generate_db_schema")()
    task.agent = agent
    
    inputs = {
        "architecture_schema": arch_json,
        "user_prompt": prompt,
    }
    
    temp_crew = Crew(
        agents=[agent],
        tasks=[task],
        verbose=True,
        memory=False,
        cache=False
    )
    
    try:
        result = temp_crew.kickoff(inputs=inputs)
        print("RAW OUTPUT:")
        print(result.raw)
    except Exception as e:
        print(f"Exception: {e}")

if __name__ == "__main__":
    asyncio.run(main())
