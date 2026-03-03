"use client";

import { useState } from "react";
import type { RichTextOverfetch } from "@/lib/query-analyzer";
import { formatBytes } from "@/lib/query-analyzer";

interface RichTextCardProps {
  overfetches: RichTextOverfetch[];
  onRemoveFormats: (formatsToRemove: string[]) => void;
}

export function RichTextCard({ overfetches, onRemoveFormats }: RichTextCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (overfetches.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-violet-500/10">
            <DocIcon className="w-4 h-4 text-violet-400" />
          </div>
          <h3 className="font-medium text-zinc-300">RichText Formats</h3>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
            <CheckIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-xs text-zinc-500">No RichText over-fetching detected.</p>
        </div>
      </div>
    );
  }

  const totalSavings = overfetches.reduce((s, o) => s + o.savingsBytes, 0);

  const extraFormats = new Set<string>();
  for (const o of overfetches) {
    for (const f of o.selectedFormats) {
      if (f !== o.recommendedFormat) extraFormats.add(f);
    }
  }

  const INITIAL_SHOW = 6;
  const visible = expanded ? overfetches : overfetches.slice(0, INITIAL_SHOW);
  const hasMore = overfetches.length > INITIAL_SHOW;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-violet-500/10">
            <DocIcon className="w-4 h-4 text-violet-400" />
          </div>
          <h3 className="font-medium text-zinc-300">RichText Formats</h3>
        </div>
        <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
          {overfetches.length} over-fetched
        </span>
      </div>

      <div className="max-h-[400px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
        {visible.map((item, i) => (
          <div
            key={i}
            className={`px-2.5 py-2 rounded-lg ${
              i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"
            }`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xs text-zinc-200 font-medium truncate min-w-0">
                {item.parentPath.length > 45
                  ? "..." + item.parentPath.slice(-42)
                  : item.parentPath}
              </span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {item.selectedFormats.map((fmt) => (
                <span
                  key={fmt}
                  className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                    fmt === item.recommendedFormat
                      ? "bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20"
                      : "bg-zinc-800/60 text-zinc-500 line-through"
                  }`}
                >
                  {fmt}
                </span>
              ))}
              <span className="text-[10px] text-zinc-600 ml-auto">
                keep <span className="text-emerald-400">{item.recommendedFormat}</span>
              </span>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 w-full text-center text-xs text-purple-400 hover:text-purple-300 transition-colors py-1 rounded-lg hover:bg-white/[0.03]"
        >
          {expanded ? "Show less" : `Show all ${overfetches.length}`}
        </button>
      )}

      {extraFormats.size > 0 && (
        <button
          onClick={() => onRemoveFormats(Array.from(extraFormats))}
          className="mt-3 w-full py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-300 text-xs font-medium hover:bg-violet-500/20 transition-colors"
        >
          Keep only recommended formats (~{formatBytes(totalSavings)} savings)
        </button>
      )}
    </div>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
