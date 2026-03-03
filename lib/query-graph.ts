import {
  DocumentNode,
  OperationDefinitionNode,
  FragmentDefinitionNode,
  FieldNode,
  InlineFragmentNode,
  SelectionSetNode,
  Kind,
  print,
} from "graphql";

export type NodeKind = "field" | "inlineFragment";

export interface QueryTreeNode {
  id: string;
  name: string;
  displayName: string;
  path: string;
  depth: number;
  selected: boolean;
  isRelation: boolean;
  nodeKind: NodeKind;
  typeName?: string;
  alias?: string;
  arguments: { name: string; value: string }[];
  scalarFields: string[];
  estimatedSize: number;
  children: QueryTreeNode[];
}

type FragmentMap = Map<string, FragmentDefinitionNode>;

let nodeCounter = 0;

function buildFragmentMap(ast: DocumentNode): FragmentMap {
  const map: FragmentMap = new Map();
  for (const def of ast.definitions) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) {
      map.set(def.name.value, def);
    }
  }
  return map;
}

function processSelectionSet(
  selectionSet: SelectionSetNode,
  depth: number,
  parentPath: string,
  fragmentMap: FragmentMap,
  visited: Set<string>
): { scalars: string[]; children: QueryTreeNode[] } {
  const scalars: string[] = [];
  const children: QueryTreeNode[] = [];

  for (const selection of selectionSet.selections) {
    if (selection.kind === Kind.FIELD) {
      const field = selection as FieldNode;
      const fieldName = field.name.value;

      if (fieldName === "__typename") {
        continue;
      }

      if (field.selectionSet && field.selectionSet.selections.length > 0) {
        const node = processFieldNode(field, depth, parentPath, fragmentMap, visited);
        if (node) children.push(node);
      } else {
        const displayName = field.alias ? field.alias.value : fieldName;
        scalars.push(displayName);
      }
    } else if (selection.kind === Kind.INLINE_FRAGMENT) {
      const inlineFrag = selection as InlineFragmentNode;
      const node = processInlineFragment(inlineFrag, depth, parentPath, fragmentMap, visited);
      if (node) children.push(node);
    } else if (selection.kind === Kind.FRAGMENT_SPREAD) {
      const fragName = selection.name.value;
      if (visited.has(fragName)) continue;
      const fragDef = fragmentMap.get(fragName);
      if (!fragDef) continue;

      const nextVisited = new Set(visited);
      nextVisited.add(fragName);

      const resolved = processSelectionSet(
        fragDef.selectionSet,
        depth,
        parentPath,
        fragmentMap,
        nextVisited
      );
      for (const s of resolved.scalars) {
        if (!scalars.includes(s)) scalars.push(s);
      }
      for (const c of resolved.children) {
        const existing = children.find(
          (ch) => ch.name === c.name && ch.nodeKind === c.nodeKind
        );
        if (!existing) {
          children.push(c);
        } else {
          for (const s of c.scalarFields) {
            if (!existing.scalarFields.includes(s)) existing.scalarFields.push(s);
          }
          for (const ch of c.children) {
            if (!existing.children.find((ec) => ec.name === ch.name && ec.nodeKind === ch.nodeKind)) {
              existing.children.push(ch);
            }
          }
          existing.estimatedSize += c.estimatedSize;
        }
      }
    }
  }

  return { scalars, children };
}

function processFieldNode(
  node: FieldNode,
  depth: number,
  parentPath: string,
  fragmentMap: FragmentMap,
  visited: Set<string>
): QueryTreeNode | null {
  const fieldName = node.name.value;
  const displayName = node.alias ? node.alias.value : fieldName;
  const currentPath = parentPath ? `${parentPath}.${displayName}` : displayName;
  const id = `node-${nodeCounter++}`;

  const args: { name: string; value: string }[] = [];
  if (node.arguments) {
    for (const arg of node.arguments) {
      args.push({ name: arg.name.value, value: print(arg.value) });
    }
  }

  let scalars: string[] = [];
  let children: QueryTreeNode[] = [];

  if (node.selectionSet) {
    const result = processSelectionSet(
      node.selectionSet, depth + 1, currentPath, fragmentMap, visited
    );
    scalars = result.scalars;
    children = result.children;
  }

  if (scalars.length === 0 && children.length === 0) return null;

  const scalarSize = scalars.reduce((sum, f) => sum + f.length + 6, 0);
  const argSize = args.reduce((sum, a) => sum + a.name.length + a.value.length + 4, 0);
  const overhead = displayName.length + 10;
  const childrenSize = children.reduce((sum, c) => sum + c.estimatedSize, 0);

  return {
    id,
    name: fieldName,
    displayName,
    path: currentPath,
    depth,
    selected: true,
    isRelation: true,
    nodeKind: "field",
    alias: node.alias ? node.alias.value : undefined,
    arguments: args,
    scalarFields: scalars,
    estimatedSize: overhead + scalarSize + argSize + childrenSize,
    children,
  };
}

function processInlineFragment(
  node: InlineFragmentNode,
  depth: number,
  parentPath: string,
  fragmentMap: FragmentMap,
  visited: Set<string>
): QueryTreeNode | null {
  const typeName = node.typeCondition?.name.value || "Unknown";
  const displayName = `... on ${typeName}`;
  const currentPath = parentPath ? `${parentPath}.${typeName}` : typeName;
  const id = `node-${nodeCounter++}`;

  let scalars: string[] = [];
  let children: QueryTreeNode[] = [];

  if (node.selectionSet) {
    const result = processSelectionSet(
      node.selectionSet, depth + 1, currentPath, fragmentMap, visited
    );
    scalars = result.scalars;
    children = result.children;
  }

  if (scalars.length === 0 && children.length === 0) return null;

  const scalarSize = scalars.reduce((sum, f) => sum + f.length + 6, 0);
  const overhead = displayName.length + 15;
  const childrenSize = children.reduce((sum, c) => sum + c.estimatedSize, 0);

  return {
    id,
    name: typeName,
    displayName,
    path: currentPath,
    depth,
    selected: true,
    isRelation: true,
    nodeKind: "inlineFragment",
    typeName,
    arguments: [],
    scalarFields: scalars,
    estimatedSize: overhead + scalarSize + childrenSize,
    children,
  };
}

export function astToTree(ast: DocumentNode): QueryTreeNode[] {
  const operation = ast.definitions.find(
    (def): def is OperationDefinitionNode =>
      def.kind === Kind.OPERATION_DEFINITION
  );
  if (!operation) return [];

  nodeCounter = 0;
  const fragmentMap = buildFragmentMap(ast);
  const roots: QueryTreeNode[] = [];

  const result = processSelectionSet(
    operation.selectionSet, 0, "", fragmentMap, new Set()
  );

  for (const child of result.children) {
    roots.push(child);
  }

  return roots;
}

export function treeToQuery(
  roots: QueryTreeNode[],
  selectedIds: Set<string>,
  operationName?: string,
  operationType?: string,
  variableDefs?: string
): string {
  function renderNode(node: QueryTreeNode, indent: number): string | null {
    if (!selectedIds.has(node.id)) return null;

    const pad = "  ".repeat(indent);
    const selectedChildren = node.children
      .map((c) => renderNode(c, indent + 1))
      .filter(Boolean);

    const selectedScalars = node.scalarFields;
    if (selectedScalars.length === 0 && selectedChildren.length === 0) {
      return null;
    }

    const lines: string[] = [];

    if (node.nodeKind === "inlineFragment") {
      lines.push(`${pad}... on ${node.typeName || node.name} {`);
    } else {
      const prefix = node.alias ? `${node.alias}: ${node.name}` : node.name;
      const argsStr =
        node.arguments.length > 0
          ? `(${node.arguments.map((a) => `${a.name}: ${a.value}`).join(", ")})`
          : "";
      lines.push(`${pad}${prefix}${argsStr} {`);
    }

    for (const scalar of selectedScalars) {
      lines.push(`${pad}  ${scalar}`);
    }
    if (node.nodeKind === "inlineFragment") {
      lines.push(`${pad}  __typename`);
    }
    for (const child of selectedChildren) {
      lines.push(child!);
    }
    lines.push(`${pad}}`);

    return lines.join("\n");
  }

  const bodyParts = roots
    .map((r) => renderNode(r, 1))
    .filter(Boolean);

  if (bodyParts.length === 0) return "";

  const opType = operationType || "query";
  const opName = operationName ? ` ${operationName}` : "";
  const varDefsStr = variableDefs ? `(${variableDefs})` : "";

  return `${opType}${opName}${varDefsStr} {\n${bodyParts.join("\n")}\n}`;
}

export function collectAllNodeIds(roots: QueryTreeNode[]): Set<string> {
  const ids = new Set<string>();
  function walk(node: QueryTreeNode) {
    ids.add(node.id);
    node.children.forEach(walk);
  }
  roots.forEach(walk);
  return ids;
}

export function collectSubtreeIds(node: QueryTreeNode): Set<string> {
  const ids = new Set<string>();
  function walk(n: QueryTreeNode) {
    ids.add(n.id);
    n.children.forEach(walk);
  }
  walk(node);
  return ids;
}

export function findNodeById(
  roots: QueryTreeNode[],
  id: string
): QueryTreeNode | null {
  for (const root of roots) {
    if (root.id === id) return root;
    const found = findNodeById(root.children, id);
    if (found) return found;
  }
  return null;
}
