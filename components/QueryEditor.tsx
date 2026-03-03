"use client";

import { useCallback, useRef } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { parse, print } from "graphql";

export type MonacoEditorInstance = Parameters<OnMount>[0];

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  onEditorMount?: (editor: MonacoEditorInstance) => void;
}

const BASE64_RE = /^[A-Za-z0-9+/\-_=\s]+$/;
const GQL_TOKEN_RE = /^\s*(query|mutation|subscription|fragment|\{)/;

function tryDecodeBase64(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 20 || !BASE64_RE.test(trimmed)) return null;

  try {
    const normalised = trimmed.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = atob(normalised);
    if (GQL_TOKEN_RE.test(decoded)) return decoded;
  } catch {
    // not valid base64
  }
  return null;
}

function beautifyGraphQL(text: string): string | null {
  try {
    return print(parse(text));
  } catch {
    return null;
  }
}

function resolveAndBeautify(raw: string): string | null {
  const decoded = tryDecodeBase64(raw);
  const source = decoded ?? raw;
  return beautifyGraphQL(source);
}

export function QueryEditor({
  value,
  onChange,
  height = "300px",
  onEditorMount,
}: QueryEditorProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null);

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      onEditorMount?.(editor);
      editor.onDidPaste(() => {
        const currentValue = editor.getValue();
        const beautified = resolveAndBeautify(currentValue);
        if (beautified && beautified !== currentValue) {
          onChange(beautified);
        }
      });
    },
    [onChange, onEditorMount]
  );

  const handleFormat = useCallback(() => {
    const beautified = resolveAndBeautify(value);
    if (beautified) {
      onChange(beautified);
    }
  }, [value, onChange]);

  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <div className="bg-zinc-900/50 px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <span className="text-sm text-zinc-400">GraphQL Query / Mutation</span>
        <button
          onClick={handleFormat}
          className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Format
        </button>
      </div>
      <Editor
        height={height}
        defaultLanguage="graphql"
        value={value}
        onChange={(val) => onChange(val || "")}
        onMount={handleEditorMount}
        theme="vs-dark"
        options={{
          minimap: { enabled: false },
          fontSize: 13,
          fontFamily: "'JetBrains Mono', monospace",
          lineNumbers: "on",
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
