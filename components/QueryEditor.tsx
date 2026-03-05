"use client";

import { useCallback, useRef, useEffect } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { parse, print } from "graphql";
import { decodeQueryInput } from "@/lib/decode-input";

export type MonacoEditorInstance = Parameters<OnMount>[0];

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  onEditorMount?: (editor: MonacoEditorInstance) => void;
}

interface FragmentLocation {
  name: string;
  line: number;
  col: number;
}

const FRAG_DEF_RE = /^(\s*)fragment\s+(\w+)\s+on\s+/;
const FRAG_SPREAD_RE = /\.\.\.(\w+)/g;

function beautifyGraphQL(text: string): string | null {
  try {
    return print(parse(text));
  } catch {
    return null;
  }
}

async function resolveAndBeautify(raw: string): Promise<string | null> {
  const decoded = await decodeQueryInput(raw);
  const source = decoded ?? raw;
  return beautifyGraphQL(source);
}

function buildFragmentMaps(text: string) {
  const lines = text.split("\n");
  const defs = new Map<string, FragmentLocation>();
  const spreads: { name: string; line: number; startCol: number; endCol: number }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const defMatch = FRAG_DEF_RE.exec(line);
    if (defMatch) {
      defs.set(defMatch[2], { name: defMatch[2], line: i + 1, col: (defMatch[1]?.length || 0) + 1 });
    }

    let spreadMatch: RegExpExecArray | null;
    FRAG_SPREAD_RE.lastIndex = 0;
    while ((spreadMatch = FRAG_SPREAD_RE.exec(line)) !== null) {
      const fragName = spreadMatch[1];
      if (fragName === "on") continue;
      const dotStart = spreadMatch.index;
      const nameStart = dotStart + 3;
      spreads.push({
        name: fragName,
        line: i + 1,
        startCol: nameStart + 1,
        endCol: nameStart + fragName.length + 1,
      });
    }
  }

  return { defs, spreads };
}

export function QueryEditor({
  value,
  onChange,
  height = "300px",
  onEditorMount,
}: QueryEditorProps) {
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const decorationsRef = useRef<string[]>([]);
  const fragDefsRef = useRef<Map<string, FragmentLocation>>(new Map());

  const updateFragmentDecorations = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const text = model.getValue();
    const { defs, spreads } = buildFragmentMaps(text);
    fragDefsRef.current = defs;

    const newDecorations = spreads
      .filter((s) => defs.has(s.name))
      .map((s) => ({
        range: {
          startLineNumber: s.line,
          startColumn: s.startCol,
          endLineNumber: s.line,
          endColumn: s.endCol,
        },
        options: {
          inlineClassName: "fragment-link",
          hoverMessage: { value: `Go to fragment **${s.name}** definition (click)` },
        },
      }));

    decorationsRef.current = editor.deltaDecorations(
      decorationsRef.current,
      newDecorations
    );
  }, []);

  const handleEditorMount: OnMount = useCallback(
    (editor) => {
      editorRef.current = editor;
      onEditorMount?.(editor);

      editor.onDidPaste(() => {
        const currentValue = editor.getValue();
        resolveAndBeautify(currentValue).then((beautified) => {
          if (beautified && beautified !== currentValue) {
            onChange(beautified);
          }
        });
      });

      editor.onMouseDown((e) => {
        const model = editor.getModel();
        if (!model || !e.target.position) return;

        const { lineNumber, column } = e.target.position;
        const lineContent = model.getLineContent(lineNumber);

        FRAG_SPREAD_RE.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = FRAG_SPREAD_RE.exec(lineContent)) !== null) {
          const fragName = match[1];
          if (fragName === "on") continue;
          const nameStart = match.index + 3 + 1;
          const nameEnd = nameStart + fragName.length;
          if (column >= nameStart && column <= nameEnd) {
            const def = fragDefsRef.current.get(fragName);
            if (def) {
              editor.revealLineInCenter(def.line);
              editor.setPosition({ lineNumber: def.line, column: def.col });
              editor.focus();
            }
            break;
          }
        }
      });

      setTimeout(updateFragmentDecorations, 100);
    },
    [onChange, onEditorMount, updateFragmentDecorations]
  );

  useEffect(() => {
    updateFragmentDecorations();
  }, [value, updateFragmentDecorations]);

  const handleFormat = useCallback(() => {
    resolveAndBeautify(value).then((beautified) => {
      if (beautified) {
        onChange(beautified);
      }
    });
  }, [value, onChange]);

  return (
    <div className="rounded-xl overflow-hidden border border-white/10">
      <div className="bg-zinc-900/50 px-4 py-2 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-sm text-zinc-400">GraphQL Query / Mutation</span>
          <span className="text-[10px] text-zinc-600">Click fragment spreads to jump to definition</span>
        </div>
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
