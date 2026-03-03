"use client";

import { useState, useMemo } from "react";
import type { QueryTreeNode } from "@/lib/query-graph";

interface DepthPath {
  segments: string[];
  depth: number;
}

function collectDeepPaths(
  nodes: QueryTreeNode[],
  ancestors: string[] = [],
): DepthPath[] {
  const results: DepthPath[] = [];

  for (const node of nodes) {
    const current = [...ancestors, node.displayName];

    if (node.children.length === 0 && current.length > 3) {
      results.push({ segments: current, depth: current.length });
    }

    if (node.children.length > 0) {
      results.push(...collectDeepPaths(node.children, current));
    }
  }

  return results;
}

function deduplicatePaths(paths: DepthPath[]): DepthPath[] {
  const seen = new Set<string>();
  const unique: DepthPath[] = [];

  for (const p of paths) {
    const key = p.segments.join(" > ");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }

  return unique;
}

export function DepthPathsCard({ tree }: { tree: QueryTreeNode[] }) {
  const [expanded, setExpanded] = useState(false);

  const paths = useMemo(() => {
    const raw = collectDeepPaths(tree);
    const unique = deduplicatePaths(raw);
    unique.sort((a, b) => b.depth - a.depth);
    return unique;
  }, [tree]);

  if (paths.length === 0) {
    return (
      <div className="glass-card rounded-xl p-4">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <DepthIcon className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Nesting Depth</h3>
        </div>
        <div className="flex flex-col items-center py-6 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center mb-2">
            <CheckIcon className="w-5 h-5 text-emerald-400" />
          </div>
          <p className="text-xs text-zinc-500">All paths are 3 levels or fewer.</p>
        </div>
      </div>
    );
  }

  const INITIAL_SHOW = 8;
  const visible = expanded ? paths : paths.slice(0, INITIAL_SHOW);
  const hasMore = paths.length > INITIAL_SHOW;

  return (
    <div className="glass-card rounded-xl p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-amber-500/10">
            <DepthIcon className="w-4 h-4 text-amber-400" />
          </div>
          <h3 className="font-medium text-zinc-300">Nesting Depth</h3>
        </div>
        <span className="text-xs text-zinc-500 bg-zinc-800/50 px-2 py-1 rounded-md">
          {paths.length} deep {paths.length === 1 ? "path" : "paths"}
        </span>
      </div>

      <div className="max-h-[400px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
        {visible.map((p, i) => (
          <div
            key={i}
            className={`flex items-start gap-2.5 px-2.5 py-2 rounded-lg ${
              i % 2 === 0 ? "bg-white/[0.02]" : "bg-white/[0.04]"
            }`}
          >
            <span className="shrink-0 mt-0.5 text-[10px] font-mono w-7 text-center py-0.5 rounded bg-amber-500/15 text-amber-400 font-semibold">
              {p.depth}
            </span>
            <p className="text-xs text-zinc-400 leading-relaxed break-all min-w-0">
              {p.segments.map((seg, j) => (
                <span key={j}>
                  {j > 0 && <span className="text-zinc-600 mx-0.5">&rsaquo;</span>}
                  <span className={j === p.segments.length - 1 ? "text-zinc-200 font-medium" : ""}>
                    {seg}
                  </span>
                </span>
              ))}
            </p>
          </div>
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 w-full text-center text-xs text-purple-400 hover:text-purple-300 transition-colors py-1.5 rounded-lg hover:bg-white/[0.03]"
        >
          {expanded ? "Show less" : `Show all ${paths.length} paths`}
        </button>
      )}
    </div>
  );
}

function DepthIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h8m-8 6h16" />
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
