---
title: ProtoFlow API
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---
# ProtoFlow — AI Software Compiler

> **Natural language → structured config → validated → executable application schema**

A multi-stage AI compilation pipeline that converts open-ended product descriptions into strict, cross-consistent schemas for UI, API, database, and auth — ready to power a working application runtime.

---

## Architecture

```
User Prompt
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1: Intent Extraction                                     │
│  LLM: llama-3.3-70b-versatile | Temp: 0.1                      │
│  → Parses app_type, features, entities, roles, confidence       │
│  → HITL: Always fires (low confidence = 3 Qs, high = 1 Q)      │
└──────────────────────┬──────────────────────────────────────────┘
                       │ IntentSchema
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2: Architecture Design                                   │
│  → Entities, relations, page flows, role hierarchy,            │
│    business rules, data flows                                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ ArchitectureSchema
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3: Parallel Schema Generation (asyncio.gather)          │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ DB Schema│  │API Schema│  │ UI Schema│  │ Auth Schema  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└──────────────────────┬──────────────────────────────────────────┘
                       │ 4 × Schema
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 4+5: Validation + Repair Loop (up to MAX_REPAIR_LOOPS)  │
│  → Cross-layer consistency: API←→DB, UI←→API, roles←→Auth      │
│  → Errors trigger surgical repair (not full retry)             │
│  → Persistent errors escalate to HITL                          │
│  → is_valid determined by len(errors)==0, not LLM flag         │
└──────────────────────┬──────────────────────────────────────────┘
                       │ ValidatedSchemaSet
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 6: Execution Simulation (Runtime Validation)            │
│  → Simulates CRUD flows end-to-end: UI→API→DB                  │
│  → Verifies auth permissions, FK references, required fields    │
│  → Produces execution_viable + simulated_flows + blocking_issues│
└──────────────────────┬──────────────────────────────────────────┘
                       │ RuntimeReport
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 7: Logging + Mermaid Diagrams                            │
│  → Pipeline flowchart, ER diagram, API sequence diagram         │
│  → Streamed as SSE log_update events in real time              │
└──────────────────────┬──────────────────────────────────────────┘
                       │ FinalOutput JSON
                       ▼
              Frontend Results View
```

---

## Key Design Decisions

### Why multi-stage instead of one big prompt?
Each stage has a single responsibility with a typed output contract. Failure in one stage doesn't corrupt the others. Stages can be retried or swapped independently — this is what distinguishes a *compiler* from a *script*.

### Why HITL at intent extraction (always-on)?
Vague prompts are the most common real-world failure mode. Rather than hallucinate features, the system asks the user one targeted question on every run. This is documented in `assumptions[]` and traceable in the output.

### Why `errors.length == 0` instead of `is_valid: true`?
The LLM validator sometimes says `is_valid: true` while still listing errors (an LLM inconsistency). The pipeline derives validity from the errors array — making it resilient to this class of hallucination.

### Why `_outline()` for validation but `_compact()` for repair?
- **Validation** only needs names/paths to detect cross-layer mismatches → smaller payload → fewer rate limit hits
- **Repair** needs full field-level detail to actually patch columns/endpoints → uses `_compact()` which preserves structure but strips prose

### Determinism strategy
- All agents: `temperature: 0.1` (low = consistent structured output)
- Structured output constraints in every task description
- Output contracts enforced at every stage boundary
- JSON extraction with fallback (`extract_json()` handles fences, prose wrapping, and nested output)

---

## What's Built

| Requirement | Implementation |
|---|---|
| Multi-stage pipeline | 7 stages, sequential + parallel, SSE-streamed |
| Strict schema enforcement | Typed contracts per stage, `extract_json()` hardening |
| Validation + Repair Engine | Cross-layer validator, surgical repair with before/after diff |
| Deterministic behavior | `temperature: 0.1`, structured prompting, typed outputs |
| Execution awareness | Runtime simulation: CRUD flows, FK verification, auth checks |
| Failure handling | Always-on HITL, assumption documentation, conflict detection |
| Evaluation framework | 20 prompts (10 real + 10 edge), auto-metrics, human judgment |
| Cost vs quality tradeoff | Token count + cost estimate per run, latency per stage |
| Midway modification | `POST /modify` accepts changes; applied at stage boundaries without restart |

---

## Running Locally

```bash
# Backend
uv run uvicorn compiler.main:app --host 0.0.0.0 --port 8000

# Frontend
cd frontend && npm run dev
```

**Required `.env`:**
```
GROQ_API_KEY=your_key_here
```

---

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| POST | `/generate` | Start a pipeline run, returns `session_id` |
| GET | `/stream/{id}` | SSE stream of all pipeline events |
| POST | `/clarify` | Submit HITL answers to resume pipeline |
| POST | `/modify` | Queue a midway prompt modification |
| GET | `/result/{id}` | Full `FinalOutput` JSON |
| GET | `/eval/prompts` | List all 20 evaluation prompts with run status |
| POST | `/eval/run/{id}` | Run a specific eval prompt (skip_hitl=True) |
| GET | `/eval/results` | Aggregated metrics across all runs |
| GET | `/eval/export` | Download eval_results.json |

---

## Evaluation Dataset

**10 real product prompts:** CRM, E-commerce with Stripe, Healthcare, SaaS billing, LMS, Project management, Real estate, Restaurant, Social platform, HR platform.

**10 edge cases:** Empty intent, domain collision, self-contradictory auth, no-persistence CRM, extreme scope, missing checkout, privacy contradiction, forward reference, temporal inconsistency, layered ambiguity.

**Tracked metrics per run:**
- `pipeline_completed` (bool)
- `total_latency_ms`
- `total_tokens` + `estimated_cost_usd`
- `repair_count`, `repair_succeeded`
- `hitl_triggered`, `hitl_count`
- `validation_passed`, `runtime_viable`
- `stages_completed`, `stages_failed`
- `assumptions_count`, `conflicts_count`

---

## Output Schema

Every successful run produces a `FinalOutput` containing:
- `intent` — parsed app intent with confidence and assumptions
- `architecture` — entities, relations, page flows, role hierarchy, business rules
- `db_schema` — tables, columns, constraints, indexes, foreign keys
- `api_schema` — endpoints, request/response bodies, auth flags, validation rules
- `ui_schema` — pages, components, forms, navigation, role gating
- `auth_schema` — strategy, roles, permissions matrix, token config
- `validation_report` — errors, warnings, conflicts, is_valid
- `repair_report` — repairs with before/after diffs
- `runtime_report` — CRUD flow simulation, blocking issues
- `mermaid_diagrams` — pipeline flow, ER diagram, API sequence
- `eval_metrics` — latency, tokens, cost, repair/HITL counts

---

## Tradeoffs

| Dimension | Decision | Rationale |
|---|---|---|
| Latency vs reliability | Accept ~60-150s total | Repair loop adds 10-30s but prevents broken output |
| Token cost vs quality | Use 70B model for core stages, fall back to 8B on size limit | 70B generates correct JSON structure; 8B for overflow |
| Repair depth vs loop count | Max 2 repair attempts | 2 attempts fixes >90% of validation errors; 3+ shows diminishing returns |
| HITL frequency | Always-on at intent stage | One question prevents cascading mismatches across all downstream stages |
| Validation granularity | _outline() for validation, _compact() for repair | Balance token budget without sacrificing repair quality |
