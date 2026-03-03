import {
  parse,
  visit,
  DocumentNode,
  OperationDefinitionNode,
  FieldNode,
  FragmentDefinitionNode,
  InlineFragmentNode,
  SelectionSetNode,
  Kind,
  print,
} from "graphql";
import type { QueryTreeNode } from "./query-graph";

type FragmentMap = Map<string, FragmentDefinitionNode>;

export type HygraphPlan = "hobby" | "growth" | "enterprise";
export type OperationType = "query" | "mutation";

export interface PlanLimits {
  query: number;
  mutation: number;
}

export const PLAN_LIMITS: Record<HygraphPlan, PlanLimits> = {
  hobby: { query: 10 * 1024, mutation: 30 * 1024 },
  growth: { query: 15 * 1024, mutation: 70 * 1024 },
  enterprise: { query: 20 * 1024, mutation: 80 * 1024 },
};

export interface ComplexityMetrics {
  depth: number;
  maxDepth: number;
  fieldCount: number;
  connectionCount: number;
  score: number;
}

export interface PayloadMetrics {
  querySize: number;
  variablesSize: number;
  totalSize: number;
  minifiedSize: number;
  planLimit: number;
  percentageUsed: number;
}

export interface VariableInfo {
  name: string;
  type: string;
  used: boolean;
  defined: boolean;
}

export interface DuplicateFieldOccurrence {
  fullPath: string;
  parentContext: string;
}

export interface DuplicateFieldInfo {
  fieldName: string;
  occurrences: DuplicateFieldOccurrence[];
  count: number;
}

export interface RootFieldInfo {
  name: string;
  arguments: string[];
  description: string;
}

export interface QuerySummary {
  brief: string;
  detailed: {
    operationType: string;
    operationName: string;
    rootFields: RootFieldInfo[];
    relationships: string[];
    scalarFields: string[];
    totalFieldCount: number;
  };
}

export interface FieldDetail {
  name: string;
  type: string;
  description?: string;
}

export interface RelationDetail {
  name: string;
  targetType: string;
  isArray: boolean;
  fields: FieldDetail[];
  nestedRelations: RelationDetail[];
  estimatedSize: number;
}

export interface DetailedQuerySummary {
  brief: string;
  operation: { type: string; name: string };
  locales: { codes: string[]; names: string[] };
  rootFields: {
    name: string;
    arguments: { name: string; value: string }[];
    scalarFields: FieldDetail[];
    relations: RelationDetail[];
    estimatedSize: number;
  }[];
  totals: {
    scalarFields: number;
    relations: number;
    maxDepth: number;
    depthPath: string;
    estimatedQuerySize: number;
    estimatedVariablesSize: number;
  };
  pagination?: { limit: number };
}

export interface LocaleInfo {
  source: "query" | "variables";
  path: string;
  locales: string[];
}

export const LOCALE_NAMES: Record<string, string> = {
  en: "English", de: "German", fr: "French", es: "Spanish",
  it: "Italian", pt: "Portuguese", nl: "Dutch", pl: "Polish",
  ja: "Japanese", ko: "Korean", zh: "Chinese", ru: "Russian",
  ar: "Arabic", hi: "Hindi", sv: "Swedish", da: "Danish",
  nb: "Norwegian", fi: "Finnish", tr: "Turkish", cs: "Czech",
  el: "Greek", hu: "Hungarian", ro: "Romanian", bg: "Bulgarian",
  uk: "Ukrainian", he: "Hebrew", th: "Thai", vi: "Vietnamese",
};

export interface QueryAnalysis {
  isValid: boolean;
  error?: string;
  operationType: OperationType;
  operationName?: string;
  complexity: ComplexityMetrics;
  payload: PayloadMetrics;
  variables: VariableInfo[];
  fieldPaths: string[];
  duplicateFields: string[];
  duplicateFieldsInfo: DuplicateFieldInfo[];
  ast?: DocumentNode;
}

export function analyzeQuery(
  query: string,
  variables: string,
  plan: HygraphPlan
): QueryAnalysis {
  const defaultResult: QueryAnalysis = {
    isValid: false,
    operationType: "query",
    complexity: {
      depth: 0,
      maxDepth: 10,
      fieldCount: 0,
      connectionCount: 0,
      score: 0,
    },
    payload: {
      querySize: 0,
      variablesSize: 0,
      totalSize: 0,
      minifiedSize: 0,
      planLimit: PLAN_LIMITS[plan].query,
      percentageUsed: 0,
    },
    variables: [],
    fieldPaths: [],
    duplicateFields: [],
    duplicateFieldsInfo: [],
  };

  if (!query.trim()) {
    return { ...defaultResult, error: "Query is empty" };
  }

  let ast: DocumentNode;
  try {
    ast = parse(query);
  } catch (e) {
    return {
      ...defaultResult,
      error: `Parse error: ${e instanceof Error ? e.message : "Invalid GraphQL"}`,
    };
  }

  let parsedVariables: Record<string, unknown> = {};
  if (variables.trim()) {
    try {
      parsedVariables = JSON.parse(variables);
    } catch (e) {
      return {
        ...defaultResult,
        isValid: true,
        ast,
        error: `Variables JSON error: ${e instanceof Error ? e.message : "Invalid JSON"}`,
      };
    }
  }

  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );

  if (!operation) {
    return { ...defaultResult, error: "No operation found in query" };
  }

  const operationType: OperationType =
    operation.operation === "mutation" ? "mutation" : "query";
  const operationName = operation.name?.value;

  const complexity = calculateComplexity(ast);
  const variableAnalysis = analyzeVariables(ast, parsedVariables);
  const { fieldPaths, duplicateFields, duplicateFieldsInfo } = analyzeFieldPaths(ast);

  const querySize = new TextEncoder().encode(query).length;
  const variablesSize = new TextEncoder().encode(variables).length;

  let parsedVars: unknown;
  try { parsedVars = variables.trim() ? JSON.parse(variables) : undefined; } catch { parsedVars = undefined; }

  const enc = new TextEncoder();
  const requestBody = JSON.stringify({
    query,
    variables: parsedVars,
    operationName: operationName || undefined,
  });
  const totalSize = enc.encode(requestBody).length;

  const minifiedQuery = minifyQuery(ast);
  const minifiedBody = JSON.stringify({
    query: minifiedQuery,
    variables: parsedVars,
    operationName: operationName || undefined,
  });
  const minifiedSize = enc.encode(minifiedBody).length;

  const planLimit = PLAN_LIMITS[plan][operationType];
  const percentageUsed = Math.round((totalSize / planLimit) * 100);

  return {
    isValid: true,
    operationType,
    operationName,
    complexity,
    payload: {
      querySize,
      variablesSize,
      totalSize,
      minifiedSize,
      planLimit,
      percentageUsed,
    },
    variables: variableAnalysis,
    fieldPaths,
    duplicateFields,
    duplicateFieldsInfo,
    ast,
  };
}

function buildFragmentMap(ast: DocumentNode): FragmentMap {
  const map: FragmentMap = new Map();
  for (const def of ast.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      map.set(def.name.value, def);
    }
  }
  return map;
}

function walkSelections(
  selectionSet: SelectionSetNode | undefined,
  depth: number,
  fragmentMap: FragmentMap,
  visited: Set<string>,
  callback: (field: FieldNode, depth: number) => void
): void {
  if (!selectionSet) return;
  for (const sel of selectionSet.selections) {
    if (sel.kind === Kind.FIELD) {
      callback(sel, depth);
      walkSelections(sel.selectionSet, depth + 1, fragmentMap, visited, callback);
    } else if (sel.kind === Kind.INLINE_FRAGMENT) {
      walkSelections(sel.selectionSet, depth, fragmentMap, visited, callback);
    } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
      const fragName = sel.name.value;
      if (visited.has(fragName)) continue;
      const fragDef = fragmentMap.get(fragName);
      if (!fragDef) continue;
      const nextVisited = new Set(visited);
      nextVisited.add(fragName);
      walkSelections(fragDef.selectionSet, depth, fragmentMap, nextVisited, callback);
    }
  }
}

function calculateComplexity(ast: DocumentNode): ComplexityMetrics {
  let maxDepth = 0;
  let fieldCount = 0;
  let connectionCount = 0;

  const connectionFieldNames = [
    "edges", "nodes", "connection", "aggregate", "pageInfo",
  ];
  const connectionArgNames = ["first", "last", "before", "after", "skip"];

  const fragmentMap = buildFragmentMap(ast);
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) {
    return { depth: 0, maxDepth: 10, fieldCount: 0, connectionCount: 0, score: 0 };
  }

  walkSelections(operation.selectionSet, 1, fragmentMap, new Set(), (node, depth) => {
    fieldCount++;
    if (depth > maxDepth) maxDepth = depth;

    const fieldName = node.name.value.toLowerCase();
    const hasConnectionArg = node.arguments?.some((arg) =>
      connectionArgNames.includes(arg.name.value)
    );
    const isConnectionField = connectionFieldNames.some((name) =>
      fieldName.includes(name)
    );
    if (hasConnectionArg || isConnectionField) {
      if (hasConnectionArg) connectionCount++;
    }
  });

  const depthScore = Math.min((maxDepth / 10) * 40, 40);
  const fieldScore = Math.min((fieldCount / 50) * 30, 30);
  const connectionScore = Math.min((connectionCount / 5) * 30, 30);
  const score = Math.round(depthScore + fieldScore + connectionScore);

  return {
    depth: maxDepth,
    maxDepth: 10,
    fieldCount,
    connectionCount,
    score: Math.min(score, 100),
  };
}

function analyzeVariables(
  ast: DocumentNode,
  providedVariables: Record<string, unknown>
): VariableInfo[] {
  const definedVariables: Map<string, string> = new Map();
  const usedVariables: Set<string> = new Set();

  visit(ast, {
    VariableDefinition(node) {
      const name = node.variable.name.value;
      const type = print(node.type);
      definedVariables.set(name, type);
    },
    Variable(node) {
      usedVariables.add(node.name.value);
    },
  });

  const result: VariableInfo[] = [];

  definedVariables.forEach((type, name) => {
    result.push({
      name,
      type,
      defined: true,
      used: usedVariables.has(name),
    });
  });

  Object.keys(providedVariables).forEach((name) => {
    if (!definedVariables.has(name)) {
      result.push({
        name,
        type: "unknown",
        defined: false,
        used: false,
      });
    }
  });

  return result;
}

function analyzeFieldPaths(ast: DocumentNode): {
  fieldPaths: string[];
  duplicateFields: string[];
  duplicateFieldsInfo: DuplicateFieldInfo[];
} {
  const fieldPaths: string[] = [];
  const pathCounts: Map<string, number> = new Map();
  const fieldOccurrences: Map<string, DuplicateFieldOccurrence[]> = new Map();
  const fragmentMap = buildFragmentMap(ast);

  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) return { fieldPaths: [], duplicateFields: [], duplicateFieldsInfo: [] };

  function walkForPaths(
    selectionSet: SelectionSetNode | undefined,
    pathStack: string[],
    visited: Set<string>
  ) {
    if (!selectionSet) return;
    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const fieldName = sel.name.value;
        pathStack.push(fieldName);
        const fullPath = pathStack.join(".");
        fieldPaths.push(fullPath);
        pathCounts.set(fullPath, (pathCounts.get(fullPath) || 0) + 1);

        const parentContext =
          pathStack.length > 1 ? pathStack[pathStack.length - 2] : "(root)";
        if (!fieldOccurrences.has(fieldName)) {
          fieldOccurrences.set(fieldName, []);
        }
        fieldOccurrences.get(fieldName)!.push({ fullPath, parentContext });

        walkForPaths(sel.selectionSet, pathStack, visited);
        pathStack.pop();
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        const typeName = (sel as InlineFragmentNode).typeCondition?.name.value;
        if (typeName) pathStack.push(`[${typeName}]`);
        walkForPaths(sel.selectionSet, pathStack, visited);
        if (typeName) pathStack.pop();
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragmentMap.get(fragName);
        if (!fragDef) continue;
        const nextVisited = new Set(visited);
        nextVisited.add(fragName);
        walkForPaths(fragDef.selectionSet, pathStack, nextVisited);
      }
    }
  }

  walkForPaths(operation.selectionSet, [], new Set());

  const duplicateFields: string[] = [];
  pathCounts.forEach((count, path) => {
    if (count > 1) duplicateFields.push(path);
  });

  const duplicateFieldsInfo: DuplicateFieldInfo[] = [];
  fieldOccurrences.forEach((occurrences, fieldName) => {
    if (occurrences.length > 1) {
      const uniquePaths = new Set(occurrences.map((o) => o.fullPath));
      if (uniquePaths.size > 1) {
        duplicateFieldsInfo.push({
          fieldName,
          occurrences: occurrences.filter(
            (occ, idx, arr) =>
              arr.findIndex((o) => o.fullPath === occ.fullPath) === idx
          ),
          count: uniquePaths.size,
        });
      }
    }
  });

  return { fieldPaths, duplicateFields, duplicateFieldsInfo };
}

export function minifyQuery(ast: DocumentNode): string {
  return print(ast)
    .replace(/\s+/g, " ")
    .replace(/\s*([{}():,])\s*/g, "$1")
    .replace(/\s*\.\.\.\s*/g, "...")
    .trim();
}

export function generateQuerySummary(ast: DocumentNode): QuerySummary {
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );

  if (!operation) {
    return {
      brief: "Invalid query - no operation found",
      detailed: {
        operationType: "unknown",
        operationName: "",
        rootFields: [],
        relationships: [],
        scalarFields: [],
        totalFieldCount: 0,
      },
    };
  }

  const operationType = operation.operation;
  const operationName = operation.name?.value || "";
  const rootFields: RootFieldInfo[] = [];
  const relationships: string[] = [];
  const scalarFields: string[] = [];
  let totalFieldCount = 0;
  const fragmentMap = buildFragmentMap(ast);

  function walkSummarySelections(
    selectionSet: SelectionSetNode | undefined,
    depth: number,
    parentPath: string,
    visited: Set<string>
  ) {
    if (!selectionSet) return;
    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const node = sel as FieldNode;
        const fieldName = node.name.value;
        if (fieldName === "__typename") continue;
        const hasSelections = node.selectionSet && node.selectionSet.selections.length > 0;
        totalFieldCount++;

        if (depth === 1) {
          const args: string[] = [];
          node.arguments?.forEach((arg) => {
            args.push(`${arg.name.value}: ${print(arg.value)}`);
          });
          const firstArg = node.arguments?.find((a) => a.name.value === "first");
          let description = "";
          if (firstArg) description = `Fetches up to ${print(firstArg.value)} ${fieldName}`;
          else if (hasSelections) description = `Fetches ${fieldName}`;
          else description = `Returns ${fieldName}`;
          rootFields.push({ name: fieldName, arguments: args, description });
        } else if (hasSelections) {
          const isLikelyRelation = /^[a-z]/.test(fieldName) &&
            !["html", "raw", "text", "markdown", "json"].includes(fieldName.toLowerCase());
          if (isLikelyRelation) {
            relationships.push(parentPath ? `${parentPath}.${fieldName}` : fieldName);
          }
        } else if (depth > 1) {
          scalarFields.push(fieldName);
        }

        const currentPath = parentPath ? `${parentPath}.${fieldName}` : fieldName;
        walkSummarySelections(node.selectionSet, depth + 1, currentPath, visited);
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        walkSummarySelections(sel.selectionSet, depth, parentPath, visited);
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragmentMap.get(fragName);
        if (!fragDef) continue;
        const next = new Set(visited);
        next.add(fragName);
        walkSummarySelections(fragDef.selectionSet, depth, parentPath, next);
      }
    }
  }

  walkSummarySelections(operation.selectionSet, 1, "", new Set());

  const uniqueScalarFields = Array.from(new Set(scalarFields));
  const uniqueRelationships = Array.from(new Set(relationships));

  let brief = "";
  const actionVerb = operationType === "mutation" ? "Executes" : "Fetches";

  if (rootFields.length === 1) {
    const root = rootFields[0];
    const firstArg = root.arguments.find((a) => a.startsWith("first:"));
    const countStr = firstArg ? firstArg.replace("first:", "").trim() + " " : "";
    const relationPart = uniqueRelationships.length > 0
      ? ` with ${uniqueRelationships.slice(0, 2).join(", ")}${uniqueRelationships.length > 2 ? ` and ${uniqueRelationships.length - 2} more relations` : ""}`
      : "";
    const fieldPart = uniqueScalarFields.length > 3
      ? ` (${uniqueScalarFields.length} fields)` : "";
    brief = `${actionVerb} ${countStr}${root.name}${relationPart}${fieldPart}`;
  } else if (rootFields.length > 1) {
    brief = `${actionVerb} ${rootFields.map((r) => r.name).join(", ")} (${totalFieldCount} total fields)`;
  } else {
    brief = `Empty ${operationType}`;
  }

  return {
    brief,
    detailed: {
      operationType, operationName, rootFields,
      relationships: uniqueRelationships,
      scalarFields: uniqueScalarFields,
      totalFieldCount,
    },
  };
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getPayloadStatus(
  percentageUsed: number
): "safe" | "warning" | "danger" | "critical" {
  if (percentageUsed >= 100) return "critical";
  if (percentageUsed >= 80) return "danger";
  if (percentageUsed >= 50) return "warning";
  return "safe";
}

export function detectLocales(
  ast: DocumentNode,
  variables: Record<string, unknown>
): LocaleInfo[] {
  const results: LocaleInfo[] = [];
  const knownLocales = Object.keys(LOCALE_NAMES);

  visit(ast, {
    Argument(node, _key, _parent, _path, ancestors) {
      if (node.name.value === "locales" || node.name.value === "locale") {
        const locales: string[] = [];
        if (node.value.kind === Kind.LIST) {
          for (const item of node.value.values) {
            if (item.kind === Kind.ENUM) locales.push(item.value);
            else if (item.kind === Kind.STRING) locales.push(item.value);
          }
        } else if (node.value.kind === Kind.ENUM) {
          locales.push(node.value.value);
        }

        if (locales.length > 0) {
          const parentField = ancestors
            .filter((a): a is FieldNode => (a as FieldNode)?.kind === Kind.FIELD)
            .map((f: FieldNode) => f.name.value);
          results.push({
            source: "query",
            path: parentField.join(".") || "(root)",
            locales,
          });
        }
      }
    },
  });

  for (const [key, value] of Object.entries(variables)) {
    if (key.toLowerCase().includes("locale")) {
      if (Array.isArray(value)) {
        const locales = value.filter(
          (v): v is string => typeof v === "string" && knownLocales.includes(v)
        );
        if (locales.length > 0) {
          results.push({ source: "variables", path: `$${key}`, locales });
        }
      } else if (typeof value === "string" && knownLocales.includes(value)) {
        results.push({ source: "variables", path: `$${key}`, locales: [value] });
      }
    }
  }

  return results;
}

const RICH_TEXT_FIELDS = ["html", "raw", "text", "markdown", "json"];

function inferFieldType(name: string): string {
  const lower = name.toLowerCase();
  if (lower === "id") return "ID";
  if (lower.includes("at") && (lower.includes("created") || lower.includes("updated") || lower.includes("published")))
    return "DateTime";
  if (lower === "url" || lower === "src" || lower === "href") return "String (URL)";
  if (RICH_TEXT_FIELDS.includes(lower)) return "String (Rich Text)";
  if (lower === "count" || lower === "size" || lower === "width" || lower === "height")
    return "Int";
  if (lower.includes("is") || lower.includes("has")) return "Boolean";
  return "String";
}

export function generateDetailedSummary(
  ast: DocumentNode,
  localeInfos: LocaleInfo[],
  querySize: number,
  variablesSize: number
): DetailedQuerySummary {
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );

  const allLocales = Array.from(new Set(localeInfos.flatMap((l) => l.locales)));
  const localeNames = allLocales.map((code) => LOCALE_NAMES[code] || code);
  const fragmentMap = buildFragmentMap(ast);

  if (!operation) {
    return {
      brief: "Invalid query",
      operation: { type: "unknown", name: "" },
      locales: { codes: allLocales, names: localeNames },
      rootFields: [],
      totals: {
        scalarFields: 0, relations: 0, maxDepth: 0, depthPath: "",
        estimatedQuerySize: querySize, estimatedVariablesSize: variablesSize,
      },
    };
  }

  const opType = operation.operation;
  const opName = operation.name?.value || "";
  let totalScalars = 0;
  let totalRelations = 0;
  let maxDepth = 0;
  let deepestPath = "";

  function collectFieldsFromSelections(
    selectionSet: SelectionSetNode | undefined,
    depth: number,
    pathParts: string[],
    visited: Set<string>
  ): { scalars: FieldDetail[]; relations: RelationDetail[]; size: number } {
    const scalars: FieldDetail[] = [];
    const relations: RelationDetail[] = [];
    let size = 0;

    if (!selectionSet) return { scalars, relations, size };

    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const field = sel as FieldNode;
        const fieldName = field.alias?.value || field.name.value;
        if (fieldName === "__typename") continue;

        if (field.selectionSet && field.selectionSet.selections.length > 0) {
          totalRelations++;
          const childPath = [...pathParts, fieldName];
          if (depth > maxDepth) { maxDepth = depth; deepestPath = childPath.join(" → "); }

          const childResult = collectFieldsFromSelections(
            field.selectionSet, depth + 1, childPath, visited
          );

          const nameLower = fieldName.toLowerCase();
          const isArray = fieldName.endsWith("s") &&
            !["address", "status", "class"].includes(nameLower);
          const relSize = fieldName.length + 10 + childResult.size;

          relations.push({
            name: fieldName,
            targetType: capitalize(fieldName),
            isArray,
            fields: childResult.scalars,
            nestedRelations: childResult.relations,
            estimatedSize: relSize,
          });
          size += relSize;
        } else {
          totalScalars++;
          scalars.push({
            name: fieldName,
            type: inferFieldType(fieldName),
            description: RICH_TEXT_FIELDS.includes(fieldName.toLowerCase())
              ? "Rich text output" : undefined,
          });
          size += fieldName.length + 6;
          if (depth > maxDepth) {
            maxDepth = depth;
            deepestPath = [...pathParts, fieldName].join(" → ");
          }
        }
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        const inlineFrag = sel as InlineFragmentNode;
        const typeName = inlineFrag.typeCondition?.name.value || "Unknown";
        const childPath = [...pathParts, `[${typeName}]`];

        const childResult = collectFieldsFromSelections(
          inlineFrag.selectionSet, depth, childPath, visited
        );

        if (childResult.scalars.length > 0 || childResult.relations.length > 0) {
          totalRelations++;
          const relSize = typeName.length + 15 + childResult.size;
          relations.push({
            name: `... on ${typeName}`,
            targetType: typeName,
            isArray: false,
            fields: childResult.scalars,
            nestedRelations: childResult.relations,
            estimatedSize: relSize,
          });
          size += relSize;
        }
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragmentMap.get(fragName);
        if (!fragDef) continue;
        const nextVisited = new Set(visited);
        nextVisited.add(fragName);

        const resolved = collectFieldsFromSelections(
          fragDef.selectionSet, depth, pathParts, nextVisited
        );
        for (const s of resolved.scalars) {
          if (!scalars.find((ex) => ex.name === s.name)) scalars.push(s);
        }
        for (const r of resolved.relations) {
          if (!relations.find((ex) => ex.name === r.name)) relations.push(r);
        }
        size += resolved.size;
      }
    }

    return { scalars, relations, size };
  }

  const rootFields: DetailedQuerySummary["rootFields"] = [];

  for (const sel of operation.selectionSet.selections) {
    if (sel.kind === Kind.FIELD) {
      const rootNode = sel as FieldNode;
      const rootName = rootNode.alias?.value || rootNode.name.value;
      totalRelations++;

      const args: { name: string; value: string }[] = [];
      rootNode.arguments?.forEach((arg) => {
        args.push({ name: arg.name.value, value: print(arg.value) });
      });

      const result = collectFieldsFromSelections(
        rootNode.selectionSet, 1, [rootName], new Set()
      );

      rootFields.push({
        name: rootName,
        arguments: args,
        scalarFields: result.scalars,
        relations: result.relations,
        estimatedSize: rootName.length + 10 + result.size,
      });
    }
  }

  const actionVerb = opType === "mutation" ? "Executes" : "Fetches";
  let brief = "";
  const localeStr = allLocales.length > 0 ? ` (${allLocales.join(", ")})` : "";

  if (rootFields.length === 1) {
    const root = rootFields[0];
    const firstArg = root.arguments.find((a) => a.name === "first");
    const countStr = firstArg ? `${firstArg.value} ` : "";
    const relNames = root.relations.map((r) => r.name);
    const relPart =
      relNames.length > 0
        ? ` with ${relNames.slice(0, 3).join(", ")}${relNames.length > 3 ? ` +${relNames.length - 3} more` : ""}`
        : "";
    brief = `${actionVerb} ${countStr}${root.name}${localeStr}${relPart}`;
  } else if (rootFields.length > 1) {
    brief = `${actionVerb} ${rootFields.map((r) => r.name).join(", ")}${localeStr}`;
  } else {
    brief = `Empty ${opType}`;
  }

  let pagination: DetailedQuerySummary["pagination"];
  for (const rf of rootFields) {
    const firstArg = rf.arguments.find((a) => a.name === "first");
    if (firstArg) {
      const limit = parseInt(firstArg.value, 10);
      if (!isNaN(limit)) pagination = { limit };
      break;
    }
  }

  return {
    brief,
    operation: { type: opType, name: opName },
    locales: { codes: allLocales, names: localeNames },
    rootFields,
    totals: {
      scalarFields: totalScalars,
      relations: totalRelations,
      maxDepth,
      depthPath: deepestPath,
      estimatedQuerySize: querySize,
      estimatedVariablesSize: variablesSize,
    },
    pagination,
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).replace(/s$/, "");
}

// --- Query Digest helpers ---

export interface FragmentUsageEntry {
  name: string;
  onType: string;
  fieldCount: number;
  usedIn: string[];
}

export interface QueryDigestData {
  naturalSummary: string;
  typeNames: string[];
  fragments: FragmentUsageEntry[];
  variableUsageMap: { variable: string; type: string; usedBy: string[] }[];
}

export function buildQueryDigest(
  ast: DocumentNode,
  tree: QueryTreeNode[],
  analysis: QueryAnalysis
): QueryDigestData {
  return {
    naturalSummary: generateNaturalSummary(ast, tree, analysis),
    typeNames: collectAllTypeNames(tree),
    fragments: collectFragmentUsage(ast),
    variableUsageMap: buildVariableUsageMap(ast),
  };
}

function generateNaturalSummary(
  ast: DocumentNode,
  tree: QueryTreeNode[],
  analysis: QueryAnalysis
): string {
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) return "No operation found.";

  const opType = operation.operation;
  const opName = operation.name?.value;
  const verb = opType === "mutation" ? "mutates" : "fetches";
  const parts: string[] = [];

  const rootNames = tree.map((r) => r.displayName);
  const rootDescriptions: string[] = [];
  for (const root of tree) {
    const argParts: string[] = [];
    const whereArg = root.arguments.find((a) => a.name === "where");
    const firstArg = root.arguments.find((a) => a.name === "first" || a.name === "last");
    const localeArg = root.arguments.find((a) => a.name === "locales" || a.name === "locale");
    const stageArg = root.arguments.find((a) => a.name === "stage");

    if (firstArg) argParts.push(`limited to ${firstArg.value} results`);
    if (whereArg) argParts.push(`filtered by a ${whereArg.name} clause`);
    if (stageArg) argParts.push(`on stage ${stageArg.value}`);
    if (localeArg) argParts.push(`in locale(s) ${localeArg.value}`);

    const desc = argParts.length > 0
      ? `\`${root.displayName}\` (${argParts.join(", ")})`
      : `\`${root.displayName}\``;
    rootDescriptions.push(desc);
  }

  const nameLabel = opName ? `**${opName}**` : "This";
  if (rootDescriptions.length === 1) {
    parts.push(`${nameLabel} is a ${opType} that ${verb} ${rootDescriptions[0]}.`);
  } else {
    parts.push(`${nameLabel} is a ${opType} that ${verb} ${rootDescriptions.length} root fields: ${rootDescriptions.join(", ")}.`);
  }

  let totalInlineFragments = 0;
  const inlineTypeNames: string[] = [];
  let maxInlineParent = "";
  let maxInlineCount = 0;
  function countInline(node: QueryTreeNode, parent: string) {
    const inlineChildren = node.children.filter((c) => c.nodeKind === "inlineFragment");
    if (inlineChildren.length > maxInlineCount) {
      maxInlineCount = inlineChildren.length;
      maxInlineParent = parent || node.displayName;
    }
    for (const child of node.children) {
      if (child.nodeKind === "inlineFragment") {
        totalInlineFragments++;
        if (child.typeName) inlineTypeNames.push(child.typeName);
      }
      countInline(child, node.displayName);
    }
  }
  for (const root of tree) countInline(root, "");

  if (totalInlineFragments > 0) {
    const shown = inlineTypeNames.slice(0, 4).join(", ");
    const more = inlineTypeNames.length > 4 ? ` and ${inlineTypeNames.length - 4} more` : "";
    parts.push(`It resolves ${totalInlineFragments} union/interface types (${shown}${more}) via inline fragments on \`${maxInlineParent}\`.`);
  }

  let totalRelations = 0;
  const relationNames: string[] = [];
  function countRels(node: QueryTreeNode) {
    for (const child of node.children) {
      if (child.nodeKind === "field" && child.children.length > 0) {
        totalRelations++;
        if (!relationNames.includes(child.displayName)) relationNames.push(child.displayName);
      }
      countRels(child);
    }
  }
  for (const root of tree) countRels(root);

  if (totalRelations > 0) {
    const shown = relationNames.slice(0, 5).join(", ");
    const more = relationNames.length > 5 ? `, +${relationNames.length - 5} more` : "";
    parts.push(`It traverses ${totalRelations} nested relations (${shown}${more}).`);
  }

  const depth = analysis.complexity.depth;
  if (depth > 3) {
    let deepestPath = "";
    let maxD = 0;
    const findDeepest = (node: QueryTreeNode, pathParts: string[]) => {
      const cur = [...pathParts, node.displayName];
      if (cur.length > maxD) { maxD = cur.length; deepestPath = cur.join(" > "); }
      for (const child of node.children) findDeepest(child, cur);
    };
    for (const root of tree) findDeepest(root, []);
    parts.push(`The deepest nesting reaches ${depth} levels through \`${deepestPath}\`.`);
  }

  const fragments = ast.definitions.filter(
    (d) => d.kind === Kind.FRAGMENT_DEFINITION
  );
  if (fragments.length > 0) {
    parts.push(`The query uses ${fragments.length} named fragment${fragments.length > 1 ? "s" : ""} to structure reusable field selections.`);
  }

  return parts.join(" ");
}

function collectAllTypeNames(tree: QueryTreeNode[]): string[] {
  const types = new Set<string>();
  function walk(node: QueryTreeNode) {
    if (node.nodeKind === "inlineFragment" && node.typeName) {
      types.add(node.typeName);
    }
    for (const child of node.children) walk(child);
  }
  for (const root of tree) walk(root);
  return Array.from(types).sort();
}

function collectFragmentUsage(ast: DocumentNode): FragmentUsageEntry[] {
  const fragmentDefs = new Map<string, FragmentDefinitionNode>();
  for (const def of ast.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragmentDefs.set(def.name.value, def);
    }
  }

  const usageMap = new Map<string, Set<string>>();
  function walkForSpreads(
    selectionSet: SelectionSetNode | undefined,
    context: string
  ) {
    if (!selectionSet) return;
    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const name = sel.name.value;
        if (!usageMap.has(name)) usageMap.set(name, new Set());
        usageMap.get(name)!.add(context);
      }
      if (sel.kind === Kind.FIELD) {
        const fieldName = sel.name.value;
        walkForSpreads(sel.selectionSet, fieldName);
      }
      if (sel.kind === Kind.INLINE_FRAGMENT) {
        const typeName = (sel as InlineFragmentNode).typeCondition?.name.value || context;
        walkForSpreads(sel.selectionSet, typeName);
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) {
      walkForSpreads(def.selectionSet, def.name?.value || "(operation)");
    }
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      walkForSpreads(def.selectionSet, def.name.value);
    }
  }

  const result: FragmentUsageEntry[] = [];
  fragmentDefs.forEach((fragDef, name) => {
    let fieldCount = 0;
    function countFields(ss: SelectionSetNode | undefined) {
      if (!ss) return;
      for (const sel of ss.selections) {
        if (sel.kind === Kind.FIELD) {
          fieldCount++;
          countFields(sel.selectionSet);
        } else if (sel.kind === Kind.INLINE_FRAGMENT) {
          countFields(sel.selectionSet);
        } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
          fieldCount++;
        }
      }
    }
    countFields(fragDef.selectionSet);

    result.push({
      name,
      onType: fragDef.typeCondition.name.value,
      fieldCount,
      usedIn: Array.from(usageMap.get(name) || []),
    });
  });

  return result.sort((a, b) => b.fieldCount - a.fieldCount);
}

function buildVariableUsageMap(
  ast: DocumentNode
): { variable: string; type: string; usedBy: string[] }[] {
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) return [];

  const varTypes = new Map<string, string>();
  if (operation.variableDefinitions) {
    for (const v of operation.variableDefinitions) {
      varTypes.set(v.variable.name.value, print(v.type));
    }
  }

  const varUsage = new Map<string, Set<string>>();
  function walkForVars(
    selectionSet: SelectionSetNode | undefined,
    context: string
  ) {
    if (!selectionSet) return;
    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const fieldName = sel.name.value;
        if (sel.arguments) {
          for (const arg of sel.arguments) {
            const argStr = print(arg.value);
            const matches = argStr.match(/\$([a-zA-Z_]\w*)/g);
            if (matches) {
              for (const m of matches) {
                const varName = m.slice(1);
                if (!varUsage.has(varName)) varUsage.set(varName, new Set());
                varUsage.get(varName)!.add(context ? `${context}.${fieldName}` : fieldName);
              }
            }
          }
        }
        walkForVars(sel.selectionSet, context ? `${context}.${fieldName}` : fieldName);
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        walkForVars(sel.selectionSet, context);
      }
    }
  }

  walkForVars(operation.selectionSet, "");

  const fragmentMap = buildFragmentMap(ast);
  fragmentMap.forEach((fragDef, fragName) => {
    walkForVars(fragDef.selectionSet, `(fragment ${fragName})`);
  });

  const result: { variable: string; type: string; usedBy: string[] }[] = [];
  varTypes.forEach((type, name) => {
    result.push({
      variable: name,
      type,
      usedBy: Array.from(varUsage.get(name) || []),
    });
  });

  return result;
}

// ---------------------------------------------------------------------------
// System Fields Detection
// ---------------------------------------------------------------------------

export type SystemFieldCategory = "introspection" | "metadata" | "cache";

export interface SystemFieldOccurrence {
  fieldName: string;
  fullPath: string;
  category: SystemFieldCategory;
  bytesCost: number;
  safeToRemove: boolean;
}

export interface SystemFieldsAnalysis {
  occurrences: SystemFieldOccurrence[];
  totalBytes: number;
  safeBytes: number;
  categories: { introspection: number; metadata: number; cache: number };
}

const METADATA_FIELDS = new Set([
  "stage",
  "createdAt",
  "updatedAt",
  "publishedAt",
  "documentInStages",
  "localizations",
]);

function classifySystemField(name: string): SystemFieldCategory | null {
  if (name === "__typename") return "introspection";
  if (name.startsWith("__")) return "cache";
  if (METADATA_FIELDS.has(name)) return "metadata";
  return null;
}

export function detectSystemFields(ast: DocumentNode): SystemFieldsAnalysis {
  const occurrences: SystemFieldOccurrence[] = [];
  const fragmentMap = buildFragmentMap(ast);

  function walkSS(
    ss: SelectionSetNode | undefined,
    path: string,
    parentHasInlineFragments: boolean,
    visited: Set<string>
  ) {
    if (!ss) return;

    const hasInlineFrags = ss.selections.some(
      (s) => s.kind === Kind.INLINE_FRAGMENT
    );

    for (const sel of ss.selections) {
      if (sel.kind === Kind.FIELD) {
        const name = sel.name.value;
        const category = classifySystemField(name);
        if (category) {
          const fullPath = path ? `${path} > ${name}` : name;
          const bytesCost = name.length + 3;
          const safeToRemove =
            category !== "introspection" || !parentHasInlineFragments;
          occurrences.push({ fieldName: name, fullPath, category, bytesCost, safeToRemove });
        }
        if (sel.selectionSet) {
          const nextPath = path ? `${path} > ${name}` : name;
          walkSS(sel.selectionSet, nextPath, false, visited);
        }
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        const typeName = (sel as InlineFragmentNode).typeCondition?.name.value;
        const label = typeName ? `... on ${typeName}` : "...";
        const nextPath = path ? `${path} > ${label}` : label;
        walkSS(sel.selectionSet, nextPath, true, visited);
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragmentMap.get(fragName);
        if (!fragDef) continue;
        const next = new Set(visited);
        next.add(fragName);
        walkSS(fragDef.selectionSet, path, hasInlineFrags, next);
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) {
      walkSS(def.selectionSet, "", false, new Set());
    }
  }

  let totalBytes = 0;
  let safeBytes = 0;
  const cats = { introspection: 0, metadata: 0, cache: 0 };
  for (const occ of occurrences) {
    totalBytes += occ.bytesCost;
    if (occ.safeToRemove) safeBytes += occ.bytesCost;
    cats[occ.category]++;
  }

  return { occurrences, totalBytes, safeBytes, categories: cats };
}

// ---------------------------------------------------------------------------
// RichText Over-Fetching Detection
// ---------------------------------------------------------------------------

export interface RichTextOverfetch {
  parentPath: string;
  selectedFormats: string[];
  recommendedFormat: string;
  savingsBytes: number;
}

const RT_FORMATS = new Set(["html", "raw", "text", "markdown", "json"]);

export function detectRichTextOverfetch(
  ast: DocumentNode
): RichTextOverfetch[] {
  const results: RichTextOverfetch[] = [];
  const fragmentMap = buildFragmentMap(ast);

  function walkSS(
    ss: SelectionSetNode | undefined,
    path: string,
    visited: Set<string>
  ) {
    if (!ss) return;

    for (const sel of ss.selections) {
      if (sel.kind === Kind.FIELD) {
        const name = sel.name.value;
        const nextPath = path ? `${path} > ${name}` : name;

        if (sel.selectionSet) {
          const scalarNames: string[] = [];
          for (const inner of sel.selectionSet.selections) {
            if (inner.kind === Kind.FIELD && !inner.selectionSet) {
              scalarNames.push(inner.name.value);
            }
            if (inner.kind === Kind.FRAGMENT_SPREAD) {
              const frag = fragmentMap.get(inner.name.value);
              if (frag) {
                for (const fs of frag.selectionSet.selections) {
                  if (fs.kind === Kind.FIELD && !fs.selectionSet) {
                    scalarNames.push(fs.name.value);
                  }
                }
              }
            }
          }

          const rtFormats = scalarNames.filter((n) => RT_FORMATS.has(n));
          if (rtFormats.length >= 2) {
            const recommended = rtFormats.includes("raw")
              ? "raw"
              : rtFormats[0];
            const extraCount = rtFormats.length - 1;
            const avgFormatBytes = 8;
            results.push({
              parentPath: nextPath,
              selectedFormats: rtFormats,
              recommendedFormat: recommended,
              savingsBytes: extraCount * avgFormatBytes,
            });
          }

          walkSS(sel.selectionSet, nextPath, visited);
        }
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        const typeName = (sel as InlineFragmentNode).typeCondition?.name.value;
        const label = typeName ? `... on ${typeName}` : "...";
        const nextPath = path ? `${path} > ${label}` : label;
        walkSS(sel.selectionSet, nextPath, visited);
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragmentMap.get(fragName);
        if (!fragDef) continue;
        const next = new Set(visited);
        next.add(fragName);
        walkSS(fragDef.selectionSet, path, next);
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) {
      walkSS(def.selectionSet, "", new Set());
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// AST Rewrite: Remove fields by name
// ---------------------------------------------------------------------------

export function removeFieldsByName(
  query: string,
  fieldNames: Set<string>
): string {
  const ast = parse(query);

  const edited = visit(ast, {
    Field: {
      enter(node) {
        if (fieldNames.has(node.name.value)) {
          return null;
        }
        return undefined;
      },
    },
  });

  return print(edited);
}

// ---------------------------------------------------------------------------
// Fragment Extraction
// ---------------------------------------------------------------------------

export interface FragmentSuggestion {
  id: string;
  suggestedName: string;
  fields: string[];
  occurrences: { parentPath: string; parentType?: string }[];
  estimatedSavings: number;
}

export function detectExtractableFragments(
  ast: DocumentNode
): FragmentSuggestion[] {
  const fragmentMap = buildFragmentMap(ast);

  interface SelectionSetFingerprint {
    fields: string[];
    fingerprint: string;
    parentPath: string;
    parentType?: string;
    charLength: number;
  }

  const fingerprints: SelectionSetFingerprint[] = [];

  function walkForFingerprints(
    selectionSet: SelectionSetNode | undefined,
    pathStack: string[],
    parentType: string | undefined,
    visited: Set<string>
  ) {
    if (!selectionSet) return;

    const directFields: string[] = [];
    let charLen = 0;

    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        directFields.push(sel.name.value);
        charLen += sel.name.value.length + 2;
      }
    }

    if (directFields.length >= 3) {
      const sorted = Array.from(directFields).sort();
      fingerprints.push({
        fields: sorted,
        fingerprint: sorted.join(","),
        parentPath: pathStack.join(".") || "(root)",
        parentType: parentType,
        charLength: charLen,
      });
    }

    for (const sel of selectionSet.selections) {
      if (sel.kind === Kind.FIELD) {
        const fieldName = sel.name.value;
        if (sel.selectionSet) {
          walkForFingerprints(
            sel.selectionSet,
            [...pathStack, fieldName],
            fieldName,
            visited
          );
        }
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        const typeName = (sel as InlineFragmentNode).typeCondition?.name.value;
        walkForFingerprints(
          sel.selectionSet,
          pathStack,
          typeName || parentType,
          visited
        );
      } else if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const fragName = sel.name.value;
        if (visited.has(fragName)) continue;
        const fragDef = fragmentMap.get(fragName);
        if (!fragDef) continue;
        const next = new Set(visited);
        next.add(fragName);
        walkForFingerprints(
          fragDef.selectionSet,
          pathStack,
          fragDef.typeCondition.name.value,
          next
        );
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION) {
      walkForFingerprints(def.selectionSet, [], undefined, new Set());
    }
  }

  const groups = new Map<
    string,
    { fields: string[]; charLength: number; occurrences: SelectionSetFingerprint[] }
  >();
  for (const fp of fingerprints) {
    const existing = groups.get(fp.fingerprint);
    if (existing) {
      existing.occurrences.push(fp);
    } else {
      groups.set(fp.fingerprint, {
        fields: fp.fields,
        charLength: fp.charLength,
        occurrences: [fp],
      });
    }
  }

  const results: FragmentSuggestion[] = [];
  let idx = 0;

  groups.forEach((group) => {
    if (group.occurrences.length < 2) return;

    const firstOcc = group.occurrences[0];
    const typeName = firstOcc.parentType || "Shared";
    const baseName = typeName.charAt(0).toUpperCase() + typeName.slice(1);
    const suggestedName = `${baseName}Fields`;

    const fragmentDefOverhead = `fragment ${suggestedName} on ${typeName} { ${group.fields.join(" ")} }`.length;
    const spreadSize = `...${suggestedName}`.length;
    const savings =
      group.occurrences.length * group.charLength -
      (spreadSize * group.occurrences.length + fragmentDefOverhead);

    if (savings <= 0) return;

    results.push({
      id: `frag-${idx++}`,
      suggestedName,
      fields: group.fields,
      occurrences: group.occurrences.map((o) => ({
        parentPath: o.parentPath,
        parentType: o.parentType,
      })),
      estimatedSavings: savings,
    });
  });

  return results.sort((a, b) => b.estimatedSavings - a.estimatedSavings);
}

export function applyFragmentExtraction(
  query: string,
  suggestions: FragmentSuggestion[]
): string {
  if (suggestions.length === 0) return query;

  const ast = parse(query);
  const targetSets = new Map<string, string>();
  for (const s of suggestions) {
    const key = Array.from(s.fields).sort().join(",");
    targetSets.set(key, s.suggestedName);
  }

  const edited = visit(ast, {
    SelectionSet: {
      enter(node) {
        const directFields: string[] = [];
        for (const sel of node.selections) {
          if (sel.kind === Kind.FIELD) {
            directFields.push(sel.name.value);
          }
        }
        if (directFields.length < 3) return undefined;

        const key = Array.from(directFields).sort().join(",");
        const fragName = targetSets.get(key);
        if (!fragName) return undefined;

        const nonFieldSelections = node.selections.filter(
          (s) => s.kind !== Kind.FIELD || s.selectionSet
        );

        return {
          ...node,
          selections: [
            ...nonFieldSelections,
            {
              kind: Kind.FRAGMENT_SPREAD,
              name: { kind: Kind.NAME, value: fragName },
              directives: [],
            },
          ],
        };
      },
    },
  });

  let result = print(edited);

  for (const s of suggestions) {
    const typeName =
      s.occurrences.find((o) => o.parentType)?.parentType || "Unknown";
    const capitalType =
      typeName.charAt(0).toUpperCase() + typeName.slice(1);
    result += `\n\nfragment ${s.suggestedName} on ${capitalType} {\n  ${s.fields.join("\n  ")}\n}`;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Pagination Guard
// ---------------------------------------------------------------------------

export interface PaginationIssue {
  fieldName: string;
  fullPath: string;
  depth: number;
  confidence: "high" | "medium";
  suggestedLimit: number;
}

export function detectUnboundedConnections(
  tree: QueryTreeNode[]
): PaginationIssue[] {
  const issues: PaginationIssue[] = [];
  const paginationArgs = new Set(["first", "last", "before", "after"]);
  const connectionChildren = new Set(["edges", "nodes", "pageInfo", "aggregate"]);

  function walk(node: QueryTreeNode, pathParts: string[], depth: number) {
    if (node.nodeKind === "inlineFragment") {
      for (const child of node.children) {
        walk(child, pathParts, depth);
      }
      return;
    }

    const currentPath = [...pathParts, node.displayName];

    if (node.children.length > 0) {
      const hasPagination = node.arguments.some((a) => paginationArgs.has(a.name));

      if (!hasPagination) {
        const hasConnectionChild = node.children.some((c) =>
          connectionChildren.has(c.displayName.toLowerCase())
        );
        const hasConnectionArg = node.arguments.some(
          (a) => a.name === "where" || a.name === "orderBy"
        );
        const confidence: "high" | "medium" =
          hasConnectionChild || hasConnectionArg ? "high" : "medium";

        issues.push({
          fieldName: node.displayName,
          fullPath: currentPath.join(" > "),
          depth,
          confidence,
          suggestedLimit: depth <= 1 ? 100 : 50,
        });
      }
    }

    for (const child of node.children) {
      walk(child, currentPath, depth + 1);
    }
  }

  for (const root of tree) {
    walk(root, [], 1);
  }

  return issues.sort((a, b) => {
    if (a.confidence !== b.confidence) return a.confidence === "high" ? -1 : 1;
    return a.depth - b.depth;
  });
}

export function addPaginationToFields(
  query: string,
  fieldPaths: string[],
  limits: Map<string, number>
): string {
  const ast = parse(query);
  const pathSet = new Set(fieldPaths);

  function matchPath(fieldPath: string[]): number | null {
    const joined = fieldPath.join(" > ");
    if (!pathSet.has(joined)) return null;
    return limits.get(joined) ?? 100;
  }

  const pathStack: string[] = [];

  const edited = visit(ast, {
    Field: {
      enter(node) {
        pathStack.push(node.name.value);
        const limit = matchPath(pathStack);
        if (limit === null) return undefined;

        const alreadyHasFirst = node.arguments?.some(
          (a) => a.name.value === "first"
        );
        if (alreadyHasFirst) return undefined;

        return {
          ...node,
          arguments: [
            ...(node.arguments || []),
            {
              kind: Kind.ARGUMENT,
              name: { kind: Kind.NAME, value: "first" },
              value: { kind: Kind.INT, value: String(limit) },
            },
          ],
        };
      },
      leave() {
        pathStack.pop();
      },
    },
  });

  return print(edited);
}
