import { useState } from "react";
import type { StageStatus } from "../api/types";

interface Props {
  label: string; model: string; status: StageStatus;
  latencyMs?: number; outputSummary?: string;
  assumptions?: string[]; conflicts?: string[]; repaired?: boolean;
}

const DOT: Record<StageStatus, string> = {
  pending: "bg-ink-200",
  running: "bg-accent-500 animate-pulse",
  complete: "bg-green-600",
  failed: "bg-red-600",
  repair_triggered: "bg-amber-600",
  hitl_required: "bg-amber-500 animate-pulse",
};

const LABEL_CLS: Record<StageStatus, string> = {
  pending: "text-ink-400",
  running: "text-ink-800 font-medium",
  complete: "text-ink-800",
  failed: "text-red-700",
  repair_triggered: "text-amber-700",
  hitl_required: "text-amber-700",
};

export default function StageCard({ label, model, status, latencyMs, outputSummary, assumptions=[], conflicts=[], repaired }: Props) {
  const [open, setOpen] = useState(false);
  const hasExtra = assumptions.length > 0 || conflicts.length > 0 || !!outputSummary;

  return (
    <div className={order-l-2 pl-4 py-1.5 }>
      <div className="flex items-center gap-2.5">
        <span className={w-2 h-2 rounded-full flex-shrink-0 } />
        <span className={	ext-sm flex-1 }>{label}</span>
        {repaired && <span className="text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">repaired</span>}
        {status === "hitl_required" && <span className="text-[10px] font-mono bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">awaiting input</span>}
        {status === "complete" && latencyMs && <span className="text-[10px] font-mono text-ink-400">{latencyMs}ms</span>}
        {hasExtra && status !== "pending" && (
          <button onClick={() => setOpen(o => !o)} className="text-[10px] text-ink-400 hover:text-ink-700 font-mono">
            {open ? "▲" : "▼"}
          </button>
        )}
      </div>
      {open && hasExtra && (
        <div className="mt-2 ml-4 space-y-1.5 text-xs">
          {outputSummary && <p className="font-mono text-ink-500 break-all">{outputSummary}</p>}
          {assumptions.map((a,i) => <p key={i} className="text-ink-500">→ {a}</p>)}
          {conflicts.map((c,i) => <p key={i} className="text-amber-700">⚠ {c}</p>)}
        </div>
      )}
    </div>
  );
}