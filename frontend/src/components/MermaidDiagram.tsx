import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  themeVariables: {
    background: "#111827",
    primaryColor: "#6366f1",
    primaryTextColor: "#f3f4f6",
    lineColor: "#4b5563",
    edgeLabelBackground: "#1f2937",
  },
});

interface MermaidDiagramProps {
  title: string;
  source: string;
}

let _idCounter = 0;

/** Client-side sanitizer that mirrors the backend _sanitize_mermaid() logic.
 *  Catches any diagrams that slipped through (e.g., cached /result payloads). */
function sanitizeMermaid(source: string): string {
  if (!source) return source;
  // Normalise escaped newlines
  let s = source.replace(/\\n/g, "\n");
  // Fix -->|label|> → -->|label|
  s = s.replace(/(\|[^|]*\|)>/g, "$1");
  // Strip `style X fill:...` from erDiagram / sequenceDiagram
  if (s.includes("erDiagram") || s.includes("sequenceDiagram")) {
    s = s
      .split("\n")
      .filter((line) => {
        const t = line.trim();
        return !(t.startsWith("style ") && (t.includes("fill:") || t.includes("stroke:")));
      })
      .join("\n");
  }
  return s;
}

export default function MermaidDiagram({ title, source }: MermaidDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [showSource, setShowSource] = useState(false);
  const [copied, setCopied] = useState(false);
  const idRef = useRef(`mermaid-${++_idCounter}`);

  useEffect(() => {
    if (!source || !containerRef.current) return;
    setError(null);

    const clean = sanitizeMermaid(source);
    console.log("[MermaidDiagram] Rendering:", title, "length:", clean.length);

    mermaid.render(idRef.current, clean)
      .then(({ svg }) => {
        if (containerRef.current) {
          containerRef.current.innerHTML = svg;
        }
      })
      .catch((err) => {
        console.error("[MermaidDiagram] Render error for", title, ":", err);
        setError(`${err.message ?? err}`);
      });
  }, [source, title]);

  const handleCopy = () => {
    navigator.clipboard.writeText(source).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (!source) {
    return (
      <div className="rounded-lg border border-canvas-800 bg-canvas-900 p-6 text-center text-canvas-600 text-sm">
        {title} — not yet generated
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-canvas-800 bg-canvas-900 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-canvas-800">
        <span className="text-sm font-medium text-canvas-300">{title}</span>
        <div className="flex items-center gap-2">
          {error && (
            <button
              onClick={() => setShowSource((v) => !v)}
              className="text-xs text-amber-500 hover:text-amber-300 transition-colors px-2 py-1 rounded hover:bg-canvas-800"
            >
              {showSource ? "Hide source" : "Show source"}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="text-xs text-canvas-500 hover:text-canvas-300 transition-colors px-2 py-1 rounded hover:bg-canvas-800"
          >
            {copied ? "✓ Copied" : "Copy Mermaid Source"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-4">
          <p className="text-amber-400 text-xs mb-2">
            ⚠ Diagram parse error — copy the source and paste into{" "}
            <a
              href="https://mermaid.live"
              target="_blank"
              rel="noreferrer"
              className="underline hover:text-amber-300"
            >
              mermaid.live
            </a>{" "}
            to debug.
          </p>
          {showSource && (
            <pre className="text-canvas-500 text-xs font-mono whitespace-pre-wrap break-all bg-canvas-950 rounded p-3 max-h-64 overflow-y-auto">
              {source.replace(/\\n/g, "\n")}
            </pre>
          )}
        </div>
      ) : (
        <div
          ref={containerRef}
          className="p-4 overflow-x-auto flex justify-center [&>svg]:max-w-full"
        />
      )}
    </div>
  );
}
