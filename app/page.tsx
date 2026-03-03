"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { parse, print as gqlPrint, DocumentNode, OperationDefinitionNode, Kind } from "graphql";
import { QueryEditor, type MonacoEditorInstance } from "@/components/QueryEditor";
import { VariablesEditor } from "@/components/VariablesEditor";
import { QueryTreeView } from "@/components/QueryTreeView";
import { QuerySummaryCard } from "@/components/QuerySummaryCard";
import { LocaleToggles } from "@/components/LocaleToggles";
import { SplitOptionsPanel } from "@/components/SplitOptionsPanel";
import { MetricsBar } from "@/components/MetricsBar";
import { OptimizationSuggestions } from "@/components/OptimizationSuggestions";
import { DepthPathsCard } from "@/components/DepthPathsCard";
import { DuplicateFieldsCard } from "@/components/DuplicateFieldsCard";
import { SystemFieldsCard } from "@/components/SystemFieldsCard";
import { RichTextCard } from "@/components/RichTextCard";
import { FragmentExtractionCard } from "@/components/FragmentExtractionCard";
import { PaginationGuardCard } from "@/components/PaginationGuardCard";
import { AnalysisTabs, TabDef } from "@/components/AnalysisTabs";
import { QuickActions } from "@/components/QuickActions";
import {
  analyzeQuery,
  detectLocales,
  detectSystemFields,
  detectRichTextOverfetch,
  detectExtractableFragments,
  applyFragmentExtraction,
  detectUnboundedConnections,
  addPaginationToFields,
  removeFieldsByName,
  minifyQuery,
  OperationType,
} from "@/lib/query-analyzer";
import {
  generateSuggestions,
  applySuggestion,
} from "@/lib/query-optimizer";
import {
  astToTree,
  treeToQuery,
  collectAllNodeIds,
  QueryTreeNode,
} from "@/lib/query-graph";
import { generateSplitOptions } from "@/lib/query-splitter";

const EXAMPLE_QUERY = `query GetArticles($locale: Locale!, $first: Int) {
  articles(locales: [$locale], first: $first) {
    id
    title
    slug
    content {
      html
    }
    author {
      name
      bio
      avatar {
        url
      }
    }
    categories {
      name
      slug
    }
    createdAt
    updatedAt
  }
}`;


const FEATURES = [
  { icon: "gauge", label: "Complexity scoring" },
  { icon: "ruler", label: "Payload size analysis" },
  { icon: "copy", label: "Duplicate field detection" },
  { icon: "layers", label: "Nesting depth analysis" },
  { icon: "shield", label: "System field detection" },
  { icon: "file", label: "RichText over-fetch detection" },
  { icon: "globe", label: "Locale optimization" },
  { icon: "scissors", label: "Query splitting" },
  { icon: "tree", label: "Interactive tree view" },
  { icon: "bulb", label: "Optimization suggestions" },
  { icon: "book", label: "Query digest" },
  { icon: "puzzle", label: "Fragment extraction" },
  { icon: "filter", label: "Pagination guard" },
];

export default function QueryOptimizerPage() {
  const [query, setQuery] = useState(EXAMPLE_QUERY);
  const [variables, setVariables] = useState("");
  const [operationType, setOperationType] = useState<OperationType>("query");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showFeatures, setShowFeatures] = useState(true);
  const editorRef = useRef<MonacoEditorInstance | null>(null);

  const handleEditorMount = useCallback((editor: MonacoEditorInstance) => {
    editorRef.current = editor;
  }, []);

  const handleNodeClick = useCallback((node: QueryTreeNode) => {
    const editor = editorRef.current;
    if (!editor || !node.loc) return;
    const { startLine, endLine } = node.loc;
    const model = editor.getModel();
    const endCol = model
      ? model.getLineMaxColumn(endLine)
      : 1;
    editor.revealLineInCenter(startLine);
    editor.setSelection({
      startLineNumber: startLine,
      startColumn: 1,
      endLineNumber: endLine,
      endColumn: endCol,
    });
    editor.focus();
  }, []);

  const handleFragmentZoom = useCallback((node: QueryTreeNode) => {
    if (!node.fragmentName) return;
    const editor = editorRef.current;
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const searchPattern = new RegExp(
      `^\\s*fragment\\s+${node.fragmentName}\\s+on\\s+`
    );
    const lineCount = model.getLineCount();
    for (let i = 1; i <= lineCount; i++) {
      const lineContent = model.getLineContent(i);
      if (searchPattern.test(lineContent)) {
        let endLine = i;
        let braceDepth = 0;
        for (let j = i; j <= lineCount; j++) {
          const line = model.getLineContent(j);
          for (const ch of line) {
            if (ch === "{") braceDepth++;
            else if (ch === "}") braceDepth--;
          }
          if (braceDepth <= 0 && j > i) {
            endLine = j;
            break;
          }
        }
        editor.revealLineInCenter(i);
        editor.setSelection({
          startLineNumber: i,
          startColumn: 1,
          endLineNumber: endLine,
          endColumn: model.getLineMaxColumn(endLine),
        });
        editor.focus();
        break;
      }
    }
  }, []);

  const ast = useMemo<DocumentNode | null>(() => {
    try {
      return parse(query);
    } catch {
      return null;
    }
  }, [query]);

  const tree = useMemo<QueryTreeNode[]>(() => {
    if (!ast) return [];
    return astToTree(ast);
  }, [ast]);

  useMemo(() => {
    if (tree.length > 0) {
      const allIds = collectAllNodeIds(tree);
      setSelectedIds(allIds);
      setInitialized(true);
    }
  }, [tree]);

  const parsedVariables = useMemo<Record<string, unknown>>(() => {
    try {
      return JSON.parse(variables);
    } catch {
      return {};
    }
  }, [variables]);

  const localeInfos = useMemo(() => {
    if (!ast) return [];
    return detectLocales(ast, parsedVariables);
  }, [ast, parsedVariables]);

  useMemo(() => {
    const allLocales = new Set(localeInfos.flatMap((l) => l.locales));
    setSelectedLocales(allLocales);
  }, [localeInfos]);

  const analysis = useMemo(() => {
    return analyzeQuery(query, variables);
  }, [query, variables]);

  const systemFieldsAnalysis = useMemo(() => {
    if (!ast) return { occurrences: [], totalBytes: 0, safeBytes: 0, categories: { introspection: 0, metadata: 0, cache: 0 } };
    return detectSystemFields(ast);
  }, [ast]);

  const richTextOverfetches = useMemo(() => {
    if (!ast) return [];
    return detectRichTextOverfetch(ast);
  }, [ast]);

  const fragmentSuggestions = useMemo(() => {
    if (!ast) return [];
    return detectExtractableFragments(ast);
  }, [ast]);

  const existingFragmentNames = useMemo(() => {
    if (!ast) return [] as string[];
    return ast.definitions
      .filter((d): d is import("graphql").FragmentDefinitionNode => d.kind === Kind.FRAGMENT_DEFINITION)
      .map((d) => d.name.value);
  }, [ast]);

  const paginationIssues = useMemo(() => {
    return detectUnboundedConnections(tree);
  }, [tree]);

  const optimization = useMemo(() => {
    return generateSuggestions(analysis, query, variables, tree);
  }, [analysis, query, variables, tree]);

  const splitOptions = useMemo(() => {
    if (!ast) return [];
    return generateSplitOptions(ast, tree, analysis.payload.totalSize);
  }, [ast, tree, analysis.payload.totalSize]);

  const regeneratedQuery = useMemo(() => {
    if (!initialized || !ast || tree.length === 0) return null;
    const allIds = collectAllNodeIds(tree);
    if (selectedIds.size === allIds.size) return null;

    const operation = ast.definitions.find(
      (def): def is OperationDefinitionNode =>
        def.kind === Kind.OPERATION_DEFINITION
    );
    const opName = operation?.name?.value;
    const opType = operation?.operation || "query";
    const varDefs = operation?.variableDefinitions
      ?.map((v) => `$${v.variable.name.value}: ${gqlPrint(v.type)}`)
      .join(", ");

    return treeToQuery(tree, selectedIds, opName, opType, varDefs, ast);
  }, [ast, tree, selectedIds, initialized]);

  // Computed quick-action data
  const minifySavings = analysis.payload.totalSize - analysis.payload.minifiedSize;
  const minifyPct = analysis.payload.totalSize > 0
    ? Math.round((minifySavings / analysis.payload.totalSize) * 100)
    : 0;
  const canMinify = minifySavings > 100 && minifyPct > 5;

  const safeSystemFieldNames = useMemo(() => {
    return systemFieldsAnalysis.occurrences
      .filter((o) => o.safeToRemove)
      .map((o) => o.fieldName);
  }, [systemFieldsAnalysis]);

  const richTextFormatsToRemove = useMemo(() => {
    const names: string[] = [];
    for (const rt of richTextOverfetches) {
      for (const f of rt.selectedFormats) {
        if (f !== rt.recommendedFormat) names.push(f);
      }
    }
    return names;
  }, [richTextOverfetches]);

  // Handlers
  const handleApplySuggestion = useCallback(
    (suggestionId: string) => {
      const result = applySuggestion(suggestionId, analysis, query, variables);
      setQuery(result.query);
      setVariables(result.variables);
    },
    [analysis, query, variables]
  );

  const handleLocaleToggle = useCallback(
    (locale: string) => {
      setSelectedLocales((prev) => {
        const next = new Set(prev);
        if (next.has(locale)) next.delete(locale);
        else next.add(locale);
        return next;
      });
    },
    []
  );

  const handleApplySelection = useCallback(() => {
    if (regeneratedQuery) setQuery(regeneratedQuery);
  }, [regeneratedQuery]);

  const handleCopyQuery = useCallback(() => {
    navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }, [query]);

  const handleMinify = useCallback(() => {
    if (ast) setQuery(minifyQuery(ast));
  }, [ast]);

  const handleRemoveSystemFields = useCallback(
    (fieldNames: string[]) => {
      try {
        setQuery(removeFieldsByName(query, new Set(fieldNames)));
      } catch { /* ignore */ }
    },
    [query]
  );

  const handleRemoveRichTextFormats = useCallback(
    (formatsToRemove: string[]) => {
      try {
        setQuery(removeFieldsByName(query, new Set(formatsToRemove)));
      } catch { /* ignore */ }
    },
    [query]
  );

  const handleExtractFragments = useCallback(
    (suggestions: import("@/lib/query-analyzer").FragmentSuggestion[]) => {
      try {
        setQuery(applyFragmentExtraction(query, suggestions));
      } catch { /* ignore */ }
    },
    [query]
  );

  const handleFixPagination = useCallback(
    (fieldPath: string, limit: number) => {
      try {
        const limits = new Map([[fieldPath, limit]]);
        setQuery(addPaginationToFields(query, [fieldPath], limits));
      } catch { /* ignore */ }
    },
    [query]
  );

  const handleFixAllPagination = useCallback(() => {
    try {
      const paths = paginationIssues.map((i) => i.fullPath);
      const limits = new Map(paginationIssues.map((i) => [i.fullPath, i.suggestedLimit]));
      setQuery(addPaginationToFields(query, paths, limits));
    } catch { /* ignore */ }
  }, [query, paginationIssues]);

  const variablesError = useMemo(() => {
    if (!variables.trim()) return undefined;
    try {
      JSON.parse(variables);
      return undefined;
    } catch (e) {
      return e instanceof Error ? e.message : "Invalid JSON";
    }
  }, [variables]);

  const totalNodeCount = useMemo(() => collectAllNodeIds(tree).size, [tree]);

  const fragmentCount = useMemo(() => {
    if (!ast) return 0;
    return ast.definitions.filter((d) => d.kind === Kind.FRAGMENT_DEFINITION).length;
  }, [ast]);

  const localeNames = useMemo(() => {
    const allLocales = new Set<string>();
    for (const info of localeInfos) {
      for (const l of info.locales) allLocales.add(l);
    }
    return Array.from(allLocales);
  }, [localeInfos]);

  // Tab definitions
  const suggestionBadge = optimization.suggestions.length + splitOptions.length;
  const detectionBadge =
    systemFieldsAnalysis.occurrences.length +
    richTextOverfetches.length +
    fragmentSuggestions.length +
    paginationIssues.length;
  const analysisBadge = analysis.duplicateFieldsInfo.length;

  const hasDepthIssues = tree.length > 0;
  const hasLocales = localeInfos.length > 0;

  const tabs: TabDef[] = [
    {
      id: "suggestions",
      label: "Suggestions",
      badge: suggestionBadge,
      isEmpty: suggestionBadge === 0,
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <OptimizationSuggestions
            suggestions={optimization.suggestions}
            onApply={handleApplySuggestion}
          />
          <SplitOptionsPanel options={splitOptions} onApplyAll={setQuery} />
        </div>
      ),
    },
    {
      id: "detections",
      label: "Detections",
      badge: detectionBadge,
      isEmpty: detectionBadge === 0,
      content: (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {systemFieldsAnalysis.occurrences.length > 0 && (
            <SystemFieldsCard
              analysis={systemFieldsAnalysis}
              onRemove={handleRemoveSystemFields}
            />
          )}
          {richTextOverfetches.length > 0 && (
            <RichTextCard
              overfetches={richTextOverfetches}
              onRemoveFormats={handleRemoveRichTextFormats}
            />
          )}
          {fragmentSuggestions.length > 0 && (
            <FragmentExtractionCard
              suggestions={fragmentSuggestions}
              existingFragmentNames={existingFragmentNames}
              onExtract={handleExtractFragments}
            />
          )}
          {paginationIssues.length > 0 && (
            <PaginationGuardCard
              issues={paginationIssues}
              onFix={handleFixPagination}
              onFixAll={handleFixAllPagination}
            />
          )}
        </div>
      ),
    },
    {
      id: "analysis",
      label: "Analysis",
      badge: analysisBadge,
      isEmpty: !hasDepthIssues && analysisBadge === 0 && !hasLocales,
      content: (
        <div className="space-y-4">
          {(hasDepthIssues || analysisBadge > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {hasDepthIssues && <DepthPathsCard tree={tree} />}
              {analysisBadge > 0 && (
                <DuplicateFieldsCard duplicates={analysis.duplicateFieldsInfo} />
              )}
            </div>
          )}
          {hasLocales && (
            <LocaleToggles
              localeInfos={localeInfos}
              selectedLocales={selectedLocales}
              onToggle={handleLocaleToggle}
            />
          )}
        </div>
      ),
    },
    {
      id: "digest",
      label: "Digest",
      content: (
        <QuerySummaryCard analysis={analysis} tree={tree} ast={ast} />
      ),
    },
  ];

  return (
    <main className="min-h-screen py-6 px-4 hygraph-bg">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold gradient-text mb-1">
                GraphQL Query Optimizer
              </h1>
              <p className="text-zinc-400 text-sm">
                Visualize, analyze, and optimize your GraphQL queries
              </p>
            </div>
          </div>
        </div>

        {/* Feature Showcase */}
        <div className="mb-4">
          <button
            onClick={() => setShowFeatures(!showFeatures)}
            className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-400 transition-colors mb-2"
          >
            <ChevronIcon
              className={`w-3 h-3 transition-transform ${showFeatures ? "rotate-90" : ""}`}
            />
            <span className="uppercase tracking-wider font-medium">
              What this tool does
            </span>
          </button>
          {showFeatures && (
            <div className="flex flex-wrap gap-2">
              {FEATURES.map((f) => (
                <span
                  key={f.label}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-800/60 border border-white/5 text-xs text-zinc-400"
                >
                  <FeatureIcon name={f.icon} />
                  {f.label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Parse Error */}
        {analysis.error && !analysis.isValid && (
          <div className="mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="flex items-start gap-3">
              <ErrorIcon className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Parse Error</p>
                <p className="text-xs text-zinc-400 mt-1">{analysis.error}</p>
              </div>
            </div>
          </div>
        )}

        {/* Main Grid: Input + Visualizer */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
          {/* Left Column: Editors */}
          <div className="space-y-3">
            <QueryEditor value={query} onChange={setQuery} height="420px" onEditorMount={handleEditorMount} />
            <VariablesEditor
              value={variables}
              onChange={setVariables}
              height="140px"
              error={variablesError}
            />

            <div className="flex gap-2">
              <button
                onClick={handleCopyQuery}
                className="flex-1 py-2 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-300 text-sm font-medium hover:bg-zinc-700/80 transition-colors flex items-center justify-center gap-2"
              >
                <ClipboardIcon className="w-4 h-4" />
                {copied ? "Copied!" : "Copy Query"}
              </button>
              {regeneratedQuery && (
                <button
                  onClick={handleApplySelection}
                  className="flex-1 py-2 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-sm font-medium hover:bg-purple-500/30 transition-colors"
                >
                  Apply Selection ({selectedIds.size}/{totalNodeCount} nodes)
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Visualizer */}
          <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/50">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-zinc-900/50">
              <span className="px-3 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                Tree View
              </span>
              <span className="text-[10px] text-zinc-600 ml-auto">
                Shift+click to select/deselect subtree
              </span>
            </div>

            <div style={{ height: "560px" }}>
              <QueryTreeView
                roots={tree}
                selectedIds={selectedIds}
                onSelectionChange={setSelectedIds}
                onNodeClick={handleNodeClick}
                onFragmentZoom={handleFragmentZoom}
              />
            </div>
          </div>
        </div>

        {/* Metrics Bar + Quick Actions */}
        <div className="mb-4 space-y-3">
          <MetricsBar
            totalSize={analysis.payload.totalSize}
            complexity={analysis.complexity}
            selectedCount={selectedIds.size}
            totalCount={totalNodeCount}
            isValid={analysis.isValid}
            operationName={analysis.operationName}
            operationType={analysis.operationType}
            localeCount={localeNames.length}
            localeNames={localeNames}
            variableCount={analysis.variables.length}
            fragmentCount={fragmentCount}
            issueCount={detectionBadge + analysisBadge}
          />
          {analysis.isValid && (
            <QuickActions
              canMinify={canMinify}
              minifySavingsLabel={canMinify ? `-${minifyPct}%` : undefined}
              onMinify={handleMinify}
              safeSystemFieldCount={safeSystemFieldNames.length}
              onRemoveSystemFields={() => handleRemoveSystemFields(safeSystemFieldNames)}
              richTextFixCount={richTextOverfetches.length}
              onFixRichText={() => handleRemoveRichTextFormats(richTextFormatsToRemove)}
              fragmentCount={fragmentSuggestions.length}
              onExtractFragments={() => handleExtractFragments(fragmentSuggestions)}
              paginationIssueCount={paginationIssues.length}
              onFixPagination={handleFixAllPagination}
            />
          )}
        </div>

        {/* Tabbed Analysis Panel */}
        {analysis.isValid && (
          <div className="mb-4">
            <AnalysisTabs tabs={tabs} />
          </div>
        )}

        {/* Footer */}
        <div className="mt-6 text-center">
          <p className="text-xs text-zinc-500">
            Based on{" "}
            <a
              href="https://hygraph.com/docs/api-reference/basics/api-limits"
              target="_blank"
              rel="noopener noreferrer"
              className="text-purple-400 hover:text-purple-300 underline"
            >
              Hygraph API Limits documentation
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function FeatureIcon({ name }: { name: string }) {
  const cls = "w-3.5 h-3.5 text-zinc-500";
  switch (name) {
    case "gauge":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
      );
    case "ruler":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M3 12h18M3 18h18" />
        </svg>
      );
    case "copy":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      );
    case "layers":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
        </svg>
      );
    case "shield":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
      );
    case "file":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "globe":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      );
    case "scissors":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
        </svg>
      );
    case "tree":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 10h16M4 14h16M4 18h16" />
        </svg>
      );
    case "bulb":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "book":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "puzzle":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H7a1 1 0 01-1-1v-3a1 1 0 00-1-1H4a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
        </svg>
      );
    case "filter":
      return (
        <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
        </svg>
      );
    default:
      return <span className="w-3.5 h-3.5" />;
  }
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}
