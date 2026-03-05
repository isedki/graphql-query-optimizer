import {
  parse,
  DocumentNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
  SelectionSetNode,
  Kind,
} from "graphql";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CrossSplitDuplicate {
  path: string;
  inQueries: string[];
}

export interface SplitVerification {
  totalOriginalFields: number;
  totalSplitFields: number;
  coveredCount: number;
  coveragePercent: number;
  missingPaths: string[];
  extraPaths: string[];
  duplicates: CrossSplitDuplicate[];
  isFullyCovered: boolean;
}

export interface LiveTestResult {
  originalResponse: unknown;
  splitResponses: { name: string; response: unknown; variables: Record<string, unknown> }[];
  mergedResponse: unknown;
  differences: { path: string; original: unknown; split: unknown }[];
  isIdentical: boolean;
  error?: string;
}

export interface TestConfig {
  endpoint: string;
  headers: Record<string, string>;
  originalQuery: string;
  splitQueries: { name: string; query: string }[];
  variables: Record<string, unknown>;
  onProgress?: (step: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers: collect field paths from a query
// ---------------------------------------------------------------------------

type FragmentMap = Map<string, FragmentDefinitionNode>;

function buildFragmentMap(ast: DocumentNode): FragmentMap {
  const map: FragmentMap = new Map();
  for (const def of ast.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      map.set(def.name.value, def);
    }
  }
  return map;
}

function collectFieldPaths(ast: DocumentNode): Set<string> {
  const paths = new Set<string>();
  const fragMap = buildFragmentMap(ast);

  function walkSelections(
    selections: SelectionSetNode["selections"],
    parentPath: string,
    visited: Set<string>
  ) {
    for (const sel of selections) {
      if (sel.kind === Kind.FIELD) {
        const name = sel.alias ? sel.alias.value : sel.name.value;
        const fieldPath = parentPath ? `${parentPath}.${name}` : name;
        paths.add(fieldPath);
        if (sel.selectionSet) {
          walkSelections(sel.selectionSet.selections, fieldPath, visited);
        }
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        const typeName = sel.typeCondition?.name.value;
        const prefix = typeName ? `${parentPath}[${typeName}]` : parentPath;
        if (sel.selectionSet) {
          walkSelections(sel.selectionSet.selections, prefix, visited);
        }
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragMap.get(fragName);
        if (!fragDef) continue;
        const nextVisited = new Set(visited);
        nextVisited.add(fragName);
        walkSelections(fragDef.selectionSet.selections, parentPath, nextVisited);
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION && def.selectionSet) {
      walkSelections(def.selectionSet.selections, "", new Set());
    }
  }

  return paths;
}

// ---------------------------------------------------------------------------
// Static field coverage
// ---------------------------------------------------------------------------

export function verifySplitCoverage(
  originalQuery: string,
  splitQueries: { name: string; query: string }[]
): SplitVerification | null {
  let originalAst: DocumentNode;
  try {
    originalAst = parse(originalQuery);
  } catch {
    return null;
  }

  const originalPaths = collectFieldPaths(originalAst);

  const perQueryPaths = new Map<string, Set<string>>();
  const allSplitPaths = new Set<string>();

  for (const sq of splitQueries) {
    try {
      const ast = parse(sq.query);
      const paths = collectFieldPaths(ast);
      perQueryPaths.set(sq.name, paths);
      paths.forEach((p) => allSplitPaths.add(p));
    } catch {
      perQueryPaths.set(sq.name, new Set());
    }
  }

  const missingPaths: string[] = [];
  originalPaths.forEach((p) => {
    if (!allSplitPaths.has(p)) missingPaths.push(p);
  });

  const extraPaths: string[] = [];
  allSplitPaths.forEach((p) => {
    if (!originalPaths.has(p)) extraPaths.push(p);
  });

  // Cross-split duplicates: paths appearing in 2+ split queries
  const pathToQueries = new Map<string, string[]>();
  perQueryPaths.forEach((paths, queryName) => {
    paths.forEach((p) => {
      const list = pathToQueries.get(p);
      if (list) {
        list.push(queryName);
      } else {
        pathToQueries.set(p, [queryName]);
      }
    });
  });

  const duplicates: CrossSplitDuplicate[] = [];
  pathToQueries.forEach((queries, path) => {
    if (queries.length > 1) {
      duplicates.push({ path, inQueries: queries });
    }
  });

  const coveredCount = originalPaths.size - missingPaths.length;
  const coveragePercent =
    originalPaths.size > 0
      ? Math.round((coveredCount / originalPaths.size) * 100)
      : 100;

  return {
    totalOriginalFields: originalPaths.size,
    totalSplitFields: allSplitPaths.size,
    coveredCount,
    coveragePercent,
    missingPaths: missingPaths.sort(),
    extraPaths: extraPaths.sort(),
    duplicates: duplicates.sort((a, b) => a.path.localeCompare(b.path)),
    isFullyCovered: missingPaths.length === 0,
  };
}

// ---------------------------------------------------------------------------
// Live endpoint test helpers
// ---------------------------------------------------------------------------

function getVariableNames(query: string): Set<string> {
  try {
    const ast = parse(query);
    const names = new Set<string>();
    for (const def of ast.definitions) {
      if (def.kind === Kind.OPERATION_DEFINITION && def.variableDefinitions) {
        for (const v of def.variableDefinitions) {
          names.add(v.variable.name.value);
        }
      }
    }
    return names;
  } catch {
    return new Set();
  }
}

interface ClassifiedQueries {
  sameVars: { name: string; query: string }[];
  dependsOnMain: { name: string; query: string; fieldName: string }[];
  mainQuery: { name: string; query: string } | null;
}

export function classifySplitQueries(
  originalQuery: string,
  splitQueries: { name: string; query: string }[]
): ClassifiedQueries {
  const originalVars = getVariableNames(originalQuery);

  const sameVars: ClassifiedQueries["sameVars"] = [];
  const dependsOnMain: ClassifiedQueries["dependsOnMain"] = [];
  let mainQuery: ClassifiedQueries["mainQuery"] = null;

  for (const sq of splitQueries) {
    const sqVars = getVariableNames(sq.query);
    let hasNewVar = false;
    let newVarField = "";

    sqVars.forEach((v) => {
      if (!originalVars.has(v)) {
        hasNewVar = true;
        newVarField = v;
      }
    });

    if (hasNewVar) {
      dependsOnMain.push({ name: sq.name, query: sq.query, fieldName: newVarField });
    } else {
      sameVars.push({ name: sq.name, query: sq.query });
      if (sq.name === "mainQuery" || (!mainQuery && sameVars.length === 1)) {
        mainQuery = sq;
      }
    }
  }

  if (!mainQuery && sameVars.length > 0) {
    mainQuery = sameVars[0];
  }

  return { sameVars, dependsOnMain, mainQuery };
}

// ---------------------------------------------------------------------------
// Deep merge + diff
// ---------------------------------------------------------------------------

function deepMerge(target: unknown, source: unknown): unknown {
  if (source === null || source === undefined) return target;
  if (target === null || target === undefined) return source;

  if (Array.isArray(target) && Array.isArray(source)) {
    return [...target, ...source];
  }

  if (
    typeof target === "object" &&
    typeof source === "object" &&
    !Array.isArray(target) &&
    !Array.isArray(source)
  ) {
    const merged: Record<string, unknown> = { ...(target as Record<string, unknown>) };
    const src = source as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      merged[key] = key in merged ? deepMerge(merged[key], src[key]) : src[key];
    }
    return merged;
  }

  return source;
}

interface Diff {
  path: string;
  original: unknown;
  split: unknown;
}

function computeDiff(
  original: unknown,
  split: unknown,
  currentPath: string = ""
): Diff[] {
  const diffs: Diff[] = [];

  if (original === split) return diffs;
  if (original === null || original === undefined || split === null || split === undefined) {
    if (original !== split) {
      diffs.push({ path: currentPath || "(root)", original, split });
    }
    return diffs;
  }

  if (typeof original !== typeof split) {
    diffs.push({ path: currentPath || "(root)", original, split });
    return diffs;
  }

  if (Array.isArray(original) && Array.isArray(split)) {
    const maxLen = Math.max(original.length, split.length);
    for (let i = 0; i < maxLen; i++) {
      const childPath = currentPath ? `${currentPath}[${i}]` : `[${i}]`;
      if (i >= original.length) {
        diffs.push({ path: childPath, original: undefined, split: split[i] });
      } else if (i >= split.length) {
        diffs.push({ path: childPath, original: original[i], split: undefined });
      } else {
        diffs.push(...computeDiff(original[i], split[i], childPath));
      }
    }
    return diffs;
  }

  if (typeof original === "object") {
    const origObj = original as Record<string, unknown>;
    const splitObj = split as Record<string, unknown>;
    const allKeys = new Set([...Object.keys(origObj), ...Object.keys(splitObj)]);
    allKeys.forEach((key) => {
      const childPath = currentPath ? `${currentPath}.${key}` : key;
      if (!(key in origObj)) {
        diffs.push({ path: childPath, original: undefined, split: splitObj[key] });
      } else if (!(key in splitObj)) {
        diffs.push({ path: childPath, original: origObj[key], split: undefined });
      } else {
        diffs.push(...computeDiff(origObj[key], splitObj[key], childPath));
      }
    });
    return diffs;
  }

  if (original !== split) {
    diffs.push({ path: currentPath || "(root)", original, split });
  }
  return diffs;
}

// ---------------------------------------------------------------------------
// Live endpoint test
// ---------------------------------------------------------------------------

async function executeQuery(
  endpoint: string,
  headers: Record<string, string>,
  query: string,
  variables: Record<string, unknown>
): Promise<unknown> {
  const opName = extractOperationName(query);
  const body: Record<string, unknown> = { query, variables };
  if (opName) body.operationName = opName;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "unknown error")}`);
  }

  return res.json();
}

function extractOperationName(query: string): string | null {
  try {
    const ast = parse(query);
    for (const def of ast.definitions) {
      if (def.kind === Kind.OPERATION_DEFINITION && def.name) {
        return def.name.value;
      }
    }
  } catch { /* ignore */ }
  return null;
}

function extractIdsFromResponse(response: unknown): string[] {
  const ids: string[] = [];

  function walk(obj: unknown) {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      for (const item of obj) walk(item);
      return;
    }
    if (typeof obj === "object") {
      const rec = obj as Record<string, unknown>;
      if (typeof rec.id === "string") {
        ids.push(rec.id);
      }
      for (const val of Object.values(rec)) walk(val);
    }
  }

  walk(response);
  return ids;
}

export interface SingleQueryResult {
  response: unknown;
  durationMs: number;
  responseSize: number;
  error?: string;
}

export async function runQueryAgainstEndpoint(
  endpoint: string,
  headers: Record<string, string>,
  query: string,
  variables: Record<string, unknown>,
  onProgress?: (step: string) => void
): Promise<SingleQueryResult> {
  onProgress?.("Running query...");
  const start = Date.now();
  try {
    const response = await executeQuery(endpoint, headers, query, variables);
    const durationMs = Date.now() - start;
    const responseSize = JSON.stringify(response).length;
    onProgress?.("Done");
    return { response, durationMs, responseSize };
  } catch (err) {
    return {
      response: null,
      durationMs: Date.now() - start,
      responseSize: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function testSplitAgainstEndpoint(
  config: TestConfig
): Promise<LiveTestResult> {
  const { endpoint, headers, originalQuery, splitQueries, variables, onProgress } = config;

  try {
    // 1. Execute original query
    onProgress?.("Running original query...");
    const originalResponse = await executeQuery(endpoint, headers, originalQuery, variables);

    // 2. Classify split queries
    const classified = classifySplitQueries(originalQuery, splitQueries);

    // 3. Execute same-vars queries in parallel
    const splitResponses: LiveTestResult["splitResponses"] = [];
    let mergedData: unknown = {};

    if (classified.sameVars.length > 0) {
      onProgress?.(`Running ${classified.sameVars.length} split quer${classified.sameVars.length > 1 ? "ies" : "y"}...`);
      const results = await Promise.all(
        classified.sameVars.map((sq) =>
          executeQuery(endpoint, headers, sq.query, variables).then((res) => ({
            name: sq.name,
            response: res,
            variables: { ...variables },
          }))
        )
      );
      for (const r of results) {
        splitResponses.push(r);
        const data = (r.response as Record<string, unknown>)?.data;
        if (data) mergedData = deepMerge(mergedData, data);
      }
    }

    // 4. Execute depends-on-main queries (relationship split)
    if (classified.dependsOnMain.length > 0 && classified.mainQuery) {
      const mainResult = splitResponses.find((r) => r.name === classified.mainQuery!.name);
      const mainData = mainResult
        ? (mainResult.response as Record<string, unknown>)?.data
        : null;

      const ids = mainData ? extractIdsFromResponse(mainData) : [];

      for (let i = 0; i < classified.dependsOnMain.length; i++) {
        const sq = classified.dependsOnMain[i];
        onProgress?.(`Running relation query ${i + 1}/${classified.dependsOnMain.length} (${sq.name})...`);

        const relVars: Record<string, unknown> = {};
        relVars[sq.fieldName] = ids[i] ?? ids[0] ?? "";

        try {
          const res = await executeQuery(endpoint, headers, sq.query, relVars);
          splitResponses.push({ name: sq.name, response: res, variables: relVars });
          const data = (res as Record<string, unknown>)?.data;
          if (data) mergedData = deepMerge(mergedData, data);
        } catch (err) {
          splitResponses.push({
            name: sq.name,
            response: { error: err instanceof Error ? err.message : String(err) },
            variables: relVars,
          });
        }
      }
    }

    // 5. Diff
    onProgress?.("Comparing responses...");
    const originalData = (originalResponse as Record<string, unknown>)?.data;
    const differences = computeDiff(originalData, mergedData);

    return {
      originalResponse,
      splitResponses,
      mergedResponse: { data: mergedData },
      differences,
      isIdentical: differences.length === 0,
    };
  } catch (err) {
    return {
      originalResponse: null,
      splitResponses: [],
      mergedResponse: null,
      differences: [],
      isIdentical: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
