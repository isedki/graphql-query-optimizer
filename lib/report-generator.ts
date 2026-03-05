import type { DocumentNode } from "graphql";
import type {
  QueryAnalysis,
  SystemFieldsAnalysis,
  RichTextOverfetch,
  PaginationIssue,
  FragmentSuggestion,
} from "./query-analyzer";
import { buildQueryDigest, formatBytes } from "./query-analyzer";
import type { Suggestion, OptimizationResult } from "./query-optimizer";
import type { QueryTreeNode } from "./query-graph";
import type { SplitOption } from "./query-splitter";

interface QueryTab {
  label: string;
  query: string;
}

export interface ReportInput {
  query: string;
  analysis: QueryAnalysis;
  systemFieldsAnalysis: SystemFieldsAnalysis;
  richTextOverfetches: RichTextOverfetch[];
  paginationIssues: PaginationIssue[];
  fragmentSuggestions: FragmentSuggestion[];
  optimization: OptimizationResult;
  splitOptions: SplitOption[];
  queryTabs: QueryTab[];
  tree: QueryTreeNode[];
  ast: DocumentNode | null;
  localeNames: string[];
  fragmentCount: number;
  totalNodeCount: number;
  selectedCount: number;
}

// ---------------------------------------------------------------------------
// Depth-path collection (mirrors DepthPathsCard logic)
// ---------------------------------------------------------------------------

interface DepthPath {
  segments: string[];
  depth: number;
}

function collectDeepPaths(
  nodes: QueryTreeNode[],
  ancestors: string[] = []
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

function uniqueDeepPaths(tree: QueryTreeNode[]): DepthPath[] {
  const seen = new Set<string>();
  const unique: DepthPath[] = [];
  for (const p of collectDeepPaths(tree)) {
    const key = p.segments.join(" > ");
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(p);
    }
  }
  unique.sort((a, b) => b.depth - a.depth);
  return unique;
}

// ---------------------------------------------------------------------------
// Severity label helper
// ---------------------------------------------------------------------------

function severityLabel(s: string): string {
  switch (s) {
    case "error":
      return "[ERROR]";
    case "warning":
      return "[WARNING]";
    default:
      return "[INFO]";
  }
}

// ---------------------------------------------------------------------------
// Main report generator
// ---------------------------------------------------------------------------

export function generateReport(input: ReportInput): string {
  const {
    query,
    analysis,
    systemFieldsAnalysis,
    richTextOverfetches,
    paginationIssues,
    fragmentSuggestions,
    optimization,
    splitOptions,
    queryTabs,
    tree,
    ast,
    localeNames,
    fragmentCount,
    totalNodeCount,
    selectedCount,
  } = input;

  const lines: string[] = [];
  const push = (...l: string[]) => lines.push(...l);

  // --- Header ---
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  push(
    "# GraphQL Query Analysis Report",
    "",
    `**Date:** ${date}  `,
    `**Operation:** \`${analysis.operationType}\` ${analysis.operationName ? `**${analysis.operationName}**` : "(anonymous)"}  `,
    ""
  );

  // --- Digest ---
  if (ast) {
    const digest = buildQueryDigest(ast, tree, analysis);
    push("## Query Digest", "", digest.naturalSummary, "");

    if (digest.typeNames.length > 0) {
      push(
        "**Models & types touched:** " +
          digest.typeNames.map((t) => `\`${t}\``).join(", "),
        ""
      );
    }

    if (digest.variableUsageMap.length > 0) {
      push("### Variables", "");
      push("| Variable | Type | Used by |", "|---|---|---|");
      for (const v of digest.variableUsageMap) {
        const usedBy =
          v.usedBy.length > 0
            ? v.usedBy.map((u) => `\`${u}\``).join(", ")
            : "_unused_";
        push(`| \`$${v.variable}\` | \`${v.type}\` | ${usedBy} |`);
      }
      push("");
    }

    if (digest.fragments.length > 0) {
      push("### Fragments", "");
      push("| Fragment | On type | Fields | Used in |", "|---|---|---|---|");
      for (const f of digest.fragments) {
        const usedIn =
          f.usedIn.length > 0
            ? f.usedIn.map((u) => `\`${u}\``).join(", ")
            : "_unused_";
        push(
          `| \`${f.name}\` | \`${f.onType}\` | ${f.fieldCount} | ${usedIn} |`
        );
      }
      push("");
    }
  }

  // --- Metrics ---
  push("## Metrics Summary", "");
  push("| Metric | Value |", "|---|---|");
  push(`| Total payload size | ${formatBytes(analysis.payload.totalSize)} |`);
  push(`| Query size | ${formatBytes(analysis.payload.querySize)} |`);
  push(`| Variables size | ${formatBytes(analysis.payload.variablesSize)} |`);
  push(`| Complexity score | ${analysis.complexity.score} |`);
  push(`| Max nesting depth | ${analysis.complexity.depth} |`);
  push(`| Total fields | ${totalNodeCount} |`);
  push(`| Selected fields | ${selectedCount} / ${totalNodeCount} |`);
  push(`| Connections | ${analysis.complexity.connectionCount} |`);
  push(
    `| Locales | ${localeNames.length > 0 ? localeNames.join(", ") : "none"} |`
  );
  push(`| Variables | ${analysis.variables.length} |`);
  push(`| Fragments | ${fragmentCount} |`);
  push("");

  // --- Issues ---
  const hasSystemFields = systemFieldsAnalysis.occurrences.length > 0;
  const hasRichText = richTextOverfetches.length > 0;
  const hasPagination = paginationIssues.length > 0;
  const hasDuplicates = analysis.duplicateFieldsInfo.length > 0;
  const deepPaths = uniqueDeepPaths(tree);
  const hasDepth = deepPaths.length > 0;
  const hasFragmentSuggestions = fragmentSuggestions.length > 0;

  const totalIssues =
    systemFieldsAnalysis.occurrences.length +
    richTextOverfetches.length +
    paginationIssues.length +
    analysis.duplicateFieldsInfo.length +
    deepPaths.length +
    fragmentSuggestions.length;

  if (totalIssues > 0) {
    push(`## Issues Found (${totalIssues})`, "");

    // System fields
    if (hasSystemFields) {
      const safe = systemFieldsAnalysis.occurrences.filter(
        (o) => o.safeToRemove
      );
      push(
        `### System Fields — ${systemFieldsAnalysis.occurrences.length} occurrences (${formatBytes(systemFieldsAnalysis.totalBytes)})`,
        ""
      );
      if (safe.length > 0) {
        push(
          `${safe.length} field(s) can be safely removed, saving ~${formatBytes(systemFieldsAnalysis.safeBytes)}.`,
          ""
        );
      }
      push("| Field | Path | Category | Safe to remove |", "|---|---|---|---|");
      for (const o of systemFieldsAnalysis.occurrences) {
        const cat =
          o.category === "introspection"
            ? "Introspection"
            : o.category === "metadata"
              ? "Metadata"
              : "Cache";
        push(
          `| \`${o.fieldName}\` | \`${o.fullPath}\` | ${cat} | ${o.safeToRemove ? "Yes" : "No"} |`
        );
      }
      push("");
    }

    // RichText over-fetching
    if (hasRichText) {
      push(
        `### RichText Over-fetching — ${richTextOverfetches.length} field(s)`,
        ""
      );
      for (const rt of richTextOverfetches) {
        const extras = rt.selectedFormats.filter(
          (f) => f !== rt.recommendedFormat
        );
        push(
          `- **\`${rt.parentPath}\`**: fetches ${rt.selectedFormats.map((f) => `\`${f}\``).join(", ")}. Recommended: keep only \`${rt.recommendedFormat}\`. Removing ${extras.map((e) => `\`${e}\``).join(", ")} saves ~${formatBytes(rt.savingsBytes)}.`
        );
      }
      push("");
    }

    // Pagination
    if (hasPagination) {
      push(
        `### Unbounded Connections — ${paginationIssues.length} field(s) missing pagination`,
        ""
      );
      push(
        "| Field | Path | Depth | Confidence | Suggested limit |",
        "|---|---|---|---|---|"
      );
      for (const p of paginationIssues) {
        push(
          `| \`${p.fieldName}\` | \`${p.fullPath}\` | ${p.depth} | ${p.confidence} | \`first: ${p.suggestedLimit}\` |`
        );
      }
      push("");
    }

    // Duplicates
    if (hasDuplicates) {
      push(
        `### Duplicate Fields — ${analysis.duplicateFieldsInfo.length} field(s)`,
        ""
      );
      for (const d of analysis.duplicateFieldsInfo) {
        push(`- **\`${d.fieldName}\`** appears ${d.count} times:`);
        for (const occ of d.occurrences) {
          push(`  - \`${occ.fullPath}\``);
        }
      }
      push("");
    }

    // Depth
    if (hasDepth) {
      push(
        `### Deep Nesting — ${deepPaths.length} path(s) exceeding 3 levels`,
        ""
      );
      push("| Depth | Path |", "|---|---|");
      for (const p of deepPaths.slice(0, 20)) {
        push(`| ${p.depth} | ${p.segments.map((s) => `\`${s}\``).join(" > ")} |`);
      }
      if (deepPaths.length > 20) {
        push(`| ... | _and ${deepPaths.length - 20} more paths_ |`);
      }
      push("");
    }

    // Fragment extraction opportunities
    if (hasFragmentSuggestions) {
      push(
        `### Fragment Extraction Opportunities — ${fragmentSuggestions.length}`,
        ""
      );
      for (const fs of fragmentSuggestions) {
        push(
          `- **\`${fs.suggestedName}\`** (fields: ${fs.fields.join(", ")}): found in ${fs.occurrences.length} locations, saves ~${formatBytes(fs.estimatedSavings)}.`
        );
      }
      push("");
    }
  } else {
    push("## Issues Found", "", "No issues detected.", "");
  }

  // --- Suggestions ---
  const suggestions = optimization.suggestions;
  if (suggestions.length > 0) {
    push(`## Optimization Suggestions (${suggestions.length})`, "");
    for (const s of suggestions) {
      push(`### ${severityLabel(s.severity)} ${s.title}`, "");
      push(s.description, "");
      if (s.impact) {
        push(`**Impact:** ${s.impact}`, "");
      }
      push(`> **Why it matters:** ${s.whyItMatters}`, "");
    }
  } else {
    push("## Optimization Suggestions", "", "No additional suggestions.", "");
  }

  // --- Split Analysis ---
  if (queryTabs.length > 1) {
    push("## Split Analysis", "");
    push(
      `The query has been split into **${queryTabs.length - 1} sub-queries** (plus the original).`,
      ""
    );
    push("| Tab | Query size |", "|---|---|");
    for (const tab of queryTabs) {
      const size = new TextEncoder().encode(tab.query).length;
      push(`| ${tab.label} | ${formatBytes(size)} |`);
    }
    push("");
  } else if (splitOptions.length > 0) {
    push("## Available Split Strategies", "");
    for (const opt of splitOptions) {
      push(`### ${opt.name}`, "");
      push(opt.description, "");
      push(
        `- **Sub-queries:** ${opt.queries.length}`,
        `- **Savings:** ${opt.savingsPercentage.toFixed(1)}% (original ${formatBytes(opt.originalSize)} -> largest split ${formatBytes(opt.totalSize)})`,
        ""
      );
      push("| Split | Size | Fields |", "|---|---|---|");
      for (const sq of opt.queries) {
        push(
          `| ${sq.name} | ${formatBytes(sq.size)} | ${sq.fields.join(", ")} |`
        );
      }
      push("");
    }
  }

  // --- Appendix ---
  push("## Appendix: Original Query", "");
  push("```graphql", query, "```", "");

  push("---", `*Generated by GraphQL Query Optimizer on ${date}*`);

  return lines.join("\n");
}
