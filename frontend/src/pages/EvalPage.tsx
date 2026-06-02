import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import {
  Play, CheckCircle2, AlertTriangle, XCircle, HelpCircle,
  FileDown, RefreshCw, BarChart3, Coins, Layers,
  Loader2, Filter, AlertCircle, Info, ExternalLink
} from "lucide-react";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from "recharts";

const BASE_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

interface Prompt {
  id: number;
  category: string;
  difficulty: string;
  label: string;
  prompt: string;
  expected_behavior: string;
  known_challenges: string[];
  latest_result?: RunResult | null;
}

interface AutoMetrics {
  pipeline_completed: boolean;
  total_latency_ms: number;
  total_tokens: number;
  repair_count: number;
  repair_succeeded: boolean;
  hitl_triggered: boolean;
  hitl_count: number;
  hitl_stages: string[];
  validation_passed: boolean;
  runtime_viable: boolean;
  stages_completed: string[];
  stages_failed: string[];
  assumptions_count: number;
  conflicts_count: number;
  confidence_scores: Record<string, number>;
}

interface RunResult {
  prompt_id: number;
  label: string;
  category: string;
  difficulty: string;
  session_id: string;
  run_at: string;
  auto_metrics: AutoMetrics;
  human_judgment: "pass" | "partial" | "fail" | null;
  human_notes: string | null;
  failure_category: string | null;
}

interface Summary {
  total_run: number;
  pass_rate: number;
  partial_rate: number;
  fail_rate: number;
  avg_latency_ms: number;
  avg_tokens: number;
  avg_repair_count: number;
  hitl_trigger_rate: number;
  failure_breakdown: Record<string, number>;
  by_category: Record<string, any>;
  by_difficulty: Record<string, any>;
}

export default function EvalPage() {
  const navigate = useNavigate();

  // State
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // UI Controls
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [expandedRows, setExpandedRows] = useState<Record<number, boolean>>({});
  
  // Run Status Map (prompt_id -> "idle" | "running" | "complete" | "failed")
  const [runStatuses, setRunStatuses] = useState<Record<number, string>>({});

  // Judgment Modal State
  const [judgingPrompt, setJudgingPrompt] = useState<Prompt | null>(null);
  const [judgmentValue, setJudgmentValue] = useState<"pass" | "partial" | "fail">("pass");
  const [judgmentNotes, setJudgmentNotes] = useState("");
  const [failureCategory, setFailureCategory] = useState("none");
  const [savingJudgment, setSavingJudgment] = useState(false);

  // Sequential Runner State
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkQueue, setBulkQueue] = useState<number[]>([]);
  const [bulkActiveId, setBulkActiveId] = useState<number | null>(null);
  
  const bulkQueueRef = useRef<number[]>([]);
  const activeSseRef = useRef<EventSource | null>(null);

  // Load Data
  const fetchData = async () => {
    try {
      const promptsRes = await fetch(`${BASE_URL}/eval/prompts`);
      if (!promptsRes.ok) throw new Error("Failed to fetch prompts.");
      const promptsData = await promptsRes.json();
      setPrompts(promptsData.prompts);

      const resultsRes = await fetch(`${BASE_URL}/eval/results`);
      if (!resultsRes.ok) throw new Error("Failed to fetch results.");
      const resultsData = await resultsRes.json();
      setSummary(resultsData.summary);
      
      setLoading(false);
    } catch (err: any) {
      setError(err.message ?? String(err));
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    return () => {
      if (activeSseRef.current) activeSseRef.current.close();
    };
  }, []);

  // Trigger individual prompt run
  const runSinglePrompt = async (promptId: number): Promise<string> => {
    setRunStatuses(prev => ({ ...prev, [promptId]: "running" }));
    
    const res = await fetch(`${BASE_URL}/eval/run/${promptId}`, { method: "POST" });
    if (!res.ok) {
      setRunStatuses(prev => ({ ...prev, [promptId]: "failed" }));
      throw new Error(`Failed to start prompt ${promptId}`);
    }

    const { session_id } = await res.json();
    
    // Connect to SSE stream to monitor progress
    const sse = new EventSource(`${BASE_URL}/stream/${session_id}`);
    activeSseRef.current = sse;

    return new Promise((resolve, reject) => {
      sse.addEventListener("pipeline_complete", () => {
        sse.close();
        setRunStatuses(prev => ({ ...prev, [promptId]: "complete" }));
        fetchData(); // reload statistics
        resolve("complete");
      });

      sse.addEventListener("pipeline_failed", (e: any) => {
        sse.close();
        setRunStatuses(prev => ({ ...prev, [promptId]: "failed" }));
        fetchData();
        reject(new Error("Pipeline failed: " + (e.data ? JSON.parse(e.data).error : "")));
      });

      sse.onerror = () => {
        // SSE error can happen on disconnect or timeout, treat completion detection via polling fallback if needed
        // but for now, keep it simple
      };
    });
  };

  // Run all unrun sequential runner
  const startRunAllUnrun = () => {
    if (isBulkRunning) return;
    
    // Find all prompts that haven't been run yet (no latest_result) and aren't currently running
    const unrunIds = prompts
      .filter(p => !p.latest_result && runStatuses[p.id] !== "running")
      .map(p => p.id);

    if (unrunIds.length === 0) {
      alert("All prompts have already been run!");
      return;
    }

    setIsBulkRunning(true);
    bulkQueueRef.current = [...unrunIds];
    setBulkQueue(unrunIds);
    executeNextInBulk();
  };

  const executeNextInBulk = async () => {
    if (bulkQueueRef.current.length === 0) {
      setIsBulkRunning(false);
      setBulkActiveId(null);
      setBulkQueue([]);
      return;
    }

    const nextId = bulkQueueRef.current.shift();
    if (!nextId) return;

    setBulkActiveId(nextId);
    setBulkQueue([...bulkQueueRef.current]);

    try {
      await runSinglePrompt(nextId);
    } catch (err) {
      console.error(`Error in bulk run for prompt ${nextId}:`, err);
    }

    // Wait 5 seconds before starting the next prompt
    setTimeout(() => {
      executeNextInBulk();
    }, 5000);
  };

  // Trigger judgment modal open
  const openJudgment = (prompt: Prompt) => {
    setJudgingPrompt(prompt);
    setJudgmentValue("pass");
    setJudgmentNotes("");
    setFailureCategory("none");
  };

  // Save human judgment
  const saveJudgment = async () => {
    if (!judgingPrompt || !judgingPrompt.latest_result) return;
    setSavingJudgment(true);
    try {
      const res = await fetch(`${BASE_URL}/eval/record/${judgingPrompt.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_id: judgingPrompt.latest_result.session_id,
          human_judgment: judgmentValue,
          human_notes: judgmentNotes,
          failure_category: judgmentValue === "pass" ? "none" : failureCategory
        })
      });

      if (!res.ok) throw new Error("Failed to record judgment.");
      
      setJudgingPrompt(null);
      fetchData(); // reload
    } catch (err: any) {
      alert(err.message ?? String(err));
    } finally {
      setSavingJudgment(false);
    }
  };

  // Export results helper
  const exportResults = () => {
    window.open(`${BASE_URL}/eval/export`, "_blank");
  };

  // Row expand toggle
  const toggleRow = (id: number) => {
    setExpandedRows(prev => ({ ...prev, [id]: !prev[id] }));
  };

  // Filters application
  const filteredPrompts = prompts.filter(p => {
    if (categoryFilter !== "all" && p.category !== categoryFilter) return false;
    if (difficultyFilter !== "all" && p.difficulty !== difficultyFilter) return false;
    
    const runResult = p.latest_result;
    
    if (statusFilter !== "all") {
      if (statusFilter === "not_run" && (runResult || runStatuses[p.id])) return false;
      if (statusFilter === "pass" && runResult?.human_judgment !== "pass") return false;
      if (statusFilter === "partial" && runResult?.human_judgment !== "partial") return false;
      if (statusFilter === "fail" && runResult?.human_judgment !== "fail") return false;
    }
    return true;
  });

  // Loading and Error views
  if (loading) {
    return (
      <div className="h-screen bg-canvas-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3 text-canvas-600">
          <Loader2 className="w-8 h-8 animate-spin text-terra-500" />
          <span className="text-sm font-medium">Loading evaluation dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen bg-canvas-950 flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <XCircle className="w-12 h-12 text-rose-500 mx-auto" />
          <h2 className="text-lg font-semibold text-canvas-100">Failed to load Eval Dashboard</h2>
          <p className="text-rose-400 text-sm">{error}</p>
          <button onClick={fetchData} className="btn-primary mx-auto">
            <RefreshCw className="w-4 h-4" /> Retry Connection
          </button>
        </div>
      </div>
    );
  }

  // Summary Metrics Computation
  const promptsRunCount = summary?.total_run ?? 0;
  const passRate = summary?.pass_rate ?? 0;
  const avgLatency = summary?.avg_latency_ms ?? 0;
  const avgTokens = summary?.avg_tokens ?? 0;
  const hitlRate = summary?.hitl_trigger_rate ?? 0;

  // Chart 1: Donut Chart Data
  const donutData = [
    { name: "Pass", value: prompts.filter(p => p.latest_result?.human_judgment === "pass").length, color: "#4e8c53" },
    { name: "Partial", value: prompts.filter(p => p.latest_result?.human_judgment === "partial").length, color: "#e8a550" },
    { name: "Fail", value: prompts.filter(p => p.latest_result?.human_judgment === "fail").length, color: "#c45050" },
    { name: "Unrun / Untriaged", value: prompts.filter(p => !p.latest_result || !p.latest_result.human_judgment).length, color: "#2a2520" }
  ].filter(d => d.value > 0);

  // Chart 2: Latency per Prompt (Color-coded by Difficulty)
  const latencyData = prompts
    .filter(p => p.latest_result)
    .map(p => {
      const diffColors: Record<string, string> = { medium: "#6e90b5", hard: "#ef8a52", adversarial: "#c45050" };
      return {
        label: p.label.length > 15 ? p.label.slice(0, 15) + "…" : p.label,
        latency: Math.round((p.latest_result?.auto_metrics.total_latency_ms ?? 0) / 1000), // in seconds
        fill: diffColors[p.difficulty] || "#9ab0cc"
      };
    });

  // Chart 3: Repair Loop Count per Prompt
  const repairData = prompts
    .filter(p => p.latest_result)
    .map(p => ({
      label: p.label.length > 15 ? p.label.slice(0, 15) + "…" : p.label,
      repairs: p.latest_result?.auto_metrics.repair_count ?? 0
    }));

  // Chart 4: Failure breakdown horizontal bar
  const failureBreakdownData = Object.entries(summary?.failure_breakdown ?? {}).map(([cat, count]) => ({
    category: cat.replace(/_/g, " "),
    count: count
  }));

  // Helper colors
  const passRateColor = passRate >= 0.8 ? "text-sage-500" : passRate >= 0.5 ? "text-terra-400" : "text-rose-500";

  return (
    <div className="min-h-screen bg-canvas-950 bg-noise flex flex-col">
      {/* Navbar */}
      <nav className="flex items-center justify-between px-6 py-4 border-b border-canvas-900 bg-canvas-950/80 backdrop-blur flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <img src="/favicon.png" className="w-8 h-8 object-contain" alt="ProtoFlow logo" />
          <span className="font-display text-xl text-canvas-100 tracking-wide">ProtoFlow</span>
          <span className="text-canvas-700 mx-1 text-sm">/</span>
          <span className="text-xs text-canvas-400 font-mono tracking-widest uppercase">Evaluation Dashboard</span>
        </div>
        <div className="flex items-center gap-3">
          {isBulkRunning && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-medium">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Running Bulk: {bulkQueue.length} left
            </div>
          )}
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 text-xs text-canvas-500 hover:text-canvas-300 px-3 py-2 rounded-lg border border-canvas-800 hover:border-canvas-700 transition-colors bg-canvas-900/40"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
          <button
            onClick={() => navigate("/")}
            className="btn-primary py-2 text-xs"
          >
            Go to Generator
          </button>
        </div>
      </nav>

      {/* Main Container */}
      <div className="flex-1 p-6 space-y-6 w-full">
        
        {/* ── Summary Stats Bar ── */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            { label: "Prompts Run", value: `${promptsRunCount} / 20`, icon: Play, color: "text-canvas-100" },
            { label: "Pass Rate", value: `${Math.round(passRate * 100)}%`, icon: CheckCircle2, color: passRateColor },
            { label: "Avg Latency", value: `${(avgLatency / 1000).toFixed(1)}s`, icon: BarChart3, color: "text-canvas-100" },
            { label: "Avg Tokens", value: Math.round(avgTokens).toLocaleString(), icon: Coins, color: "text-canvas-100" },
            { label: "HITL Rate", value: `${Math.round(hitlRate * 100)}%`, icon: Layers, color: "text-canvas-100" }
          ].map((card, idx) => (
            <div key={idx} className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-5 flex items-center justify-between">
              <div>
                <p className="text-xs text-canvas-500 font-semibold uppercase tracking-wider">{card.label}</p>
                <p className={`text-2xl font-bold mt-1.5 font-mono ${card.color}`}>{card.value}</p>
              </div>
              <div className="w-10 h-10 rounded-xl bg-canvas-900 border border-canvas-800 flex items-center justify-center text-canvas-400">
                <card.icon className="w-5 h-5" />
              </div>
            </div>
          ))}
        </div>

        {/* ── Filter Controls ── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl border border-canvas-800 bg-canvas-900/20">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs font-semibold text-canvas-500 uppercase tracking-widest flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" /> Filters:
            </span>
            {/* Category */}
            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="text-xs bg-canvas-900 border border-canvas-800 text-canvas-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-terra-500"
            >
              <option value="all">Category: All</option>
              <option value="real">Real Product</option>
              <option value="edge">Edge Cases</option>
            </select>
            {/* Difficulty */}
            <select
              value={difficultyFilter}
              onChange={e => setDifficultyFilter(e.target.value)}
              className="text-xs bg-canvas-900 border border-canvas-800 text-canvas-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-terra-500"
            >
              <option value="all">Difficulty: All</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
              <option value="adversarial">Adversarial</option>
            </select>
            {/* Status */}
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-xs bg-canvas-900 border border-canvas-800 text-canvas-300 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-terra-500"
            >
              <option value="all">Status: All</option>
              <option value="not_run">Not Run</option>
              <option value="pass">Pass</option>
              <option value="partial">Partial</option>
              <option value="fail">Fail</option>
            </select>
          </div>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={startRunAllUnrun}
              disabled={isBulkRunning}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs text-white bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:pointer-events-none px-4 py-2 rounded-lg font-semibold transition-colors shadow-md shadow-blue-500/10"
            >
              <Play className="w-3.5 h-3.5" /> Run All Unrun
            </button>
            <button
              onClick={exportResults}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 text-xs text-canvas-300 bg-canvas-900 hover:bg-canvas-800 border border-canvas-800 hover:border-canvas-700 px-4 py-2 rounded-lg font-semibold transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" /> Export Results
            </button>
          </div>
        </div>

        {/* ── Two-Column Layout ── */}
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6">
          
          {/* ── Left Column: Charts (40% width) ── */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Chart 1: Donut */}
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-canvas-400 uppercase tracking-widest">
                Overall Pass/Fail Ratio
              </h3>
              <div className="h-48">
                {donutData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-canvas-600 font-medium">
                    No results evaluated yet.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={donutData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={70}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {donutData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1c1814", borderColor: "#433a30", borderRadius: "12px", fontSize: "12px" }}
                        itemStyle={{ color: "#e8e2d9" }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" wrapperStyle={{ fontSize: "11px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 2: Latency per Prompt */}
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-canvas-400 uppercase tracking-widest">
                Latency by Difficulty (seconds)
              </h3>
              <div className="h-48">
                {latencyData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-canvas-600 font-medium">
                    Run prompts to plot latency values.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={latencyData} margin={{ bottom: 10 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2520" />
                      <XAxis dataKey="label" stroke="#7d6e5e" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={40} />
                      <YAxis stroke="#7d6e5e" tick={{ fontSize: 10 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1c1814", borderColor: "#433a30", borderRadius: "12px", fontSize: "12px" }}
                        itemStyle={{ color: "#e8e2d9" }}
                      />
                      <Bar dataKey="latency" radius={[4, 4, 0, 0]}>
                        {latencyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 3: Repairs count */}
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-canvas-400 uppercase tracking-widest">
                Schema Repair loops per Prompt
              </h3>
              <div className="h-48">
                {repairData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-canvas-600 font-medium">
                    Run prompts to view repair loops.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={repairData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2520" />
                      <XAxis dataKey="label" stroke="#7d6e5e" tick={{ fontSize: 9 }} angle={-25} textAnchor="end" height={40} />
                      <YAxis stroke="#7d6e5e" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1c1814", borderColor: "#433a30", borderRadius: "12px", fontSize: "12px" }}
                        itemStyle={{ color: "#e8e2d9" }}
                      />
                      <Bar dataKey="repairs" fill="#e86d2a" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Chart 4: Failure breakdown */}
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/40 p-5 space-y-4">
              <h3 className="text-xs font-semibold text-canvas-400 uppercase tracking-widest">
                Failure Category Breakdown
              </h3>
              <div className="h-48">
                {failureBreakdownData.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-xs text-canvas-600 font-medium">
                    No failures logged. Great job!
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={failureBreakdownData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#2a2520" />
                      <XAxis stroke="#7d6e5e" type="number" tick={{ fontSize: 10 }} allowDecimals={false} />
                      <YAxis dataKey="category" stroke="#7d6e5e" type="category" tick={{ fontSize: 9 }} width={120} />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#1c1814", borderColor: "#433a30", borderRadius: "12px", fontSize: "12px" }}
                        itemStyle={{ color: "#e8e2d9" }}
                      />
                      <Bar dataKey="count" fill="#c45050" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

          </div>

          {/* ── Right Column: Prompt Table (60% width) ── */}
          <div className="lg:col-span-6 space-y-4">
            <div className="rounded-2xl border border-canvas-800 bg-canvas-900/20 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-canvas-800 bg-canvas-900/40 text-canvas-500 font-semibold text-xs tracking-wider uppercase">
                      <th className="py-4 px-4 w-12 text-center">#</th>
                      <th className="py-4 px-3">Label</th>
                      <th className="py-4 px-3 w-24">Category</th>
                      <th className="py-4 px-3 w-28">Difficulty</th>
                      <th className="py-4 px-3 w-28 text-center">Status</th>
                      <th className="py-4 px-3 w-28 text-center">Judgment</th>
                      <th className="py-4 px-4 w-28 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPrompts.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="text-center py-8 text-canvas-600 text-sm font-medium">
                          No prompts matching current filters.
                        </td>
                      </tr>
                    ) : (
                      filteredPrompts.map((p) => {
                        const runResult = p.latest_result;
                        const status = runStatuses[p.id] || (runResult ? "complete" : "not_run");
                        const judgment = runResult?.human_judgment;
                        
                        const isExpanded = !!expandedRows[p.id];
                        
                        // Status pill render logic
                        let statusPill = (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-canvas-900 border border-canvas-800 text-canvas-500">
                            Not Run
                          </span>
                        );
                        if (status === "running") {
                          statusPill = (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-500/10 border border-blue-500/30 text-blue-400 animate-pulse-slow">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-ping" />
                              Running
                            </span>
                          );
                        } else if (status === "failed") {
                          statusPill = (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                              Fail
                            </span>
                          );
                        } else if (status === "complete") {
                          if (judgment === "pass") {
                            statusPill = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-sage-600/10 border border-sage-600/30 text-sage-400">
                                Pass
                              </span>
                            );
                          } else if (judgment === "partial") {
                            statusPill = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-terra-500/10 border border-terra-500/30 text-terra-400">
                                Partial
                              </span>
                            );
                          } else if (judgment === "fail") {
                            statusPill = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-400">
                                Fail
                              </span>
                            );
                          } else {
                            statusPill = (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-500/10 border border-green-500/30 text-green-400">
                                Complete
                              </span>
                            );
                          }
                        }

                        // Difficulty badge
                        let diffBadge = <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/40 text-blue-400 border border-blue-800/40 font-mono capitalize">medium</span>;
                        if (p.difficulty === "hard") {
                          diffBadge = <span className="text-[10px] px-1.5 py-0.5 rounded bg-orange-950/40 text-orange-400 border border-orange-800/40 font-mono capitalize">hard</span>;
                        } else if (p.difficulty === "adversarial") {
                          diffBadge = <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-950/40 text-red-400 border border-red-800/40 font-mono capitalize">adversarial</span>;
                        }

                        return (
                          <React.Fragment key={p.id}>
                            {/* Primary Row */}
                            <tr
                              className={`border-b border-canvas-900/60 hover:bg-canvas-900/20 transition-colors cursor-pointer ${
                                isExpanded ? "bg-canvas-900/10" : ""
                              }`}
                              onClick={() => toggleRow(p.id)}
                            >
                              <td className="py-3 px-4 text-center font-mono text-xs text-canvas-600">{p.id}</td>
                              <td className="py-3 px-3 font-semibold text-canvas-200 text-sm">
                                <div className="flex items-center gap-2">
                                  {p.label}
                                  {bulkActiveId === p.id && (
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-3 text-xs text-canvas-500 capitalize">{p.category}</td>
                              <td className="py-3 px-3">{diffBadge}</td>
                              <td className="py-3 px-3 text-center">{statusPill}</td>
                              <td className="py-3 px-3 text-center text-xs font-semibold font-mono text-canvas-400">
                                {judgment ? <span className="capitalize">{judgment}</span> : "—"}
                              </td>
                              <td className="py-3 px-4 text-right" onClick={e => e.stopPropagation()}>
                                {status === "running" ? (
                                  <button disabled className="text-xs text-canvas-600 font-semibold flex items-center justify-center gap-1.5 ml-auto">
                                    <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> running
                                  </button>
                                ) : status === "not_run" ? (
                                  <button
                                    onClick={() => runSinglePrompt(p.id)}
                                    className="text-xs text-white bg-terra-500 hover:bg-terra-400 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1 ml-auto"
                                  >
                                    Run →
                                  </button>
                                ) : !judgment ? (
                                  <button
                                    onClick={() => openJudgment(p)}
                                    className="text-xs text-white bg-orange-600 hover:bg-orange-500 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1 ml-auto"
                                  >
                                    Judge →
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => runSinglePrompt(p.id)}
                                    className="text-xs text-canvas-400 bg-canvas-900 border border-canvas-800 hover:border-canvas-700 px-3 py-1.5 rounded-lg font-semibold transition-colors flex items-center justify-center gap-1 ml-auto"
                                  >
                                    Re-run →
                                  </button>
                                )}
                              </td>
                            </tr>
                            
                            {/* Expanded Row details */}
                            {isExpanded && (
                              <tr className="border-b border-canvas-900 bg-canvas-950/40">
                                <td colSpan={7} className="py-4 px-6 text-xs text-canvas-400 space-y-4">
                                  
                                  {/* Prompt content info */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                      <span className="text-[10px] font-semibold text-canvas-600 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                        <Info className="w-3 h-3" /> Full Prompt
                                      </span>
                                      <p className="bg-canvas-950 p-3 rounded-lg border border-canvas-900 font-sans text-xs leading-relaxed text-canvas-300">
                                        {p.prompt}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-semibold text-canvas-600 uppercase tracking-wider flex items-center gap-1.5 mb-1.5">
                                        <HelpCircle className="w-3.5 h-3.5" /> Expected Behavior
                                      </span>
                                      <p className="bg-canvas-950 p-3 rounded-lg border border-canvas-900 font-sans text-xs leading-relaxed text-canvas-300">
                                        {p.expected_behavior}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Known Challenges */}
                                  <div>
                                    <span className="text-[10px] font-semibold text-canvas-600 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                                      <AlertTriangle className="w-3 h-3" /> Known Challenges
                                    </span>
                                    <ul className="list-disc pl-4 space-y-1 text-canvas-500 font-sans mt-1">
                                      {p.known_challenges.map((c, ci) => (
                                        <li key={ci}>{c}</li>
                                      ))}
                                    </ul>
                                  </div>

                                  {/* Run Result Stats */}
                                  {runResult ? (
                                    <div className="space-y-3 pt-2 border-t border-canvas-900">
                                      <div className="flex items-center justify-between">
                                        <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">
                                          Auto Metrics summary
                                        </span>
                                        <button
                                          onClick={() => navigate(`/results?session=${runResult.session_id}`)}
                                          className="text-[10.5px] text-terra-400 hover:text-terra-300 font-semibold flex items-center gap-1"
                                        >
                                          View Full Schema <ExternalLink className="w-3 h-3" />
                                        </button>
                                      </div>
                                      
                                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                        <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-800/60">
                                          <p className="text-[10px] text-canvas-600 uppercase font-semibold">Latency</p>
                                          <p className="font-mono text-sm font-semibold text-canvas-200 mt-0.5">{(runResult.auto_metrics.total_latency_ms / 1000).toFixed(1)}s</p>
                                        </div>
                                        <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-800/60">
                                          <p className="text-[10px] text-canvas-600 uppercase font-semibold">Tokens Used</p>
                                          <p className="font-mono text-sm font-semibold text-canvas-200 mt-0.5">{runResult.auto_metrics.total_tokens.toLocaleString()}</p>
                                        </div>
                                        <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-800/60">
                                          <p className="text-[10px] text-canvas-600 uppercase font-semibold">Repairs / HITL</p>
                                          <p className="font-mono text-sm font-semibold text-canvas-200 mt-0.5">{runResult.auto_metrics.repair_count} / {runResult.auto_metrics.hitl_count}</p>
                                        </div>
                                        <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-800/60">
                                          <p className="text-[10px] text-canvas-600 uppercase font-semibold">Checks Passed</p>
                                          <p className="font-mono text-sm font-semibold text-canvas-200 mt-0.5">
                                            {runResult.auto_metrics.validation_passed ? "Valid" : "Invalid"} · {runResult.auto_metrics.runtime_viable ? "Viable" : "Unviable"}
                                          </p>
                                        </div>
                                      </div>

                                      {/* Human notes if recorded */}
                                      {runResult.human_notes && (
                                        <div className="bg-canvas-900/30 p-3 rounded-lg border border-canvas-800/40 text-canvas-400 font-sans mt-2">
                                          <span className="font-semibold text-canvas-300">Human Notes:</span> {runResult.human_notes}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <div className="text-center py-2 text-canvas-600 italic">
                                      This prompt has not been executed yet. Use "Run →" to generate metrics.
                                    </div>
                                  )}

                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

        </div>

      </div>

      {/* ── Judgment Modal ── */}
      {judgingPrompt && judgingPrompt.latest_result && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-canvas-950 border border-canvas-800 rounded-2xl max-w-lg w-full overflow-hidden shadow-2xl animate-fade-up">
            
            {/* Modal Header */}
            <div className="px-5 py-4 border-b border-canvas-900 bg-canvas-950 flex items-center justify-between">
              <span className="font-semibold text-sm text-canvas-100 uppercase tracking-widest flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-terra-500" /> Evaluate Result
              </span>
              <button
                onClick={() => setJudgingPrompt(null)}
                className="text-canvas-600 hover:text-canvas-400 text-xs font-semibold"
              >
                Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
              
              {/* Full prompt info */}
              <div>
                <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">Prompt</span>
                <p className="bg-canvas-900/50 p-3 rounded-lg border border-canvas-900 font-sans text-xs text-canvas-300 leading-relaxed mt-1">
                  {judgingPrompt.prompt}
                </p>
              </div>

              {/* Expected behavior */}
              <div>
                <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">Expected Behavior</span>
                <p className="bg-canvas-900/50 p-3 rounded-lg border border-canvas-900 font-sans text-xs text-canvas-300 leading-relaxed mt-1">
                  {judgingPrompt.expected_behavior}
                </p>
              </div>

              {/* Known Challenges */}
              <div>
                <span className="text-[10px] font-semibold text-canvas-600 uppercase tracking-wider flex items-center gap-1 mb-1">
                  <AlertTriangle className="w-3 h-3 text-orange-400" /> Known Challenges to Check
                </span>
                <ul className="list-disc pl-4 space-y-1 text-canvas-500 font-sans text-[11px]">
                  {judgingPrompt.known_challenges.map((c, ci) => (
                    <li key={ci}>{c}</li>
                  ))}
                </ul>
              </div>

              {/* Auto Metrics Summary */}
              <div>
                <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">Auto Metrics Summary</span>
                <div className="grid grid-cols-2 gap-3 mt-1.5">
                  <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-900 flex justify-between items-center text-xs">
                    <span className="text-canvas-500">Latency:</span>
                    <span className="font-mono text-canvas-200">{(judgingPrompt.latest_result.auto_metrics.total_latency_ms / 1000).toFixed(1)}s</span>
                  </div>
                  <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-900 flex justify-between items-center text-xs">
                    <span className="text-canvas-500">Tokens:</span>
                    <span className="font-mono text-canvas-200">{judgingPrompt.latest_result.auto_metrics.total_tokens.toLocaleString()}</span>
                  </div>
                  <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-900 flex justify-between items-center text-xs">
                    <span className="text-canvas-500">Repairs:</span>
                    <span className="font-mono text-canvas-200">{judgingPrompt.latest_result.auto_metrics.repair_count} ({judgingPrompt.latest_result.auto_metrics.repair_succeeded ? "passed" : "failed"})</span>
                  </div>
                  <div className="bg-canvas-900/50 p-2.5 rounded-lg border border-canvas-900 flex justify-between items-center text-xs">
                    <span className="text-canvas-500">HITL rounds:</span>
                    <span className="font-mono text-canvas-200">{judgingPrompt.latest_result.auto_metrics.hitl_count}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-2">
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${judgingPrompt.latest_result.auto_metrics.pipeline_completed ? "bg-sage-600/10 text-sage-400" : "bg-rose-500/10 text-rose-400"}`}>
                    Pipeline: {judgingPrompt.latest_result.auto_metrics.pipeline_completed ? "Completed" : "Failed"}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${judgingPrompt.latest_result.auto_metrics.validation_passed ? "bg-sage-600/10 text-sage-400" : "bg-rose-500/10 text-rose-400"}`}>
                    Validation: {judgingPrompt.latest_result.auto_metrics.validation_passed ? "Passed" : "Failed"}
                  </span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${judgingPrompt.latest_result.auto_metrics.runtime_viable ? "bg-sage-600/10 text-sage-400" : "bg-rose-500/10 text-rose-400"}`}>
                    Runtime Viable: {judgingPrompt.latest_result.auto_metrics.runtime_viable ? "Yes" : "No"}
                  </span>
                </div>
              </div>

              {/* Judgment Input */}
              <div className="space-y-2 pt-2 border-t border-canvas-900">
                <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">Select Judgment</span>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setJudgmentValue("pass")}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all border ${
                      judgmentValue === "pass"
                        ? "bg-sage-600/15 border-sage-600 text-sage-400 font-bold"
                        : "bg-canvas-900 border-canvas-800 text-canvas-500 hover:text-canvas-300"
                    }`}
                  >
                    Pass
                  </button>
                  <button
                    onClick={() => setJudgmentValue("partial")}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all border ${
                      judgmentValue === "partial"
                        ? "bg-terra-500/15 border-terra-500 text-terra-400 font-bold"
                        : "bg-canvas-900 border-canvas-800 text-canvas-500 hover:text-canvas-300"
                    }`}
                  >
                    Partial
                  </button>
                  <button
                    onClick={() => setJudgmentValue("fail")}
                    className={`py-2 rounded-xl text-xs font-semibold transition-all border ${
                      judgmentValue === "fail"
                        ? "bg-rose-500/15 border-rose-500 text-rose-400 font-bold"
                        : "bg-canvas-900 border-canvas-800 text-canvas-500 hover:text-canvas-300"
                    }`}
                  >
                    Fail
                  </button>
                </div>
              </div>

              {/* Notes Input */}
              <div className="space-y-1.5">
                <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">Notes (optional)</span>
                <textarea
                  value={judgmentNotes}
                  onChange={e => setJudgmentNotes(e.target.value)}
                  placeholder="Record why this score was given, issues encountered, etc..."
                  rows={3}
                  className="input-base text-xs font-sans"
                />
              </div>

              {/* Failure Category Dropdown (only if Partial or Fail is selected) */}
              {(judgmentValue === "partial" || judgmentValue === "fail") && (
                <div className="space-y-1.5 animate-fade-up">
                  <span className="text-[10px] font-semibold text-canvas-500 uppercase tracking-wider">Failure Category</span>
                  <select
                    value={failureCategory}
                    onChange={e => setFailureCategory(e.target.value)}
                    className="w-full text-xs bg-canvas-900 border border-canvas-800 text-canvas-200 rounded-xl px-4 py-3 focus:outline-none focus:border-terra-500"
                  >
                    <option value="none">None</option>
                    <option value="hallucination">Hallucination</option>
                    <option value="missing_field">Missing Field</option>
                    <option value="cross_layer_mismatch">Cross-Layer Mismatch</option>
                    <option value="hitl_not_triggered">HITL Not Triggered</option>
                    <option value="repair_failed">Repair Failed</option>
                    <option value="runtime_not_viable">Runtime Not Viable</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}

            </div>

            {/* Modal Footer */}
            <div className="px-5 py-4 border-t border-canvas-900 bg-canvas-950 flex justify-end gap-2">
              <button
                onClick={() => setJudgingPrompt(null)}
                className="px-4 py-2 rounded-xl text-xs text-canvas-400 hover:text-canvas-300 font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveJudgment}
                disabled={savingJudgment}
                className="btn-primary py-2 text-xs"
              >
                {savingJudgment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Save Judgment"}
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
