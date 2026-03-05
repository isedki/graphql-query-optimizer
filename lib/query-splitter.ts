import {
  DocumentNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
  SelectionSetNode,
  Kind,
  parse,
  print,
  visit,
} from "graphql";
import { QueryTreeNode } from "./query-graph";

export interface SplitQuery {
  name: string;
  query: string;
  size: number;
  fields: string[];
}

export interface SplitOption {
  id: string;
  name: string;
  description: string;
  queries: SplitQuery[];
  totalSize: number;
  originalSize: number;
  savingsPercentage: number;
}

export function generateSplitOptions(
  ast: DocumentNode,
  tree: QueryTreeNode[],
  originalSize: number
): SplitOption[] {
  const options: SplitOption[] = [];
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation || tree.length < 2) {
    const relSplit = generateRelationshipSplit(ast, tree, originalSize);
    if (relSplit) options.push(relSplit);
    const unionSplit = generateUnionTypeSplit(ast, tree, originalSize);
    if (unionSplit) options.push(unionSplit);
    return options;
  }

  const rootSplit = generateRootFieldSplit(ast, operation, tree, originalSize);
  if (rootSplit) options.push(rootSplit);

  const relSplit = generateRelationshipSplit(ast, tree, originalSize);
  if (relSplit) options.push(relSplit);

  const unionSplit = generateUnionTypeSplit(ast, tree, originalSize);
  if (unionSplit) options.push(unionSplit);

  return options;
}

function collectFragmentNames(node: QueryTreeNode): Set<string> {
  const names = new Set<string>();
  function walk(n: QueryTreeNode) {
    if (n.nodeKind === "fragmentSpread" && n.fragmentName) {
      names.add(n.fragmentName);
    }
    for (const child of n.children) walk(child);
  }
  walk(node);
  return names;
}

function resolveTransitiveFragments(
  names: Set<string>,
  ast: DocumentNode
): Set<string> {
  const fragDefs = new Map<string, FragmentDefinitionNode>();
  for (const def of ast.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragDefs.set(def.name.value, def);
    }
  }

  const resolved = new Set(names);
  const queue: string[] = [];
  names.forEach((n) => queue.push(n));
  while (queue.length > 0) {
    const name = queue.pop()!;
    const def = fragDefs.get(name);
    if (!def) continue;
    const text = print(def);
    const spreadRe = /\.\.\.([A-Z_a-z]\w*)/g;
    let match;
    while ((match = spreadRe.exec(text)) !== null) {
      if (!resolved.has(match[1]) && fragDefs.has(match[1])) {
        resolved.add(match[1]);
        queue.push(match[1]);
      }
    }
  }
  return resolved;
}

function appendFragmentDefs(
  query: string,
  fragNames: Set<string>,
  ast: DocumentNode
): string {
  if (fragNames.size === 0) return query;
  const allNames = resolveTransitiveFragments(fragNames, ast);
  let result = query;
  for (const def of ast.definitions) {
    if (
      def.kind === Kind.FRAGMENT_DEFINITION &&
      allNames.has(def.name.value)
    ) {
      result += "\n\n" + print(def);
    }
  }
  return stripUnusedFragments(result);
}

function stripUnusedFragments(query: string): string {
  let ast: DocumentNode;
  try {
    ast = parse(query);
  } catch {
    return query;
  }

  const fragDefs = new Map<string, FragmentDefinitionNode>();
  for (const def of ast.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      fragDefs.set(def.name.value, def);
    }
  }
  if (fragDefs.size === 0) return query;

  const used = new Set<string>();
  function walkSelections(sels: SelectionSetNode["selections"]) {
    for (const sel of sels) {
      if (sel.kind === Kind.FRAGMENT_SPREAD) {
        const name = sel.name.value;
        if (!used.has(name)) {
          used.add(name);
          const frag = fragDefs.get(name);
          if (frag?.selectionSet) walkSelections(frag.selectionSet.selections);
        }
      } else if (sel.kind === Kind.FIELD && sel.selectionSet) {
        walkSelections(sel.selectionSet.selections);
      } else if (sel.kind === Kind.INLINE_FRAGMENT && sel.selectionSet) {
        walkSelections(sel.selectionSet.selections);
      }
    }
  }

  for (const def of ast.definitions) {
    if (def.kind === Kind.OPERATION_DEFINITION && def.selectionSet) {
      walkSelections(def.selectionSet.selections);
    }
  }

  if (used.size === fragDefs.size) return query;

  const cleaned = visit(ast, {
    FragmentDefinition: {
      enter(node) {
        if (!used.has(node.name.value)) return null;
        return undefined;
      },
    },
  });

  return print(cleaned);
}

function generateRootFieldSplit(
  ast: DocumentNode,
  operation: OperationDefinitionNode,
  tree: QueryTreeNode[],
  originalSize: number
): SplitOption | null {
  if (tree.length < 2) return null;

  const opType = operation.operation;
  const queries: SplitQuery[] = [];

  for (const rootNode of tree) {
    const varDefs = operation.variableDefinitions
      ? operation.variableDefinitions
          .map((v) => `$${v.variable.name.value}: ${print(v.type)}`)
          .join(", ")
      : "";

    const argsStr =
      rootNode.arguments.length > 0
        ? `(${rootNode.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
        : "";

    const bodyLines = buildFieldBody(rootNode, 2);
    const fieldHeader = rootNode.alias ? `${rootNode.alias}: ${rootNode.name}` : rootNode.name;
    const opName = `get${capitalize(rootNode.name)}`;
    const varDefsStr = varDefs ? `(${varDefs})` : "";

    let queryStr = `${opType} ${opName}${varDefsStr} {\n  ${fieldHeader}${argsStr} {\n${bodyLines}\n  }\n}`;
    const fragNames = collectFragmentNames(rootNode);
    queryStr = appendFragmentDefs(queryStr, fragNames, ast);
    const size = new TextEncoder().encode(queryStr).length;

    queries.push({
      name: opName,
      query: queryStr,
      size,
      fields: [rootNode.displayName],
    });
  }

  const totalSize = queries.reduce((sum, q) => sum + q.size, 0);
  const overhead = totalSize - originalSize;
  const savingsPercentage = Math.round(
    ((originalSize - Math.max(...queries.map((q) => q.size))) / originalSize) * 100
  );

  return {
    id: "split-root-fields",
    name: "Split by Root Fields",
    description: `Splits into ${queries.length} separate queries, one per root field. Each query stays under the limit independently.`,
    queries,
    totalSize,
    originalSize,
    savingsPercentage: Math.max(0, savingsPercentage),
  };
}

function generateRelationshipSplit(
  ast: DocumentNode,
  tree: QueryTreeNode[],
  originalSize: number
): SplitOption | null {
  const deepRelations: { root: QueryTreeNode; child: QueryTreeNode }[] = [];
  for (const root of tree) {
    for (const child of root.children) {
      if (child.nodeKind === "inlineFragment" || child.nodeKind === "fragmentSpread") continue;
      if (child.children.length > 0 || child.scalarFields.length > 3) {
        deepRelations.push({ root, child });
      }
    }
  }

  if (deepRelations.length === 0) return null;

  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) return null;

  const opType = operation.operation;
  const varDefs = operation.variableDefinitions
    ? operation.variableDefinitions
        .map((v) => `$${v.variable.name.value}: ${print(v.type)}`)
        .join(", ")
    : "";
  const varDefsStr = varDefs ? `(${varDefs})` : "";

  const queries: SplitQuery[] = [];

  const mainLines: string[] = [];
  for (const root of tree) {
    const rootHeader = root.alias ? `${root.alias}: ${root.name}` : root.name;
    const argsStr =
      root.arguments.length > 0
        ? `(${root.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
        : "";
    const fieldLines: string[] = [];
    for (const scalar of root.scalarFields) {
      fieldLines.push(`      ${scalar}`);
    }
    for (const child of root.children) {
      const isExtracted = deepRelations.some(
        (dr) => dr.child.id === child.id
      );
      if (child.nodeKind === "fragmentSpread" && child.fragmentName) {
        if (!isExtracted) {
          fieldLines.push(`      ...${child.fragmentName}`);
        }
      } else if (child.nodeKind === "inlineFragment") {
        if (isExtracted) {
          fieldLines.push(`      ... on ${child.typeName || child.name} { __typename }`);
        } else {
          fieldLines.push(`      ... on ${child.typeName || child.name} {`);
          fieldLines.push(buildFieldBody(child, 4));
          fieldLines.push(`        __typename`);
          fieldLines.push(`      }`);
        }
      } else {
        const childHeader = child.alias ? `${child.alias}: ${child.name}` : child.name;
        if (isExtracted) {
          fieldLines.push(`      ${childHeader} { id }`);
        } else {
          const childArgs = child.arguments.length > 0
            ? `(${child.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
            : "";
          fieldLines.push(`      ${childHeader}${childArgs} {`);
          fieldLines.push(buildFieldBody(child, 4));
          fieldLines.push(`      }`);
        }
      }
    }
    mainLines.push(
      `    ${rootHeader}${argsStr} {\n${fieldLines.join("\n")}\n    }`
    );
  }
  let mainQuery = `${opType} mainQuery${varDefsStr} {\n${mainLines.join("\n")}\n}`;
  const mainFragNames = new Set<string>();
  for (const root of tree) {
    collectFragmentNames(root).forEach((name) => mainFragNames.add(name));
  }
  mainQuery = appendFragmentDefs(mainQuery, mainFragNames, ast);
  const mainSize = new TextEncoder().encode(mainQuery).length;
  queries.push({
    name: "mainQuery",
    query: mainQuery,
    size: mainSize,
    fields: tree.map((r) => r.name),
  });

  for (const { child } of deepRelations) {
    const bodyLines = buildFieldBody(child, 2);
    let relQuery = `${opType} get${capitalize(child.name)}($id: ID!) {\n  ${child.name}(where: { id: $id }) {\n${bodyLines}\n  }\n}`;
    const relFragNames = collectFragmentNames(child);
    relQuery = appendFragmentDefs(relQuery, relFragNames, ast);
    const relSize = new TextEncoder().encode(relQuery).length;
    queries.push({
      name: `get${capitalize(child.name)}`,
      query: relQuery,
      size: relSize,
      fields: [child.name],
    });
  }

  const maxSingle = Math.max(...queries.map((q) => q.size));
  const savingsPercentage = Math.round(
    ((originalSize - maxSingle) / originalSize) * 100
  );

  return {
    id: "split-relations",
    name: "Split by Relationships",
    description: `Extracts ${deepRelations.length} deep relation${deepRelations.length > 1 ? "s" : ""} (${deepRelations.map((r) => r.child.name).join(", ")}) into separate queries.`,
    queries,
    totalSize: queries.reduce((s, q) => s + q.size, 0),
    originalSize,
    savingsPercentage: Math.max(0, savingsPercentage),
  };
}

const UNION_BATCH_SIZE = 5;
const UNION_BATCH_SIZE_BYTES = 30_000;
const MIN_INLINE_FRAGMENTS_FOR_SPLIT = 4;

function generateUnionTypeSplit(
  ast: DocumentNode,
  tree: QueryTreeNode[],
  originalSize: number
): SplitOption | null {
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) return null;

  const candidates: { root: QueryTreeNode; inlineChildren: QueryTreeNode[] }[] = [];
  for (const root of tree) {
    const inlineChildren = root.children.filter(
      (c) => c.nodeKind === "inlineFragment"
    );
    if (inlineChildren.length >= MIN_INLINE_FRAGMENTS_FOR_SPLIT) {
      candidates.push({ root, inlineChildren });
    }
  }
  if (candidates.length === 0) return null;

  const opType = operation.operation;
  const opName = operation.name?.value || "Query";
  const varDefs = operation.variableDefinitions
    ? operation.variableDefinitions
        .map((v) => `$${v.variable.name.value}: ${print(v.type)}`)
        .join(", ")
    : "";
  const varDefsStr = varDefs ? `(${varDefs})` : "";

  const queries: SplitQuery[] = [];
  let batchIdx = 1;

  for (const { root, inlineChildren } of candidates) {
    const rootHeader = root.alias ? `${root.alias}: ${root.name}` : root.name;
    const argsStr =
      root.arguments.length > 0
        ? `(${root.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
        : "";

    const nonInlineChildren = root.children.filter(
      (c) => c.nodeKind !== "inlineFragment"
    );

    const batches: QueryTreeNode[][] = [];
    let currentBatch: QueryTreeNode[] = [];
    let currentBatchSize = 0;

    for (const child of inlineChildren) {
      if (
        currentBatch.length >= UNION_BATCH_SIZE ||
        (currentBatch.length > 0 && currentBatchSize + child.estimatedSize > UNION_BATCH_SIZE_BYTES)
      ) {
        batches.push(currentBatch);
        currentBatch = [];
        currentBatchSize = 0;
      }
      currentBatch.push(child);
      currentBatchSize += child.estimatedSize;
    }
    if (currentBatch.length > 0) batches.push(currentBatch);

    for (const batch of batches) {
      const fieldLines: string[] = [];

      for (const scalar of root.scalarFields) {
        fieldLines.push(`      ${scalar}`);
      }

      for (const child of nonInlineChildren) {
        if (child.nodeKind === "fragmentSpread" && child.fragmentName) {
          fieldLines.push(`      ...${child.fragmentName}`);
        } else {
          const childHeader = child.alias ? `${child.alias}: ${child.name}` : child.name;
          const childArgs =
            child.arguments.length > 0
              ? `(${child.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
              : "";
          fieldLines.push(`      ${childHeader}${childArgs} {`);
          fieldLines.push(buildFieldBody(child, 4));
          fieldLines.push(`      }`);
        }
      }

      for (const child of batch) {
        fieldLines.push(`      ... on ${child.typeName || child.name} {`);
        fieldLines.push(buildFieldBody(child, 4));
        fieldLines.push(`        __typename`);
        fieldLines.push(`      }`);
      }

      fieldLines.push(`      __typename`);

      const batchName = `${opName}_batch${batchIdx}`;
      let queryStr = `${opType} ${batchName}${varDefsStr} {\n    ${rootHeader}${argsStr} {\n${fieldLines.join("\n")}\n    }\n}`;

      const fragNames = new Set<string>();
      for (const child of batch) {
        collectFragmentNames(child).forEach((n) => fragNames.add(n));
      }
      for (const child of nonInlineChildren) {
        collectFragmentNames(child).forEach((n) => fragNames.add(n));
      }
      queryStr = appendFragmentDefs(queryStr, fragNames, ast);
      const size = new TextEncoder().encode(queryStr).length;

      queries.push({
        name: batchName,
        query: queryStr,
        size,
        fields: batch.map((c) => c.typeName || c.name),
      });

      batchIdx++;
    }
  }

  if (queries.length < 2) return null;

  const totalSize = queries.reduce((sum, q) => sum + q.size, 0);
  const maxSingle = Math.max(...queries.map((q) => q.size));
  const savingsPercentage = Math.round(
    ((originalSize - maxSingle) / originalSize) * 100
  );

  return {
    id: "split-union-types",
    name: "Split by Union Types",
    description: `Splits ${candidates.reduce((s, c) => s + c.inlineChildren.length, 0)} union type branches into ${queries.length} batched queries, each using the same root field.`,
    queries,
    totalSize,
    originalSize,
    savingsPercentage: Math.max(0, savingsPercentage),
  };
}

function buildFieldBody(node: QueryTreeNode, indent: number): string {
  const pad = "  ".repeat(indent);
  const lines: string[] = [];
  for (const scalar of node.scalarFields) {
    lines.push(`${pad}${scalar}`);
  }
  for (const child of node.children) {
    if (child.nodeKind === "fragmentSpread" && child.fragmentName) {
      lines.push(`${pad}...${child.fragmentName}`);
    } else if (child.scalarFields.length > 0 || child.children.length > 0) {
      if (child.nodeKind === "inlineFragment") {
        lines.push(`${pad}... on ${child.typeName || child.name} {`);
      } else {
        const prefix = child.alias ? `${child.alias}: ${child.name}` : child.name;
        const argsStr =
          child.arguments.length > 0
            ? `(${child.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
            : "";
        lines.push(`${pad}${prefix}${argsStr} {`);
      }
      lines.push(buildFieldBody(child, indent + 1));
      if (child.nodeKind === "inlineFragment") {
        lines.push(`${pad}  __typename`);
      }
      lines.push(`${pad}}`);
    }
  }
  return lines.join("\n");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
