"use client";

import { useState } from "react";
import Editor from "@monaco-editor/react";

interface VariablesEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  error?: string;
}

export function VariablesEditor({
  value,
  onChange,
  height = "120px",
  error,
}: VariablesEditorProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full bg-zinc-900/50 px-4 py-2 flex items-center justify-between hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronIcon
            className={`w-3 h-3 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <span className="text-sm text-zinc-400">Variables (JSON)</span>
        </div>
        <div className="flex items-center gap-2">
          {error && (
            <span className="text-xs text-red-400 truncate max-w-[200px]">
              {error}
            </span>
          )}
          {!error && value.trim() && !expanded && (
            <span className="text-[10px] text-zinc-600 truncate max-w-[200px]">
              {value.trim().slice(0, 50)}
              {value.trim().length > 50 ? "..." : ""}
            </span>
          )}
        </div>
      </button>
      {expanded && (
        <div className="border-t border-white/10">
          <Editor
            height={height}
            defaultLanguage="json"
            value={value}
            onChange={(val) => onChange(val || "")}
            theme="vs-dark"
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              fontFamily: "'JetBrains Mono', monospace",
              lineNumbers: "off",
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              wordWrap: "on",
              padding: { top: 12, bottom: 12 },
              renderLineHighlight: "none",
              overviewRulerBorder: false,
              hideCursorInOverviewRuler: true,
              scrollbar: {
                vertical: "hidden",
                horizontal: "hidden",
              },
            }}
          />
        </div>
      )}
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M9 5l7 7-7 7"
      />
    </svg>
  );
}
