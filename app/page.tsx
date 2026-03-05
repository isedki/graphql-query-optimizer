"use client";

import { useState, useMemo, useCallback, useRef } from "react";
import { parse, print as gqlPrint, DocumentNode, OperationDefinitionNode, Kind } from "graphql";
import { QueryEditor, type MonacoEditorInstance } from "@/components/QueryEditor";
import { VariablesEditor } from "@/components/VariablesEditor";
import { QueryTreeView } from "@/components/QueryTreeView";
import { QuerySummaryCard } from "@/components/QuerySummaryCard";
import { LocaleToggles } from "@/components/LocaleToggles";
import { SplitOptionsPanel, type SplitQueryInfo } from "@/components/SplitOptionsPanel";
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
import { SplitVerificationPanel } from "@/components/SplitVerificationPanel";
import {
  runQueryAgainstEndpoint,
  type SingleQueryResult,
} from "@/lib/split-verifier";
import { generateReport } from "@/lib/report-generator";

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
  const [copiedTab, setCopiedTab] = useState<number | "all" | null>(null);
  const [copiedReport, setCopiedReport] = useState(false);
  const [showFeatures, setShowFeatures] = useState(false);
  const editorRef = useRef<MonacoEditorInstance | null>(null);

  // Split-tab state
  interface QueryTab { label: string; query: string }
  const [queryTabs, setQueryTabs] = useState<QueryTab[]>([]);
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  // Endpoint config
  const [endpoint, setEndpoint] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [runResult, setRunResult] = useState<SingleQueryResult | null>(null);
  const [runProgress, setRunProgress] = useState<string | null>(null);
  const [showRunResponse, setShowRunResponse] = useState(false);

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

  // --- Apply-to-all-tabs helpers ---
  const applyToAllTabs = useCallback(
    (transform: (q: string) => string) => {
      const synced = queryTabs.map((tab, idx) =>
        idx === activeTabIdx ? { ...tab, query } : tab
      );
      const updated = synced.map((tab) => {
        try {
          return { ...tab, query: transform(tab.query) };
        } catch {
          return tab;
        }
      });
      setQueryTabs(updated);
      if (updated[activeTabIdx]) {
        setQuery(updated[activeTabIdx].query);
      }
    },
    [queryTabs, activeTabIdx, query]
  );

  const handleRemoveSystemFieldsAll = useCallback(() => {
    applyToAllTabs((q) => removeFieldsByName(q, new Set(safeSystemFieldNames)));
  }, [applyToAllTabs, safeSystemFieldNames]);

  const handleRemoveRichTextFormatsAll = useCallback(() => {
    applyToAllTabs((q) => removeFieldsByName(q, new Set(richTextFormatsToRemove)));
  }, [applyToAllTabs, richTextFormatsToRemove]);

  const handleExtractFragmentsAll = useCallback(() => {
    applyToAllTabs((q) => {
      const tabAst = parse(q);
      const tabSuggestions = detectExtractableFragments(tabAst);
      if (tabSuggestions.length === 0) return q;
      return applyFragmentExtraction(q, tabSuggestions);
    });
  }, [applyToAllTabs]);

  const handleFixAllPaginationAll = useCallback(() => {
    applyToAllTabs((q) => {
      const tabAst = parse(q);
      const tabTree = astToTree(tabAst);
      const tabIssues = detectUnboundedConnections(tabTree);
      if (tabIssues.length === 0) return q;
      const paths = tabIssues.map((i) => i.fullPath);
      const limits = new Map(tabIssues.map((i) => [i.fullPath, i.suggestedLimit]));
      return addPaginationToFields(q, paths, limits);
    });
  }, [applyToAllTabs]);

  const handleSplitApply = useCallback(
    (queries: SplitQueryInfo[]) => {
      if (queries.length === 0) return;
      const tabs: QueryTab[] = [
        { label: "Original", query },
        ...queries.map((q) => ({ label: q.name, query: q.query })),
      ];
      setQueryTabs(tabs);
      setActiveTabIdx(1);
      setQuery(tabs[1].query);
    },
    [query]
  );

  const handleTabSwitch = useCallback(
    (idx: number) => {
      // Persist current edits into the active tab before switching
      setQueryTabs((prev) => {
        const updated = [...prev];
        if (updated[activeTabIdx]) {
          updated[activeTabIdx] = { ...updated[activeTabIdx], query };
        }
        return updated;
      });
      setActiveTabIdx(idx);
      setQuery(queryTabs[idx].query);
    },
    [query, queryTabs, activeTabIdx]
  );

  const handleCloseTabs = useCallback(() => {
    const original = queryTabs[0]?.query ?? query;
    setQueryTabs([]);
    setActiveTabIdx(0);
    setQuery(original);
  }, [queryTabs, query]);

  const handleCopyTab = useCallback((idx: number) => {
    const tab = queryTabs[idx];
    if (!tab) return;
    navigator.clipboard.writeText(tab.query).then(() => {
      setCopiedTab(idx);
      setTimeout(() => setCopiedTab(null), 1500);
    });
  }, [queryTabs]);

  const handleCopyAllTabs = useCallback(() => {
    const allQueries = queryTabs
      .map((t) => `# --- ${t.label} ---\n${t.query}`)
      .join("\n\n");
    navigator.clipboard.writeText(allQueries).then(() => {
      setCopiedTab("all");
      setTimeout(() => setCopiedTab(null), 1500);
    });
  }, [queryTabs]);

  const handleRunQuery = useCallback(async () => {
    if (!endpoint.trim() || !query.trim()) return;
    setRunResult(null);
    setRunProgress("Running...");
    const parsedVars: Record<string, unknown> = (() => {
      try { return JSON.parse(variables); } catch { return {}; }
    })();
    const headers: Record<string, string> = {};
    if (authToken.trim()) headers["Authorization"] = `Bearer ${authToken.trim()}`;
    const res = await runQueryAgainstEndpoint(endpoint.trim(), headers, query, parsedVars, setRunProgress);
    setRunResult(res);
    setRunProgress(null);
  }, [endpoint, authToken, query, variables]);

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

  const handleGenerateReport = useCallback(() => {
    const md = generateReport({
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
      totalNodeCount: collectAllNodeIds(tree).size,
      selectedCount: selectedIds.size,
    });
    navigator.clipboard.writeText(md).then(() => {
      setCopiedReport(true);
      setTimeout(() => setCopiedReport(false), 2000);
    });
  }, [
    query, analysis, systemFieldsAnalysis, richTextOverfetches,
    paginationIssues, fragmentSuggestions, optimization, splitOptions,
    queryTabs, tree, ast, localeNames, fragmentCount, selectedIds,
  ]);

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
          <SplitOptionsPanel options={splitOptions} onApplyAll={handleSplitApply} />
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
    ...(queryTabs.length > 0
      ? [
          {
            id: "splitTest",
            label: "Split Test",
            badge: queryTabs.length - 1,
            content: (
              <SplitVerificationPanel
                queryTabs={queryTabs}
                variables={variables}
                endpoint={endpoint}
                authToken={authToken}
              />
            ),
          },
        ]
      : []),
  ];

  const splitTestActiveTab = queryTabs.length > 0 ? "splitTest" : undefined;

  return (
    <main className="h-screen flex flex-col hygraph-bg overflow-hidden">
      {/* Header with Endpoint */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="max-w-[1600px] mx-auto">
          <div className="flex items-center justify-between gap-4">
            <div className="shrink-0">
              <h1 className="text-2xl font-bold gradient-text">
                GraphQL Query Optimizer
              </h1>
              <p className="text-zinc-500 text-xs">
                Visualize, analyze, and optimize your GraphQL queries
              </p>
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <input
                type="text"
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                placeholder="Content API Endpoint"
                className="w-[260px] px-2.5 py-1.5 rounded-md bg-zinc-800/80 border border-white/10 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40 truncate"
              />
              <input
                type="password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Auth Token"
                className="w-[160px] px-2.5 py-1.5 rounded-md bg-zinc-800/80 border border-white/10 text-xs text-zinc-300 placeholder:text-zinc-600 focus:outline-none focus:border-purple-500/40"
              />
              <div className="relative">
                <button
                  onClick={handleRunQuery}
                  disabled={!endpoint.trim() || !query.trim() || !!runProgress}
                  className="px-3 py-1.5 rounded-md bg-purple-500/15 border border-purple-500/20 text-purple-300 text-xs font-medium hover:bg-purple-500/25 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {runProgress ?? "Run"}
                </button>
                {runResult && (
                  <button
                    onClick={() => setShowRunResponse(!showRunResponse)}
                    className={`ml-1 text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      runResult.error
                        ? "bg-red-500/15 text-red-400"
                        : "bg-emerald-500/15 text-emerald-400"
                    }`}
                  >
                    {runResult.error ? "Error" : `${runResult.durationMs}ms`}
                  </button>
                )}
                {showRunResponse && runResult && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-[400px] max-h-[350px] rounded-lg bg-zinc-900 border border-white/10 shadow-xl overflow-hidden">
                    <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
                      <span className="text-[11px] text-zinc-400 font-medium">
                        {runResult.error ? "Error" : `Success - ${runResult.durationMs}ms - ${formatHeaderBytes(runResult.responseSize)}`}
                      </span>
                      <button
                        onClick={() => setShowRunResponse(false)}
                        className="text-zinc-500 hover:text-zinc-300 text-xs"
                      >
                        &times;
                      </button>
                    </div>
                    <pre className="text-[10px] text-zinc-400 p-2 overflow-auto max-h-[300px] custom-scrollbar whitespace-pre-wrap break-all">
                      {runResult.error
                        ? runResult.error
                        : JSON.stringify(runResult.response, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Parse Error */}
      {analysis.error && !analysis.isValid && (
        <div className="shrink-0 px-4">
          <div className="max-w-[1600px] mx-auto mb-2 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20">
            <div className="flex items-start gap-3">
              <ErrorIcon className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-400">Parse Error</p>
                <p className="text-xs text-zinc-400 mt-0.5">{analysis.error}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hero Grid: Editor + Tree View */}
      <div className="flex-1 min-h-0 px-4 pb-2">
        <div className="max-w-[1600px] mx-auto h-full grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Left Column: Editor area */}
          <div className="overflow-y-auto custom-scrollbar space-y-2 pr-1">
            {queryTabs.length > 0 && (
              <div className="flex items-center gap-1 bg-zinc-900/60 rounded-lg p-1 border border-white/5 overflow-x-auto custom-scrollbar flex-nowrap shrink-0">
                {queryTabs.map((tab, idx) => (
                  <div key={idx} className="shrink-0 flex items-center gap-0.5">
                    <button
                      onClick={() => handleTabSwitch(idx)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                        idx === activeTabIdx
                          ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                          : "text-zinc-400 hover:text-zinc-300 hover:bg-white/5 border border-transparent"
                      }`}
                    >
                      {tab.label}
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); handleCopyTab(idx); }}
                      className="p-1 rounded text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
                      title={`Copy ${tab.label}`}
                    >
                      {copiedTab === idx ? (
                        <svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))}
                <div className="shrink-0 ml-auto flex items-center gap-1">
                  <button
                    onClick={handleCopyAllTabs}
                    className="px-2 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors flex items-center gap-1"
                    title="Copy all queries"
                  >
                    {copiedTab === "all" ? (
                      <><svg className="w-3 h-3 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg><span className="text-emerald-400">Copied!</span></>
                    ) : (
                      <><svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>Copy All</>
                    )}
                  </button>
                  <button
                    onClick={handleCloseTabs}
                    className="px-2 py-1.5 text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                    title="Close split view"
                  >
                    &times; Close
                  </button>
                </div>
              </div>
            )}
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
                className="flex-1 py-1.5 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-colors flex items-center justify-center gap-2"
              >
                <ClipboardIcon className="w-3.5 h-3.5" />
                {copied ? "Copied!" : "Copy Query"}
              </button>
              {regeneratedQuery && (
                <button
                  onClick={handleApplySelection}
                  className="flex-1 py-1.5 rounded-lg bg-purple-500/20 border border-purple-500/30 text-purple-300 text-xs font-medium hover:bg-purple-500/30 transition-colors"
                >
                  Apply Selection ({selectedIds.size}/{totalNodeCount})
                </button>
              )}
            </div>
          </div>

          {/* Right Column: Tree View */}
          <div className="rounded-xl border border-white/10 overflow-hidden bg-zinc-950/50 flex flex-col min-h-0">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-white/5 bg-zinc-900/50 shrink-0">
              <span className="px-3 py-1 rounded text-xs font-medium bg-purple-500/20 text-purple-300">
                Tree View
              </span>
              <span className="text-[10px] text-zinc-600 ml-auto">
                Shift+click to select/deselect subtree
              </span>
            </div>
            <div className="flex-1 min-h-0">
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
      </div>

      {/* Below-the-fold: scrollable */}
      <div className="shrink-0 max-h-[50vh] overflow-y-auto custom-scrollbar">
        <div className="px-4">
          <div className="max-w-[1600px] mx-auto space-y-3 py-3">
            {/* Metrics Bar + Quick Actions (sticky within scroll area) */}
            <div className="sticky top-0 z-10 space-y-2 py-1 bg-[#09090b]/90 backdrop-blur-sm -mx-1 px-1">
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
              {queryTabs.length > 0 && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                  <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs text-blue-300">
                    Tip: For best results, apply pagination, system field removal, and fragment extraction to the <strong>Original</strong> query before splitting.
                  </span>
                  {activeTabIdx !== 0 && (
                    <button
                      onClick={() => handleTabSwitch(0)}
                      className="shrink-0 px-2.5 py-1 rounded-md bg-blue-500/15 border border-blue-500/25 text-blue-300 text-[11px] font-medium hover:bg-blue-500/25 transition-colors"
                    >
                      Switch to Original
                    </button>
                  )}
                </div>
              )}
              {analysis.isValid && (
                <QuickActions
                  safeSystemFieldCount={safeSystemFieldNames.length}
                  onRemoveSystemFields={() => handleRemoveSystemFields(safeSystemFieldNames)}
                  richTextFixCount={richTextOverfetches.length}
                  onFixRichText={() => handleRemoveRichTextFormats(richTextFormatsToRemove)}
                  fragmentCount={fragmentSuggestions.length}
                  onExtractFragments={() => handleExtractFragments(fragmentSuggestions)}
                  paginationIssueCount={paginationIssues.length}
                  onFixPagination={handleFixAllPagination}
                  splitMode={queryTabs.length > 0}
                  onRemoveSystemFieldsAll={handleRemoveSystemFieldsAll}
                  onFixRichTextAll={handleRemoveRichTextFormatsAll}
                  onExtractFragmentsAll={handleExtractFragmentsAll}
                  onFixPaginationAll={handleFixAllPaginationAll}
                />
              )}
              {analysis.isValid && (
                <button
                  onClick={handleGenerateReport}
                  className="w-full py-2 rounded-lg bg-zinc-800/80 border border-white/10 text-zinc-300 text-xs font-medium hover:bg-zinc-700/80 transition-colors flex items-center justify-center gap-2"
                >
                  <ReportIcon className="w-3.5 h-3.5" />
                  {copiedReport ? "Report copied to clipboard!" : "Generate Report (Markdown)"}
                </button>
              )}
            </div>

            {/* Tabbed Analysis Panel */}
            {analysis.isValid && (
              <AnalysisTabs tabs={tabs} defaultActiveId={splitTestActiveTab} />
            )}

            {/* Feature Showcase */}
            <div className="pt-2">
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

            {/* Footer */}
            <div className="text-center pb-2">
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

function ReportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  );
}

function formatHeaderBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ClipboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
    </svg>
  );
}
