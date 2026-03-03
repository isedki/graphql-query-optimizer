"use client";

import type { PaginationIssue } from "@/lib/query-analyzer";

interface PaginationGuardCardProps {
  issues: PaginationIssue[];
  onFix: (fieldPath: string, limit: number) => void;
  onFixAll: () => void;
}

export function PaginationGuardCard({
  issues,
  onFix,
  onFixAll,
}: PaginationGuardCardProps) {
  if (issues.length === 0) return null;

  const highCount = issues.filter((i) => i.confidence === "high").length;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <FilterIcon className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Pagination Guard</h3>
        </div>
        <div className="flex items-center gap-2">
          {highCount > 0 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
              {highCount} unbounded
            </span>
          )}
          <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
            {issues.length} {issues.length === 1 ? "field" : "fields"}
          </span>
        </div>
      </div>

      <button
        onClick={onFixAll}
        className="w-full mb-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-500/20 text-amber-300 text-xs font-medium hover:bg-amber-500/25 transition-colors"
      >
        Add pagination to all {issues.length} fields
      </button>

      <div className="space-y-1.5 max-h-[300px] overflow-y-auto custom-scrollbar">
        {issues.map((issue, idx) => (
          <div
            key={idx}
            className={`flex items-center justify-between px-3 py-2 rounded-lg border ${
              issue.confidence === "high"
                ? "border-red-500/15 bg-red-500/5"
                : "border-amber-500/10 bg-amber-500/5"
            }`}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span
                className={`shrink-0 w-1.5 h-1.5 rounded-full ${
                  issue.confidence === "high" ? "bg-red-400" : "bg-amber-400"
                }`}
              />
              <code className="text-xs text-zinc-300 truncate">
                {issue.fullPath}
              </code>
              <span
                className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded ${
                  issue.confidence === "high"
                    ? "bg-red-500/10 text-red-400"
                    : "bg-amber-500/10 text-amber-400"
                }`}
              >
                {issue.confidence}
              </span>
            </div>
            <button
              onClick={() => onFix(issue.fullPath, issue.suggestedLimit)}
              className="shrink-0 ml-2 px-2 py-0.5 text-[10px] font-medium rounded bg-zinc-700/80 text-zinc-300 hover:bg-zinc-600/80 transition-colors"
            >
              + first: {issue.suggestedLimit}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function FilterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
    </svg>
  );
}
