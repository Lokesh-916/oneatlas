---
title: OneAtlas AppSpec Engine
emoji: 🚀
colorFrom: blue
colorTo: indigo
sdk: docker
pinned: false
---

# 🚀 OneAtlas AppSpec Engine

![OneAtlas Preview](./image.png)

> **AI Engineer — 3-Day Trial Task** (June 2026)  
> *A multi-stage AI compilation pipeline that converts a natural language app description into a structured, validated AppSpec.*

OneAtlas AppSpec Engine is built for reliability. The core challenge of AI-native software generation isn't just calling an LLM—it's ensuring the output is **structured, reliable, and executable**. This engine introduces a multi-stage validation and self-repair pipeline to ensure even messy inputs yield perfect `AppSpec` JSONs.

---

## ✨ Features

- **Multi-Stage AI Pipeline**: Distinct phases for Intent, Architecture, Database, APIs, UI, Auth, and Workflows.
- **Self-Repair Engine**: 3-tier repair loop (Structural, Field, Consistency) automatically fixes LLM hallucinations.
- **Human-in-the-Loop (HITL)**: Intelligently suspends the pipeline to ask clarifying questions when requirements are deeply ambiguous.
- **Provider Routing**: Gracefully degrades from Groq to Gemini to OpenRouter upon rate-limiting (429) or server errors (5xx).
- **Mermaid Graphing**: Live visual architecture, ER diagrams, and sequence flows.

---

## 🏗️ Architecture & Pipeline

```mermaid
flowchart LR
    A[Intent Extraction] --> B[Architecture Design]
    subgraph Parallel Schema Generation
        direction TB
        D(DB Schema)
        E(API Schema)
        F(UI Schema)
        G(Auth Schema)
    end
    
    B --> D
    B --> E
    B --> F
    B --> G
    
    D --> H[Validation Engine]
    E --> H
    F --> H
    G --> H
    
    H -- "Errors Found" --> I[Repair Loop]
    I -- "Fixed" --> H
    I -- "Too Ambiguous" --> J[Human in the Loop]
    J --> H
    
    H -- "Valid" --> K[Integration Hooks]
    K --> L[Workflow Stubs]
    L --> M((Unified AppSpec))
```

---

## 🚀 Quick Start (Under 5 Minutes)

### 1. Backend (FastAPI / CrewAI)

```bash
git clone https://github.com/Lokesh-916/oneatlas.git
cd oneatlas
uv sync
cp .env.example .env
```
> [!IMPORTANT]
> Ensure you add your `GROQ_API_KEY` to the `.env` file!

```bash
uv run uvicorn compiler.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend (React / Vite)

```bash
cd frontend
npm install
npm run dev
```



## 🛠️ The Repair Engine

When the LLM generates invalid JSON or inconsistent schemas, the Repair Engine intercepts the payload before it poisons the pipeline:

| Strategy | Trigger | Action |
|---|---|---|
| **STRUCTURAL** | JSON Parsing Failure | Uses `json_repair` heuristic tooling + LLM strict mode. |
| **FIELD** | Missing or invalid types | Extracts exactly what is missing and executes a targeted re-prompt. |
| **CONSISTENCY** | Cross-layer mismatch | Fixes references (e.g. an API calling a non-existent DB table). |
| **ESCALATED** | 3+ consecutive failures | Pauses generation and triggers Human-in-the-Loop clarification. |

---

## 🔌 Integration Registry

The engine statically maps natural language requests to predefined integration stubs.

| Status | Integrations |
|---|---|
| 🟢 **Implemented** | `slack`, `gmail`, `stripe`, `whatsapp`, `webhook`, `google_sheets` |
| 🟡 **Stubbed** | `jira`, `hubspot`, `notion`, `twilio_sms` |

---

## 📊 Evaluation Results

The pipeline was tested against the 12 required trial prompts (`eval_reports/`).

* **Success Rate**: 12/12 successful AppSpec generations.
* **Latency**: ~120s average generation time.
* **Cost**: ~$0.0065 average cost per run.
* **Resilience**: The repair loop caught and resolved errors in 6/12 runs. The weakest link was LLM validation occasionally missing strict field-type casting, which the secondary repair layer successfully handled.

---

## 💻 Tech Stack

* **Backend**: Python 3.12, FastAPI, CrewAI 1.14.5, Groq, LiteLLM
* **Frontend**: React 19, Vite, TailwindCSS
* **Deployment**: Hugging Face Spaces (Backend Docker) / Vercel (Frontend)
