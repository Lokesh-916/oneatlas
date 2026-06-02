import { useEffect, useRef } from "react";
import { Terminal } from "lucide-react";

interface LogViewerProps {
  entries: string[];
}

export default function LogViewer({ entries }: LogViewerProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 text-canvas-700">
        <Terminal className="w-8 h-8" />
        <span className="text-sm font-mono">Waiting for pipeline to start…</span>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto font-mono text-xs leading-relaxed p-4 space-y-0.5">
      {entries.map((entry, i) => {
        const isHeader  = entry.startsWith("#");
        const isError   = /error|failed|exception/i.test(entry);
        const isWarn    = /warn|repair|conflict/i.test(entry);
        const isSuccess = /complete|valid|success/i.test(entry);
        const isStage   = /^\[stage|^\[session/i.test(entry);

        const cls = isHeader  ? "text-indigo-400 font-semibold mt-2"
          : isError   ? "text-red-400"
          : isWarn    ? "text-orange-400"
          : isSuccess ? "text-green-400"
          : isStage   ? "text-blue-400"
          : "text-canvas-500";

        return (
          <div key={i} className={cls}>
            {entry}
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
