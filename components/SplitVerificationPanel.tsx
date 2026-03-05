"use client";

import { useState, useCallback } from "react";
import type {
  SplitVerification,
  LiveTestResult,
  TestConfig,
} from "@/lib/split-verifier";
import { testSplitAgainstEndpoint } from "@/lib/split-verifier";

interface SplitVerificationPanelProps {
  verification: SplitVerification | null;
  queryTabs: { label: string; query: string }[];
  variables: string;
}

export function SplitVerificationPanel({
  verification,
  queryTabs,
  variables,
}: SplitVerificationPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [showLiveTest, setShowLiveTest] = useState(false);
  const [endpoint, setEndpoint] = useState("");
  const [headers, setHeaders] = useState<{ key: string; value: string }[]>([
    { key: "", value: "" },
  ]);
  const [progress, setProgress] = useState<string | null>(null);
  const [liveResult, setLiveResult] = useState<LiveTestResult | null>(null);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [showResponses, setShowResponses] = useState(false);

  const addHeader = useCallback(() => {
    setHeaders((prev) => [...prev, { key: "", value: "" }]);
  }, []);

  const updateHeader = useCallback(
    (idx: number, field: "key" | "value", val: string) => {
      setHeaders((prev) => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: val };
        return next;
      });
    },
    []
  );

  const removeHeader = useCallback((idx: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== idx));
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

    const headerMap: Record<string, string> = {};
    for (const h of headers) {
      if (h.key.trim()) headerMap[h.key.trim()] = h.value;
    }

    const originalQuery = queryTabs[0]?.query ?? "";
    const splitQueries = queryTabs.slice(1).map((t) => ({
      name: t.label,
      query: t.query,
    }));

    const config: TestConfig = {
      endpoint: endpoint.trim(),
      headers: headerMap,
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
  }, [endpoint, headers, queryTabs, variables]);

  if (!verification) return null;

  const { coveragePercent, isFullyCovered, missingPaths, extraPaths, duplicates } =
    verification;

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/60 px-3 py-2">
      {/* Badges row */}
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-medium hover:opacity-80 transition-opacity"
        >
          <ChevronIcon
            className={`w-3 h-3 text-zinc-500 transition-transform ${expanded ? "rotate-90" : ""}`}
          />
          <VerifyIcon className="w-3.5 h-3.5 text-zinc-400" />
          <span className="text-zinc-400">Split Verification</span>
        </button>

        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            isFullyCovered
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-amber-500/15 text-amber-400"
          }`}
        >
          {coveragePercent}% field coverage
          {!isFullyCovered && ` — ${missingPaths.length} missing`}
        </span>

        {extraPaths.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/15 text-sky-400 font-medium">
            {extraPaths.length} extra
          </span>
        )}

        {duplicates.length > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-400 font-medium">
            {duplicates.length} cross-split duplicate{duplicates.length > 1 ? "s" : ""}
          </span>
        )}

        {!expanded && !showLiveTest && (
          <button
            onClick={() => {
              setShowLiveTest(true);
              setExpanded(true);
            }}
            className="ml-auto text-[10px] px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors border border-white/5"
          >
            Test against endpoint
          </button>
        )}
      </div>

      {/* Expandable details */}
      {expanded && (
        <div className="mt-3 space-y-3">
          {/* Missing paths */}
          {missingPaths.length > 0 && (
            <FieldList
              title="Missing fields"
              subtitle="Present in original but not in any split query"
              fields={missingPaths}
              color="amber"
            />
          )}

          {/* Extra paths */}
          {extraPaths.length > 0 && (
            <FieldList
              title="Extra fields"
              subtitle="Present in split queries but not in original"
              fields={extraPaths}
              color="sky"
            />
          )}

          {/* Duplicates */}
          {duplicates.length > 0 && (
            <div>
              <p className="text-[11px] font-medium text-blue-400 mb-1">
                Cross-split duplicates
              </p>
              <p className="text-[10px] text-zinc-500 mb-1.5">
                Same field path fetched by multiple split queries
              </p>
              <div className="space-y-1 max-h-[200px] overflow-y-auto custom-scrollbar">
                {duplicates.map((d) => (
                  <div
                    key={d.path}
                    className="flex items-start gap-2 px-2 py-1.5 rounded bg-blue-500/5 border border-blue-500/10"
                  >
                    <code className="text-[11px] text-zinc-300 break-all flex-1">
                      {d.path}
                    </code>
                    <span className="text-[10px] text-blue-400 shrink-0">
                      in {d.inQueries.join(", ")}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {isFullyCovered && missingPaths.length === 0 && extraPaths.length === 0 && duplicates.length === 0 && (
            <p className="text-[11px] text-emerald-400">
              All {verification.totalOriginalFields} field paths are fully covered by the split queries with no duplicates.
            </p>
          )}

          {/* Live test section */}
          <div className="border-t border-white/5 pt-3">
            <button
              onClick={() => setShowLiveTest(!showLiveTest)}
              className="flex items-center gap-1.5 text-xs font-medium text-zinc-400 hover:text-zinc-300 transition-colors"
            >
              <ChevronIcon
                className={`w-3 h-3 transition-transform ${showLiveTest ? "rotate-90" : ""}`}
              />
              Test against endpoint
            </button>

            {showLiveTest && (
              <div className="mt-2 space-y-2">
                <div>
                  <label className="block text-[10px] text-zinc-500 mb-1">
                    Endpoint URL
                  </label>
                  <input
                    type="text"
                    value={endpoint}
                    onChange={(e) => setEndpoint(e.target.value)}
                    placeholder="https://api.example.com/graphql"
                    className="w-full px-2.5 py-1.5 rounded-md bg-zinc-800/80 border border-white/10 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-[10px] text-zinc-500">Headers</label>
                    <button
                      onClick={addHeader}
                      className="text-[10px] text-purple-400 hover:text-purple-300"
                    >
                      + Add header
                    </button>
                  </div>
                  <div className="space-y-1">
                    {headers.map((h, idx) => (
                      <div key={idx} className="flex items-center gap-1">
                        <input
                          type="text"
                          value={h.key}
                          onChange={(e) => updateHeader(idx, "key", e.target.value)}
                          placeholder="Header name"
                          className="flex-1 px-2 py-1 rounded bg-zinc-800/80 border border-white/10 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40"
                        />
                        <input
                          type="text"
                          value={h.value}
                          onChange={(e) => updateHeader(idx, "value", e.target.value)}
                          placeholder="Value"
                          className="flex-1 px-2 py-1 rounded bg-zinc-800/80 border border-white/10 text-[11px] text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40"
                        />
                        {headers.length > 1 && (
                          <button
                            onClick={() => removeHeader(idx)}
                            className="text-zinc-600 hover:text-zinc-400 text-xs px-1"
                          >
                            &times;
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRunTest}
                  disabled={!endpoint.trim() || !!progress}
                  className="w-full py-1.5 rounded-lg bg-purple-500/15 border border-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {progress ? progress : "Run Test"}
                </button>

                {/* Live test results */}
                {liveError && !liveResult && (
                  <div className="px-2.5 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-[11px] text-red-400">{liveError}</p>
                  </div>
                )}

                {liveResult && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          liveResult.isIdentical
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-red-500/15 text-red-400"
                        }`}
                      >
                        {liveResult.isIdentical
                          ? "Responses match"
                          : `${liveResult.differences.length} difference${liveResult.differences.length > 1 ? "s" : ""} found`}
                      </span>
                      {liveResult.error && (
                        <span className="text-[10px] text-red-400">
                          {liveResult.error}
                        </span>
                      )}
                    </div>

                    {/* Per-query status */}
                    <div className="space-y-1">
                      {liveResult.splitResponses.map((sr) => (
                        <div
                          key={sr.name}
                          className="flex items-center gap-2 px-2 py-1 rounded bg-zinc-800/50 border border-white/5"
                        >
                          <span className="text-[11px] text-zinc-300 font-medium">
                            {sr.name}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            vars: {JSON.stringify(sr.variables).slice(0, 80)}
                            {JSON.stringify(sr.variables).length > 80 ? "..." : ""}
                          </span>
                          <span className="text-[10px] text-zinc-500 ml-auto">
                            {JSON.stringify(sr.response).length} bytes
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Diff table */}
                    {liveResult.differences.length > 0 && (
                      <div>
                        <p className="text-[11px] font-medium text-red-400 mb-1">
                          Differences
                        </p>
                        <div className="space-y-1 max-h-[250px] overflow-y-auto custom-scrollbar">
                          {liveResult.differences.map((diff, idx) => (
                            <div
                              key={idx}
                              className="px-2 py-1.5 rounded bg-red-500/5 border border-red-500/10 text-[11px]"
                            >
                              <code className="text-zinc-300 font-medium">
                                {diff.path}
                              </code>
                              <div className="flex gap-4 mt-0.5">
                                <span className="text-zinc-500">
                                  original:{" "}
                                  <span className="text-emerald-400">
                                    {JSON.stringify(diff.original)?.slice(0, 60) ?? "undefined"}
                                  </span>
                                </span>
                                <span className="text-zinc-500">
                                  split:{" "}
                                  <span className="text-red-400">
                                    {JSON.stringify(diff.split)?.slice(0, 60) ?? "undefined"}
                                  </span>
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Full response viewer */}
                    <button
                      onClick={() => setShowResponses(!showResponses)}
                      className="text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors"
                    >
                      {showResponses ? "Hide" : "Show"} full responses
                    </button>
                    {showResponses && (
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-[10px] text-zinc-500 mb-1">
                            Original response
                          </p>
                          <pre className="text-[10px] text-zinc-400 bg-zinc-800/50 rounded p-2 max-h-[200px] overflow-auto custom-scrollbar">
                            {JSON.stringify(liveResult.originalResponse, null, 2)}
                          </pre>
                        </div>
                        <div>
                          <p className="text-[10px] text-zinc-500 mb-1">
                            Merged split response
                          </p>
                          <pre className="text-[10px] text-zinc-400 bg-zinc-800/50 rounded p-2 max-h-[200px] overflow-auto custom-scrollbar">
                            {JSON.stringify(liveResult.mergedResponse, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FieldList({
  title,
  subtitle,
  fields,
  color,
}: {
  title: string;
  subtitle: string;
  fields: string[];
  color: "amber" | "sky";
}) {
  const colorMap = {
    amber: {
      title: "text-amber-400",
      bg: "bg-amber-500/5",
      border: "border-amber-500/10",
    },
    sky: {
      title: "text-sky-400",
      bg: "bg-sky-500/5",
      border: "border-sky-500/10",
    },
  };
  const c = colorMap[color];
  return (
    <div>
      <p className={`text-[11px] font-medium ${c.title} mb-1`}>{title}</p>
      <p className="text-[10px] text-zinc-500 mb-1.5">{subtitle}</p>
      <div className="space-y-0.5 max-h-[200px] overflow-y-auto custom-scrollbar">
        {fields.map((f) => (
          <div
            key={f}
            className={`px-2 py-1 rounded ${c.bg} border ${c.border}`}
          >
            <code className="text-[11px] text-zinc-300 break-all">{f}</code>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function VerifyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}
