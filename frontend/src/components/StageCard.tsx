import { useState } from "react";
import {
  CheckCircle2, XCircle, Loader2, AlertTriangle,
  Wrench, MessageSquare, ChevronDown, ChevronUp,
  Clock, Coins, BarChart2,
} from "lucide-react";
import type { StageStatus } from "../api/types";

interface StageCardProps {
  stage: string;
  label: string;
  model: string;
  status: StageStatus;
  latencyMs?: number;
  tokens?: number;
  confidence?: number;
  outputSummary?: string;
  assumptions?: string[];
  conflicts?: string[];
  repaired?: boolean;
}

function StatusIcon({ status }: { status: StageStatus }) {
  const cls = "w-4 h-4 flex-shrink-0";
  switch (status) {
    case "complete":         return <CheckCircle2  className={`${cls} text-sage-400`} />;
    case "failed":           return <XCircle       className={`${cls} text-red-400`} />;
    case "running":          return <Loader2       className={`${cls} text-terra-400 animate-spin`} />;
    case "repair_triggered": return <Wrench        className={`${cls} text-rose-400`} />;
    case "hitl_required":    return <MessageSquare className={`${cls} text-rose-400`} />;
    default:                 return <div           className={`${cls} rounded-full bg-canvas-700`} />;
  }
}

const STATUS_BORDER: Record<StageStatus, string> = {
  pending:          "border-canvas-800",
  running:          "border-terra-500/60",
  complete:         "border-sage-500/40",
  failed:           "border-red-500/60",
  repair_triggered: "border-rose-500/60",
  hitl_required:    "border-rose-400/60",
};

export default function StageCard({
  label, model, status, latencyMs, tokens, confidence,
  outputSummary, assumptions = [], conflicts = [], repaired,
}: StageCardProps) {
  const [expanded, setExpanded] = useState(false);
  const hasDetails = assumptions.length > 0 || conflicts.length > 0 || outputSummary;

  return (
    <div className={`rounded-lg border ${STATUS_BORDER[status]} bg-canvas-900/80 p-3 transition-all duration-300`}>
      <div className="flex items-center gap-3">
        <StatusIcon status={status} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm text-canvas-100">{label}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-canvas-800 text-canvas-500 font-mono">
              {model}
            </span>
            {repaired && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-orange-950 text-orange-300 border border-orange-800/50">
                <Wrench className="w-3 h-3" /> Repaired
              </span>
            )}
            {status === "hitl_required" && (
              <span className="flex items-center gap-1 text-xs px-1.5 py-0.5 rounded bg-rose-950 text-rose-300 border border-rose-800/50">
                <MessageSquare className="w-3 h-3" /> Awaiting input
              </span>
            )}
          </div>

          {status === "complete" && (
            <div className="flex gap-3 mt-1 text-xs text-canvas-500">
              {latencyMs !== undefined && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />{latencyMs}ms
                </span>
              )}
              {tokens !== undefined && tokens > 0 && (
                <span className="flex items-center gap-1">
                  <Coins className="w-3 h-3" />{tokens}
                </span>
              )}
              {confidence !== undefined && (
                <span className={`flex items-center gap-1 ${confidence >= 0.75 ? "text-sage-400" : "text-rose-400"}`}>
                  <BarChart2 className="w-3 h-3" />{Math.round(confidence * 100)}%
                </span>
              )}
            </div>
          )}
        </div>

        {hasDetails && status !== "pending" && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-canvas-600 hover:text-canvas-300 flex-shrink-0 transition-colors"
          >
            {expanded
              ? <ChevronUp className="w-4 h-4" />
              : <ChevronDown className="w-4 h-4" />}
          </button>
        )}
      </div>

      {expanded && hasDetails && (
        <div className="mt-3 space-y-2 text-xs border-t border-canvas-800 pt-2">
          {outputSummary && (
            <div>
              <span className="text-canvas-500 uppercase tracking-wide text-[10px]">Output</span>
              <p className="text-canvas-300 mt-0.5 font-mono break-all">{outputSummary}</p>
            </div>
          )}
          {assumptions.length > 0 && (
            <div>
              <span className="text-canvas-500 uppercase tracking-wide text-[10px]">Assumptions</span>
              <ul className="mt-0.5 space-y-0.5">
                {assumptions.map((a, i) => (
                  <li key={i} className="text-canvas-400 flex gap-1.5">
                    <span className="text-canvas-600">–</span>{a}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {conflicts.length > 0 && (
            <div>
              <span className="text-orange-400 uppercase tracking-wide text-[10px]">Conflicts</span>
              <ul className="mt-0.5 space-y-0.5">
                {conflicts.map((c, i) => (
                  <li key={i} className="text-orange-300 flex gap-1.5">
                    <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />{c}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
