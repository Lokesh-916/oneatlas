import { ArrowRight } from "lucide-react";
import StageCard from "./StageCard";
import type { StageStatus } from "../api/types";
import { STAGE_ORDER, STAGE_META } from "../api/types";

export interface StageState {
  status: StageStatus;
  latencyMs?: number;
  tokens?: number;
  confidence?: number;
  outputSummary?: string;
  assumptions?: string[];
  conflicts?: string[];
  repaired?: boolean;
}

interface PipelineProgressProps {
  stages: Record<string, StageState>;
  onViewResults?: () => void;
  complete?: boolean;
}

export default function PipelineProgress({ stages, onViewResults, complete }: PipelineProgressProps) {
  const completedCount = Object.values(stages).filter(s => s.status === "complete").length;
  const totalCount = STAGE_ORDER.length;
  const progressPct = Math.round((completedCount / totalCount) * 100);

  return (
    <div className="flex flex-col gap-3">
      {/* Progress bar */}
      <div className="flex items-center gap-3 mb-1">
        <div className="flex-1 h-1 bg-canvas-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-terra-500 to-sage-500 rounded-full transition-all duration-700"
            style={{ width: `${progressPct}%` }}
          />
        </div>
        <span className="text-xs text-canvas-500 flex-shrink-0 font-mono tabular-nums">
          {completedCount}/{totalCount}
        </span>
      </div>

      {/* Stage cards */}
      <div className="relative">
        {/* Vertical connector */}
        <div className="absolute left-[17px] top-5 bottom-5 w-px bg-canvas-800 z-0" />

        <div className="relative z-10 flex flex-col gap-2">
          {STAGE_ORDER.map((stageKey) => {
            const meta = STAGE_META[stageKey];
            const state = stages[stageKey] ?? { status: "pending" as StageStatus };
            return (
              <StageCard
                key={stageKey}
                stage={stageKey}
                label={meta.label}
                model={meta.model}
                status={state.status}
                latencyMs={state.latencyMs}
                tokens={state.tokens}
                confidence={state.confidence}
                outputSummary={state.outputSummary}
                assumptions={state.assumptions}
                conflicts={state.conflicts}
                repaired={state.repaired}
              />
            );
          })}
        </div>
      </div>

      {/* View Results CTA */}
      {complete && onViewResults && (
        <button
          onClick={onViewResults}
          className="mt-4 w-full flex items-center justify-center gap-2 py-3 rounded-xl
                     bg-terra-600 hover:bg-terra-500 active:bg-terra-700
                     text-white font-semibold text-sm transition-all duration-200
                     shadow-lg shadow-terra-500/20 ring-1 ring-terra-500/30"
        >
          View Results
          <ArrowRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}
