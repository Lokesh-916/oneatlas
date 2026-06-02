# OneAtlas AppSpec Engine

> Natural language to validated AppSpec — entities, schema, APIs, pages, auth rules, integration hooks, workflow stubs.

A multi-stage AI compilation pipeline that converts open-ended product descriptions into a strict,
cross-consistent AppSpec ready for downstream code generation or template rendering.

Built for the OneAtlas.dev AI Engineer trial assignment (June 2026).

---

## Running Locally

    uv run uvicorn compiler.main:app --host 0.0.0.0 --port 8000
    cd frontend && npm run dev

Required .env:

    GROQ_API_KEY=your_key_here
    GEMINI_API_KEY=your_key_here
    OPENROUTER_API_KEY=your_key_here

---

## Deployment

Frontend: Vercel project oneatlas-appspec-engine
Backend:  HuggingFace Spaces oneatlas-appspec-engine-api

DO NOT overwrite compiler (ProtoFlow) deployments.

---

## Integration Registry

Implemented: slack, gmail, stripe, whatsapp, webhook
Stubbed: jira, google_sheets, hubspot, notion, twilio_sms

---

## Provider Routing

Configured via src/compiler/config/routing.yaml
Providers: Groq (primary), Gemini (schema fallback), OpenRouter (universal fallback)

---

## Repair Strategies

Every repair attempt is classified: STRUCTURAL, FIELD, CONSISTENCY, ESCALATED
