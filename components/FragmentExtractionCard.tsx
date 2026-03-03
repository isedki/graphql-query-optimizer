"use client";

import { useState } from "react";
import type { FragmentSuggestion } from "@/lib/query-analyzer";
import { formatBytes } from "@/lib/query-analyzer";

interface FragmentExtractionCardProps {
  suggestions: FragmentSuggestion[];
  existingFragmentNames?: string[];
  onExtract: (suggestions: FragmentSuggestion[]) => void;
}

export function FragmentExtractionCard({
  suggestions,
  existingFragmentNames = [],
  onExtract,
}: FragmentExtractionCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (suggestions.length === 0) return null;

  const existingSet = new Set(existingFragmentNames);
  const totalSavings = suggestions.reduce((s, f) => s + f.estimatedSavings, 0);
  const reuseCount = suggestions.filter((s) => existingSet.has(s.suggestedName)).length;
  const newCount = suggestions.length - reuseCount;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/10">
            <PuzzleIcon className="w-4 h-4 text-violet-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Fragment Extraction</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
            {newCount > 0 && <>{newCount} new</>}
            {newCount > 0 && reuseCount > 0 && " · "}
            {reuseCount > 0 && <>{reuseCount} reusable</>}
            {" · ~"}{formatBytes(totalSavings)} savings
          </span>
        </div>
      </div>

      <button
        onClick={() => onExtract(suggestions)}
        className="w-full mb-3 py-1.5 rounded-lg bg-violet-500/15 border border-violet-500/20 text-violet-300 text-xs font-medium hover:bg-violet-500/25 transition-colors"
      >
        Apply all {suggestions.length} optimizations
      </button>

      <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
        {suggestions.map((s) => {
          const isReuse = existingSet.has(s.suggestedName);
          return (
            <div
              key={s.id}
              className="rounded-lg border border-white/5 bg-zinc-900/30 overflow-hidden"
            >
              <button
                onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                className="w-full px-3 py-2 flex items-center justify-between hover:bg-white/5 transition-colors text-left"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <ChevronIcon
                    className={`w-3 h-3 text-zinc-500 shrink-0 transition-transform ${
                      expandedId === s.id ? "rotate-90" : ""
                    }`}
                  />
                  {isReuse && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-500/15 text-sky-400 border border-sky-500/20 shrink-0">
                      reuse
                    </span>
                  )}
                  <code className="text-xs font-medium text-violet-300 truncate">
                    {isReuse ? `...${s.suggestedName}` : s.suggestedName}
                  </code>
                  <span className="text-[10px] text-zinc-500 shrink-0">
                    {s.fields.length} fields · {s.occurrences.length} places
                  </span>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  <span className="text-[10px] text-emerald-400">
                    ~{formatBytes(s.estimatedSavings)}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onExtract([s]);
                    }}
                    className="px-2 py-0.5 text-[10px] font-medium rounded bg-violet-500/20 text-violet-300 hover:bg-violet-500/30 transition-colors"
                  >
                    {isReuse ? "Use" : "Extract"}
                  </button>
                </div>
              </button>

              {expandedId === s.id && (
                <div className="px-3 pb-2.5 space-y-2">
                  {isReuse && (
                    <p className="text-[10px] text-sky-400/80 bg-sky-500/5 rounded px-2 py-1">
                      Fragment <code className="font-medium">{s.suggestedName}</code> already
                      exists — these {s.occurrences.length} locations can use{" "}
                      <code className="font-medium">...{s.suggestedName}</code> instead of
                      repeating the fields.
                    </p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {s.fields.map((f) => (
                      <code
                        key={f}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800/80 text-zinc-400"
                      >
                        {f}
                      </code>
                    ))}
                  </div>
                  <div className="space-y-1">
                    <p className="text-[10px] text-zinc-500 font-medium">
                      {isReuse ? "Should use spread in:" : "Found in:"}
                    </p>
                    {s.occurrences.map((occ, i) => (
                      <div key={i} className="flex items-center gap-1">
                        <span className="text-zinc-600 text-[10px]">&rarr;</span>
                        <code className="text-[10px] text-zinc-400 truncate">
                          {occ.parentPath}
                        </code>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PuzzleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
