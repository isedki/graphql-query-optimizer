"use client";

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
  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <div className="bg-zinc-900/50 px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm text-zinc-400">Variables (JSON)</span>
        {error && (
          <span className="text-xs text-red-400 truncate max-w-[200px]">
            {error}
          </span>
        )}
      </div>
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
  );
}
