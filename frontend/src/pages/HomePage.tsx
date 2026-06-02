import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Zap, Database, Shield, GitMerge, Loader2 } from "lucide-react";
import { startPipeline } from "../api/client";

const EXAMPLES = [
  "CRM with contacts, deals, pipeline stages, roles, and analytics dashboard",
  "E-commerce with product catalog, cart, Stripe payments, orders, and admin panel",
  "Project management with boards, tasks, sprints, teams, and time tracking",
];

const FEATURES = [
  { icon: Database, label: "Database",    desc: "Normalised schema with FK, indexes, soft-delete" },
  { icon: Zap,      label: "REST API",    desc: "Full CRUD endpoints mapped to DB columns" },
  { icon: Shield,   label: "Auth & Roles", desc: "JWT, permissions matrix, premium plan gates" },
  { icon: GitMerge, label: "Repair Loop", desc: "Auto-fixes cross-layer conflicts up to 3x" },
];

export default function HomePage() {
  const navigate = useNavigate();
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError("");
    try {
      const { session_id } = await startPipeline(prompt.trim());
      navigate(`/generate?session=${session_id}`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-canvas-950 bg-noise flex flex-col">

      {/* ── Nav ── */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" className="w-8 h-8 object-contain" alt="ProtoFlow logo" />
          <span className="font-display text-xl text-canvas-100 tracking-wide">ProtoFlow</span>
        </div>
        <span className="text-xs text-canvas-700 font-mono">v1.0 · beta</span>
      </nav>

      {/* ── Hero ── */}
      <main className="flex-1 flex flex-col lg:flex-row max-w-7xl mx-auto w-full justify-center">

        {/* Left column — headline + input */}
        <div className="flex-1 flex flex-col justify-center px-8 lg:px-16 py-12 lg:py-0 max-w-2xl">

          <div className="space-y-8">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full
                            bg-terra-500/10 border border-terra-500/20 text-terra-400 text-xs font-medium w-fit">
              <span className="w-1.5 h-1.5 rounded-full bg-terra-400 animate-pulse-slow" />
              Multi-agent AI pipeline
            </div>

            {/* Headline */}
            <div className="space-y-3">
              <h1 className="font-pacifico text-5xl lg:text-6xl text-canvas-50 leading-tight">
                Describe your app.
              </h1>
              <h1 className="font-pacifico text-5xl lg:text-6xl leading-tight text-gradient">
                Get the blueprint.
              </h1>
              <p className="text-canvas-400 text-lg leading-relaxed max-w-md mt-4">
                ProtoFlow runs a 10-agent pipeline that compiles your idea into a
                validated, executable JSON schema — database, API, UI, and auth — in one shot.
              </p>
            </div>

            {/* Input area */}
            <div className="space-y-3">
              <div className="relative">
                <textarea
                  value={prompt}
                  onChange={e => setPrompt(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleGenerate(); }}
                  placeholder="Describe the application you want to build…"
                  rows={4}
                  className="input-base resize-none text-base leading-relaxed"
                />
                <span className="absolute bottom-3 right-3 text-xs text-canvas-700 font-mono tabular-nums select-none">
                  {prompt.length}
                </span>
              </div>

              {error && (
                <p className="text-xs text-rose-400 flex items-center gap-2 px-1">
                  <span className="w-1 h-1 rounded-full bg-rose-400 flex-shrink-0" />
                  {error}
                </p>
              )}

              <button
                onClick={handleGenerate}
                disabled={!prompt.trim() || loading}
                className="btn-primary w-full py-3.5 text-base"
              >
                {loading
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Starting pipeline…</>
                  : <>Generate Schema <ArrowRight className="w-4 h-4" /></>
                }
              </button>

              <p className="text-center text-xs text-canvas-700">
                Ctrl+Enter · Takes 30–90 seconds depending on complexity
              </p>
            </div>

            {/* Example chips */}
            <div className="space-y-2">
              <p className="text-xs text-canvas-600 font-medium uppercase tracking-wider">Try an example</p>
              <div className="flex flex-col gap-2">
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex}
                    onClick={() => setPrompt(ex)}
                    className="text-left text-sm text-canvas-500 hover:text-canvas-200
                               px-4 py-2.5 rounded-xl border border-canvas-800 hover:border-canvas-700
                               bg-canvas-900/40 hover:bg-canvas-900 transition-all duration-150"
                  >
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column — feature grid */}
        <div className="lg:w-[420px] flex flex-col justify-center px-8 lg:px-12 py-12 lg:py-0
                        border-t lg:border-t-0 lg:border-l border-canvas-900">
          <div className="space-y-6">
            <p className="text-xs text-canvas-600 font-medium uppercase tracking-wider">
              What gets generated
            </p>
            <div className="grid grid-cols-1 gap-4">
              {FEATURES.map(({ icon: Icon, label, desc }) => (
                <div key={label}
                  className="flex items-start gap-4 p-4 rounded-2xl border border-canvas-800
                             bg-canvas-900/40 hover:bg-canvas-900/70 transition-all duration-200 group">
                  <div className="w-9 h-9 rounded-xl bg-terra-500/10 border border-terra-500/20
                                  flex items-center justify-center flex-shrink-0
                                  group-hover:bg-terra-500/20 transition-colors">
                    <Icon className="w-4 h-4 text-terra-400" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-canvas-200">{label}</p>
                    <p className="text-xs text-canvas-500 mt-0.5 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Pipeline stages preview */}
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-4 space-y-2">
              <p className="text-xs text-canvas-600 font-medium uppercase tracking-wider mb-3">
                10-stage pipeline
              </p>
              {[
                "Intent Extraction",
                "Architecture Design",
                "DB · API · UI · Auth  (parallel)",
                "Cross-layer Validation",
                "Surgical Repair Loop",
                "Runtime Simulation",
              ].map((s, i) => (
                <div key={s} className="flex items-center gap-3">
                  <span className="text-xs text-canvas-700 font-mono w-4 text-right flex-shrink-0">{i + 1}</span>
                  <div className="flex-1 h-px bg-canvas-800" />
                  <span className="text-xs text-canvas-400">{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="px-8 py-4 border-t border-canvas-900 flex items-center justify-between max-w-7xl mx-auto w-full">
        <span className="text-xs text-canvas-800">
          ProtoFlow — natural language to application schema
        </span>
        <span className="text-xs text-canvas-800 font-mono">
          crewai 1.14.5 · groq
        </span>
      </footer>
    </div>
  );
}
