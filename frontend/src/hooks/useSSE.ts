import { useEffect, useRef } from "react";
import { createSSEStream } from "../api/client";
import type { SSEEvent } from "../api/types";

interface UseSSEOptions {
  sessionId: string | null;
  onEvent: (event: SSEEvent) => void;
  onError?: (err: Event) => void;
}

/**
 * Opens an SSE connection to /stream/{sessionId}.
 * Automatically reconnects on error (up to 5 times).
 * Closes when pipeline_complete or pipeline_failed is received.
 */
export function useSSE({ sessionId, onEvent, onError }: UseSSEOptions) {
  const esRef = useRef<EventSource | null>(null);
  const retryCount = useRef(0);
  const MAX_RETRIES = 5;

  // Use refs for callbacks to avoid reconnect loops
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;

  useEffect(() => {
    if (!sessionId) return;

    retryCount.current = 0;
    let cancelled = false;

    function connect() {
      if (cancelled || !sessionId) return;

      console.log("[useSSE] Connecting to session:", sessionId, "retry:", retryCount.current);
      const es = createSSEStream(sessionId);
      esRef.current = es;

      const handleMessage = (e: MessageEvent) => {
        try {
          const parsed: SSEEvent = JSON.parse(e.data);
          console.log("[useSSE] Event received:", parsed.event);
          onEventRef.current(parsed);

          if (parsed.event === "pipeline_complete" || parsed.event === "pipeline_failed") {
            console.log("[useSSE] Terminal event received, closing stream.");
            es.close();
          }
        } catch (err) {
          console.error("[useSSE] Failed to parse SSE data:", e.data, err);
        }
      };

      // Listen to all named event types
      const eventTypes = [
        "stage_update", "hitl_required", "log_update",
        "pipeline_complete", "pipeline_failed", "ping",
        "modification_queued", "modification_applied",
      ];
      eventTypes.forEach((type) => es.addEventListener(type, handleMessage as EventListener));
      es.onmessage = handleMessage; // fallback for unnamed events

      es.onerror = (err) => {
        console.error("[useSSE] SSE error on session:", sessionId, err);
        es.close();
        if (!cancelled && retryCount.current < MAX_RETRIES) {
          retryCount.current += 1;
          const delay = Math.min(1000 * retryCount.current, 5000);
          console.log("[useSSE] Reconnecting in", delay, "ms...");
          setTimeout(connect, delay);
        } else if (!cancelled) {
          console.error("[useSSE] Max retries reached. Giving up.");
          onErrorRef.current?.(err);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      console.log("[useSSE] Cleanup — closing stream for session:", sessionId);
      esRef.current?.close();
    };
  }, [sessionId]);
}
