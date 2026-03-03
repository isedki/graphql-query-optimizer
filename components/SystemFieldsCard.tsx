"use client";

import { useState, useMemo } from "react";
import type {
  SystemFieldsAnalysis,
  SystemFieldOccurrence,
  SystemFieldCategory,
} from "@/lib/query-analyzer";
import { formatBytes } from "@/lib/query-analyzer";

interface SystemFieldsCardProps {
  analysis: SystemFieldsAnalysis;
  onRemove: (fieldNames: string[]) => void;
}

const CATEGORY_LABELS: Record<SystemFieldCategory, string> = {
  introspection: "__typename",
  metadata: "Metadata",
  cache: "Cache",
};

export function SystemFieldsCard({ analysis, onRemove }: SystemFieldsCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [openCategory, setOpenCategory] = useState<SystemFieldCategory | null>(null);

  const grouped = useMemo(() => {
    const map = new Map<SystemFieldCategory, SystemFieldOccurrence[]>();
    for (const occ of analysis.occurrences) {
      const list = map.get(occ.category) || [];
      list.push(occ);
      map.set(occ.category, list);
    }
    return map;
  }, [analysis.occurrences]);

  const safeFieldNames = useMemo(() => {
    const names = new Set<string>();
    for (const occ of analysis.occurrences) {
      if (occ.safeToRemove) names.add(occ.fieldName);
    }
    return Array.from(names);
  }, [analysis.occurrences]);

  if (analysis.occurrences.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <ShieldIcon className="w-4 h-4 text-blue-400" />
          </div>
          <h3 className="font-medium text-zinc-300">System Fields</h3>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
            <CheckIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-xs text-zinc-500">No system fields detected in this query.</p>
        </div>
      </div>
    );
  }

  const categories: SystemFieldCategory[] = ["introspection", "metadata", "cache"];
  const INITIAL_SHOW = 6;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-blue-500/10">
            <ShieldIcon className="w-4 h-4 text-blue-400" />
          </div>
          <h3 className="font-medium text-zinc-300">System Fields</h3>
        </div>
        <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
          {analysis.occurrences.length} fields &middot; ~{formatBytes(analysis.totalBytes)}
        </span>
      </div>

      {/* Category pills */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {categories.map((cat) => {
          const count = analysis.categories[cat];
          if (count === 0) return null;
          return (
            <span
              key={cat}
              className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800/60 text-zinc-400"
            >
              {count} {CATEGORY_LABELS[cat]}
            </span>
          );
        })}
        {analysis.safeBytes > 0 && (
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400">
            ~{formatBytes(analysis.safeBytes)} removable
          </span>
        )}
      </div>

      {/* Grouped list */}
      <div className="max-h-[400px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
        {categories.map((cat) => {
          const items = grouped.get(cat);
          if (!items || items.length === 0) return null;
          const isOpen = openCategory === cat;
          const visible = isOpen
            ? expanded
              ? items
              : items.slice(0, INITIAL_SHOW)
            : [];
          const hasMore = items.length > INITIAL_SHOW;

          return (
            <div key={cat}>
              <button
                onClick={() => setOpenCategory(isOpen ? null : cat)}
                className="w-full flex items-center gap-2 text-left px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors"
              >
                <span className="shrink-0 text-[10px] font-mono w-7 text-center py-0.5 rounded bg-blue-500/15 text-blue-400 font-semibold">
                  {items.length}
                </span>
                <span className="text-xs text-zinc-200 font-medium">
                  {CATEGORY_LABELS[cat]}
                </span>
                <span className="text-[10px] text-zinc-600 ml-1">
                  ({items.filter((i) => i.safeToRemove).length} safe to remove)
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
                <div className="space-y-0.5 mt-0.5">
                  {visible.map((occ, i) => (
                    <div
                      key={i}
                      className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg ml-4 ${
                        i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"
                      }`}
                    >
                      <code className="text-[11px] text-zinc-300 font-mono shrink-0">
                        {occ.fieldName}
                      </code>
                      <span className="text-[10px] text-zinc-600 truncate min-w-0">
                        {occ.fullPath.length > 50
                          ? "..." + occ.fullPath.slice(-47)
                          : occ.fullPath}
                      </span>
                      <span
                        className={`ml-auto shrink-0 text-[9px] px-1.5 py-0.5 rounded ${
                          occ.safeToRemove
                            ? "bg-emerald-500/10 text-emerald-400"
                            : "bg-amber-500/10 text-amber-400"
                        }`}
                      >
                        {occ.safeToRemove ? "safe" : "needed"}
                      </span>
                    </div>
                  ))}
                  {hasMore && (
                    <button
                      onClick={() => setExpanded((v) => !v)}
                      className="ml-4 text-xs text-purple-400 hover:text-purple-300 transition-colors py-1"
                    >
                      {expanded ? "Show less" : `Show all ${items.length}`}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Remove button */}
      {safeFieldNames.length > 0 && (
        <button
          onClick={() => onRemove(safeFieldNames)}
          className="mt-3 w-full py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-xs font-medium hover:bg-blue-500/20 transition-colors"
        >
          Remove safe system fields (~{formatBytes(analysis.safeBytes)} savings)
        </button>
      )}
    </div>
  );
}

function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
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
