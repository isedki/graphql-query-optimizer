"use client";

import { useState } from "react";
import { SplitOption } from "@/lib/query-splitter";
import { formatBytes } from "@/lib/query-analyzer";

export interface SplitQueryInfo {
  name: string;
  query: string;
}

interface SplitOptionsPanelProps {
  options: SplitOption[];
  onCopyQuery?: (query: string) => void;
  onApplyAll?: (queries: SplitQueryInfo[]) => void;
}

export function SplitOptionsPanel({
  options,
  onCopyQuery,
  onApplyAll,
}: SplitOptionsPanelProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (options.length === 0) return null;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <div className="p-1.5 rounded-lg bg-orange-500/10">
          <SplitIcon className="w-4 h-4 text-orange-400" />
        </div>
        <h3 className="font-medium text-zinc-300">Split Options</h3>
      </div>

      <div className="space-y-2">
        {options.map((option) => (
          <SplitOptionCard
            key={option.id}
            option={option}
            isExpanded={expandedId === option.id}
            onToggle={() =>
              setExpandedId(expandedId === option.id ? null : option.id)
            }
            onCopyQuery={onCopyQuery}
            onApplyAll={onApplyAll}
          />
        ))}
      </div>
    </div>
  );
}

function SplitOptionCard({
  option,
  isExpanded,
  onToggle,
  onCopyQuery,
  onApplyAll,
}: {
  option: SplitOption;
  isExpanded: boolean;
  onToggle: () => void;
  onCopyQuery?: (query: string) => void;
  onApplyAll?: (queries: SplitQueryInfo[]) => void;
}) {
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);

  const handleCopy = (query: string, idx: number) => {
    navigator.clipboard.writeText(query);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 1500);
    onCopyQuery?.(query);
  };

  const combinedQuery = option.queries.map((q) => q.query).join("\n\n");

  const handleCopyAll = () => {
    navigator.clipboard.writeText(combinedQuery);
    setCopiedAll(true);
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/30 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full px-3 py-2.5 flex items-center justify-between hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ChevronIcon
            className={`w-3 h-3 text-zinc-500 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
          <span className="text-sm font-medium text-zinc-300">
            {option.name}
          </span>
          <span className="text-[10px] text-zinc-500">
            ({option.queries.length} queries)
          </span>
        </div>
        {option.savingsPercentage > 0 && (
          <span className="text-xs font-medium text-emerald-400">
            -{option.savingsPercentage}% max query size
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="px-3 pb-3 space-y-2">
          <p className="text-xs text-zinc-500">{option.description}</p>

          {/* Apply All + Copy All actions */}
          <div className="flex items-center gap-2 py-1">
            {onApplyAll && (
              <button
                onClick={() =>
                  onApplyAll(
                    option.queries.map((q) => ({ name: q.name, query: q.query }))
                  )
                }
                className="text-xs px-3 py-1 rounded bg-purple-500/20 text-purple-300 hover:bg-purple-500/30 transition-colors font-medium border border-purple-500/20"
              >
                Split into {option.queries.length} tabs
              </button>
            )}
            <button
              onClick={handleCopyAll}
              className="text-xs px-3 py-1 rounded bg-zinc-700 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-600 transition-colors"
            >
              {copiedAll ? "Copied!" : "Copy all"}
            </button>
          </div>

          <div className="space-y-1.5">
            {option.queries.map((q, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between p-2 rounded bg-zinc-800/50"
              >
                <div className="flex items-center gap-2">
                  <code className="text-xs text-zinc-300">{q.name}</code>
                  <span className="text-[10px] text-zinc-500">
                    {formatBytes(q.size)}
                  </span>
                  <span className="text-[10px] text-zinc-600">
                    ({q.fields.join(", ")})
                  </span>
                </div>
                <button
                  onClick={() => handleCopy(q.query, idx)}
                  className="text-[10px] px-2 py-0.5 rounded bg-zinc-700 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-600 transition-colors"
                >
                  {copiedIdx === idx ? "Copied!" : "Copy"}
                </button>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between pt-1 text-[10px] text-zinc-600">
            <span>
              Original: {formatBytes(option.originalSize)} → Largest split:{" "}
              {formatBytes(Math.max(...option.queries.map((q) => q.size)))}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function SplitIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
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
