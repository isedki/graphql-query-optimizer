"use client";

import { useState, useCallback } from "react";
import {
  QueryTreeNode,
  collectSubtreeIds,
  collectAllNodeIds,
} from "@/lib/query-graph";
import { formatBytes } from "@/lib/query-analyzer";

interface QueryTreeViewProps {
  roots: QueryTreeNode[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onNodeClick?: (node: QueryTreeNode) => void;
}

export function QueryTreeView({
  roots,
  selectedIds,
  onSelectionChange,
  onNodeClick,
}: QueryTreeViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => {
    const ids = new Set<string>();
    roots.forEach((r) => ids.add(r.id));
    return ids;
  });

  const toggleExpand = useCallback((id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelect = useCallback(
    (node: QueryTreeNode, shiftKey: boolean) => {
      const next = new Set(selectedIds);
      if (shiftKey) {
        const subtreeIds = collectSubtreeIds(node);
        const allSelected = Array.from(subtreeIds).every((id) => next.has(id));
        subtreeIds.forEach((id) => {
          if (allSelected) next.delete(id);
          else next.add(id);
        });
      } else {
        if (next.has(node.id)) next.delete(node.id);
        else next.add(node.id);
      }
      onSelectionChange(next);
    },
    [selectedIds, onSelectionChange]
  );

  const handleExpandAll = useCallback(() => {
    setExpandedIds(collectAllNodeIds(roots));
  }, [roots]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleSelectAll = useCallback(() => {
    onSelectionChange(collectAllNodeIds(roots));
  }, [roots, onSelectionChange]);

  const handleClearSelection = useCallback(() => {
    onSelectionChange(new Set());
  }, [onSelectionChange]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5">
        <button
          onClick={handleExpandAll}
          className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Expand All
        </button>
        <button
          onClick={handleCollapseAll}
          className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Collapse
        </button>
        <div className="flex-1" />
        <button
          onClick={handleSelectAll}
          className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Select All
        </button>
        <button
          onClick={handleClearSelection}
          className="text-xs px-2 py-1 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-auto p-2">
        {roots.length === 0 ? (
          <p className="text-sm text-zinc-500 p-4 text-center">
            Enter a valid query to see its structure
          </p>
        ) : (
          roots.map((root) => (
            <TreeNode
              key={root.id}
              node={root}
              depth={0}
              isLast={true}
              expandedIds={expandedIds}
              selectedIds={selectedIds}
              onToggleExpand={toggleExpand}
              onToggleSelect={toggleSelect}
              onNodeClick={onNodeClick}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface TreeNodeProps {
  node: QueryTreeNode;
  depth: number;
  isLast: boolean;
  expandedIds: Set<string>;
  selectedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  onToggleSelect: (node: QueryTreeNode, shiftKey: boolean) => void;
  onNodeClick?: (node: QueryTreeNode) => void;
}

function TreeNode({
  node,
  depth,
  isLast,
  expandedIds,
  selectedIds,
  onToggleExpand,
  onToggleSelect,
  onNodeClick,
}: TreeNodeProps) {
  const isExpanded = expandedIds.has(node.id);
  const isSelected = selectedIds.has(node.id);
  const hasChildren = node.children.length > 0;

  const scalarExcerpt = formatScalarExcerpt(node.scalarFields);

  return (
    <div className={`${isSelected ? "" : "opacity-40"} transition-opacity`}>
      <div
        className="group flex items-start gap-1.5 py-1 px-1 rounded hover:bg-white/5 cursor-pointer"
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
        onClick={() => onNodeClick?.(node)}
      >
        {/* Connector lines */}
        {depth > 0 && (
          <span className="text-zinc-700 text-xs font-mono shrink-0 w-4 text-right mr-0.5">
            {isLast ? "└" : "├"}
          </span>
        )}

        {/* Expand/collapse */}
        {hasChildren ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.id);
            }}
            className="shrink-0 w-4 h-4 flex items-center justify-center text-zinc-500 hover:text-zinc-300 mt-0.5"
          >
            <svg
              className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        ) : (
          <span className="shrink-0 w-4" />
        )}

        {/* Checkbox */}
        <button
          onClick={(e) => onToggleSelect(node, e.shiftKey)}
          className="shrink-0 mt-0.5"
        >
          <div
            className={`w-4 h-4 rounded border transition-colors flex items-center justify-center ${
              isSelected
                ? "bg-purple-500 border-purple-500"
                : "border-zinc-600 hover:border-zinc-400"
            }`}
          >
            {isSelected && (
              <svg
                className="w-3 h-3 text-white"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={3}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            )}
          </div>
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            {node.nodeKind === "inlineFragment" ? (
              <span className="text-sm font-medium text-purple-400">
                ... on <span className="text-purple-300">{node.name}</span>
              </span>
            ) : (
              <span
                className={`text-sm font-medium ${
                  hasChildren ? "text-blue-400" : "text-zinc-300"
                }`}
              >
                {node.displayName}
                {node.alias && (
                  <span className="text-zinc-600 font-normal text-xs ml-1">
                    ({node.name})
                  </span>
                )}
              </span>
            )}
            {node.arguments.map((arg) => (
              <span
                key={arg.name}
                className="text-[10px] px-1.5 py-0 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700"
              >
                {arg.name}: {arg.value.length > 20 ? arg.value.slice(0, 20) + "..." : arg.value}
              </span>
            ))}
            <span className="text-[10px] text-zinc-600 ml-auto shrink-0 flex items-center gap-1">
              {node.loc && onNodeClick && (
                <svg
                  className="w-3 h-3 text-zinc-600 opacity-0 group-hover:opacity-100 transition-opacity"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                </svg>
              )}
              ~{formatBytes(node.estimatedSize)}
            </span>
          </div>

          {scalarExcerpt && (
            <div className="text-xs text-zinc-500 mt-0.5 truncate">
              {scalarExcerpt}
            </div>
          )}

          {hasChildren && !isExpanded && (
            <div className="text-[10px] text-zinc-600 mt-0.5">
              + {node.children.length} nested relation
              {node.children.length > 1 ? "s" : ""}
            </div>
          )}
        </div>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child, idx) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isLast={idx === node.children.length - 1}
              expandedIds={expandedIds}
              selectedIds={selectedIds}
              onToggleExpand={onToggleExpand}
              onToggleSelect={onToggleSelect}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function formatScalarExcerpt(fields: string[]): string {
  if (fields.length === 0) return "";
  const MAX_SHOW = 4;
  const shown = fields.slice(0, MAX_SHOW).join(", ");
  const remaining = fields.length - MAX_SHOW;
  return remaining > 0 ? `${shown}, +${remaining} more` : shown;
}
