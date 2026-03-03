"use client";

import { useState } from "react";
import { DocumentNode } from "graphql";
import {
  QueryAnalysis,
  formatBytes,
  buildQueryDigest,
  FragmentUsageEntry,
} from "@/lib/query-analyzer";
import { QueryTreeNode } from "@/lib/query-graph";

interface QuerySummaryCardProps {
  analysis: QueryAnalysis;
  tree: QueryTreeNode[];
  ast: DocumentNode | null;
}

interface QueryStats {
  totalFields: number;
  scalarFields: number;
  relations: number;
  inlineFragments: number;
  inlineFragmentParent: string | null;
  depth: number;
  deepestPath: string;
  topDuplicates: { name: string; count: number }[];
  missingPagination: string[];
  complexWhereArgs: string[];
  localeSource: string | null;
}

function computeStats(
  analysis: QueryAnalysis,
  tree: QueryTreeNode[]
): QueryStats {
  let inlineFragments = 0;
  let inlineFragmentParent: string | null = null;
  let maxInlineOnNode = 0;
  let deepestPath = "";
  let maxDepth = 0;

  function walkTree(node: QueryTreeNode, pathParts: string[]) {
    const currentPath = [...pathParts, node.displayName];
    if (currentPath.length > maxDepth) {
      maxDepth = currentPath.length;
      deepestPath = currentPath.join(" > ");
    }
    if (node.nodeKind === "inlineFragment") inlineFragments++;
    const inlineChildCount = node.children.filter(
      (c) => c.nodeKind === "inlineFragment"
    ).length;
    if (inlineChildCount > maxInlineOnNode) {
      maxInlineOnNode = inlineChildCount;
      inlineFragmentParent = node.displayName;
    }
    for (const child of node.children) walkTree(child, currentPath);
  }
  for (const root of tree) walkTree(root, []);

  const missingPagination: string[] = [];
  const complexWhereArgs: string[] = [];
  for (const root of tree) {
    const hasFirst = root.arguments.some(
      (a) => a.name === "first" || a.name === "last"
    );
    if (!hasFirst && (root.children.length > 0 || root.scalarFields.length > 0)) {
      missingPagination.push(root.displayName);
    }
    for (const arg of root.arguments) {
      if (arg.name === "where" && arg.value.length > 80) {
        complexWhereArgs.push(root.displayName);
      }
    }
  }

  let localeSource: string | null = null;
  function findLocaleArg(node: QueryTreeNode) {
    for (const arg of node.arguments) {
      if (arg.name === "locales" || arg.name === "locale") {
        localeSource = arg.value.startsWith("$")
          ? `via ${arg.value} variable`
          : arg.value;
        return;
      }
    }
    for (const child of node.children) {
      findLocaleArg(child);
      if (localeSource) return;
    }
  }
  for (const root of tree) {
    findLocaleArg(root);
    if (localeSource) break;
  }

  const topDuplicates = analysis.duplicateFieldsInfo
    .slice()
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((d) => ({ name: d.fieldName, count: d.count }));

  const relations = countRelations(tree);
  const scalarFields = analysis.complexity.fieldCount - relations;

  return {
    totalFields: analysis.complexity.fieldCount,
    scalarFields: Math.max(0, scalarFields),
    relations,
    inlineFragments,
    inlineFragmentParent: maxInlineOnNode > 0 ? inlineFragmentParent : null,
    depth: analysis.complexity.depth,
    deepestPath: deepestPath || "(none)",
    topDuplicates,
    missingPagination,
    complexWhereArgs,
    localeSource,
  };
}

function countRelations(nodes: QueryTreeNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node.children.length > 0) count++;
    count += countRelations(node.children);
  }
  return count;
}

function computeIssues(stats: QueryStats): { text: string; severity: "error" | "warning" }[] {
  const issues: { text: string; severity: "error" | "warning" }[] = [];
  for (const field of stats.missingPagination) {
    issues.push({
      text: `No pagination limit on "${field}" -- missing "first" argument`,
      severity: "warning",
    });
  }
  if (stats.inlineFragments > 5 && stats.inlineFragmentParent) {
    issues.push({
      text: `${stats.inlineFragments} union types on "${stats.inlineFragmentParent}" -- consider splitting by type`,
      severity: stats.inlineFragments > 15 ? "error" : "warning",
    });
  }
  if (stats.topDuplicates.length > 0) {
    const worst = stats.topDuplicates[0];
    if (worst.count > 3) {
      issues.push({
        text: `"${worst.name}" duplicated across ${worst.count} locations`,
        severity: "warning",
      });
    }
  }
  if (stats.depth > 6) {
    issues.push({
      text: `Depth ${stats.depth} -- deep nesting increases response time`,
      severity: stats.depth > 8 ? "error" : "warning",
    });
  }
  for (const field of stats.complexWhereArgs) {
    issues.push({
      text: `Complex filter on "${field}" -- consider simplifying or using pagination`,
      severity: "warning",
    });
  }
  return issues;
}

export function QuerySummaryCard({ analysis, tree, ast }: QuerySummaryCardProps) {
  if (!analysis.isValid) {
    return (
      <div className="glass-card rounded-xl p-4">
        <h3 className="font-medium text-zinc-300 mb-2">Query Digest</h3>
        <p className="text-sm text-zinc-500">
          Enter a valid GraphQL query to see a full digest
        </p>
      </div>
    );
  }

  const stats = computeStats(analysis, tree);
  const issues = computeIssues(stats);

  const digest = ast ? buildQueryDigest(ast, tree, analysis) : null;

  return (
    <div className="glass-card rounded-xl p-4 space-y-0">
      <h3 className="font-medium text-zinc-300 mb-1">Query Digest</h3>
      <p className="text-[11px] text-zinc-600 mb-3">
        {analysis.operationType} {analysis.operationName ? `"${analysis.operationName}"` : ""}
      </p>

      {/* Section 1: Natural Language Summary */}
      {digest && (
        <div className="mb-4 p-3 rounded-lg bg-zinc-900/60 border border-white/5">
          <p className="text-sm text-zinc-300 leading-relaxed whitespace-pre-wrap"
            dangerouslySetInnerHTML={{
              __html: digest.naturalSummary
                .replace(/\*\*(.*?)\*\*/g, '<strong class="text-purple-300">$1</strong>')
                .replace(/`(.*?)`/g, '<code class="text-blue-400 text-xs bg-zinc-800 px-1 py-0.5 rounded">$1</code>')
            }}
          />
        </div>
      )}

      {/* Section 2: Root Fields Breakdown */}
      <DigestSection title="Root Fields" defaultOpen count={tree.length}>
        <div className="space-y-2">
          {tree.map((root) => (
            <RootFieldCard key={root.id} root={root} />
          ))}
        </div>
      </DigestSection>

      {/* Section 3: Models & Types Touched */}
      {digest && digest.typeNames.length > 0 && (
        <DigestSection title="Models & Types Touched" count={digest.typeNames.length}>
          <div className="flex flex-wrap gap-1.5">
            {digest.typeNames.map((t) => (
              <span
                key={t}
                className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 border border-purple-500/10"
              >
                {t}
              </span>
            ))}
          </div>
        </DigestSection>
      )}

      {/* Section 4: Variables & Arguments */}
      {digest && digest.variableUsageMap.length > 0 && (
        <DigestSection title="Variables" count={digest.variableUsageMap.length}>
          <div className="space-y-1.5">
            {digest.variableUsageMap.map((v) => (
              <div key={v.variable} className="flex items-start gap-2">
                <code className="text-[11px] text-blue-400 bg-zinc-800 px-1 py-0.5 rounded shrink-0">
                  ${v.variable}
                </code>
                <div className="min-w-0">
                  <span className="text-[10px] text-zinc-500">{v.type}</span>
                  {v.usedBy.length > 0 && (
                    <span className="text-[10px] text-zinc-600 ml-1.5">
                      used in {v.usedBy.slice(0, 3).join(", ")}
                      {v.usedBy.length > 3 ? ` +${v.usedBy.length - 3}` : ""}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </DigestSection>
      )}

      {/* Section 5: Fragment Usage Map */}
      {digest && digest.fragments.length > 0 && (
        <DigestSection title="Fragments" count={digest.fragments.length}>
          <FragmentMap fragments={digest.fragments} />
        </DigestSection>
      )}

      {/* Section 6: Numerical Stats + Issues */}
      <DigestSection title="Stats" defaultOpen>
        <div className="space-y-1.5">
          <StatRow label="Size" value={formatBytes(analysis.payload.totalSize)} sub={`${formatBytes(analysis.payload.querySize)} query + ${formatBytes(analysis.payload.variablesSize)} vars`} />
          <StatRow label="Fields" value={`${stats.totalFields} total`} sub={`${stats.scalarFields} scalar, ${stats.relations} relations`} />
          {stats.inlineFragments > 0 && (
            <StatRow
              label="Union types"
              value={`${stats.inlineFragments} inline fragments`}
              sub={stats.inlineFragmentParent ? `on "${stats.inlineFragmentParent}"` : undefined}
            />
          )}
          {stats.topDuplicates.length > 0 && (
            <StatRow
              label="Duplicates"
              value={`${analysis.duplicateFieldsInfo.length} fields repeated`}
              sub={stats.topDuplicates.slice(0, 3).map((d) => `${d.name} x${d.count}`).join(", ")}
            />
          )}
          <StatRow
            label="Depth"
            value={`${stats.depth} levels`}
            sub={stats.deepestPath.length < 80 ? stats.deepestPath : stats.deepestPath.slice(0, 77) + "..."}
          />
          {stats.localeSource && (
            <StatRow label="Locales" value={stats.localeSource} />
          )}
          {stats.missingPagination.length > 0 ? (
            <StatRow
              label="Pagination"
              value={`No "first" on ${stats.missingPagination.join(", ")}`}
              warn
            />
          ) : (
            <StatRow label="Pagination" value="OK" />
          )}
          {digest && (
            <>
              <StatRow label="Fragments" value={`${digest.fragments.length}`} />
              <StatRow label="Variables" value={`${digest.variableUsageMap.length} declared`} sub={
                analysis.variables.filter((v) => !v.used).length > 0
                  ? `${analysis.variables.filter((v) => !v.used).length} unused`
                  : undefined
              } />
              {digest.typeNames.length > 0 && (
                <StatRow label="Types" value={`${digest.typeNames.length} unique models`} />
              )}
            </>
          )}
        </div>

        {issues.length > 0 && (
          <div className="mt-3 pt-2 border-t border-white/5">
            <h4 className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider mb-1.5">
              Issues ({issues.length})
            </h4>
            <div className="space-y-1">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-1.5">
                  <span
                    className={`text-[10px] mt-0.5 shrink-0 ${
                      issue.severity === "error"
                        ? "text-red-400"
                        : "text-amber-400"
                    }`}
                  >
                    {issue.severity === "error" ? "!!" : "!"}
                  </span>
                  <span className="text-[10px] text-zinc-400 leading-relaxed">
                    {issue.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DigestSection>
    </div>
  );
}

// --- Sub-components ---

function DigestSection({
  title,
  children,
  defaultOpen = false,
  count,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-white/5 py-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 py-1 hover:bg-white/[0.02] rounded transition-colors"
      >
        <ChevronIcon
          className={`w-3 h-3 text-zinc-600 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <span className="text-xs font-medium text-zinc-400">{title}</span>
        {count !== undefined && (
          <span className="text-[10px] text-zinc-600 ml-auto">{count}</span>
        )}
      </button>
      {open && <div className="mt-2 pl-5">{children}</div>}
    </div>
  );
}

function RootFieldCard({ root }: { root: QueryTreeNode }) {
  const [expanded, setExpanded] = useState(false);

  const unionChildren = root.children.filter((c) => c.nodeKind === "inlineFragment");
  const relationChildren = root.children.filter(
    (c) => c.nodeKind === "field" && c.children.length > 0
  );
  const paginationArg = root.arguments.find(
    (a) => a.name === "first" || a.name === "last"
  );
  const whereArg = root.arguments.find((a) => a.name === "where");
  const localeArg = root.arguments.find(
    (a) => a.name === "locales" || a.name === "locale"
  );

  return (
    <div className="rounded-lg border border-white/5 bg-zinc-900/40 p-2.5">
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs font-semibold text-blue-400">
          {root.displayName}
        </span>
        {root.arguments.map((arg) => (
          <span
            key={arg.name}
            className="text-[9px] px-1.5 py-0 rounded-full bg-zinc-800 text-zinc-500 border border-zinc-700"
          >
            {arg.name}: {arg.value.length > 20 ? arg.value.slice(0, 20) + "..." : arg.value}
          </span>
        ))}
        <span className="text-[10px] text-zinc-600 ml-auto">
          ~{formatBytes(root.estimatedSize)}
        </span>
      </div>

      {/* Quick summary line */}
      <div className="mt-1.5 text-[10px] text-zinc-500 leading-relaxed">
        {root.scalarFields.length > 0 && (
          <span>
            <span className="text-zinc-400">{root.scalarFields.length}</span> scalar fields
            ({root.scalarFields.slice(0, 5).join(", ")}
            {root.scalarFields.length > 5 ? ` +${root.scalarFields.length - 5}` : ""})
          </span>
        )}
        {relationChildren.length > 0 && (
          <span>
            {root.scalarFields.length > 0 ? " · " : ""}
            <span className="text-zinc-400">{relationChildren.length}</span> relations
            ({relationChildren.slice(0, 3).map((r) => r.displayName).join(", ")}
            {relationChildren.length > 3 ? ` +${relationChildren.length - 3}` : ""})
          </span>
        )}
        {unionChildren.length > 0 && (
          <span>
            {(root.scalarFields.length > 0 || relationChildren.length > 0) ? " · " : ""}
            <span className="text-zinc-400">{unionChildren.length}</span> union types
          </span>
        )}
      </div>

      {/* Key argument info */}
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
        {paginationArg && (
          <span className="text-emerald-500">
            Paginated: {paginationArg.name}={paginationArg.value}
          </span>
        )}
        {!paginationArg && (
          <span className="text-amber-500">No pagination limit</span>
        )}
        {localeArg && (
          <span className="text-zinc-500">
            Locale: {localeArg.value}
          </span>
        )}
        {whereArg && (
          <span className="text-zinc-500">
            Filtered
          </span>
        )}
      </div>

      {/* Expandable union type list */}
      {unionChildren.length > 0 && (
        <div className="mt-1.5">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[10px] text-purple-400 hover:text-purple-300 transition-colors"
          >
            {expanded ? "Hide" : "Show"} {unionChildren.length} union types
          </button>
          {expanded && (
            <div className="mt-1 flex flex-wrap gap-1">
              {unionChildren.map((u) => (
                <span
                  key={u.id}
                  className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300/80 border border-purple-500/10"
                  title={`${u.scalarFields.length} scalars, ${u.children.length} nested`}
                >
                  {u.typeName || u.name}
                  <span className="text-purple-400/50 ml-0.5">
                    ({u.scalarFields.length + u.children.length})
                  </span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function FragmentMap({ fragments }: { fragments: FragmentUsageEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? fragments : fragments.slice(0, 10);

  return (
    <div>
      <div className="space-y-1">
        {visible.map((f) => (
          <div key={f.name} className="flex items-start gap-2 text-[10px]">
            <code className="text-zinc-400 shrink-0 min-w-[120px] truncate" title={f.name}>
              {f.name}
            </code>
            <span className="text-zinc-600 shrink-0">on {f.onType}</span>
            <span className="text-zinc-600 shrink-0">{f.fieldCount}f</span>
            {f.usedIn.length > 0 && (
              <span className="text-zinc-700 truncate" title={f.usedIn.join(", ")}>
                &larr; {f.usedIn.slice(0, 2).join(", ")}
                {f.usedIn.length > 2 ? ` +${f.usedIn.length - 2}` : ""}
              </span>
            )}
          </div>
        ))}
      </div>
      {fragments.length > 10 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-1.5 text-[10px] text-purple-400 hover:text-purple-300"
        >
          {showAll ? "Show less" : `Show all ${fragments.length} fragments`}
        </button>
      )}
    </div>
  );
}

function StatRow({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-[10px] text-zinc-500 w-16 shrink-0">{label}</span>
      <div className="min-w-0">
        <span className={`text-xs font-medium ${warn ? "text-amber-400" : "text-zinc-300"}`}>
          {value}
        </span>
        {sub && (
          <span className="text-[10px] text-zinc-600 ml-2 truncate">{sub}</span>
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}
