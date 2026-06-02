"""
crew.py — ProtoFlow Pipeline Orchestrator
─────────────────────────────────────────
Assembles the CrewAI crew from YAML config and runs the full pipeline.

Key responsibilities:
  - Load agents and tasks from config/agents.yaml and config/tasks.yaml
  - Fan out parallel stages (db, api, ui, auth) via asyncio.gather
  - Run the repair loop (max 3 attempts) after validation failures
  - Emit SSE events at every stage transition
  - Hold the pipeline on HITL events using asyncio.Event
  - Write structured logs via the logging module (remove debug calls later)

All LLM calls go through Groq via crewai LiteLLM routing. Temperature is set per-agent via
the LLM config in main.py (not in YAML, because YAML does not support
the full LLM config object).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import re
import time
from typing import TYPE_CHECKING, Any, Callable, Coroutine, Optional

import yaml as _yaml
import litellm

# Monkey-patch litellm to strip `cache_breakpoint` from messages.
# CrewAI 1.14+ injects this for Anthropic, but Groq strictly rejects it with a 400 Bad Request.
original_completion = litellm.completion
def patched_completion(*args, **kwargs):
    if "messages" in kwargs:
        for msg in kwargs["messages"]:
            if "cache_breakpoint" in msg:
                del msg["cache_breakpoint"]
    return original_completion(*args, **kwargs)
litellm.completion = patched_completion

from crewai import Agent, Crew, LLM, Process, Task
from crewai.project import CrewBase, agent, crew, task
from crewai.agents.agent_builder.base_agent import BaseAgent
from compiler.tools.json_repair_tool import extract_json

if TYPE_CHECKING:
    from compiler.schemas.contracts import (
        ValidationReport,
        RepairReport,
        FinalOutput,
    )

logger = logging.getLogger("protoflow.crew")

SSEEmitter = Callable[[str, str, dict], Coroutine[Any, Any, None]]

MAX_REPAIR_LOOPS = int(os.getenv("MAX_REPAIR_LOOPS", "3"))
HITL_TIMEOUT_SECONDS = int(os.getenv("HITL_TIMEOUT_SECONDS", "300"))

import random
# Load all available Groq API keys from env
GROQ_KEYS = []
for k, v in os.environ.items():
    if k.startswith("GROQ_API_KEY") and v.strip():
        GROQ_KEYS.extend([key.strip() for key in v.split(",") if key.strip()])
GROQ_KEYS = list(set(GROQ_KEYS))
if GROQ_KEYS:
    os.environ["GROQ_API_KEY"] = GROQ_KEYS[0]


# ── Schema compaction ─────────────────────────────────────────────────────────


def _compact(data: Optional[dict]) -> str:
    """Strip verbose text fields to reduce token count for downstream LLM calls.
    Removes description, default_value, error_responses, navigation_links,
    props, and validation fields recursively. Keeps all structural fields
    (names, types, paths, columns, endpoints, roles, permissions).
    """
    if not data:
        return "{}"
    _VERBOSE = frozenset({
        "description", "backstory", "default_value",
        "error_responses", "navigation_links", "props", "validation",
    })
    def _rec(obj: Any) -> Any:
        if isinstance(obj, dict):
            return {k: _rec(v) for k, v in obj.items() if k not in _VERBOSE}
        if isinstance(obj, list):
            return [_rec(i) for i in obj]
        return obj
    return json.dumps(_rec(data), separators=(',', ':'))


def _outline(data: Optional[dict]) -> str:
    """Ultra-compact schema outline for validation/repair/runtime inputs.
    Only retains structural keys (names, types, paths, methods, roles)
    and drops all detail arrays deeper than 1 level. This keeps token
    count low enough to fit in a single Groq request even for large apps.
    """
    if not data:
        return "{}"
    # Top-level keys to keep per schema type, with how many items to show
    def _summarise(obj: Any, depth: int = 0) -> Any:
        if depth >= 2:
            # At depth 2+, only return primitive values or list length
            if isinstance(obj, list):
                return f"[{len(obj)} items]"
            if isinstance(obj, dict):
                return f"{{{len(obj)} keys}}"
            return obj
        if isinstance(obj, dict):
            KEEP = frozenset({
                "name", "table", "path", "method", "type", "role",
                "role_required", "auth_required", "required_role",
                "tables", "endpoints", "pages", "roles",
                "permissions_matrix", "auth_strategy", "entities",
                "relations", "primary_key", "nullable", "data_type",
                "references_table", "from_entity", "to_entity",
                "submit_endpoint", "api_endpoint", "cardinality",
                "is_valid", "errors", "warnings", "conflicts",
            })
            return {k: _summarise(v, depth + 1) for k, v in obj.items() if k in KEEP}
        if isinstance(obj, list):
            return [_summarise(i, depth + 1) for i in obj]
        return obj
    return json.dumps(_summarise(data), separators=(',', ':'))



# ── CrewBase class ────────────────────────────────────────────────────────────


def _sanitize_mermaid(source: str, diagram_hint: str = "") -> str:
    """Fix the two most common LLM Mermaid syntax errors so diagrams render.

    1. -->|label|>  (extra trailing >) → -->|label|
       The LLM sometimes appends a '>' after the closing '|' of an edge label,
       which is invalid in Mermaid's flowchart grammar.

    2. 'style X fill:...' inside sequenceDiagram or erDiagram.
       Those diagram types don't support the 'style' keyword — only flowcharts
       do. Strip any line that starts with 'style ' in those diagram types.
    """
    if not source:
        return source

    # Normalise escaped newlines (LLM sometimes returns \\n literals)
    src = source.replace("\\n", "\n")

    # Fix 1: -->|label|>  →  -->|label|
    import re
    src = re.sub(r'(\|[^|]*\|)>', r'\1', src)

    # Fix 2: strip 'style ...' lines for diagram types that don't support it
    needs_strip = False
    first_line = src.strip().split("\n")[0] if src.strip() else ""
    if "sequenceDiagram" in src or diagram_hint == "sequence":
        needs_strip = True
    if "erDiagram" in src or diagram_hint == "er":
        needs_strip = True

    if needs_strip:
        cleaned = []
        for line in src.split("\n"):
            stripped = line.strip()
            if stripped.startswith("style ") and ("fill:" in stripped or "stroke:" in stripped):
                continue  # drop invalid style line
            cleaned.append(line)
        src = "\n".join(cleaned)

    return src


@CrewBase
class ProtoFlowCrew:
    """
    ProtoFlow compiler crew.
    Agents and tasks are loaded from config/agents.yaml and config/tasks.yaml.
    Python code here only wires tools and assembles the crew — no agent logic.
    """

    agents: list[BaseAgent]
    tasks: list[Task]

    agents_config = "config/agents.yaml"
    tasks_config = "config/tasks.yaml"

    # ── Agent factory methods ─────────────────────────────────────────────────

    @agent
    def intent_extractor(self) -> Agent:
        logger.debug("[crew] Building intent_extractor agent.")
        return Agent(
            config=self.agents_config["intent_extractor"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.1),
            verbose=True,
            cache=False,
        )

    @agent
    def system_architect(self) -> Agent:
        logger.debug("[crew] Building system_architect agent.")
        return Agent(
            config=self.agents_config["system_architect"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.2),
            verbose=True,
            cache=False,
        )

    @agent
    def db_schema_agent(self) -> Agent:
        logger.debug("[crew] Building db_schema_agent agent.")
        return Agent(
            config=self.agents_config["db_schema_agent"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.2),
            verbose=True,
            cache=False,
        )

    @agent
    def api_schema_agent(self) -> Agent:
        logger.debug("[crew] Building api_schema_agent agent.")
        return Agent(
            config=self.agents_config["api_schema_agent"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.2),
            verbose=True,
            cache=False,
        )

    @agent
    def ui_schema_agent(self) -> Agent:
        logger.debug("[crew] Building ui_schema_agent agent.")
        return Agent(
            config=self.agents_config["ui_schema_agent"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.2),
            verbose=True,
            cache=False,
        )

    @agent
    def auth_agent(self) -> Agent:
        logger.debug("[crew] Building auth_agent agent.")
        return Agent(
            config=self.agents_config["auth_agent"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.2),
            verbose=True,
            cache=False,
        )

    @agent
    def validator_agent(self) -> Agent:
        logger.debug("[crew] Building validator_agent agent.")
        return Agent(
            config=self.agents_config["validator_agent"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.1),
            verbose=True,
            cache=False,
        )

    @agent
    def repair_agent(self) -> Agent:
        logger.debug("[crew] Building repair_agent agent.")
        return Agent(
            config=self.agents_config["repair_agent"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.2),
            verbose=True,
            cache=False,
        )

    @agent
    def runtime_validator(self) -> Agent:
        logger.debug("[crew] Building runtime_validator agent.")
        return Agent(
            config=self.agents_config["runtime_validator"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.1),
            verbose=True,
            cache=False,
        )

    @agent
    def progress_logger(self) -> Agent:
        logger.debug("[crew] Building progress_logger agent.")
        return Agent(
            config=self.agents_config["progress_logger"],  # type: ignore[index]
            llm=LLM(model="groq/llama-3.3-70b-versatile", temperature=0.3),
            verbose=True,
            cache=False,
        )

    # ── Task factory methods ──────────────────────────────────────────────────

    @task
    def task_extract_intent(self) -> Task:
        logger.debug("[crew] Building task_extract_intent.")
        return Task(
            config=self.tasks_config["task_extract_intent"],  # type: ignore[index]
        )

    @task
    def task_design_architecture(self) -> Task:
        logger.debug("[crew] Building task_design_architecture.")
        return Task(
            config=self.tasks_config["task_design_architecture"],  # type: ignore[index]
        )

    @task
    def task_generate_db_schema(self) -> Task:
        logger.debug("[crew] Building task_generate_db_schema.")
        return Task(
            config=self.tasks_config["task_generate_db_schema"],  # type: ignore[index]
        )

    @task
    def task_generate_api_schema(self) -> Task:
        logger.debug("[crew] Building task_generate_api_schema.")
        return Task(
            config=self.tasks_config["task_generate_api_schema"],  # type: ignore[index]
        )

    @task
    def task_generate_ui_schema(self) -> Task:
        logger.debug("[crew] Building task_generate_ui_schema.")
        return Task(
            config=self.tasks_config["task_generate_ui_schema"],  # type: ignore[index]
        )

    @task
    def task_generate_auth_schema(self) -> Task:
        logger.debug("[crew] Building task_generate_auth_schema.")
        return Task(
            config=self.tasks_config["task_generate_auth_schema"],  # type: ignore[index]
        )

    @task
    def task_validate_schemas(self) -> Task:
        logger.debug("[crew] Building task_validate_schemas.")
        return Task(
            config=self.tasks_config["task_validate_schemas"],  # type: ignore[index]
        )

    @task
    def task_repair_schemas(self) -> Task:
        logger.debug("[crew] Building task_repair_schemas.")
        return Task(
            config=self.tasks_config["task_repair_schemas"],  # type: ignore[index]
        )

    @task
    def task_validate_runtime(self) -> Task:
        logger.debug("[crew] Building task_validate_runtime.")
        return Task(
            config=self.tasks_config["task_validate_runtime"],  # type: ignore[index]
        )

    @task
    def task_log_progress(self) -> Task:
        logger.debug("[crew] Building task_log_progress.")
        return Task(
            config=self.tasks_config["task_log_progress"],  # type: ignore[index]
        )

    # ── Crew assembly ─────────────────────────────────────────────────────────

    @crew
    def crew(self) -> Crew:
        """
        Assembles the ProtoFlow crew in sequential process.
        The parallel fan-out (db/api/ui/auth) is handled by the async
        pipeline runner below, not by CrewAI's process — CrewAI sequential
        is used as the base so task context passing works correctly.
        """
        logger.info("[crew] Assembling ProtoFlow crew (sequential process).")
        return Crew(
            agents=self.agents,
            tasks=self.tasks,
            process=Process.sequential,
            verbose=True,
            memory=False,  # No OpenAI embedder available; context passed via task context[]
        )


# ── Session state ─────────────────────────────────────────────────────────────

class PipelineSession:
    """
    Holds all mutable state for one pipeline run.
    One instance per session_id, stored in the session store in main.py.
    """

    def __init__(self, session_id: str, prompt: str, skip_hitl: bool = False) -> None:
        self.session_id = session_id
        self.prompt = prompt
        self.original_prompt = prompt  # preserves the initial prompt
        self.skip_hitl = skip_hitl
        self.started_at = time.monotonic()

        # HITL synchronisation
        self.hitl_event: asyncio.Event = asyncio.Event()
        self.hitl_answers: list[str] = []
        self.hitl_chosen_option: Optional[str] = None

        # Midway modification support
        self.pending_modification: Optional[str] = None   # set by POST /modify
        self.modification_history: list[dict] = []        # record of all modifications

        # Accumulated outputs
        self.intent: Optional[dict] = None
        self.architecture: Optional[dict] = None
        self.db_schema: Optional[dict] = None
        self.api_schema: Optional[dict] = None
        self.ui_schema: Optional[dict] = None
        self.auth_schema: Optional[dict] = None
        self.validation_report: Optional[dict] = None
        self.repair_report: Optional[dict] = None
        self.runtime_report: Optional[dict] = None
        self.log_output: Optional[dict] = None

        # Metrics
        self.repair_count: int = 0
        self.hitl_count: int = 0
        self.stage_latencies: dict[str, int] = {}
        self.total_tokens: int = 0

        # SSE event buffer for reconnection replay
        self.event_buffer: list[dict] = []
        self.sse_queue: asyncio.Queue = asyncio.Queue()

        logger.info(
            "[session:%s] Created. prompt_length=%d chars.", session_id, len(prompt)
        )

    def elapsed_ms(self) -> int:
        return int((time.monotonic() - self.started_at) * 1000)

    def resume_hitl(self, answers: list[str], chosen_option: Optional[str] = None) -> None:
        """Called by POST /clarify to unblock the pipeline."""
        logger.info(
            "[session:%s] HITL resumed. answers=%s chosen=%s",
            self.session_id, answers, chosen_option,
        )
        self.hitl_answers = answers
        self.hitl_chosen_option = chosen_option
        self.hitl_count += 1
        self.hitl_event.set()

    def queue_modification(self, modification: str) -> None:
        """Called by POST /modify to enqueue a midway prompt modification."""
        logger.info(
            "[session:%s] Modification queued: %r",
            self.session_id, modification[:100],
        )
        self.pending_modification = modification


# ── Async pipeline runner ─────────────────────────────────────────────────────

async def _emit(session: PipelineSession, event_type: str, payload: dict) -> None:
    """
    Push an SSE event onto the session queue and into the replay buffer.
    Logs every emission so you can trace the exact event sequence.
    """
    event = {"event": event_type, "session_id": session.session_id, **payload}
    session.event_buffer.append(event)
    await session.sse_queue.put(event)
    logger.debug(
        "[session:%s] SSE emitted. event=%s keys=%s",
        session.session_id, event_type, list(payload.keys()),
    )


async def _wait_for_hitl(
    session: PipelineSession,
    stage: str,
    trigger_reason: str,
    questions: list[str],
    options: Optional[list[str]] = None,
    timeout_seconds: int = HITL_TIMEOUT_SECONDS,
) -> list[str]:
    """
    Emit a hitl_required event, then block until POST /clarify sets the event.
    Returns the answers list.
    """
    if getattr(session, 'skip_hitl', False):
        logger.info("[session:%s] HITL skipped (eval mode).", session.session_id)
        return []

    logger.info(
        "[session:%s] HITL required. stage=%s reason=%s questions=%s",
        session.session_id, stage, trigger_reason, questions,
    )
    session.hitl_event.clear()
    session.hitl_answers = []

    await _emit(session, "hitl_required", {
        "stage": stage,
        "trigger_reason": trigger_reason,
        "questions": questions,
        "options": options,
        "timeout_seconds": timeout_seconds,
    })

    try:
        await asyncio.wait_for(session.hitl_event.wait(), timeout=timeout_seconds)
        logger.info(
            "[session:%s] HITL answered. answers=%s",
            session.session_id, session.hitl_answers,
        )
    except asyncio.TimeoutError:
        logger.warning(
            "[session:%s] HITL timed out after %ds. Proceeding with empty answers.",
            session.session_id, timeout_seconds,
        )

    return session.hitl_answers


async def _apply_pending_modification(session: PipelineSession, current_stage: str) -> bool:
    """
    Check for a pending midway modification. If found, apply it to session.prompt
    and emit modification_applied SSE event. Returns True if a modification was applied.

    This is called at stage boundaries (between pipeline stages) so the next stage
    picks up the updated requirements. The pipeline is NOT restarted; only future
    stages benefit from the change. A disclaimer is already shown in the UI.
    """
    mod = session.pending_modification
    if not mod:
        return False

    session.pending_modification = None
    new_prompt = f"{session.prompt}\n\n[MID-RUN MODIFICATION at {current_stage}]: {mod}"
    session.prompt = new_prompt

    record = {
        "modification": mod,
        "applied_at_stage": current_stage,
        "new_prompt_length": len(new_prompt),
    }
    session.modification_history.append(record)

    logger.info(
        "[session:%s] Modification applied at stage=%s: %r",
        session.session_id, current_stage, mod[:100],
    )

    await _emit(session, "modification_applied", {
        "modification": mod,
        "applied_at_stage": current_stage,
        "new_prompt": new_prompt,
    })
    return True


async def _run_stage(
    session: PipelineSession,
    stage_name: str,
    model: str,
    coro: Coroutine,
) -> Any:
    """
    Wrap a single pipeline stage coroutine with:
      - stage_update running event
      - timing
      - stage_update complete/failed event
    """
    logger.info("[session:%s] Stage START: %s", session.session_id, stage_name)
    if getattr(session, 'tpm_limit_hit', False):
        logger.warning("[session:%s] Skipping stage %s due to prior TPM limit hit.", session.session_id, stage_name)
        await _emit(session, "stage_update", {
            "stage": stage_name, "status": "failed", "model": model, "latency_ms": 0,
            "output_summary": "Bypassed due to Groq TPM limits."
        })
        return {}
    t0 = time.monotonic()

    await _emit(session, "stage_update", {
        "stage": stage_name,
        "status": "running",
        "model": model,
        "latency_ms": 0,
        "output_summary": "",
    })

    try:
        result = await coro
        latency_ms = int((time.monotonic() - t0) * 1000)
        session.stage_latencies[stage_name] = latency_ms

        # Summarise output for SSE (first 120 chars of JSON)
        summary = ""
        if result:
            try:
                summary = json.dumps(result)[:120]
            except Exception:
                summary = str(result)[:120]

        await _emit(session, "stage_update", {
            "stage": stage_name,
            "status": "complete",
            "model": model,
            "latency_ms": latency_ms,
            "output_summary": summary,
        })

        logger.info(
            "[session:%s] Stage DONE: %s latency=%dms",
            session.session_id, stage_name, latency_ms,
        )
        return result

    except Exception as exc:
        latency_ms = int((time.monotonic() - t0) * 1000)
        session.stage_latencies[stage_name] = latency_ms
        is_size_limit = "Request size exceeds TPM limit" in str(exc) or (
            "Request too large" in str(exc) and "Limit" in str(exc)
        )
        if is_size_limit:
            # Log but DO NOT set tpm_limit_hit — let each stage fail independently
            # so the pipeline continues to completion with whatever it can produce.
            logger.error(
                "[session:%s] Request size limit hit in stage %s — stage skipped, pipeline continues.",
                session.session_id, stage_name,
            )
            await _emit(session, "stage_update", {
                "stage": stage_name, "status": "failed", "model": model,
                "latency_ms": latency_ms,
                "output_summary": f"Skipped (request too large for model). {exc}"
            })
            return {}
        logger.error(
            "[session:%s] Stage FAILED: %s error=%s latency=%dms",
            session.session_id, stage_name, exc, latency_ms, exc_info=True,
        )
        await _emit(session, "stage_update", {
            "stage": stage_name,
            "status": "failed",
            "model": model,
            "latency_ms": latency_ms,
            "output_summary": f"ERROR: {exc}",
        })
        raise


async def run_pipeline(session: PipelineSession) -> None:
    """
    Full async pipeline runner.

    Stage order:
      1. intent_extraction  (sequential, HITL always-on)
      2. architecture       (async)
      3. db + api + ui + auth  (parallel fan-out via asyncio.gather)
      4. validation         (sequential)
      5. repair loop        (sequential, max MAX_REPAIR_LOOPS)
      6. runtime_validation (sequential)
      7. logging            (async)
      8. pipeline_complete  SSE event
    """
    logger.info(
        "[session:%s] Pipeline START. prompt=%r",
        session.session_id, session.prompt[:80],
    )

    crew_instance = ProtoFlowCrew()

    # ── Read raw YAML once so we can look up agent names by task name ─────────
    _yaml_path = os.path.join(os.path.dirname(__file__), "config", "tasks.yaml")
    with open(_yaml_path, "r", encoding="utf-8") as _f:
        _raw_tasks_yaml: dict = _yaml.safe_load(_f)
    logger.debug("[crew] Loaded raw tasks YAML. keys=%s", list(_raw_tasks_yaml.keys()))

    # ── Helper: kick off a single CrewAI task and parse JSON output ───────────
    async def _kickoff_task(task_name: str, inputs: dict) -> dict:
        """
        Run a single task by creating a temporary single-task Crew.
        Reads agent name from raw YAML (not from instantiated Task objects)
        to avoid the 'attribute name must be string, not Agent' error.
        """
        logger.debug(
            "[session:%s] _kickoff_task: %s inputs_keys=%s",
            session.session_id, task_name, list(inputs.keys()),
        )

        # Get agent name string from raw YAML dict
        raw_task_def = _raw_tasks_yaml.get(task_name, {})
        agent_name: str = raw_task_def.get("agent", "")
        logger.debug(
            "[session:%s] _kickoff_task: task=%s agent_name=%r",
            session.session_id, task_name, agent_name,
        )

        # Run in a thread pool to avoid blocking the event loop
        loop = asyncio.get_running_loop()
        
        max_retries = 5
        result = None
        for attempt in range(max_retries):
            # Instantiate agent via the @agent method on the crew class
            agent = None
            if agent_name and isinstance(agent_name, str):
                agent_creator = getattr(crew_instance, agent_name, None)
                if callable(agent_creator):
                    agent = agent_creator()
                    logger.debug("[session:%s] Agent instantiated: %s", session.session_id, agent_name)
                else:
                    logger.warning(
                        "[session:%s] No @agent method found for name=%r on ProtoFlowCrew",
                        session.session_id, agent_name,
                    )
            else:
                logger.warning(
                    "[session:%s] agent_name is not a string: %r (type=%s). "
                    "Check tasks.yaml for task '%s'.",
                    session.session_id, agent_name, type(agent_name).__name__, task_name,
                )

            # Instantiate task via the @task method
            task_creator = getattr(crew_instance, task_name, None)
            if not callable(task_creator):
                raise ValueError(f"No @task method found for '{task_name}' on ProtoFlowCrew")
            task_obj = task_creator()

            # Assign agent to task
            if agent:
                task_obj.agent = agent

            # Apply any previously rotated API key from attempt > 0
            if attempt > 0 and len(GROQ_KEYS) > 1:
                # We rotate keys below when catching the exception. For attempt > 0, 
                # we want to ensure the agent uses a deterministic new key from the pool.
                new_key = GROQ_KEYS[attempt % len(GROQ_KEYS)]
                os.environ["GROQ_API_KEY"] = new_key  # Force LiteLLM to see it
                
                if agent and agent.llm:
                    temp = agent.llm.temperature if hasattr(agent.llm, 'temperature') else 0.1
                    model_name = agent.llm.model
                    if not model_name.startswith("groq/"):
                        model_name = f"groq/{model_name}"
                    agent.llm = LLM(model=model_name, temperature=temp, api_key=new_key)

            temp_crew = Crew(
                agents=[agent] if agent else [],
                tasks=[task_obj],
                verbose=True,
                memory=False,  # No OpenAI embedder; avoids ChromaDB CHROMA_OPENAI_API_KEY error
                cache=False,   # Disable LLM caching to avoid returning stale broken outputs
            )
            
            try:
                result = await loop.run_in_executor(
                    None,
                    lambda: temp_crew.kickoff(inputs=inputs),
                )
                break  # Success
            except Exception as e:
                err_str = str(e)
                if "RateLimitError" in type(e).__name__ or "rate_limit" in err_str.lower() or "rate limit reached" in err_str.lower():
                    if "Request too large" in err_str and "Limit" in err_str and "Requested" in err_str:
                        # Request is too large for the current model — fall back to the
                        # smallest available Groq model regardless of which model we started with.
                        if agent and agent.llm and "llama-3.1-8b-instant" not in str(agent.llm.model):
                            logger.warning(
                                "[session:%s] Request size exceeds model limit for %s. Falling back to groq/llama-3.1-8b-instant.",
                                session.session_id, agent.llm.model
                            )
                            agent.llm = LLM(model="groq/llama-3.1-8b-instant", temperature=0.1)
                            continue  # Try immediately with fallback model
                        else:
                            raise ValueError(f"Request size exceeds limit even for fallback model: {err_str}")

                    # If not a request size limit, it's a TPD limit or standard TPM timeout.
                    # Rotate API key if we have multiple keys available.
                    rotated = False
                    if len(GROQ_KEYS) > 1:
                        new_key = random.choice(GROQ_KEYS)
                        logger.warning(
                            "[session:%s] Rate limit / TPD hit for %s. Rotating to another GROQ_API_KEY...",
                            session.session_id, task_name
                        )
                        if agent and agent.llm:
                            # Re-instantiate LLM with new API key, ensure 'groq/' prefix
                            temp = agent.llm.temperature if hasattr(agent.llm, 'temperature') else 0.1
                            model_name = agent.llm.model
                            if not model_name.startswith("groq/"):
                                model_name = f"groq/{model_name}"
                            agent.llm = LLM(model=model_name, temperature=temp, api_key=new_key)
                        
                        # Only retry immediately if we haven't exhausted all our keys
                        if attempt < len(GROQ_KEYS):
                            continue
                        rotated = True

                    if attempt < max_retries - 1:
                        # Parse "Please try again in 1h5m21.665s." or "21.665s."
                        wait_time = 30.0
                        match = re.search(r'try again in (?:(\d+)h)?(?:(\d+)m)?([\d\.]+)s', err_str)
                        if match:
                            h_str = match.group(1)
                            m_str = match.group(2)
                            s_str = match.group(3)
                            hours = int(h_str) if h_str else 0
                            minutes = int(m_str) if m_str else 0
                            seconds = float(s_str)
                            wait_time = (hours * 3600) + (minutes * 60) + seconds + 2.0  # 2s buffer
                        
                        if wait_time > 120.0:
                            logger.error(
                                "[session:%s] Rate limit wait time too long (%.1fs). Failing task.",
                                session.session_id, wait_time
                            )
                            raise e

                        logger.warning(
                            "[session:%s] Rate limit hit for %s. Sleeping %.1fs before attempt %d. Error: %s",
                            session.session_id, task_name, wait_time, attempt + 2, err_str.split('"message":')[1].split(',"type"')[0] if '"message":' in err_str else err_str[:100]
                        )
                        await asyncio.sleep(wait_time)
                        continue
                # If it's not a rate limit error, or we're out of retries, raise it
                raise e
        
        if result is None:
            raise RuntimeError(f"Task '{task_name}' failed after {max_retries} retries due to rate limits or API errors.")

        # Token extraction
        if hasattr(result, 'token_usage'):
            usage = result.token_usage
            if hasattr(usage, 'total_tokens'):
                session.total_tokens += usage.total_tokens
            elif isinstance(usage, dict):
                session.total_tokens += usage.get('total_tokens', 0)

        raw = result.raw if hasattr(result, "raw") else str(result)
        logger.debug(
            "[session:%s] _kickoff_task raw output length: %d chars",
            session.session_id, len(raw),
        )
        parsed = extract_json(raw)

        # Unwrap nested dict if LLM wraps it in a stage name key (e.g. {"api_schema": {...}})
        if isinstance(parsed, dict) and len(parsed) == 1:
            first_key = list(parsed.keys())[0]
            val = parsed[first_key]
            wrapper_keys = {
                "db_schema", "api_schema", "ui_schema", "auth_schema",
                "validation_report", "repair_report", "runtime_report", "log_output",
                "task_validate_runtime", "task_log_progress",
                "schema", "result", "response", "output", "log_progress", "progress_log"
            }
            if first_key in wrapper_keys or first_key.endswith("_schema") or first_key.endswith("_report"):
                if isinstance(val, dict):
                    logger.warning("[session:%s] Unwrapping nested LLM dict %s", session.session_id, first_key)
                    parsed = val

        # Wrap lists in expected root keys if LLM forgot the root object
        if isinstance(parsed, list):
            logger.warning("[session:%s] LLM wrapped output in list. Fixing based on task_name: %s", session.session_id, task_name)
            if task_name == "task_generate_api_schema":
                parsed = {"endpoints": parsed}
            elif task_name == "task_generate_ui_schema":
                parsed = {"pages": parsed}
            elif task_name == "task_generate_db_schema":
                parsed = {"tables": parsed}
            elif len(parsed) > 0 and isinstance(parsed[0], dict):
                parsed = parsed[0]
            else:
                parsed = {}
                
        if not isinstance(parsed, dict):
            logger.error(
                "[session:%s] LLM output parsed as %s instead of dict. Coercing to empty dict.",
                session.session_id, type(parsed).__name__
            )
            return {}
        return parsed

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 1 — Intent Extraction (always HITL)
    # ─────────────────────────────────────────────────────────────────────────
    async def _stage_intent() -> dict:
        result = await _kickoff_task(
            "task_extract_intent",
            {"user_prompt": session.prompt},
        )
        confidence = result.get("confidence", 1.0)
        logger.info(
            "[session:%s] Intent extracted. confidence=%.2f assumptions=%d",
            session.session_id, confidence, len(result.get("assumptions", [])),
        )

        # HITL is always-on: prefer the LLM's own questions from hitl_required.questions
        # (the agent generates context-specific questions); fall back to hardcoded only
        # if the LLM didn't populate that field.
        llm_questions = []
        hitl_field = result.get("hitl_required", {})
        if isinstance(hitl_field, dict):
            llm_questions = hitl_field.get("questions", [])

        if confidence < 0.75 or not llm_questions:
            # Low confidence or no LLM questions — use targeted hardcoded questions
            questions = llm_questions or [
                "What is the primary purpose of this application?",
                "Who are the main user types and what can each do?",
                "Are there any premium or paid features?",
            ]
            trigger = "low_confidence"
        else:
            # High confidence — use LLM's confirmatory question
            questions = llm_questions[:1]  # typically 1 confirmatory question
            trigger = "always_on"

        answers = await _wait_for_hitl(
            session, "intent_extraction", trigger, questions
        )
        result["clarifications_received"] = answers
        session.intent = result
        return result

    session.intent = await _run_stage(
        session, "intent_extraction",
        "groq/llama-3.3-70b-versatile", _stage_intent()
    )

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 2 — Architecture Design
    # ─────────────────────────────────────────────────────────────────────────
    async def _stage_architecture() -> dict:
        result = await _kickoff_task(
            "task_design_architecture",
            {
                "user_prompt": session.prompt,
                "intent_schema": json.dumps(session.intent),
            },
        )
        session.architecture = result
        logger.info(
            "[session:%s] Architecture designed. entities=%d relations=%d",
            session.session_id,
            len(result.get("entities", [])),
            len(result.get("relations", [])),
        )
        return result

    session.architecture = await _run_stage(
        session, "architecture_design",
        "groq/llama-3.3-70b-versatile", _stage_architecture()
    )

    # ── Modification checkpoint (before schema generation) ────────────────────
    await _apply_pending_modification(session, "before_schema_generation")

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 3 — Parallel fan-out: DB + API + UI + Auth
    # ─────────────────────────────────────────────────────────────────────────
    logger.info("[session:%s] Starting parallel schema generation.", session.session_id)

    arch_json = _compact(session.architecture or {})

    async def _stage_db() -> dict:
        result = await _kickoff_task(
            "task_generate_db_schema",
            {"architecture_schema": arch_json, "user_prompt": session.prompt},
        )
        session.db_schema = result
        logger.info(
            "[session:%s] DB schema generated. tables=%d",
            session.session_id, len(result.get("tables", [])),
        )
        return result

    async def _stage_api() -> dict:
        result = await _kickoff_task(
            "task_generate_api_schema",
            {
                "architecture_schema": arch_json,
                "db_schema": _compact(session.db_schema or {}),
                "user_prompt": session.prompt,
            },
        )
        session.api_schema = result
        logger.info(
            "[session:%s] API schema generated. endpoints=%d",
            session.session_id, len(result.get("endpoints", [])),
        )
        return result

    async def _stage_ui() -> dict:
        result = await _kickoff_task(
            "task_generate_ui_schema",
            {
                "architecture_schema": arch_json,
                "api_schema": _compact(session.api_schema or {}),
                "user_prompt": session.prompt,
            },
        )
        session.ui_schema = result
        logger.info(
            "[session:%s] UI schema generated. pages=%d",
            session.session_id, len(result.get("pages", [])),
        )
        return result

    async def _stage_auth() -> dict:
        result = await _kickoff_task(
            "task_generate_auth_schema",
            {
                "architecture_schema": arch_json,
                "ui_schema": _compact(session.ui_schema or {}),
                "user_prompt": session.prompt,
            },
        )
        session.auth_schema = result
        logger.info(
            "[session:%s] Auth schema generated. roles=%s",
            session.session_id, result.get("roles", []),
        )
        return result

    # ─────────────────────────────────────────────────────────────────────────
    # STAGES 3-6 — Sequential Execution (formerly parallel fan-out)
    # We run these sequentially to avoid hitting Groq's 12,000 TPM rate limit
    # ─────────────────────────────────────────────────────────────────────────
    async def _run_schema_stage(stage_name: str, task_coro, model: str) -> dict:
        await _emit(session, "stage_update", {
            "stage": stage_name, "status": "running",
            "model": model, "latency_ms": 0, "output_summary": "",
        })
        t_start = time.monotonic()
        result = await task_coro()
        latency_ms = int((time.monotonic() - t_start) * 1000)
        # Record to session so stage_latencies in eval_metrics is complete
        session.stage_latencies[stage_name] = latency_ms
        await _emit(session, "stage_update", {
            "stage": stage_name, "status": "complete",
            "model": model, "latency_ms": latency_ms,
            "output_summary": json.dumps(result)[:120],
        })
        return result

    db_result = await _run_schema_stage("db_schema", _stage_db, "groq/llama-3.3-70b-versatile")
    # ── Modification checkpoint (between db and api generation) ──────────────
    await _apply_pending_modification(session, "before_api_schema")
    api_result = await _run_schema_stage("api_schema", _stage_api, "groq/llama-3.3-70b-versatile")
    # ── Modification checkpoint (between api and ui generation) ──────────────
    await _apply_pending_modification(session, "before_ui_schema")
    ui_result = await _run_schema_stage("ui_schema", _stage_ui, "groq/llama-3.3-70b-versatile")
    auth_result = await _run_schema_stage("auth_schema", _stage_auth, "groq/llama-3.3-70b-versatile")

    # ── Modification checkpoint (before validation) ───────────────────────────
    await _apply_pending_modification(session, "before_validation")

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 4 + 5 — Validation + Repair loop
    # ─────────────────────────────────────────────────────────────────────────
    # Track the best (most complete) validation report seen across all attempts.
    # If a later validation returns {} (parse failure), we keep the best one.
    _best_validation: dict = {}

    for attempt in range(1, MAX_REPAIR_LOOPS + 1):
        # Use _outline() (ultra-compact) rather than _compact() for all_schemas.
        # Validation only needs structural info (table names, endpoint paths, roles) —
        # not full column/field details — to detect cross-layer mismatches.
        all_schemas_json = _outline({
            "db_schema": session.db_schema,
            "api_schema": session.api_schema,
            "ui_schema": session.ui_schema,
            "auth_schema": session.auth_schema,
        })
        logger.info(
            "[session:%s] Validation attempt %d/%d.",
            session.session_id, attempt, MAX_REPAIR_LOOPS,
        )

        async def _stage_validate() -> dict:
            result = await _kickoff_task(
                "task_validate_schemas",
                {
                    "all_schemas": all_schemas_json,
                    "user_prompt": session.prompt,
                },
            )
            session.validation_report = result
            is_valid = result.get("is_valid", False)
            error_count = len(result.get("errors", []))
            logger.info(
                "[session:%s] Validation result: is_valid=%s errors=%d warnings=%d",
                session.session_id, is_valid, error_count,
                len(result.get("warnings", [])),
            )
            return result

        validation = await _run_stage(
            session, "validation",
            "groq/llama-3.3-70b-versatile", _stage_validate()
        )

        # Derive validity from errors array — LLM's is_valid flag is unreliable.
        # Also treat empty {} as a parse failure (validator didn't return a proper report).
        errors = validation.get("errors", [])
        is_empty_report = not validation or (not errors and not validation.get("warnings") and not validation.get("validated_at"))
        effective_is_valid = len(errors) == 0 and not is_empty_report

        # Track the best validation report — prefer a real report with content over {}.
        # This ensures session.validation_report is always the most informative result
        # even if a later parse attempt returns empty.
        if not is_empty_report and len(errors) + len(validation.get("warnings", [])) > len(
            _best_validation.get("errors", []) + _best_validation.get("warnings", [])
        ):
            _best_validation = validation
        if not is_empty_report and not _best_validation:
            _best_validation = validation
        # Always expose the best known report in session
        if _best_validation:
            session.validation_report = _best_validation

        if is_empty_report:
            logger.warning(
                "[session:%s] Validation returned empty report on attempt %d — treating as failed parse, triggering repair.",
                session.session_id, attempt,
            )
        elif effective_is_valid:
            logger.info(
                "[session:%s] Schemas valid after attempt %d (0 errors).",
                session.session_id, attempt,
            )
            break

        errors = validation.get("errors", [])
        logger.warning(
            "[session:%s] Validation FAILED. %d errors. Triggering repair (attempt %d).",
            session.session_id, len(errors), attempt,
        )

        await _emit(session, "stage_update", {
            "stage": "validation",
            "status": "repair_triggered",
            "model": "groq/llama-3.3-70b-versatile",
            "latency_ms": session.stage_latencies.get("validation", 0),
            "output_summary": f"{len(errors)} errors found",
            "conflicts": [e.get("description", "") for e in validation.get("conflicts", [])],
        })

        # If same errors persist after 2 attempts, escalate to HITL
        # Only escalate on real errors — not on empty reports (those are parse failures).
        if attempt >= 2 and not is_empty_report and errors:
            unresolved = [e.get("description", str(e)) for e in errors[:3]]
            logger.warning(
                "[session:%s] Repair attempt %d — escalating to HITL. unresolved=%s",
                session.session_id, attempt, unresolved,
            )
            await _wait_for_hitl(
                session,
                stage="repair",
                trigger_reason="repair_failed",
                questions=[
                    f"Repair attempt {attempt} could not fix: {err}. "
                    f"How should this be resolved?"
                    for err in unresolved
                ],
                timeout_seconds=HITL_TIMEOUT_SECONDS,
            )

        async def _stage_repair() -> dict:
            result = await _kickoff_task(
                "task_repair_schemas",
                {
                    "validation_report": _compact(session.validation_report),
                    # Repair needs _compact (field-level detail) not _outline
                    # (name-only) because the repair agent must patch specific
                    # column constraints, endpoint validation rules, etc.
                    "all_schemas": _compact({
                        "db_schema": session.db_schema,
                        "api_schema": session.api_schema,
                        "ui_schema": session.ui_schema,
                        "auth_schema": session.auth_schema,
                    }),
                    "repair_attempt_number": attempt,
                    "user_prompt": session.prompt,
                },
            )
            session.repair_report = result
            session.repair_count += 1
            logger.info(
                "[session:%s] Repair complete. repairs=%d unresolved=%d",
                session.session_id,
                len(result.get("repairs", [])),
                len(result.get("unresolved_errors", [])),
            )
            # Merge updated schemas back into session.
            # Guard against wrong-shaped updated_schemas from the LLM, e.g.:
            #   {"schema": {...}}  instead of  {"db_schema": {...}, "api_schema": {...}}
            updated = result.get("updated_schemas", {})
            if not isinstance(updated, dict):
                logger.warning(
                    "[session:%s] Repair returned non-dict updated_schemas (type=%s). Ignoring.",
                    session.session_id, type(updated).__name__,
                )
                updated = {}
            elif set(updated.keys()) == {"schema"}:
                logger.warning(
                    "[session:%s] Repair returned updated_schemas wrapped under 'schema' key "
                    "(wrong format) — skipping merge to preserve valid original schemas.",
                    session.session_id,
                )
                updated = {}

            for key in {"db_schema", "api_schema", "ui_schema", "auth_schema"} & updated.keys():
                value = updated[key]
                if isinstance(value, dict):
                    # Guard against repair truncating schemas — only accept the
                    # repaired version if it has at least as many top-level items
                    # as the current session schema. This prevents the repair
                    # agent from replacing a 12-endpoint api_schema with 4 endpoints.
                    current = getattr(session, key, {}) or {}
                    # Count representative items per schema type
                    count_key = {"db_schema": "tables", "api_schema": "endpoints",
                                 "ui_schema": "pages", "auth_schema": "roles"}.get(key)
                    if count_key:
                        current_count = len(current.get(count_key, []))
                        repair_count = len(value.get(count_key, []))
                        if repair_count < current_count:
                            logger.warning(
                                "[session:%s] Repair returned truncated %s "
                                "(%d %s vs current %d) — skipping merge to preserve original.",
                                session.session_id, key, repair_count, count_key, current_count,
                            )
                            continue
                    setattr(session, key, value)
                    logger.debug("[session:%s] %s updated by repair.", session.session_id, key)
                else:
                    logger.warning(
                        "[session:%s] Repair returned non-dict for %s (type=%s). Skipping.",
                        session.session_id, key, type(value).__name__,
                    )
            # Rebuild all_schemas_json for next validation pass
            return result


        await _run_stage(
            session, "repair",
            "groq/llama-3.3-70b-versatile", _stage_repair()
        )

        # Rebuild outline for next validation pass
        all_schemas_json = _outline({
            "db_schema": session.db_schema,
            "api_schema": session.api_schema,
            "ui_schema": session.ui_schema,
            "auth_schema": session.auth_schema,
        })

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 6 — Runtime Validation
    # ─────────────────────────────────────────────────────────────────────────
    async def _stage_runtime() -> dict:
        result = await _kickoff_task(
            "task_validate_runtime",
            {
                "all_schemas": _outline({
                    "db_schema": session.db_schema,
                    "api_schema": session.api_schema,
                    "ui_schema": session.ui_schema,
                    "auth_schema": session.auth_schema,
                }),
                "validation_report": _compact(session.validation_report),
                "user_prompt": session.prompt,
            },
        )
        session.runtime_report = result
        viable = result.get("execution_viable", False)
        logger.info(
            "[session:%s] Runtime validation: viable=%s flows=%d blocking=%d",
            session.session_id, viable,
            len(result.get("simulated_flows", [])),
            len(result.get("blocking_issues", [])),
        )
        return result

    await _run_stage(
        session, "runtime_validation",
        "groq/llama-3.3-70b-versatile", _stage_runtime()
    )

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 7 — Progress Logging + Mermaid generation
    # ─────────────────────────────────────────────────────────────────────────
    async def _stage_logging() -> dict:
        result = await _kickoff_task(
            "task_log_progress",
            {
                # Include all stage latencies (schema stages now tracked too)
                "stage_latencies": json.dumps(session.stage_latencies),
                "repair_count": session.repair_count,
                "hitl_count": session.hitl_count,
                "user_prompt": session.prompt[:200],
                "session_id": session.session_id,
                "db_outline": _outline(session.db_schema) if session.db_schema else "No DB schema generated",
                "api_outline": _outline(session.api_schema) if session.api_schema else "No API schema generated",
            },
        )
        # Sanitize Mermaid diagrams before storing — fix LLM syntax mistakes
        for key, hint in [
            ("mermaid_pipeline", "flowchart"),
            ("mermaid_er", "er"),
            ("mermaid_sequence", "sequence"),
        ]:
            if key in result and result[key]:
                result[key] = _sanitize_mermaid(result[key], diagram_hint=hint)
        session.log_output = result
        logger.info(
            "[session:%s] Logging complete. mermaid keys=%s",
            session.session_id,
            [k for k in result if "mermaid" in k],
        )
        # Stream log entries as SSE
        for entry in result.get("log_entries", []):
            await _emit(session, "log_update", {
                "content": json.dumps(entry) if isinstance(entry, dict) else str(entry),
            })
        return result

    await _run_stage(
        session, "logging",
        "groq/llama-3.3-70b-versatile", _stage_logging()
    )

    # ─────────────────────────────────────────────────────────────────────────
    # STAGE 8 — pipeline_complete SSE event
    # ─────────────────────────────────────────────────────────────────────────
    total_ms = session.elapsed_ms()
    log_out = session.log_output or {}

    mermaid = {
        "pipeline_flow": _sanitize_mermaid(log_out.get("mermaid_pipeline", ""), "flowchart"),
        "er_diagram":    _sanitize_mermaid(log_out.get("mermaid_er",       ""), "er"),
        "api_sequence":  _sanitize_mermaid(log_out.get("mermaid_sequence",  ""), "sequence"),
    }

    final_schema = {
        "session_id": session.session_id,
        "prompt": session.prompt,
        "intent": session.intent,
        "architecture": session.architecture,
        "db_schema": session.db_schema,
        "api_schema": session.api_schema,
        "ui_schema": session.ui_schema,
        "auth_schema": session.auth_schema,
        "validation_report": session.validation_report,
        "repair_report": session.repair_report,
        "runtime_report": session.runtime_report,
    }

    from compiler.schemas.contracts import FinalOutput
    try:
        FinalOutput.model_validate(final_schema)
        logger.info("[session:%s] FinalOutput Pydantic validation passed.", session.session_id)
    except Exception as e:
        logger.warning("[session:%s] FinalOutput Pydantic validation failed (non-blocking): %s", session.session_id, e)

    await _emit(session, "pipeline_complete", {
        "total_latency_ms": total_ms,
        "total_tokens": session.total_tokens,
        "repair_count": session.repair_count,
        "hitl_count": session.hitl_count,
        "final_schema": final_schema,
        "mermaid_diagrams": mermaid,
        "assumptions": session.intent.get("assumptions", []) if session.intent else [],
        "conflicts": session.validation_report.get("conflicts", []) if session.validation_report else [],
    })

    # Signal SSE stream to close
    await session.sse_queue.put(None)

    logger.info(
        "[session:%s] Pipeline COMPLETE. total_ms=%d repairs=%d hitl=%d",
        session.session_id, total_ms, session.repair_count,
        session.hitl_count,
    )
