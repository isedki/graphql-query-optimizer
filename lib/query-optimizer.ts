import {
  QueryAnalysis,
  minifyQuery,
  formatBytes,
  getPayloadStatus,
  DuplicateFieldInfo,
} from "./query-analyzer";
import { QueryTreeNode } from "./query-graph";

export type SuggestionSeverity = "error" | "warning" | "info";
export type SuggestionCategory = "complexity" | "payload" | "variables";

export interface Suggestion {
  id: string;
  severity: SuggestionSeverity;
  category: SuggestionCategory;
  title: string;
  description: string;
  impact?: string;
  impactPercentage?: number;
  whyItMatters: string;
  canAutoFix: boolean;
  autoFixLabel?: string;
  duplicateDetails?: DuplicateFieldInfo[];
}

export interface SizeReductionTechnique {
  id: string;
  name: string;
  description: string;
  applicable: boolean;
  currentSize: number;
  potentialSize: number;
  savingsBytes: number;
  savingsPercentage: number;
  howToApply: string;
}

export interface OptimizationResult {
  suggestions: Suggestion[];
  sizeReductions: SizeReductionTechnique[];
  optimizedQuery: string;
  optimizedVariables: string;
  savings: {
    bytes: number;
    percentage: number;
  };
}

export function calculateSizeReductions(
  analysis: QueryAnalysis,
  originalQuery: string
): SizeReductionTechnique[] {
  const techniques: SizeReductionTechnique[] = [];
  const totalSize = analysis.payload.totalSize;

  if (totalSize === 0) return techniques;

  const minifySavings = analysis.payload.totalSize - analysis.payload.minifiedSize;
  const minifyPercentage = Math.round((minifySavings / totalSize) * 100);
  techniques.push({
    id: "minify",
    name: "Remove whitespace",
    description: "Minify the query by removing unnecessary whitespace and formatting",
    applicable: minifySavings > 0,
    currentSize: totalSize,
    potentialSize: analysis.payload.minifiedSize,
    savingsBytes: minifySavings,
    savingsPercentage: minifyPercentage,
    howToApply: "Click 'Minify query' to automatically remove whitespace",
  });

  const commentMatch = originalQuery.match(/#[^\n]*/g);
  if (commentMatch) {
    const commentBytes = commentMatch.reduce((sum, c) => sum + c.length + 1, 0);
    const commentPercentage = Math.round((commentBytes / totalSize) * 100);
    techniques.push({
      id: "remove-comments",
      name: "Remove comments",
      description: `Found ${commentMatch.length} comment${commentMatch.length > 1 ? "s" : ""} in the query`,
      applicable: commentBytes > 0,
      currentSize: totalSize,
      potentialSize: totalSize - commentBytes,
      savingsBytes: commentBytes,
      savingsPercentage: commentPercentage,
      howToApply: "Remove GraphQL comments (lines starting with #)",
    });
  }

  if (analysis.duplicateFieldsInfo.length > 0) {
    const estimatedFragmentSavings = analysis.duplicateFieldsInfo.reduce((sum, dup) => {
      const avgFieldLength = 15;
      const savingsPerDuplicate = (dup.count - 1) * avgFieldLength;
      return sum + savingsPerDuplicate;
    }, 0);
    const fragmentPercentage = Math.round((estimatedFragmentSavings / totalSize) * 100);
    
    if (fragmentPercentage > 0) {
      techniques.push({
        id: "use-fragments",
        name: "Use GraphQL fragments",
        description: `${analysis.duplicateFieldsInfo.length} field${analysis.duplicateFieldsInfo.length > 1 ? "s appear" : " appears"} in multiple places`,
        applicable: true,
        currentSize: totalSize,
        potentialSize: totalSize - estimatedFragmentSavings,
        savingsBytes: estimatedFragmentSavings,
        savingsPercentage: fragmentPercentage,
        howToApply: "Define fragments for repeated field selections and reuse them with ...FragmentName",
      });
    }
  }

  if (analysis.operationName && analysis.operationName.length > 20) {
    const nameSavings = analysis.operationName.length - 10;
    const namePercentage = Math.round((nameSavings / totalSize) * 100);
    techniques.push({
      id: "shorten-name",
      name: "Shorten operation name",
      description: `Operation name "${analysis.operationName}" is ${analysis.operationName.length} characters`,
      applicable: nameSavings > 0,
      currentSize: totalSize,
      potentialSize: totalSize - nameSavings,
      savingsBytes: nameSavings,
      savingsPercentage: namePercentage,
      howToApply: "Use a shorter, more concise operation name (10-15 characters recommended)",
    });
  }

  return techniques.filter(t => t.applicable && t.savingsPercentage > 0);
}

function analyzeTree(tree: QueryTreeNode[]): {
  inlineFragmentCount: number;
  inlineFragmentParent: string | null;
  maxInlineOnNode: number;
  deepestPath: string;
  missingPagination: string[];
  complexWhereArgs: string[];
  scalarCount: number;
  relationCount: number;
} {
  let inlineFragmentCount = 0;
  let inlineFragmentParent: string | null = null;
  let maxInlineOnNode = 0;
  let maxDepth = 0;
  let deepestPath = "";
  let scalarCount = 0;
  let relationCount = 0;

  function walk(node: QueryTreeNode, pathParts: string[]) {
    const current = [...pathParts, node.displayName];
    if (current.length > maxDepth) {
      maxDepth = current.length;
      deepestPath = current.join(" > ");
    }
    if (node.nodeKind === "inlineFragment") inlineFragmentCount++;
    if (node.children.length > 0) relationCount++;
    scalarCount += node.scalarFields.length;

    const inlineChildren = node.children.filter((c) => c.nodeKind === "inlineFragment").length;
    if (inlineChildren > maxInlineOnNode) {
      maxInlineOnNode = inlineChildren;
      inlineFragmentParent = node.displayName;
    }
    for (const child of node.children) walk(child, current);
  }
  for (const root of tree) walk(root, []);

  const missingPagination: string[] = [];
  const complexWhereArgs: string[] = [];
  for (const root of tree) {
    const hasFirst = root.arguments.some((a) => a.name === "first" || a.name === "last");
    if (!hasFirst && (root.children.length > 0 || root.scalarFields.length > 0)) {
      missingPagination.push(root.displayName);
    }
    for (const arg of root.arguments) {
      if (arg.name === "where" && arg.value.length > 80) {
        complexWhereArgs.push(root.displayName);
      }
    }
  }

  return {
    inlineFragmentCount,
    inlineFragmentParent: maxInlineOnNode > 0 ? inlineFragmentParent : null,
    maxInlineOnNode,
    deepestPath,
    missingPagination,
    complexWhereArgs,
    scalarCount,
    relationCount,
  };
}

export function generateSuggestions(
  analysis: QueryAnalysis,
  originalQuery: string,
  originalVariables: string,
  tree: QueryTreeNode[] = []
): OptimizationResult {
  const suggestions: Suggestion[] = [];
  const sizeReductions = calculateSizeReductions(analysis, originalQuery);
  const treeInfo = analyzeTree(tree);

  // --- Deep nesting with specific path ---
  if (analysis.complexity.depth > 6) {
    const pathDetail = treeInfo.deepestPath
      ? `\nDeepest path: ${treeInfo.deepestPath.length > 100 ? treeInfo.deepestPath.slice(0, 97) + "..." : treeInfo.deepestPath}`
      : "";
    suggestions.push({
      id: "deep-nesting",
      severity: analysis.complexity.depth > 8 ? "error" : "warning",
      category: "complexity",
      title: `Depth ${analysis.complexity.depth} -- deep nesting`,
      description: `Query reaches ${analysis.complexity.depth} levels of nesting.${pathDetail}`,
      impact: `Depth: ${analysis.complexity.depth}`,
      whyItMatters:
        "Each nesting level increases server processing time. Hygraph recommends flattening queries or splitting deeply nested parts into separate requests.",
      canAutoFix: false,
    });
  }

  // --- Many fields with breakdown ---
  if (analysis.complexity.fieldCount > 30) {
    suggestions.push({
      id: "many-fields",
      severity: analysis.complexity.fieldCount > 50 ? "error" : "warning",
      category: "complexity",
      title: `${analysis.complexity.fieldCount} fields requested`,
      description: `${treeInfo.scalarCount} scalar fields and ${treeInfo.relationCount} relations. Only fetch fields you actually use in your application.`,
      impact: `${analysis.complexity.fieldCount} fields`,
      whyItMatters:
        "Every field adds to query complexity and response size. Hygraph recommends selecting only the fields your application needs.",
      canAutoFix: false,
    });
  }

  // --- Inline fragments / union types ---
  if (treeInfo.maxInlineOnNode > 5 && treeInfo.inlineFragmentParent) {
    suggestions.push({
      id: "many-inline-fragments",
      severity: treeInfo.maxInlineOnNode > 15 ? "error" : "warning",
      category: "complexity",
      title: `${treeInfo.maxInlineOnNode} union types on "${treeInfo.inlineFragmentParent}"`,
      description: `"${treeInfo.inlineFragmentParent}" has ${treeInfo.maxInlineOnNode} inline fragments (... on Type). Consider fetching by type with separate queries or grouping related types.`,
      impact: `${treeInfo.inlineFragmentCount} fragments`,
      whyItMatters:
        "Each inline fragment adds to the query size and complexity. Splitting a large union query into smaller type-specific queries reduces individual request size and makes each query easier to optimize.",
      canAutoFix: false,
    });
  }

  // --- Missing pagination on specific roots ---
  if (treeInfo.missingPagination.length > 0) {
    const fields = treeInfo.missingPagination.map((f) => `"${f}"`).join(", ");
    suggestions.push({
      id: "missing-pagination",
      severity: "warning",
      category: "complexity",
      title: `No pagination on ${fields}`,
      description: `${fields} ${treeInfo.missingPagination.length > 1 ? "have" : "has"} no "first" or "last" argument -- this fetches ALL matching entries.`,
      whyItMatters:
        "Without pagination, Hygraph returns all matching records which increases response time and payload. Add a 'first' argument to limit results.",
      canAutoFix: false,
    });
  }

  // --- Complex where arguments ---
  if (treeInfo.complexWhereArgs.length > 0) {
    const fields = treeInfo.complexWhereArgs.map((f) => `"${f}"`).join(", ");
    suggestions.push({
      id: "complex-where",
      severity: "info",
      category: "complexity",
      title: `Complex filter on ${fields}`,
      description: `The "where" argument on ${fields} is large. Consider simplifying the filter or using pagination to reduce request size.`,
      whyItMatters:
        "Large filter arguments contribute to the total request payload measured against Hygraph's plan limits. Simpler filters with pagination are more efficient.",
      canAutoFix: false,
    });
  }

  // --- Payload size ---
  const payloadStatus = getPayloadStatus(analysis.payload.percentageUsed);
  if (payloadStatus === "critical") {
    suggestions.push({
      id: "payload-exceeded",
      severity: "error",
      category: "payload",
      title: "Request size exceeds plan limit",
      description: `Total payload (${formatBytes(analysis.payload.totalSize)}) exceeds your plan limit (${formatBytes(analysis.payload.planLimit)}).`,
      impact: `${analysis.payload.percentageUsed}% of limit`,
      whyItMatters:
        "Exceeding Hygraph's request size limit returns a 413 error. You must reduce the query size to proceed.",
      canAutoFix: false,
    });
  } else if (payloadStatus === "danger") {
    suggestions.push({
      id: "payload-warning",
      severity: "warning",
      category: "payload",
      title: "Request size approaching limit",
      description: `Total payload (${formatBytes(analysis.payload.totalSize)}) is ${analysis.payload.percentageUsed}% of your plan limit.`,
      impact: `${analysis.payload.percentageUsed}% of limit`,
      whyItMatters:
        "You're approaching Hygraph's request size limit. Consider reducing query size to avoid 413 errors.",
      canAutoFix: false,
    });
  }

  // --- Minification ---
  const savingsFromMinify =
    analysis.payload.totalSize - analysis.payload.minifiedSize;
  const savingsPercentage = analysis.payload.totalSize > 0
    ? Math.round((savingsFromMinify / analysis.payload.totalSize) * 100)
    : 0;
  if (savingsFromMinify > 100 && savingsPercentage > 10) {
    suggestions.push({
      id: "minify-query",
      severity: "info",
      category: "payload",
      title: "Whitespace can be removed",
      description: `Minifying saves ${formatBytes(savingsFromMinify)} (${savingsPercentage}% of total).`,
      impact: `-${savingsPercentage}%`,
      impactPercentage: -savingsPercentage,
      whyItMatters:
        "Every byte counts toward Hygraph's request size limit. Minifying can save significant space in complex queries.",
      canAutoFix: true,
      autoFixLabel: "Minify query",
    });
  }

  // --- Unused variables ---
  const unusedDefinedVars = analysis.variables.filter(
    (v) => v.defined && !v.used
  );
  if (unusedDefinedVars.length > 0) {
    const estimatedSavings = unusedDefinedVars.reduce((sum, v) => sum + v.name.length + v.type.length + 5, 0);
    const unusedPercentage = analysis.payload.totalSize > 0
      ? Math.round((estimatedSavings / analysis.payload.totalSize) * 100)
      : 0;
    suggestions.push({
      id: "unused-variables",
      severity: "warning",
      category: "variables",
      title: `Unused variable${unusedDefinedVars.length > 1 ? "s" : ""} defined`,
      description: `${unusedDefinedVars.map((v) => `$${v.name}`).join(", ")} ${unusedDefinedVars.length > 1 ? "are" : "is"} defined but never used in the query.`,
      impact: unusedPercentage > 0 ? `-${unusedPercentage}%` : `${unusedDefinedVars.length} unused`,
      impactPercentage: unusedPercentage > 0 ? -unusedPercentage : undefined,
      whyItMatters:
        "Unused variables add to the total request payload. Remove them to keep queries clean.",
      canAutoFix: false,
    });
  }

  // --- Undefined variables ---
  const undefinedVars = analysis.variables.filter(
    (v) => !v.defined && v.name !== ""
  );
  if (undefinedVars.length > 0) {
    suggestions.push({
      id: "undefined-variables",
      severity: "warning",
      category: "variables",
      title: `Variable${undefinedVars.length > 1 ? "s" : ""} provided but not defined`,
      description: `${undefinedVars.map((v) => `$${v.name}`).join(", ")} ${undefinedVars.length > 1 ? "are" : "is"} in the variables JSON but not defined in the query.`,
      impact: `${undefinedVars.length} extra`,
      whyItMatters:
        "Variables in the JSON that aren't used by the query add unnecessary bytes to your request payload.",
      canAutoFix: false,
    });
  }

  // --- Duplicate fields with top offenders ---
  if (analysis.duplicateFieldsInfo.length > 0) {
    const fragmentTechnique = sizeReductions.find((t) => t.id === "use-fragments");
    const fragmentPercentage = fragmentTechnique?.savingsPercentage || 0;
    const topDups = analysis.duplicateFieldsInfo
      .slice()
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
    const topList = topDups.map((d) => `"${d.fieldName}" x${d.count}`).join(", ");

    suggestions.push({
      id: "duplicate-fields",
      severity: "info",
      category: "payload",
      title: `${analysis.duplicateFieldsInfo.length} repeated field selections`,
      description: `Top duplicates: ${topList}. Using fragments can reduce repetition.`,
      impact: fragmentPercentage > 0 ? `-${fragmentPercentage}%` : `${analysis.duplicateFieldsInfo.length} duplicates`,
      impactPercentage: fragmentPercentage > 0 ? -fragmentPercentage : undefined,
      whyItMatters:
        "Hygraph recommends using GraphQL fragments to avoid repetition. This reduces query size and makes queries more maintainable.",
      canAutoFix: false,
      duplicateDetails: analysis.duplicateFieldsInfo,
    });
  }

  let optimizedQuery = originalQuery;
  let optimizedVariables = originalVariables;

  if (analysis.ast && suggestions.some((s) => s.id === "minify-query")) {
    optimizedQuery = minifyQuery(analysis.ast);
  }

  const totalSavings = analysis.payload.totalSize - analysis.payload.minifiedSize;
  const totalSavingsPercentage =
    analysis.payload.totalSize > 0
      ? Math.round((totalSavings / analysis.payload.totalSize) * 100)
      : 0;

  return {
    suggestions: suggestions.sort((a, b) => {
      const severityOrder = { error: 0, warning: 1, info: 2 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    }),
    sizeReductions,
    optimizedQuery,
    optimizedVariables,
    savings: {
      bytes: totalSavings,
      percentage: totalSavingsPercentage,
    },
  };
}

export function applySuggestion(
  suggestionId: string,
  analysis: QueryAnalysis,
  currentQuery: string,
  currentVariables: string
): { query: string; variables: string } {
  switch (suggestionId) {
    case "minify-query":
      if (analysis.ast) {
        return {
          query: minifyQuery(analysis.ast),
          variables: currentVariables,
        };
      }
      break;
  }

  return { query: currentQuery, variables: currentVariables };
}
