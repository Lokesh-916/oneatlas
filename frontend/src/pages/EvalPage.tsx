import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface Prompt { id:number; category:string; difficulty:string; label:string; prompt:string; expected_behavior:string; known_challenges:string[]; latest_result?:any; }
interface Summary { total_run:number; pass_rate:number; avg_latency_ms:number; avg_tokens:number; }

export default function EvalPage() {
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [summary, setSummary] = useState<Summary|null>(null);
  const [loading, setLoading] = useState(true);
  const [runStatus, setRunStatus] = useState<Record<number,string>>({});
  const [expanded, setExpanded] = useState<Record<number,boolean>>({});
  const activeSse = useRef<EventSource|null>(null);

  const load = async () => {
    try {
      const [pr, rr] = await Promise.all([fetch(`${BASE}/eval/prompts`), fetch(`${BASE}/eval/results`)]);
      const pd = await pr.json(); const rd = await rr.json();
      setPrompts(pd.prompts); setSummary(rd.summary); setLoading(false);
    } catch { setLoading(false); }
  };

  useEffect(() => { load(); return () => { activeSse.current?.close(); }; }, []);

  const run = async (id:number) => {
    setRunStatus(p => ({...p,[id]:"running"}));
    const r = await fetch(`${BASE}/eval/run/`, {method:"POST"});
    if (!r.ok) { setRunStatus(p => ({...p,[id]:"failed"})); return; }
    await r.json();
    const sse = new EventSource(`${BASE}/stream/`);
    activeSse.current = sse;
    sse.addEventListener("pipeline_complete", () => { sse.close(); setRunStatus(p => ({...p,[id]:"complete"})); load(); });
    sse.addEventListener("pipeline_failed", () => { sse.close(); setRunStatus(p => ({...p,[id]:"failed"})); load(); });
  };

  const DIFF_CLS:Record<string,string> = { medium:"text-blue-700 bg-blue-50 border-blue-200", hard:"text-amber-700 bg-amber-50 border-amber-200", adversarial:"text-red-700 bg-red-50 border-red-200" };

  if (loading) return <div className="h-screen bg-ink-50 flex items-center justify-center"><span className="text-xs font-mono text-ink-400">loading…</span></div>;

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-200 bg-ink-100 px-6 py-3 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <button onClick={() => navigate("/")} className="text-xs font-mono text-ink-400 hover:text-ink-800">AppSpec</button>
          <span className="text-ink-300">/</span>
          <span className="text-xs font-mono text-ink-700">eval</span>
        </div>
        <div className="flex items-center gap-3">
          <a href={`${BASE}/eval/export`} target="_blank" rel="noreferrer" className="btn-ghost text-xs py-1.5 px-3">Export</a>
          <button onClick={load} className="btn-ghost text-xs py-1.5 px-3">Refresh</button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        {/* Summary */}
        {summary && (
          <div className="grid grid-cols-4 gap-3">
            {[
              {k:"Prompts run", v:`${summary.total_run}`},
              {k:"Pass rate", v:`${Math.round((summary.pass_rate??0)*100)}%`},
              {k:"Avg latency", v:`${((summary.avg_latency_ms??0)/1000).toFixed(1)}s`},
              {k:"Avg tokens", v:Math.round(summary.avg_tokens??0).toLocaleString()},
            ].map(c => (
              <div key={c.k} className="card px-4 py-3">
                <p className="text-[10px] font-mono text-ink-400 uppercase">{c.k}</p>
                <p className="text-lg font-mono font-semibold text-ink-900 mt-0.5">{c.v}</p>
              </div>
            ))}
          </div>
        )}

        {/* Prompt table */}
        <div className="card overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50">
                <th className="py-3 px-4 text-[10px] font-mono text-ink-400 uppercase w-8">#</th>
                <th className="py-3 px-3 text-[10px] font-mono text-ink-400 uppercase">Label</th>
                <th className="py-3 px-3 text-[10px] font-mono text-ink-400 uppercase w-24">Difficulty</th>
                <th className="py-3 px-3 text-[10px] font-mono text-ink-400 uppercase w-20 text-center">Status</th>
                <th className="py-3 px-4 text-[10px] font-mono text-ink-400 uppercase w-20 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {prompts.map(p => {
                const st = runStatus[p.id] || (p.latest_result ? "complete" : "not_run");
                const j = p.latest_result?.human_judgment;
                const isExp = !!expanded[p.id];
                const STATUS_CLS:Record<string,string> = { not_run:"text-ink-300", running:"text-accent-600", complete:j==="pass"?"text-green-700":j==="fail"?"text-red-600":"text-ink-500", failed:"text-red-600" };
                return (
                  <>
                    <tr key={p.id} className="border-b border-ink-100 hover:bg-ink-50 cursor-pointer" onClick={()=>setExpanded(prev=>({...prev,[p.id]:!prev[p.id]}))}>
                      <td className="py-3 px-4 font-mono text-xs text-ink-400">{p.id}</td>
                      <td className="py-3 px-3 text-sm text-ink-800">{p.label}</td>
                      <td className="py-3 px-3"><span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${DIFF_CLS[p.difficulty]||"text-ink-600 bg-ink-50 border-ink-200"}`}>{p.difficulty}</span></td>
                      <td className="py-3 px-3 text-center"><span className={`text-xs font-mono ${STATUS_CLS[st]}`}>{st==="running"?"running…":st}</span></td>
                      <td className="py-3 px-4 text-right" onClick={e=>e.stopPropagation()}>
                        <button onClick={()=>run(p.id)} disabled={st==="running"} className="btn-ghost text-xs py-1 px-2.5 disabled:opacity-40">
                          {st==="running"?"…":"run"}
                        </button>
                      </td>
                    </tr>
                    {isExp && (
                      <tr key={`${p.id}-exp`} className="border-b border-ink-100 bg-ink-50/50">
                        <td colSpan={5} className="px-6 py-4">
                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div>
                              <p className="font-mono text-ink-400 uppercase text-[10px] mb-1">Prompt</p>
                              <p className="text-ink-600 leading-relaxed">{p.prompt}</p>
                            </div>
                            <div>
                              <p className="font-mono text-ink-400 uppercase text-[10px] mb-1">Expected</p>
                              <p className="text-ink-600 leading-relaxed">{p.expected_behavior}</p>
                            </div>
                          </div>
                          {p.latest_result && (
                            <div className="mt-3 pt-3 border-t border-ink-200 grid grid-cols-4 gap-3">
                              {[
                                {k:"Latency", v:`${((p.latest_result.auto_metrics.total_latency_ms)/1000).toFixed(1)}s`},
                                {k:"Tokens", v:p.latest_result.auto_metrics.total_tokens.toLocaleString()},
                                {k:"Repairs", v:String(p.latest_result.auto_metrics.repair_count)},
                                {k:"Validation", v:p.latest_result.auto_metrics.validation_passed?"passed":"failed"},
                              ].map(c => (
                                <div key={c.k}>
                                  <p className="font-mono text-[10px] text-ink-400 uppercase">{c.k}</p>
                                  <p className="font-mono text-sm text-ink-800 mt-0.5">{c.v}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}