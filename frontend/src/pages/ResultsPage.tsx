import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  Cpu, Database, Globe, Layout, Shield, CheckCircle2,
  Play, GitBranch, Download, Copy, RotateCcw, XCircle, Loader2, FileJson, Pencil
} from "lucide-react";
import SchemaViewer from "../components/SchemaViewer";
import MermaidDiagram from "../components/MermaidDiagram";
import AssumptionsPanel from "../components/AssumptionsPanel";
import ConflictsPanel from "../components/ConflictsPanel";
import { getResult } from "../api/client";

type Tab = "overview" | "combined" | "database" | "api" | "ui" | "auth" | "validation" | "runtime" | "diagrams" | "modifications";

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "overview",       label: "Overview",      icon: Cpu },
  { id: "combined",       label: "Combined",      icon: FileJson },
  { id: "database",       label: "Database",      icon: Database },
  { id: "api",            label: "API",           icon: Globe },
  { id: "ui",             label: "UI",            icon: Layout },
  { id: "auth",           label: "Auth",          icon: Shield },
  { id: "validation",     label: "Validation",    icon: CheckCircle2 },
  { id: "runtime",        label: "Runtime",       icon: Play },
  { id: "diagrams",       label: "Diagrams",      icon: GitBranch },
  { id: "modifications",  label: "Modifications", icon: Pencil },
];

export default function ResultsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get("session");

  const [tab, setTab] = useState<Tab>("overview");
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!sessionId) { navigate("/"); return; }
    getResult(sessionId)
      .then(data => { setResult(data); setLoading(false); })
      .catch(err => {
        if (err.message.includes("202")) {
          navigate(`/generate?session=${sessionId}`);
        } else {
          setError(err.message ?? String(err));
          setLoading(false);
        }
      });
  }, [sessionId, navigate]);

  const handleDownload = () => {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `protoflow-${sessionId?.slice(0, 8)}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    if (!result) return;
    navigator.clipboard.writeText(JSON.stringify(result, null, 2)).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    });
  };

  if (loading) return (
    <div className="h-screen bg-canvas-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-canvas-600">
        <Loader2 className="w-8 h-8 animate-spin text-terra-500" />
        <span className="text-sm font-medium">Loading results...</span>
      </div>
    </div>
  );

  if (error) return (
    <div className="h-screen bg-canvas-950 flex items-center justify-center">
      <div className="text-center space-y-4">
        <XCircle className="w-10 h-10 text-rose-500 mx-auto" />
        <p className="text-rose-400 text-sm max-w-sm">{error}</p>
        <button onClick={() => navigate("/")} className="text-xs text-canvas-500 hover:text-canvas-300 underline">
          Back to home
        </button>
      </div>
    </div>
  );

  const mermaid = (result?.mermaid_diagrams ?? {}) as Record<string, string>;
  const validation = result?.validation_report as Record<string, unknown> | undefined;
  const runtime = result?.runtime_report as Record<string, unknown> | undefined;
  const metrics = result?.eval_metrics as Record<string, unknown> | undefined;
  const assumptions = ((result?.intent as Record<string, unknown>)?.assumptions ?? []) as string[];
  const conflicts = (validation?.conflicts ?? []) as Array<{ description: string; resolution_strategy: string }>;

  // Derive validity from errors array — the LLM's is_valid flag is unreliable.
  // A report is "real" if it has a validated_at timestamp or at least one error/warning.
  const validationErrors = (validation?.errors as unknown[]) ?? [];
  const validationWarnings = (validation?.warnings as unknown[]) ?? [];
  const hasRealReport = Boolean(validation?.validated_at || validationErrors.length > 0 || validationWarnings.length > 0);
  const validationPassed = hasRealReport && validationErrors.length === 0;

  return (
    <div className="h-screen bg-canvas-950 bg-noise flex flex-col overflow-hidden">

      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-canvas-900 flex-shrink-0">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" className="w-6 h-6 object-contain" alt="ProtoFlow logo" />
          <span className="font-display text-lg text-canvas-100">ProtoFlow</span>
          <span className="text-canvas-700 mx-1">/</span>
          <span className="text-xs text-canvas-500">Results</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(`/generate?session=${sessionId}`)}
            className="flex items-center gap-1.5 text-xs text-canvas-500 hover:text-canvas-300 px-2.5 py-1.5 rounded-lg hover:bg-canvas-900 transition-colors">
            <Play className="w-3.5 h-3.5" /> Pipeline
          </button>
          <button onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-canvas-500 hover:text-canvas-300 px-2.5 py-1.5 rounded-lg hover:bg-canvas-900 transition-colors">
            <RotateCcw className="w-3.5 h-3.5" /> New
          </button>
        </div>
      </nav>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 py-2 border-b border-canvas-900 overflow-x-auto flex-shrink-0 bg-canvas-950">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
              tab === id
                ? "bg-terra-500/15 text-terra-400 border border-terra-500/25"
                : "text-canvas-500 hover:text-canvas-300 hover:bg-canvas-900"
            }`}>
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {tab === "overview" && (
          <div className="max-w-3xl mx-auto space-y-5">
            {metrics && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { label: "Total Latency",  value: `${metrics.total_latency_ms}ms` },
                  { label: "Tokens Used",    value: String(metrics.total_tokens ?? 0) },
                  { label: "Repair Loops",   value: String(metrics.repair_count ?? 0) },
                  { label: "HITL Rounds",    value: String(metrics.hitl_count ?? 0) },
                ].map(({ label, value }) => (
                  <div key={label} className="rounded-2xl border border-canvas-800 bg-canvas-900/60 p-5 text-center">
                    <p className="text-3xl font-bold text-canvas-100 tabular-nums font-mono">{value}</p>
                    <p className="text-xs text-canvas-500 mt-1.5 font-medium">{label}</p>
                  </div>
                ))}
              </div>
            )}
            <AssumptionsPanel assumptions={assumptions} />
            <ConflictsPanel conflicts={conflicts} />
          </div>
        )}

        {tab === "combined"   && <SchemaViewer data={{
          db_schema: result?.db_schema,
          api_schema: result?.api_schema,
          ui_schema: result?.ui_schema,
          auth_schema: result?.auth_schema
        }} title="Combined Schema" />}
        {tab === "database"   && <SchemaViewer data={result?.db_schema}  title="Database Schema" />}
        {tab === "api"        && <SchemaViewer data={result?.api_schema}  title="API Schema" />}
        {tab === "ui"         && <SchemaViewer data={result?.ui_schema}   title="UI Schema" />}
        {tab === "auth"       && <SchemaViewer data={result?.auth_schema} title="Auth Schema" />}

        {tab === "validation" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
              !hasRealReport
                ? "border-canvas-700/40 bg-canvas-800/30"
                : validationPassed
                  ? "border-sage-600/40 bg-sage-600/5"
                  : "border-rose-600/40 bg-rose-600/5"
            }`}>
              {!hasRealReport
                ? <span className="w-5 h-5 text-canvas-500">○</span>
                : validationPassed
                  ? <CheckCircle2 className="w-5 h-5 text-sage-400" />
                  : <XCircle className="w-5 h-5 text-rose-400" />}
              <span className="font-semibold text-sm text-canvas-200">
                {!hasRealReport
                  ? "Validation report not yet available"
                  : validationPassed
                    ? `All schemas are consistent (${validationWarnings.length} warning${validationWarnings.length !== 1 ? 's' : ''})`
                    : `${validationErrors.length} error${validationErrors.length !== 1 ? 's' : ''} found`}
              </span>
            </div>
            <SchemaViewer data={result?.validation_report} title="Validation Report" />
          </div>
        )}

        {tab === "runtime" && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className={`flex items-center gap-3 p-4 rounded-2xl border ${
              runtime?.execution_viable
                ? "border-sage-600/40 bg-sage-600/5"
                : "border-rose-600/40 bg-rose-600/5"
            }`}>
              {runtime?.execution_viable
                ? <CheckCircle2 className="w-5 h-5 text-sage-400" />
                : <XCircle className="w-5 h-5 text-rose-400" />}
              <span className="font-semibold text-sm text-canvas-200">
                {runtime?.execution_viable ? "Application is executable" : "Blocking issues found"}
              </span>
            </div>
            <SchemaViewer data={result?.runtime_report} title="Runtime Report" />
          </div>
        )}

        {tab === "diagrams" && (
          <div className="max-w-4xl mx-auto space-y-6">
            <MermaidDiagram title="Pipeline Flow"  source={mermaid.pipeline_flow ?? ""} />
            <MermaidDiagram title="ER Diagram"     source={mermaid.er_diagram ?? ""} />
            <MermaidDiagram title="API Sequence"   source={mermaid.api_sequence ?? ""} />
          </div>
        )}

        {tab === "modifications" && (
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Original prompt */}
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/60 p-5">
              <h3 className="text-xs font-semibold text-canvas-500 uppercase tracking-widest mb-3">Original Prompt</h3>
              <p className="text-sm text-canvas-300 whitespace-pre-wrap">{(result?.original_prompt as string) ?? (result?.prompt as string)}</p>
            </div>

            {/* Modification history */}
            {!!(result?.modification_history && Array.isArray(result.modification_history) && result.modification_history.length > 0) ? (
              <div className="rounded-2xl border border-canvas-800 bg-canvas-900/60 p-5">
                <h3 className="text-xs font-semibold text-canvas-500 uppercase tracking-widest mb-3">Mid-Run Modifications Applied</h3>
                <div className="space-y-3">
                  {(result.modification_history as any[]).map((mod: any, i: number) => (
                    <div key={i} className="rounded-xl border border-sage-600/20 bg-sage-600/5 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-sage-400 flex-shrink-0" />
                        <span className="text-xs text-sage-400 font-medium">Applied at stage: <code className="font-mono">{mod.applied_at_stage}</code></span>
                      </div>
                      <p className="text-sm text-canvas-300">{mod.modification}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-8 text-center">
                <Pencil className="w-6 h-6 text-canvas-700 mx-auto mb-2" />
                <p className="text-sm text-canvas-600">No midway modifications were applied in this session.</p>
              </div>
            )}

            {/* Final effective prompt */}
            {!!(result?.modification_history && Array.isArray(result.modification_history) && (result.modification_history as any[]).length > 0) && (
              <div className="rounded-2xl border border-canvas-800 bg-canvas-900/60 p-5">
                <h3 className="text-xs font-semibold text-canvas-500 uppercase tracking-widest mb-3">Final Effective Prompt</h3>
                <p className="text-sm text-canvas-300 whitespace-pre-wrap font-mono text-xs leading-relaxed">{result?.prompt as string}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center justify-between px-5 py-3 border-t border-canvas-900 bg-canvas-950 flex-shrink-0">
        <span className="text-xs text-canvas-700 font-mono truncate max-w-[180px]">{sessionId?.slice(0, 16)}...</span>
        <div className="flex items-center gap-2">
          <button onClick={handleCopy}
            className="flex items-center gap-1.5 text-xs text-canvas-500 hover:text-canvas-300 px-3 py-1.5 rounded-lg border border-canvas-800 hover:border-canvas-700 transition-all">
            <Copy className="w-3.5 h-3.5" />{copied ? "Copied" : "Copy JSON"}
          </button>
          <button onClick={handleDownload}
            className="flex items-center gap-1.5 text-xs text-white px-3 py-1.5 rounded-lg bg-terra-500 hover:bg-terra-400 transition-all">
            <Download className="w-3.5 h-3.5" />Download
          </button>
          <button onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-xs text-canvas-500 hover:text-canvas-300 px-3 py-1.5 rounded-lg border border-canvas-800 hover:border-canvas-700 transition-all">
            <RotateCcw className="w-3.5 h-3.5" />New
          </button>
        </div>
      </div>
    </div>
  );
}
