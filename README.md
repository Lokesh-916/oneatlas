# OneAtlas AppSpec Engine

A multi-stage AI compilation pipeline that converts a natural language app description into a
validated, machine-readable **AppSpec** — complete with entities, database schema, REST API,
UI pages, auth rules, integration hooks, and workflow stubs.

Built for the OneAtlas.dev AI Engineer trial assignment (June 2026).

---

## Quick Start (under 5 minutes)

**Prerequisites:** Python 3.10–3.13, [uv](https://docs.astral.sh/uv/), Node 18+

```bash
# 1. Clone
git clone https://github.com/Lokesh-916/oneatlas.git
cd oneatlas

# 2. Install backend dependencies
uv sync

# 3. Copy and fill environment variables
cp .env.example .env
# Edit .env — add at minimum GROQ_API_KEY

# 4. Start backend
uv run uvicorn compiler.main:app --host 0.0.0.0 --port 8000

# 5. Start frontend (separate terminal)
cd frontend
npm install
npm run dev
# Frontend runs at http://localhost:5173
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GROQ_API_KEY` | Yes | Primary LLM provider (Llama 3.3 70b) |
| `GEMINI_API_KEY` | No | Schema generation fallback |
| `OPENROUTER_API_KEY` | No | Universal fallback provider |
| `MAX_REPAIR_LOOPS` | No | Max repair attempts (default: 3) |
| `HITL_TIMEOUT_SECONDS` | No | HITL wait timeout (default: 300) |
| `LOG_LEVEL` | No | Logging level (default: debug) |

Copy `.env.example` to `.env` and fill in your values.

---

## Pipeline Architecture

```
User Prompt
    |
    v
Stage 1 — Intent Extraction        (HITL always-on, confidence-gated)
    | IntentSchema: app_type, features, entities, integrations_requested
    v
Stage 2 — Architecture Design
    | ArchitectureSchema: entities, relations, page_flows, role_hierarchy
    v
Stage 3 — Schema Generation (sequential: DB -> API -> UI -> Auth)
    | DBSchema + APISchema + UISchema + AuthSchema
    v
Stage 4+5 — Validation + Repair Loop  (max 3 attempts)
    | classified strategies: STRUCTURAL / FIELD / CONSISTENCY / ESCALATED
    v
Stage 6 — Runtime Simulation
    | RuntimeReport: CRUD flows, blocking issues
    v
Stage 7 — Logging + Mermaid Diagrams
    v
FinalOutput  (all schemas + unified app_spec view)
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Start pipeline, returns `session_id` |
| GET | `/stream/{id}` | SSE stream — stage progress with replay on reconnect |
| POST | `/clarify` | Submit HITL answers to resume pipeline |
| POST | `/modify` | Queue a midway prompt modification |
| GET | `/result/{id}` | Full FinalOutput JSON including `app_spec` |
| GET | `/integrations` | Full integration registry |
| POST | `/generate/{id}/repair` | Manually trigger repair on a stage |
| GET | `/health` | Health check |
| GET | `/eval/prompts` | List all evaluation prompts with run status |
| POST | `/eval/run/{id}` | Run a specific evaluation prompt |
| GET | `/eval/results` | Aggregated evaluation metrics |
| GET | `/eval/export` | Download eval results as JSON |

---

## Integration Registry

`GET /integrations` returns the full registry. Validation in the pipeline resolves
all integration references against this registry at runtime.

**Fully implemented (5):**

| ID | Display Name | Auth Type | Actions |
|---|---|---|---|
| `slack` | Slack | api_key | send_message, send_dm, post_block |
| `gmail` | Gmail / Google Workspace | oauth2 | send_email, create_calendar_event |
| `stripe` | Stripe | api_key | create_customer, create_charge, manage_subscription, issue_refund |
| `whatsapp` | WhatsApp via Twilio | api_key | send_template_message, send_notification |
| `webhook` | Generic Webhook | webhook_secret | post_payload |

**Stubbed — interface correct, HTTP call not implemented (5):**
`jira`, `google_sheets`, `hubspot`, `notion`, `twilio_sms`

---

## Repair Engine

Every repair attempt is classified and logged:

| Strategy | Trigger condition |
|---|---|
| `STRUCTURAL` | JSON parse failure, malformed or truncated output |
| `FIELD` | Missing required field or wrong type |
| `CONSISTENCY` | Cross-layer reference mismatch (e.g. page references non-existent entity) |
| `ESCALATED` | 2+ failed repair attempts — routed to HITL |

Blind full retries are not used. Each attempt is targeted at the specific error.

---

## Evaluation

Two evaluation suites run via the `/eval` dashboard:

- **20 standard prompts** in `src/compiler/eval/prompts.json`
- **12 assignment prompts** in `src/compiler/eval/assignment_prompts.json`

Metrics tracked per run: `pipeline_completed`, `total_latency_ms`, `total_tokens`,
`repair_count`, `repair_strategies_used`, `hitl_triggered`, `validation_passed`,
`runtime_viable`, `integrations_correctly_detected`, `human_judgment`.

---

## Deployment

| Service | Target | Notes |
|---|---|---|
| Frontend | Vercel — `oneatlas-appspec-engine` | New project, independent of ProtoFlow |
| Backend | HuggingFace Spaces — `oneatlas-appspec-engine-api` | New space |

---

## What is stubbed vs implemented

| Feature | Status |
|---|---|
| Multi-stage pipeline (intent, arch, db, api, ui, auth, validate, repair, runtime, log) | Implemented |
| SSE streaming with replay buffer | Implemented |
| HITL (human-in-the-loop) with asyncio blocking | Implemented |
| Repair engine with classified strategies | Implemented |
| Integration registry (10 integrations) | Implemented |
| Workflow stub generation | Implemented |
| AppSpec unified output | Implemented |
| Provider routing config (Groq / Gemini / OpenRouter) | Implemented |
| Integration HTTP calls (Slack API, Stripe API, etc.) | Stubbed — metadata correct, no live calls |
| OAuth flows | Not implemented (out of scope per assignment) |

---

## Provider Routing

Model selection is config-driven via `src/compiler/config/routing.yaml`.
No model names are hardcoded in pipeline code.

### Configured providers (3)

| Provider | Use | API Key Env |
|---|---|---|
| **Groq** | Primary for all stages — low latency | `GROQ_API_KEY` |
| **Gemini** | Schema + repair fallback — higher capability | `GEMINI_API_KEY` |
| **OpenRouter** | Universal fallback on 429 or 5xx | `OPENROUTER_API_KEY` |

### Routing decisions per stage

| Stage | Primary | Fallback |
|---|---|---|
| `intent_extraction` | `groq/llama-3.3-70b-versatile` | `openrouter/meta-llama/llama-3.3-70b-instruct` |
| `db_schema` | `groq/llama-3.3-70b-versatile` | `gemini/gemini-1.5-flash` |
| `api_schema` | `groq/llama-3.3-70b-versatile` | `gemini/gemini-1.5-flash` |
| `repair` | `groq/llama-3.3-70b-versatile` | `gemini/gemini-1.5-flash` (escalates tier) |
| all others | `groq/llama-3.3-70b-versatile` | `openrouter/meta-llama/llama-3.3-70b-instruct` |

### Fallback behaviour

- **429 (rate limit):** existing key rotation + exponential backoff applies
- **5xx (provider error):** immediately switches to fallback model from routing.yaml
- All routing decisions logged: `[routing] FALLBACK stage=X primary=Y -> fallback=Z reason=5xx`

### Cost tracking

Every run logs per-stage cost estimates via a `COST_TABLE` in `routing.yaml`.
Accessible in the `/result` response under `eval_metrics.stage_costs_usd`,
`eval_metrics.total_cost_usd`, and `eval_metrics.stage_models_used`.

To change any model, edit `routing.yaml` — no code changes required.

---

## Completed Features

| Feature | Status | Description |
|---|---|---|
| **A — Integration Registry** | Complete | 10 integrations (5 impl + 5 stubbed), `GET /integrations` |
| **B — Workflow Stubs** | Complete | Hybrid deterministic+LLM generation, registry-validated |
| **C — Integration Hooks** | Complete | Normalized, deduplicated by hook_id, deterministic |
| **D — Unified AppSpec** | Complete | Assembly from validated outputs, zero LLM calls, additive |
| **E — Provider Routing** | Complete | routing.yaml, 3 providers, COST_TABLE, fallback on 5xx |
| **F — Repair Classification** | Complete | STRUCTURAL/FIELD/CONSISTENCY/ESCALATED, per-attempt log |
| **G — Missing APIs** | Complete | `GET /integrations`, `POST /generate/{id}/repair` |
| **H — Evaluation** | Complete | 12 assignment prompts + `GET /eval/assignment-prompts` |

---

## API Reference (complete)

| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Start pipeline, returns `session_id` |
| GET | `/stream/{id}` | SSE stream with replay on reconnect |
| POST | `/clarify` | Submit HITL answers |
| POST | `/modify` | Midway prompt modification |
| GET | `/result/{id}` | Full output: all schemas + `app_spec` + `repair_log` + routing metadata |
| GET | `/integrations` | Full integration registry (Feature A/G) |
| POST | `/generate/{id}/repair` | Manual repair trigger with `stage` + `error_hint` (Feature G) |
| GET | `/health` | Health check |
| GET | `/eval/prompts` | 20 standard eval prompts |
| GET | `/eval/assignment-prompts` | 12 required assignment prompts (Feature H) |
| POST | `/eval/run/{id}` | Run eval prompt (skip_hitl=True) |
| POST | `/eval/record/{id}` | Save human judgment |
| GET | `/eval/results` | Aggregated metrics |
| GET | `/eval/export` | Download eval_results.json |

---

## Repair Strategy Classification

Every repair attempt is classified and logged in `repair_log[]`, accessible via `/result`:

```json
{
  "repair_log": [
    {
      "attempt_number": 1,
      "strategy": "CONSISTENCY",
      "error_input": "Page /deals references entity Deal which does not exist in schema",
      "outcome": "repaired",
      "errors_before": 2,
      "errors_after": 0
    }
  ]
}
```

| Strategy | Trigger |
|---|---|
| `STRUCTURAL` | JSON parse failure, empty/malformed output |
| `FIELD` | Missing required field, wrong type |
| `CONSISTENCY` | Cross-layer reference mismatch |
| `ESCALATED` | 2+ failed attempts, routed to HITL |

---

## Evaluation Dataset

**Standard prompts** (`/eval/prompts`): 20 prompts with expected behavior and known challenges

**Assignment prompts** (`/eval/assignment-prompts`): 12 required prompts from the trial spec:
- 7 real product prompts (CRM, task manager, inventory, HR, e-commerce, events, project tracker)
- 5 edge cases (minimal, ambiguous, overscoped, conflicting domain, vague modifier)

Each run tracked with: `pipeline_completed`, `latency_ms`, `tokens`, `repair_count`, `repair_strategies_used`, `integrations_correctly_detected`, `workflow_stubs_generated`, `human_judgment`.