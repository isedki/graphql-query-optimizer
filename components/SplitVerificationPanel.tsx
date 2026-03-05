"use client";

import { useState, useCallback } from "react";
import type { LiveTestResult, TestConfig } from "@/lib/split-verifier";
import { testSplitAgainstEndpoint } from "@/lib/split-verifier";

interface SplitVerificationPanelProps {
  queryTabs: { label: string; query: string }[];
  variables: string;
  endpoint: string;
  authToken: string;
}

export function SplitVerificationPanel({
  queryTabs,
  variables,
  endpoint,
  authToken,
}: SplitVerificationPanelProps) {
  const [progress, setProgress] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<LiveTestResult | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [expandedResponses, setExpandedResponses] = useState<Set<string>>(new Set());

  const toggleResponse = useCallback((name: string) => {
    setExpandedResponses((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }, []);

  const handleRunTest = useCallback(async () => {
    if (!endpoint.trim()) return;
    setLiveResult(null);
    setLiveError(null);
    setProgress("Preparing...");

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

    const originalQuery = queryTabs[0]?.query ?? "";
    const splitQueries = queryTabs.slice(1).map((t) => ({
      name: t.label,
      query: t.query,
    }));

    const config: TestConfig = {
      endpoint: endpoint.trim(),
      headers,
      originalQuery,
      splitQueries,
      variables: parsedVars,
      onProgress: setProgress,
    };

    try {
      const result = await testSplitAgainstEndpoint(config);
      setLiveResult(result);
      if (result.error) setLiveError(result.error);
    } catch (err) {
      setLiveError(err instanceof Error ? err.message : String(err));
    } finally {
      setProgress(null);
    }
  }, [endpoint, authToken, queryTabs, variables]);

  const splitCount = queryTabs.length - 1;

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-2 space-y-2">
      {/* Header + Run button */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <TestIcon className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-xs font-medium text-zinc-300">
            Split Test
          </span>
          <span className="text-[10px] text-zinc-500">
            {splitCount} quer{splitCount > 1 ? "ies" : "y"}
          </span>
        </div>

        {liveResult && (
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
              liveResult.isIdentical
                ? "bg-emerald-500/15 text-emerald-400"
                : "bg-red-500/15 text-red-400"
            }`}
          >
            {liveResult.isIdentical
              ? "Responses match"
              : `${liveResult.differences.length} difference${liveResult.differences.length > 1 ? "s" : ""}`}
          </span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {!endpoint.trim() ? (
            <span className="text-[10px] text-zinc-600 italic">
              Set endpoint below to test
            </span>
          ) : (
            <button
              onClick={handleRunTest}
              disabled={!!progress}
              className="px-3 py-1 rounded-md bg-purple-500/15 border border-purple-500/20 text-purple-300 text-[11px] font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {progress ?? "Run Split Comparison"}
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {liveError && !liveResult && (
        <div className="px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
          <p className="text-[11px] text-red-400 break-all">{liveError}</p>
        </div>
      )}

      {/* Results */}
      {liveResult && (
        <div className="space-y-2">
          {liveResult.error && (
            <div className="px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <p className="text-[11px] text-red-400 break-all">{liveResult.error}</p>
            </div>
          )}

          {/* Original query result */}
          <div className="rounded-lg border border-white/5 overflow-hidden">
            <button
              onClick={() => toggleResponse("__original__")}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/40 hover:bg-zinc-800/60 transition-colors text-left"
            >
              <ChevronIcon
                className={`w-3 h-3 text-zinc-500 transition-transform ${expandedResponses.has("__original__") ? "rotate-90" : ""}`}
              />
              <span className="text-[11px] font-medium text-emerald-400">Original</span>
              <span className="text-[10px] text-zinc-500 ml-auto">
                {formatBytes(JSON.stringify(liveResult.originalResponse).length)}
              </span>
            </button>
            {expandedResponses.has("__original__") && (
              <pre className="text-[10px] text-zinc-400 px-2.5 py-2 max-h-[250px] overflow-auto custom-scrollbar whitespace-pre-wrap break-all bg-zinc-950/30">
                {JSON.stringify(liveResult.originalResponse, null, 2)}
              </pre>
            )}
          </div>

          {/* Per-split query results */}
          {liveResult.splitResponses.map((sr) => {
            const hasError = sr.response && typeof sr.response === "object" && "error" in (sr.response as Record<string, unknown>);
            return (
              <div key={sr.name} className="rounded-lg border border-white/5 overflow-hidden">
                <button
                  onClick={() => toggleResponse(sr.name)}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/40 hover:bg-zinc-800/60 transition-colors text-left"
                >
                  <ChevronIcon
                    className={`w-3 h-3 text-zinc-500 transition-transform ${expandedResponses.has(sr.name) ? "rotate-90" : ""}`}
                  />
                  <span className={`text-[11px] font-medium ${hasError ? "text-red-400" : "text-purple-300"}`}>
                    {sr.name}
                  </span>
                  <span className="text-[10px] text-zinc-600 truncate max-w-[150px]">
                    {JSON.stringify(sr.variables).length > 2
                      ? `vars: ${JSON.stringify(sr.variables).slice(0, 60)}${JSON.stringify(sr.variables).length > 60 ? "..." : ""}`
                      : ""}
                  </span>
                  <span className="text-[10px] text-zinc-500 ml-auto shrink-0">
                    {formatBytes(JSON.stringify(sr.response).length)}
                  </span>
                </button>
                {expandedResponses.has(sr.name) && (
                  <pre className="text-[10px] text-zinc-400 px-2.5 py-2 max-h-[250px] overflow-auto custom-scrollbar whitespace-pre-wrap break-all bg-zinc-950/30">
                    {JSON.stringify(sr.response, null, 2)}
                  </pre>
                )}
              </div>
            );
          })}

          {/* Merged result */}
          <div className="rounded-lg border border-white/5 overflow-hidden">
            <button
              onClick={() => toggleResponse("__merged__")}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 bg-zinc-800/40 hover:bg-zinc-800/60 transition-colors text-left"
            >
              <ChevronIcon
                className={`w-3 h-3 text-zinc-500 transition-transform ${expandedResponses.has("__merged__") ? "rotate-90" : ""}`}
              />
              <span className="text-[11px] font-medium text-sky-400">Merged Result</span>
              <span className="text-[10px] text-zinc-500 ml-auto">
                {formatBytes(JSON.stringify(liveResult.mergedResponse).length)}
              </span>
            </button>
            {expandedResponses.has("__merged__") && (
              <pre className="text-[10px] text-zinc-400 px-2.5 py-2 max-h-[250px] overflow-auto custom-scrollbar whitespace-pre-wrap break-all bg-zinc-950/30">
                {JSON.stringify(liveResult.mergedResponse, null, 2)}
              </pre>
            )}
          </div>

          {/* Diff table */}
          {liveResult.differences.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-red-400 mb-1">
                {liveResult.differences.length} Difference{liveResult.differences.length > 1 ? "s" : ""}
              </p>
              <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                {liveResult.differences.map((diff, idx) => (
                  <div
                    key={idx}
                    className="px-2 py-1.5 rounded bg-red-500/5 border border-red-500/10 text-[11px]"
                  >
                    <code className="text-zinc-300 font-medium">{diff.path}</code>
                    <div className="flex gap-4 mt-0.5">
                      <span className="text-zinc-500">
                        original:{" "}
                        <span className="text-emerald-400">
                          {JSON.stringify(diff.original)?.slice(0, 80) ?? "undefined"}
                        </span>
                      </span>
                      <span className="text-zinc-500">
                        split:{" "}
                        <span className="text-red-400">
                          {JSON.stringify(diff.split)?.slice(0, 80) ?? "undefined"}
                        </span>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
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

function TestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
