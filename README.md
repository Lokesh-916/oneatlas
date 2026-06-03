# OneAtlas AppSpec Engine

A multi-stage AI compilation pipeline that converts a natural language app description
into a validated AppSpec with entities, schemas, APIs, pages, auth, integration hooks, and workflow stubs.

Built for the OneAtlas.dev AI Engineer trial assignment (June 2026).

---

## Quick Start (under 5 minutes)

```bash
git clone https://github.com/Lokesh-916/oneatlas.git
cd oneatlas
uv sync
cp .env.example .env  # add GROQ_API_KEY at minimum
uv run uvicorn compiler.main:app --host 0.0.0.0 --port 8000
cd frontend && npm install && npm run dev
```

---

## Environment Variables

| Variable | Required | Use |
|---|---|---|
| `GROQ_API_KEY` | Yes | Primary LLM for all stages |
| `GEMINI_API_KEY` | No | Schema/repair fallback (use GEMINI_API_KEY not GOOGLE_API_KEY) |
| `GEMINI_API_KEY_2` | No | Second Gemini key — auto-rotated on 429 rate limits |
| `OPENROUTER_API_KEY` | No | Universal fallback on 429/5xx |

---

## Pipeline

```
Stage 1  Intent Extraction    -> AppIntent (appName, appType enum, features, entities)
Stage 2  Architecture Design  -> ArchitectureSchema
Stage 3  DB + API + UI + Auth -> 4x Schemas
Stage 4  Validation           -> ValidationReport (cross-layer LLM check)
Stage 5  Repair Loop          -> RepairReport (max 3x, STRUCTURAL/FIELD/CONSISTENCY/ESCALATED)
Stage 6  Integration Stubs    -> WorkflowStubs + IntegrationHooks
Stage 7  Runtime Validation   -> RuntimeReport
Stage 8  Logging + Diagrams   -> Mermaid diagrams
Stage D  AppSpec Assembly     -> Unified AppSpec (pure Python, zero LLM)
```

---

## API

| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Start pipeline |
| GET | `/stream/{id}` | SSE: stage_start, stage_complete, stage_failed, generation_complete |
| POST | `/clarify` | HITL answers |
| POST | `/modify` | Midway prompt modification |
| GET | `/result/{id}` | Full output + app_spec + repair_log + cost breakdown |
| GET | `/integrations` | Full integration registry |
| POST | `/generate/{id}/repair` | Manual repair: {stage, error_hint} |
| GET | `/eval/assignment-prompts` | 12 required eval prompts |
| POST | `/eval/run/{id}` | Run eval prompt |
| GET | `/eval/results` | Aggregated metrics |

---

## Integration Registry

**Fully implemented (6):**
`slack` `gmail` `stripe` `whatsapp` `webhook` `google_sheets`

**Stubbed - interface correct, HTTP call not implemented (4):**
`jira` `hubspot` `notion` `twilio_sms`

---

## Provider Routing

Config-driven via `src/compiler/config/routing.yaml`. Zero hardcoded model names.

- Groq: primary for all stages
- Gemini 1.5 Flash: fallback for db_schema, api_schema, repair
- OpenRouter: universal fallback on 5xx

---

## Repair Engine

| Strategy | Trigger |
|---|---|
| STRUCTURAL | JSON parse failure |
| FIELD | Missing/wrong-type field — triggers narrow per-field re-prompt |
| CONSISTENCY | Cross-layer reference mismatch |
| ESCALATED | 2+ failed attempts -> HITL |

---

## Evaluation

See `evaluation_log.json` for all 12 prompts. 12/12 completed. Avg 120s, $0.0065/run.
Repair in 6/12 runs. Weakest stage: LLM validation (occasional field-type misses).

---

## Stack

Backend: Python 3.12 / FastAPI / CrewAI 1.14.5 / Groq / LiteLLM
Frontend: React 19 / Vite / TailwindCSS
Deployment: Render (backend) / Vercel (frontend)
