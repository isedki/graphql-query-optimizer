"use client";

import { useState, useEffect } from "react";

export interface TabDef {
  id: string;
  label: string;
  badge?: number;
  content: React.ReactNode;
  isEmpty?: boolean;
}

interface AnalysisTabsProps {
  tabs: TabDef[];
  defaultActiveId?: string;
}

export function AnalysisTabs({ tabs, defaultActiveId }: AnalysisTabsProps) {
  const [activeId, setActiveId] = useState<string>(() => {
    if (defaultActiveId) return defaultActiveId;
    const firstWithIssues = tabs.find((t) => (t.badge ?? 0) > 0);
    return firstWithIssues?.id ?? tabs[0]?.id ?? "";
  });

  useEffect(() => {
    if (defaultActiveId) {
      setActiveId(defaultActiveId);
    }
  }, [defaultActiveId]);

  useEffect(() => {
    if (!tabs.find((t) => t.id === activeId)) {
      setActiveId(tabs[0]?.id ?? "");
    }
  }, [tabs, activeId]);

  const activeTab = tabs.find((t) => t.id === activeId);

  return (
    <div className="glass-card rounded-xl overflow-hidden">
      <div className="flex border-b border-white/5 bg-zinc-900/30 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveId(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap flex items-center gap-2 ${
              activeId === tab.id
                ? "text-purple-300 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-0.5 after:bg-purple-500"
                : "text-zinc-500 hover:text-zinc-400"
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                  activeId === tab.id
                    ? "bg-purple-500/20 text-purple-300"
                    : "bg-zinc-700/80 text-zinc-400"
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="p-4">
        {activeTab?.isEmpty ? (
          <div className="flex flex-col items-center py-8 text-center">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
              <CheckIcon className="w-5 h-5 text-emerald-400" />
            </div>
            <p className="text-sm text-zinc-400">No issues found</p>
            <p className="text-xs text-zinc-500 mt-1">
              This section has nothing to report for the current query.
            </p>
          </div>
        ) : (
          activeTab?.content
        )}
      </div>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  );
}
