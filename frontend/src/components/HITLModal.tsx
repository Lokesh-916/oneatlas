import { useState, useEffect } from "react";
import { MessageSquare, Timer, Send, AlertCircle } from "lucide-react";
import type { HITLRequiredEvent } from "../api/types";
import { submitClarify } from "../api/client";

interface HITLModalProps {
  event: HITLRequiredEvent;
  onResume: () => void;
}

const TRIGGER_LABELS: Record<string, string> = {
  always_on:      "Confirming scope assumptions",
  low_confidence: "Low confidence — clarification needed",
  ambiguous:      "Ambiguous requirement detected",
  repair_failed:  "Repair failed — manual resolution required",
};

export default function HITLModal({ event, onResume }: HITLModalProps) {
  const [answers, setAnswers] = useState<string[]>(event.questions.map(() => ""));
  const [chosenOption, setChosenOption] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [timeLeft, setTimeLeft] = useState(event.timeout_seconds);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => s - 1), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  const handleSubmit = async () => {
    console.log("[HITLModal] Submitting. answers:", answers, "option:", chosenOption);
    setSubmitting(true);
    try {
      await submitClarify(
        event.session_id,
        event.options ? [chosenOption] : answers,
        event.options ? chosenOption : undefined,
      );
      onResume();
    } catch (err) {
      console.error("[HITLModal] Submit failed:", err);
      setSubmitting(false);
    }
  };

  const canSubmit = event.options
    ? chosenOption !== ""
    : answers.every(a => a.trim() !== "");

  const mins = Math.floor(timeLeft / 60);
  const secs = String(timeLeft % 60).padStart(2, "0");
  const urgent = timeLeft < 60;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full max-w-lg mx-4 bg-canvas-900 border border-canvas-700 rounded-2xl shadow-2xl overflow-hidden">

        {/* Header bar */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-canvas-800 bg-canvas-900/80">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-center justify-center">
              <MessageSquare className="w-4 h-4 text-rose-400" />
            </div>
            <div>
              <p className="text-sm font-semibold text-canvas-100">Input Required</p>
              <p className="text-xs text-canvas-500">
                {TRIGGER_LABELS[event.trigger_reason] ?? event.trigger_reason}
              </p>
            </div>
          </div>

          {/* Countdown */}
          <div className={`flex items-center gap-1.5 text-sm font-mono px-3 py-1.5 rounded-lg border ${
            urgent
              ? "bg-red-950 border-red-800 text-red-300"
              : "bg-gray-800 border-gray-700 text-gray-400"
          }`}>
            <Timer className="w-3.5 h-3.5" />
            {mins}:{secs}
          </div>
        </div>

        {/* Stage badge */}
        <div className="px-5 pt-4">
          <span className="inline-flex items-center text-xs px-2 py-1 rounded-md bg-canvas-800 text-canvas-400 border border-canvas-700 font-mono">
            stage: {event.stage}
          </span>
        </div>

        {/* Questions */}
        <div className="px-5 py-4 space-y-4">
          {event.options ? (
            <div>
              <p className="text-sm text-canvas-200 mb-3">{event.questions[0]}</p>
              <div className="space-y-2">
                {event.options.map((opt) => (
                  <label
                    key={opt}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      chosenOption === opt
                        ? "border-rose-500/60 bg-rose-950/30"
                        : "border-canvas-800 hover:border-canvas-700 bg-canvas-800/40"
                    }`}
                  >
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 transition-colors ${
                      chosenOption === opt ? "border-rose-400 bg-rose-400" : "border-canvas-600"
                    }`} />
                    <input
                      type="radio"
                      name="hitl_option"
                      value={opt}
                      checked={chosenOption === opt}
                      onChange={() => setChosenOption(opt)}
                      className="sr-only"
                    />
                    <span className="text-sm text-canvas-300">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ) : (
            event.questions.map((q, i) => (
              <div key={i}>
                <label className="block text-sm text-canvas-200 mb-1.5">{q}</label>
                <input
                  type="text"
                  value={answers[i]}
                  onChange={e => {
                    const next = [...answers];
                    next[i] = e.target.value;
                    setAnswers(next);
                  }}
                  onKeyDown={e => { if (e.key === "Enter" && canSubmit && !submitting) handleSubmit(); }}
                  placeholder="Type your answer…"
                  className="w-full bg-canvas-800 border border-canvas-700 rounded-lg px-3 py-2.5
                             text-sm text-canvas-100 placeholder-canvas-600
                             focus:outline-none focus:border-rose-500/60 focus:ring-1 focus:ring-rose-500/20
                             transition-all"
                />
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 space-y-3">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl
                       bg-rose-500 hover:bg-rose-400 active:bg-rose-600
                       disabled:opacity-40 disabled:cursor-not-allowed
                       text-canvas-900 font-semibold text-sm transition-colors"
          >
            {submitting
              ? <><Loader className="w-4 h-4 animate-spin" /> Resuming pipeline…</>
              : <><Send className="w-4 h-4" /> Resume Pipeline</>
            }
          </button>

          <div className="flex items-center gap-2 text-xs text-canvas-600">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>This dialog cannot be dismissed — the pipeline is paused waiting for your input.</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline spinner to avoid import cycle
function Loader({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}
