"use client";

import { useState } from "react";
import type { DuplicateFieldInfo } from "@/lib/query-analyzer";

interface DuplicateFieldsCardProps {
  duplicates: DuplicateFieldInfo[];
}

export function DuplicateFieldsCard({ duplicates }: DuplicateFieldsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [openField, setOpenField] = useState<string | null>(null);

  const sorted = [...duplicates].sort((a, b) => b.count - a.count);

  if (sorted.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-orange-500/10">
            <DuplicateIcon className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Duplicate Fields</h3>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
            <CheckIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-xs text-zinc-500">No duplicate field selections detected.</p>
        </div>
      </div>
    );
  }

  const INITIAL_SHOW = 8;
  const visible = expanded ? sorted : sorted.slice(0, INITIAL_SHOW);
  const hasMore = sorted.length > INITIAL_SHOW;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-orange-500/10">
            <DuplicateIcon className="w-4 h-4 text-orange-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Duplicate Fields</h3>
        </div>
        <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
          {sorted.length} duplicated
        </span>
      </div>

      <div className="max-h-[400px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
        {visible.map((dup, i) => {
          const isOpen = openField === dup.fieldName;
          return (
            <div
              key={dup.fieldName}
              className={`rounded-lg ${i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"}`}
            >
              <button
                onClick={() => setOpenField(isOpen ? null : dup.fieldName)}
                className="w-full flex items-center gap-2.5 text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <span className="shrink-0 text-[10px] font-mono w-7 text-center py-0.5 rounded bg-orange-500/15 text-orange-400 font-semibold">
                  x{dup.count}
                </span>
                <span className="text-xs text-zinc-200 font-medium truncate min-w-0">
                  {dup.fieldName}
                </span>
                <svg
                  className={`w-3.5 h-3.5 text-zinc-500 ml-auto shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isOpen && (
                <div className="px-2.5 pb-2.5 pt-0.5 ml-9 space-y-1 border-t border-white/5">
                  {dup.occurrences.map((occ, j) => (
                    <p key={j} className="text-[11px] text-zinc-500 break-all leading-relaxed">
                      <span className="text-zinc-600">{occ.parentContext}</span>
                      <span className="text-zinc-600 mx-0.5">&rsaquo;</span>
                      <span className="text-zinc-400">{dup.fieldName}</span>
                    </p>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full text-center text-xs text-purple-400 hover:text-purple-300 transition-colors py-1.5 rounded-lg hover:bg-white/[0.03]"
        >
          {expanded ? "Show less" : `Show all ${sorted.length} duplicates`}
        </button>
      )}
    </div>
  );
}

function DuplicateIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
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
