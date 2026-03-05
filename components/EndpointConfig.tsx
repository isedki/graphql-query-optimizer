"use client";

import { useState, useCallback } from "react";
import {
  runQueryAgainstEndpoint,
  type SingleQueryResult,
} from "@/lib/split-verifier";

interface EndpointConfigProps {
  endpoint: string;
  onEndpointChange: (v: string) => void;
  authToken: string;
  onAuthTokenChange: (v: string) => void;
  query: string;
  variables: string;
}

export function EndpointConfig({
  endpoint,
  onEndpointChange,
  authToken,
  onAuthTokenChange,
  query,
  variables,
}: EndpointConfigProps) {
  const [expanded, setExpanded] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<SingleQueryResult | null>(null);
  const [showResponse, setShowResponse] = useState(false);

  const handleRun = useCallback(async () => {
    if (!endpoint.trim() || !query.trim()) return;
    setResult(null);
    setProgress("Running...");

    const parsedVars: Record<string, unknown> = (() => {
      try {
        return JSON.parse(variables);
      } catch {
        return {};
      }
    })();

    const headers: Record<string, string> = {};
    if (authToken.trim()) {
      headers["Authorization"] = `Bearer ${authToken.trim()}`;
    }

    const res = await runQueryAgainstEndpoint(
      endpoint.trim(),
      headers,
      query,
      parsedVars,
      setProgress
    );
    setResult(res);
    setProgress(null);
  }, [endpoint, authToken, query, variables]);

  return (
    <div className="rounded-xl border border-white/10 bg-zinc-900/50 overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/[0.02] transition-colors"
      >
        <ChevronIcon
          className={`w-3 h-3 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
        />
        <EndpointIcon className="w-3.5 h-3.5 text-zinc-500" />
        <span className="text-zinc-400 font-medium">Endpoint</span>
        {endpoint.trim() && (
          <span className="text-[10px] text-zinc-600 truncate max-w-[200px]">
            {endpoint.trim()}
          </span>
        )}
        {result && !result.error && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 font-medium">
            {result.durationMs}ms · {formatBytes(result.responseSize)}
          </span>
        )}
        {result?.error && (
          <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">
            Error
          </span>
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2 border-t border-white/5 pt-2">
          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">
              Content API Endpoint
            </label>
            <input
              type="text"
              value={endpoint}
              onChange={(e) => onEndpointChange(e.target.value)}
              placeholder="https://api-region.hygraph.com/v2/.../master"
              className="w-full px-2.5 py-1.5 rounded-md bg-zinc-800/80 border border-white/10 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40"
            />
          </div>

          <div>
            <label className="block text-[10px] text-zinc-500 mb-1">
              Auth Token
            </label>
            <input
              type="password"
              value={authToken}
              onChange={(e) => onAuthTokenChange(e.target.value)}
              placeholder="Permanent Auth Token or Bearer token"
              className="w-full px-2.5 py-1.5 rounded-md bg-zinc-800/80 border border-white/10 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40"
            />
            <p className="text-[9px] text-zinc-600 mt-0.5">
              Sent as Authorization: Bearer &lt;token&gt;
            </p>
          </div>

          <button
            onClick={handleRun}
            disabled={!endpoint.trim() || !query.trim() || !!progress}
            className="w-full py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {progress ?? "Run Query"}
          </button>

          {result?.error && (
            <div className="px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] text-red-400">{result.error}</p>
            </div>
          )}

          {result && !result.error && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 font-medium">
                  Success
                </span>
                <span className="text-[10px] text-zinc-500">
                  {result.durationMs}ms
                </span>
                <span className="text-[10px] text-zinc-500">
                  {formatBytes(result.responseSize)} response
                </span>
              </div>

              <button
                onClick={() => setShowResponse(!showResponse)}
                className="text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
              >
                {showResponse ? "Hide" : "Show"} response
              </button>

              {showResponse && (
                <pre className="text-[10px] text-zinc-400 bg-zinc-800/50 rounded p-2 max-h-[300px] overflow-auto custom-scrollbar whitespace-pre-wrap break-all">
                  {JSON.stringify(result.response, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function EndpointIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" />
    </svg>
  );
}
