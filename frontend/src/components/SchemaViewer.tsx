import { useState } from "react";

interface SchemaViewerProps {
  data: unknown;
  title?: string;
}

function JsonNode({ value, depth = 0 }: { value: unknown; depth?: number }) {
  const [collapsed, setCollapsed] = useState(depth > 2);
  const indent = depth * 16;

  if (value === null) return <span className="text-canvas-500">null</span>;
  if (typeof value === "boolean") return <span className="text-yellow-400">{String(value)}</span>;
  if (typeof value === "number") return <span className="text-blue-400">{value}</span>;
  if (typeof value === "string") return <span className="text-green-400">"{value}"</span>;

  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="text-canvas-500">[]</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-canvas-400 hover:text-white">
          {collapsed ? `[…${value.length}]` : "["}
        </button>
        {!collapsed && (
          <div style={{ marginLeft: indent + 16 }}>
            {value.map((item, i) => (
              <div key={i}>
                <JsonNode value={item} depth={depth + 1} />
                {i < value.length - 1 && <span className="text-canvas-600">,</span>}
              </div>
            ))}
            <div style={{ marginLeft: -16 }}>]</div>
          </div>
        )}
      </span>
    );
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) return <span className="text-canvas-500">{"{}"}</span>;
    return (
      <span>
        <button onClick={() => setCollapsed(!collapsed)} className="text-canvas-400 hover:text-white">
          {collapsed ? `{…${entries.length}}` : "{"}
        </button>
        {!collapsed && (
          <div style={{ marginLeft: indent + 16 }}>
            {entries.map(([k, v], i) => (
              <div key={k}>
                <span className="text-purple-400">"{k}"</span>
                <span className="text-canvas-500">: </span>
                <JsonNode value={v} depth={depth + 1} />
                {i < entries.length - 1 && <span className="text-canvas-600">,</span>}
              </div>
            ))}
            <div style={{ marginLeft: -16 }}>{"}"}</div>
          </div>
        )}
      </span>
    );
  }

  return <span className="text-canvas-300">{String(value)}</span>;
}

export default function SchemaViewer({ data, title }: SchemaViewerProps) {
  const [raw, setRaw] = useState(false);

  const jsonStr = JSON.stringify(data, null, 2);

  const handleDownload = () => {
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title ?? "schema"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-lg border border-canvas-800 bg-canvas-900 overflow-hidden">
      {title && (
        <div className="flex items-center justify-between px-4 py-2 border-b border-canvas-800">
          <span className="text-sm font-medium text-canvas-300">{title}</span>
          <div className="flex gap-2">
            <button
              onClick={() => setRaw(!raw)}
              className="text-xs text-canvas-500 hover:text-canvas-300 px-2 py-1 rounded hover:bg-canvas-800"
            >
              {raw ? "Tree" : "Raw"}
            </button>
            <button
              onClick={handleDownload}
              className="text-xs text-canvas-500 hover:text-canvas-300 px-2 py-1 rounded hover:bg-canvas-800"
            >
              ↓ JSON
            </button>
          </div>
        </div>
      )}
      <div className="p-4 overflow-auto max-h-[600px] font-mono text-xs">
        {raw ? (
          <pre className="text-canvas-300 whitespace-pre-wrap break-all">{jsonStr}</pre>
        ) : (
          <JsonNode value={data} depth={0} />
        )}
      </div>
    </div>
  );
}
