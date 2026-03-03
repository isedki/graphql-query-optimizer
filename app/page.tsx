"use client";

import { useState, useMemo, useCallback } from "react";
import { parse, print as gqlPrint, DocumentNode, OperationDefinitionNode, Kind } from "graphql";
import { QueryEditor } from "@/components/QueryEditor";
import { VariablesEditor } from "@/components/VariablesEditor";
import { PlanSelector } from "@/components/PlanSelector";
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
import {
  analyzeQuery,
  detectLocales,
  detectSystemFields,
  detectRichTextOverfetch,
  removeFieldsByName,
  HygraphPlan,
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

const EXAMPLE_VARIABLES = `{
  "locale": "en",
  "first": 10
}`;

export default function QueryOptimizerPage() {
  const [query, setQuery] = useState(EXAMPLE_QUERY);
  const [variables, setVariables] = useState(EXAMPLE_VARIABLES);
  const [plan, setPlan] = useState<HygraphPlan>("growth");
  const [operationType, setOperationType] = useState<OperationType>("query");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedLocales, setSelectedLocales] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [copied, setCopied] = useState(false);

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
    return analyzeQuery(query, variables, plan);
  }, [query, variables, plan]);

  const systemFieldsAnalysis = useMemo(() => {
    if (!ast) return { occurrences: [], totalBytes: 0, safeBytes: 0, categories: { introspection: 0, metadata: 0, cache: 0 } };
    return detectSystemFields(ast);
  }, [ast]);

  const richTextOverfetches = useMemo(() => {
    if (!ast) return [];
    return detectRichTextOverfetch(ast);
  }, [ast]);

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

    return treeToQuery(tree, selectedIds, opName, opType, varDefs);
  }, [ast, tree, selectedIds, initialized]);

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
    if (regeneratedQuery) {
      setQuery(regeneratedQuery);
    }
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
        const updated = removeFieldsByName(query, new Set(fieldNames));
        setQuery(updated);
      } catch {
        // parse error -- ignore
      }
    },
    [query]
  );

  const handleRemoveRichTextFormats = useCallback(
    (formatsToRemove: string[]) => {
      try {
        const updated = removeFieldsByName(query, new Set(formatsToRemove));
        setQuery(updated);
      } catch {
        // parse error -- ignore
      }
    },
    [query]
  );

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

  return (
    <main className="min-h-screen py-6 px-4 hygraph-bg">
      <div className="max-w-[1600px] mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold gradient-text mb-1">
                GraphQL Query Optimizer
              </h1>
              <p className="text-zinc-400 text-sm">
                Visualize, analyze, and optimize your GraphQL queries
              </p>
            </div>
            <PlanSelector
              plan={plan}
              operationType={operationType}
              onPlanChange={setPlan}
              onOperationTypeChange={setOperationType}
            />
          </div>
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
            <QueryEditor value={query} onChange={setQuery} height="420px" />
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
              />
            </div>
          </div>
        </div>

        {/* Metrics Bar */}
        <div className="mb-4">
          <MetricsBar
            payload={analysis.payload}
            complexity={analysis.complexity}
            selectedCount={selectedIds.size}
            totalCount={totalNodeCount}
            isValid={analysis.isValid}
          />
        </div>

        {/* Suggestions + Split Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <OptimizationSuggestions
            suggestions={optimization.suggestions}
            onApply={handleApplySuggestion}
          />
          <SplitOptionsPanel
            options={splitOptions}
            onApplyAll={setQuery}
          />
        </div>

        {/* System Fields + RichText */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <SystemFieldsCard
            analysis={systemFieldsAnalysis}
            onRemove={handleRemoveSystemFields}
          />
          <RichTextCard
            overfetches={richTextOverfetches}
            onRemoveFormats={handleRemoveRichTextFormats}
          />
        </div>

        {/* Query Digest (full width) */}
        <div className="mb-4">
          <QuerySummaryCard
            analysis={analysis}
            tree={tree}
            ast={ast}
          />
        </div>

        {/* Depth + Duplicates row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <DepthPathsCard tree={tree} />
          <DuplicateFieldsCard duplicates={analysis.duplicateFieldsInfo} />
        </div>

        {/* Locales */}
        <div className="mb-4">
          <LocaleToggles
            localeInfos={localeInfos}
            selectedLocales={selectedLocales}
            onToggle={handleLocaleToggle}
          />
        </div>

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
