import type { GraphEdge, GraphNode, ImpactItem, Relation, EvidenceLevel } from "./types";
import type { Limits } from "./types";
import { compareText } from "./util";

export interface GraphQuery {
  edgesForNode(node: GraphNode): GraphEdge[];
}

export interface TraversalResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  direct: ImpactItem[];
  transitive: ImpactItem[];
  status: "complete" | "partial";
  stopReasons: string[];
}

interface QueueEntry {
  node: GraphNode;
  seed: string;
  distance: number;
  path: string[];
  edgePath: GraphEdge[];
}

export function traverseReverse(seeds: readonly GraphNode[], query: GraphQuery, nodeForId: (id: string) => GraphNode | undefined, limits: Limits): TraversalResult {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const direct: ImpactItem[] = [];
  const transitive: ImpactItem[] = [];
  const stopReasons = new Set<string>();
  const visited = new Set<string>();
  const queue: QueueEntry[] = [];

  for (const seed of [...seeds].sort((a, b) => compareText(a.id, b.id))) {
    if (nodes.size >= limits.maxNodes) {
      stopReasons.add("NODE_LIMIT");
      break;
    }
    nodes.set(seed.id, seed);
    queue.push({ node: seed, seed: seed.id, distance: 0, path: [seed.id], edgePath: [] });
    visited.add(`${seed.id}|${seed.id}`);
  }

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) {
      break;
    }
    if (current.distance >= limits.depth) {
      const frontier = query.edgesForNode(current.node)
        .filter((edge) => edge.to === current.node.id && edge.from !== current.node.id)
        .some((edge) => {
          const candidate = nodeForId(edge.from);
          return candidate !== undefined && !visited.has(`${current.seed}|${candidate.id}`);
        });
      if (frontier) {
        stopReasons.add("DEPTH_LIMIT");
      }
      continue;
    }
    const candidateEdges = query.edgesForNode(current.node)
      .filter((edge) => edge.to === current.node.id)
      .sort(compareEdges);
    for (const edge of candidateEdges) {
      const candidate = nodeForId(edge.from);
      if (!candidate) {
        stopReasons.add("MISSING_EDGE_NODE");
        continue;
      }
      const visitKey = `${current.seed}|${candidate.id}`;
      if (visited.has(visitKey)) {
        continue;
      }
      if (edges.size >= limits.maxEdges) {
        stopReasons.add("EDGE_LIMIT");
        break;
      }
      if (nodes.size >= limits.maxNodes) {
        stopReasons.add("NODE_LIMIT");
        break;
      }
      visited.add(visitKey);
      nodes.set(candidate.id, candidate);
      edges.set(edge.id, edge);
      const distance = current.distance + 1;
      const path = [...current.path, candidate.id];
      const edgePath = [...current.edgePath, edge];
      const item = impactItem(candidate, current.seed, distance, path, edgePath);
      if (distance === 1) {
        direct.push(item);
      } else {
        transitive.push(item);
      }
      queue.push({ node: candidate, seed: current.seed, distance, path, edgePath });
    }
  }

  const status = stopReasons.size === 0 ? "complete" : "partial";
  return {
    nodes: [...nodes.values()].sort(compareNodes),
    edges: [...edges.values()].sort(compareEdges),
    direct: direct.sort(compareImpactItems),
    transitive: transitive.sort(compareImpactItems),
    status,
    stopReasons: [...stopReasons].sort(),
  };
}

function impactItem(node: GraphNode, seed: string, distance: number, path: string[], edgePath: readonly GraphEdge[]): ImpactItem {
  const relationSet = new Set<Relation>();
  const evidenceSet = new Set<EvidenceLevel>();
  for (const edge of edgePath) {
    relationSet.add(edge.relation);
    evidenceSet.add(edge.evidence.level);
  }
  return {
    node: node.id,
    seed,
    distance,
    relations: [...relationSet].sort(),
    path,
    evidenceLevels: [...evidenceSet].sort(),
    granularity: node.kind,
  };
}

function compareNodes(a: GraphNode, b: GraphNode): number {
  return compareText(`${a.snapshot.id}:${a.file}:${a.kind}:${a.symbol ?? ""}:${rangeStart(a)}`, `${b.snapshot.id}:${b.file}:${b.kind}:${b.symbol ?? ""}:${rangeStart(b)}`);
}

function rangeStart(node: GraphNode): string {
  return node.declaration ? `${node.declaration.start.line}:${node.declaration.start.column}` : "0:0";
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  return compareText(`${a.from}:${a.to}:${a.relation}:${evidenceStart(a)}`, `${b.from}:${b.to}:${b.relation}:${evidenceStart(b)}`);
}

function evidenceStart(edge: GraphEdge): string {
  const location = edge.evidence.location;
  return location ? `${location.file}:${location.range.start.line}:${location.range.start.column}` : "";
}

function compareImpactItems(a: ImpactItem, b: ImpactItem): number {
  return a.distance - b.distance || compareText(`${a.node}:${a.seed}`, `${b.node}:${b.seed}`);
}
