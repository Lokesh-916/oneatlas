// ProtoFlow API client

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export async function startPipeline(prompt: string): Promise<{ session_id: string }> {
  console.log("[api] POST /generate prompt_length=%d", prompt.length);
  const res = await fetch(`${BASE}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[api] /generate failed:", err);
    throw new Error(`Failed to start pipeline: ${err}`);
  }
  const data = await res.json();
  console.log("[api] Session created:", data.session_id);
  return data;
}

export async function submitClarify(
  session_id: string,
  answers: string[],
  chosen_option?: string
): Promise<void> {
  console.log("[api] POST /clarify session=%s answers=%d", session_id, answers.length);
  const res = await fetch(`${BASE}/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, answers, chosen_option: chosen_option ?? null }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[api] /clarify failed:", err);
    throw new Error(`Failed to submit clarification: ${err}`);
  }
}

export async function submitModification(
  session_id: string,
  modification: string
): Promise<{ status: string; message: string }> {
  console.log("[api] POST /modify session=%s modification_length=%d", session_id, modification.length);
  const res = await fetch(`${BASE}/modify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id, modification }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error("[api] /modify failed:", err);
    throw new Error(`Failed to submit modification: ${err}`);
  }
  return res.json();
}


export async function getResult(session_id: string): Promise<Record<string, unknown>> {
  console.log("[api] GET /result/%s", session_id);
  const res = await fetch(`${BASE}/result/${session_id}`);
  if (!res.ok) throw new Error(`Result not ready: ${res.status}`);
  return res.json();
}

export async function getLogs(session_id: string): Promise<string> {
  const res = await fetch(`${BASE}/logs/${session_id}`);
  if (!res.ok) throw new Error(`Logs not available: ${res.status}`);
  return res.text();
}

export function createSSEStream(session_id: string): EventSource {
  const url = `${BASE}/stream/${session_id}`;
  console.log("[api] Opening SSE stream:", url);
  return new EventSource(url);
}
