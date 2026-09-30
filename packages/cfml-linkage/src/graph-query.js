import { validateGraph } from "./graph.js";

const QUERY_SCHEMA_VERSION = "agent-cfml-linkage-query/v0.1";
const SNAPSHOT_TYPE = "GraphSnapshot/v0.1";
const GRAPH_SCHEMA_VERSION = "agent-cfml-linkage-graph/v0.1";
const DEFAULT_MAX_RESULTS = 1_000;
const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_VISITED = 10_000;
const MAX_QUERY_RESULTS = 100_000;
const MAX_QUERY_DEPTH = 1_000;
const MAX_QUERY_VISITED = 100_000;
const MAX_EVIDENCE_ITEMS = 100;
const MAX_VALUE_DEPTH = 5;
const MAX_VALUE_ITEMS = 100;
const MAX_VALUE_STRING = 4_096;

const OPERATIONS = Object.freeze([
  "related",
  "callers",
  "callees",
  "includes",
  "included-by",
  "trace",
  "scope-flow",
  "tables",
  "routes",
  "unresolved",
  "explain-edge",
  "impact-evidence",
  "stats",
]);

const KNOWN_EDGE_TYPES = new Set([
  "INCLUDES",
  "CUSTOM_TAG_CALL",
  "EXTENDS",
  "IMPLEMENTS",
  "INSTANTIATES",
  "CFINVOKES",
  "CALLS_METHOD",
  "FORM_SUBMITS_TO",
  "REDIRECTS_TO",
  "AJAX_CALLS",
  "FETCHES",
  "QUERY_READS_TABLE",
  "QUERY_WRITES_TABLE",
  "QUERY_USES_DATASOURCE",
  "CALLS_REPOSITORY",
  "APPLICATION_GOVERNS",
  "REQUEST_HOOK_APPLIES_TO",
  "ROUTES_WHEN",
  "SCOPE_PRODUCES",
  "SCOPE_CONSUMES",
  "SCOPE_OVERRIDES",
  "DYNAMIC_REFERENCE",
  "CSS_ASSET_REFERENCES",
]);

const OPERATION_EDGE_TYPES = Object.freeze({
  includes: ["INCLUDES"],
  "included-by": ["INCLUDES"],
  tables: ["QUERY_READS_TABLE"],
  routes: ["FORM_SUBMITS_TO", "REDIRECTS_TO", "AJAX_CALLS", "FETCHES", "ROUTES_WHEN"],
  "scope-flow": ["SCOPE_PRODUCES", "SCOPE_CONSUMES", "SCOPE_OVERRIDES"],
});

const DEFAULT_DIRECTIONS = Object.freeze({
  related: "both",
  callers: "incoming",
  callees: "outgoing",
  includes: "outgoing",
  "included-by": "incoming",
  tables: "both",
  routes: "both",
  "scope-flow": "both",
  "impact-evidence": "incoming",
  trace: "outgoing",
});

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value, seen = new WeakSet()) {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function boundedValue(value, depth = 0) {
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, MAX_VALUE_STRING);
  if (depth >= MAX_VALUE_DEPTH) return "[bounded]";
  if (Array.isArray(value)) return value.slice(0, MAX_VALUE_ITEMS).map((item) => boundedValue(item, depth + 1));
  if (typeof value === "object") {
    const result = {};
    for (const key of Object.keys(value).sort(compareStrings).slice(0, MAX_VALUE_ITEMS)) result[key] = boundedValue(value[key], depth + 1);
    return result;
  }
  return String(value).slice(0, MAX_VALUE_STRING);
}

function spanSortKey(value) {
  const span = value?.span ?? {};
  return [span.start_line ?? 0, span.start_col ?? 0, span.end_line ?? 0, span.end_col ?? 0].join("\0");
}

function evidenceSortKey(value) {
  return [value?.file ?? "", spanSortKey(value), value?.kind ?? "", value?.rule_id ?? "", value?.normalized ?? ""].join("\0");
}

function evidenceSlices(values) {
  const unique = new Map();
  for (const value of Array.isArray(values) ? values : []) unique.set(evidenceSortKey(value), boundedValue(value));
  const sorted = [...unique.entries()].sort(([left], [right]) => compareStrings(left, right)).map(([, value]) => value);
  return { values: sorted.slice(0, MAX_EVIDENCE_ITEMS), truncated: sorted.length > MAX_EVIDENCE_ITEMS };
}

function nodeSlice(node) {
  const output = {
    id: node.id,
    kind: node.kind,
    name: String(node.name ?? "").slice(0, MAX_VALUE_STRING),
    canonical_name: String(node.canonical_name ?? "").slice(0, MAX_VALUE_STRING),
    language: node.language,
    evidence: evidenceSlices(node.evidence).values,
    attributes: boundedValue(node.attributes ?? {}),
    fingerprint: String(node.fingerprint ?? "sha256:unknown").slice(0, MAX_VALUE_STRING),
  };
  if (typeof node.path === "string") output.path = node.path.slice(0, MAX_VALUE_STRING);
  if (node.symbol && typeof node.symbol === "object") output.symbol = boundedValue(node.symbol);
  if ((node.evidence ?? []).length > MAX_EVIDENCE_ITEMS) output.evidence_truncated = true;
  return output;
}

function edgeSlice(edge) {
  const evidence = evidenceSlices(edge.evidence);
  const output = {
    id: edge.id,
    type: edge.type,
    from: edge.from,
    to: edge.to,
    direction: edge.direction,
    span: boundedValue(edge.span),
    evidence: evidence.values,
    resolver: boundedValue(edge.resolver),
    confidence: boundedValue(edge.confidence),
    dynamic: edge.dynamic === true,
    freshness: boundedValue(edge.freshness),
    attributes: boundedValue(edge.attributes ?? {}),
  };
  if (edge.condition !== undefined) output.condition = boundedValue(edge.condition);
  if (edge.order !== undefined) output.order = edge.order;
  if (evidence.truncated) output.evidence_truncated = true;
  return output;
}

function unresolvedSlice(item) {
  const evidence = evidenceSlices(item.evidence);
  const output = boundedValue(item);
  output.evidence = evidence.values;
  if (evidence.truncated) output.evidence_truncated = true;
  return output;
}

function diagnostic(code, message, details = undefined) {
  return {
    code,
    severity: "warning",
    message,
    ...(details === undefined ? {} : { details: boundedValue(details) }),
  };
}

function diagnosticSortKey(item) {
  const severity = item.severity === "info" ? 0 : item.severity === "warning" ? 1 : 2;
  return [severity, item.code ?? "", item.id ?? "", item.message ?? "", JSON.stringify(item.details ?? {})].join("\0");
}

function validateGraphInput(graph) {
  if (!graph || typeof graph !== "object" || Array.isArray(graph)) throw new TypeError("graph must be an object");
  if (graph.schema_version !== GRAPH_SCHEMA_VERSION) throw new TypeError(`Unsupported graph schema: ${graph.schema_version ?? "missing"}`);
  if (typeof graph.complete !== "boolean") throw new TypeError("graph.complete must be a boolean");
  if (!Array.isArray(graph.nodes) || !Array.isArray(graph.edges) || !Array.isArray(graph.unresolved) || !Array.isArray(graph.diagnostics)) throw new TypeError("graph nodes, edges, unresolved, and diagnostics must be arrays");
  const errors = validateGraph(graph);
  if (errors.length > 0) throw new Error(`Graph validation failed: ${errors[0].message}`);
}

function isGraphSnapshot(value) {
  return value?.snapshot_type === SNAPSHOT_TYPE && value.graph && typeof value.graph === "object";
}

/**
 * Create an immutable, read-only query snapshot from a validated Graph IR
 * document. The source graph is copied; no source files or application code
 * are read or executed.
 */
export function createGraphSnapshot(graph) {
  const source = isGraphSnapshot(graph) ? graph.graph : graph;
  const copy = cloneJson(source);
  validateGraphInput(copy);
  return deepFreeze({ snapshot_type: SNAPSHOT_TYPE, graph: deepFreeze(copy) });
}

function normalizeString(value, name) {
  if (typeof value !== "string" || value.trim() === "") throw new TypeError(`${name} must be a non-empty string`);
  if (value.length > MAX_VALUE_STRING) throw new TypeError(`${name} exceeds ${MAX_VALUE_STRING} characters`);
  return value;
}

function normalizeLimit(value, name, fallback, maximum, allowZero = false) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0) || value > maximum) throw new TypeError(`${name} must be a ${allowZero ? "non-negative" : "positive"} safe integer no greater than ${maximum}`);
  return value;
}

function normalizeRequest(request = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new TypeError("query request must be an object");
  const allowed = new Set(["operation", "node_id", "path", "canonical_name", "name", "kind", "edge_id", "relation_type", "reason_code", "edge_types", "direction", "max_results", "max_depth", "max_visited"]);
  for (const key of Object.keys(request)) if (!allowed.has(key)) throw new TypeError(`Unknown query option: ${key}`);
  const operation = normalizeString(request.operation, "operation");
  if (!OPERATIONS.includes(operation)) throw new TypeError(`Unsupported graph query operation: ${operation}`);
  const output = { operation };
  for (const key of ["node_id", "path", "canonical_name", "name", "kind", "edge_id", "relation_type", "reason_code"]) {
    if (request[key] !== undefined) output[key] = normalizeString(request[key], key);
  }
  const selectors = ["node_id", "path", "canonical_name", "name"].filter((key) => request[key] !== undefined);
  if (selectors.length > 1) throw new TypeError("Provide only one node selector");
  if (["stats", "explain-edge"].includes(operation) && selectors.length > 0) throw new TypeError(`${operation} does not accept a node selector`);
  if (request.kind !== undefined && request.name === undefined && request.path === undefined && request.canonical_name === undefined && request.node_id === undefined) throw new TypeError("kind requires a node selector");
  if (request.edge_types !== undefined) {
    if (!Array.isArray(request.edge_types) || request.edge_types.length === 0 || request.edge_types.length > 64) throw new TypeError("edge_types must contain between 1 and 64 entries");
    const normalizedEdgeTypes = request.edge_types.map((value) => normalizeString(value, "edge_types entry"));
    if (new Set(normalizedEdgeTypes).size !== normalizedEdgeTypes.length) throw new TypeError("edge_types must not contain duplicate entries");
    output.edge_types = normalizedEdgeTypes.sort(compareStrings);
    if (output.edge_types.some((value) => !KNOWN_EDGE_TYPES.has(value))) throw new TypeError("edge_types contains an unsupported edge type");
  }
  if (request.direction !== undefined && !["incoming", "outgoing", "both"].includes(request.direction)) throw new TypeError("direction must be incoming, outgoing, or both");
  output.direction = request.direction;
  output.max_results = normalizeLimit(request.max_results, "max_results", DEFAULT_MAX_RESULTS, MAX_QUERY_RESULTS);
  output.max_depth = normalizeLimit(request.max_depth, "max_depth", DEFAULT_MAX_DEPTH, MAX_QUERY_DEPTH, true);
  output.max_visited = normalizeLimit(request.max_visited, "max_visited", DEFAULT_MAX_VISITED, MAX_QUERY_VISITED);
  return output;
}

function edgeSortKey(edge) {
  return [edge.from, edge.type, edge.to, edge.id].join("\0");
}

function buildQueryIndexes(graph) {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  const edges = graph.edges.slice().sort((left, right) => compareStrings(edgeSortKey(left), edgeSortKey(right)));
  const edgeById = new Map(edges.map((edge) => [edge.id, edge]));
  const outgoing = new Map(graph.nodes.map((node) => [node.id, []]));
  const incoming = new Map(graph.nodes.map((node) => [node.id, []]));
  for (const edge of edges) {
    outgoing.get(edge.from).push({ edge, nodeId: edge.to, node: nodes.get(edge.to) });
    incoming.get(edge.to).push({ edge, nodeId: edge.from, node: nodes.get(edge.from) });
  }
  return { nodes, edges, edgeById, outgoing, incoming };
}

function resolveNode(graph, request, diagnostics) {
  const selectorKeys = ["node_id", "path", "canonical_name", "name"].filter((key) => request[key] !== undefined);
  if (selectorKeys.length === 0) return null;
  const selector = selectorKeys[0];
  const kind = request.kind;
  const matches = graph.nodes.filter((node) => {
    if (kind !== undefined && node.kind !== kind) return false;
    if (selector === "node_id") return node.id === request.node_id;
    if (selector === "path") return node.path === request.path;
    if (selector === "canonical_name") return node.canonical_name === request.canonical_name;
    return node.name === request.name;
  }).sort((left, right) => compareStrings(left.id, right.id));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    diagnostics.push(diagnostic("QUERY_TARGET_NOT_FOUND", "No graph node matched the exact query selector.", { selector: request[selector], selector_kind: selector, kind: kind ?? null }));
    return null;
  }
  diagnostics.push(diagnostic("QUERY_TARGET_AMBIGUOUS", "More than one graph node matched the exact query selector; no target was selected.", { selector: request[selector], selector_kind: selector, candidates: matches.slice(0, request.max_results).map((node) => node.id) }));
  return null;
}

function requireEdge(indexes, request, diagnostics) {
  if (request.edge_id === undefined) {
    diagnostics.push(diagnostic("QUERY_EDGE_REQUIRED", "The explain-edge query requires an exact edge_id."));
    return null;
  }
  const edge = indexes.edgeById.get(request.edge_id);
  if (!edge) diagnostics.push(diagnostic("QUERY_EDGE_NOT_FOUND", "No graph edge matched the exact edge_id.", { edge_id: request.edge_id }));
  return edge ?? null;
}

function selectedEdgeTypes(request, operation) {
  let types = request.edge_types ?? OPERATION_EDGE_TYPES[operation] ?? null;
  if (request.relation_type !== undefined) types = types === null ? [request.relation_type] : types.filter((type) => type === request.relation_type);
  return types === null ? null : new Set(types);
}

function incidentEdges(indexes, nodeId, direction) {
  const candidates = [];
  if (direction === "outgoing" || direction === "both") candidates.push(...(indexes.outgoing.get(nodeId) ?? []));
  if (direction === "incoming" || direction === "both") candidates.push(...(indexes.incoming.get(nodeId) ?? []));
  const unique = new Map(candidates.map((item) => [item.edge.id, item]));
  return [...unique.values()].sort((left, right) => compareStrings(edgeSortKey(left.edge), edgeSortKey(right.edge)));
}

function adjacentResults(indexes, targetId, direction, edgeTypes) {
  const results = [];
  for (const item of incidentEdges(indexes, targetId, direction)) {
    if (edgeTypes !== null && !edgeTypes.has(item.edge.type)) continue;
    const outgoing = item.edge.from === targetId;
    const incoming = item.edge.to === targetId;
    const self = outgoing && incoming;
    const edgeDirection = self ? "self" : outgoing ? "outgoing" : "incoming";
    results.push({ node: nodeSlice(item.node), edge: edgeSlice(item.edge), direction: edgeDirection, depth: 1 });
  }
  return results.sort((left, right) => compareStrings([left.edge.id, left.direction, left.node.id].join("\0"), [right.edge.id, right.direction, right.node.id].join("\0")));
}

function allEdgeResults(indexes, edgeTypes) {
  return indexes.edges.filter((edge) => edgeTypes === null || edgeTypes.has(edge.type)).map((edge) => ({
    node: nodeSlice(indexes.nodes.get(edge.to)),
    edge: edgeSlice(edge),
    direction: "outgoing",
    depth: 1,
  }));
}

function limitedResults(results, maxResults, diagnostics, message = "The query result limit was reached.") {
  if (results.length <= maxResults) return { results, truncated: false };
  diagnostics.push(diagnostic("QUERY_RESULT_LIMIT", `${message} Maximum results: ${maxResults}.`, { max_results: maxResults }));
  return { results: results.slice(0, maxResults), truncated: true };
}

function traversalEdges(indexes, nodeId, direction, edgeTypes) {
  return incidentEdges(indexes, nodeId, direction).filter((item) => edgeTypes === null || edgeTypes.has(item.edge.type));
}

function pathEvidence(indexes, edgeIds) {
  return evidenceSlices(edgeIds.flatMap((edgeId) => indexes.edgeById.get(edgeId)?.evidence ?? []));
}

function traverse(indexes, startId, direction, edgeTypes, request, diagnostics, mode) {
  const queue = [{ nodeId: startId, nodeIds: [startId], edgeIds: [], depth: 0 }];
  const visited = new Set([startId]);
  const inspectedEdges = new Set();
  const results = [];
  let resultLimited = false;
  let depthLimited = false;
  let visitedLimited = false;

  outer: while (queue.length > 0) {
    const current = queue.shift();
    const incident = traversalEdges(indexes, current.nodeId, direction, edgeTypes);
    if (current.depth >= request.max_depth) {
      if (incident.some((item) => !visited.has(item.nodeId))) depthLimited = true;
      continue;
    }
    for (const item of incident) {
      inspectedEdges.add(item.edge.id);
      if (visited.has(item.nodeId)) continue;
      if (visited.size >= request.max_visited) {
        visitedLimited = true;
        break outer;
      }
      visited.add(item.nodeId);
      const nodeIds = [...current.nodeIds, item.nodeId];
      const edgeIds = [...current.edgeIds, item.edge.id];
      if (mode === "trace") {
        const evidence = pathEvidence(indexes, edgeIds);
        results.push({
          node: nodeSlice(item.node),
          node_ids: nodeIds,
          edge_ids: edgeIds,
          depth: current.depth + 1,
          evidence: evidence.values,
          ...(evidence.truncated ? { evidence_truncated: true } : {}),
        });
      } else {
        results.push({ node: nodeSlice(item.node), edge: edgeSlice(item.edge), direction: direction === "both" ? "both" : direction, depth: current.depth + 1 });
      }
      if (results.length >= request.max_results) {
        resultLimited = queue.length > 0 || incident.some((candidate) => !visited.has(candidate.nodeId));
        if (resultLimited) break outer;
      }
      queue.push({ nodeId: item.nodeId, nodeIds, edgeIds, depth: current.depth + 1 });
    }
  }

  if (resultLimited) diagnostics.push(diagnostic("QUERY_RESULT_LIMIT", `The query traversal reached the maximum results: ${request.max_results}.`, { max_results: request.max_results }));
  if (depthLimited) diagnostics.push(diagnostic("QUERY_DEPTH_LIMIT", `The query traversal reached the maximum depth: ${request.max_depth}.`, { max_depth: request.max_depth }));
  if (visitedLimited) diagnostics.push(diagnostic("QUERY_VISITED_NODE_LIMIT", `The query traversal reached the maximum visited nodes: ${request.max_visited}.`, { max_visited: request.max_visited }));
  return { results, truncated: resultLimited || depthLimited || visitedLimited, visitedNodeCount: visited.size, visitedEdgeCount: inspectedEdges.size };
}

function explainEdge(indexes, edge) {
  const nodes = indexes.nodes;
  const from = nodes.get(edge.from);
  const to = nodes.get(edge.to);
  const level = edge.confidence?.level ?? "unresolved";
  const reason = edge.confidence?.reason ?? "No confidence rationale was recorded.";
  const dynamicNote = edge.dynamic === true ? " This relationship is dynamic and is not authoritative runtime proof." : "";
  const explanation = `The graph records ${edge.type} from "${from.name}" to "${to.name}" with ${level} confidence. ${reason}${dynamicNote}`.slice(0, 2_048);
  return {
    edge_id: edge.id,
    relation_type: edge.type,
    from: nodeSlice(from),
    to: nodeSlice(to),
    span: boundedValue(edge.span),
    confidence: boundedValue(edge.confidence),
    dynamic: edge.dynamic === true,
    resolver: boundedValue(edge.resolver),
    freshness: boundedValue(edge.freshness),
    evidence: evidenceSlices(edge.evidence).values,
    ...(edge.condition === undefined ? {} : { condition: boundedValue(edge.condition) }),
    ...(edge.order === undefined ? {} : { order: edge.order }),
    attributes: boundedValue(edge.attributes ?? {}),
    explanation,
  };
}

function unresolvedResults(graph, target, request) {
  return graph.unresolved.filter((item) => {
    if (target && item.source_node !== target.id) return false;
    if (request.relation_type !== undefined && item.relation_type !== request.relation_type) return false;
    if (request.reason_code !== undefined && item.reason_code !== request.reason_code) return false;
    return true;
  }).slice().sort((left, right) => compareStrings([left.source_node, left.relation_type, left.span?.start_line ?? 0, left.span?.start_col ?? 0, left.id].join("\0"), [right.source_node, right.relation_type, right.span?.start_line ?? 0, right.span?.start_col ?? 0, right.id].join("\0"))).map(unresolvedSlice);
}

function queryStats(graph, resultCount, visitedNodeCount, visitedEdgeCount) {
  return {
    file_count: graph.stats?.file_count ?? 0,
    node_count: graph.nodes.length,
    edge_count: graph.edges.length,
    unresolved_count: graph.unresolved.length,
    diagnostic_count: graph.diagnostics.length,
    evidence_count: graph.stats?.evidence_count ?? 0,
    result_count: resultCount,
    visited_node_count: visitedNodeCount,
    visited_edge_count: visitedEdgeCount,
  };
}

/**
 * Validate and normalize a graph query request without reading a graph.
 *
 * @param {object} request query operation and bounded selector/options
 * @returns {object} deterministic normalized request
 */
export function validateQueryRequest(request = {}) {
  return normalizeRequest(request);
}

/**
 * Run a deterministic, bounded query against a GraphSnapshot or Graph IR
 * document. Query output contains graph evidence slices and deterministic
 * explanations; it never evaluates source or invents a target.
 */
export function queryGraph(input, request = {}) {
  const snapshot = createGraphSnapshot(input);
  const graph = snapshot.graph;
  const indexes = buildQueryIndexes(graph);
  const normalized = normalizeRequest(request);
  const diagnostics = (graph.diagnostics ?? []).map((item) => boundedValue(item));
  const queryDiagnostics = [];
  let results = [];
  let truncated = false;
  let visitedNodeCount = 0;
  let visitedEdgeCount = 0;
  const nodeOperations = new Set(["related", "callers", "callees", "includes", "included-by", "trace", "impact-evidence", "unresolved", "tables", "routes", "scope-flow"]);
  const hasNodeSelector = ["node_id", "path", "canonical_name", "name"].some((key) => normalized[key] !== undefined);
  const target = nodeOperations.has(normalized.operation) ? resolveNode(graph, normalized, queryDiagnostics) : null;
  const targetRequired = new Set(["related", "callers", "callees", "includes", "included-by", "trace", "impact-evidence"]);
  const targetUnavailable = !target && (targetRequired.has(normalized.operation) || (hasNodeSelector && nodeOperations.has(normalized.operation)));

  if (targetUnavailable) {
    if (targetRequired.has(normalized.operation) && !hasNodeSelector) queryDiagnostics.push(diagnostic("QUERY_TARGET_REQUIRED", "This graph query requires an exact node selector."));
  } else if (normalized.operation === "stats") {
    results = [{ graph_complete: graph.complete, snapshot: boundedValue(graph.snapshot), graph_stats: boundedValue(graph.stats ?? {}) }];
    visitedNodeCount = graph.nodes.length;
    visitedEdgeCount = graph.edges.length;
  } else if (normalized.operation === "explain-edge") {
    const edge = requireEdge(indexes, normalized, queryDiagnostics);
    if (edge) results = [explainEdge(indexes, edge)];
  } else if (normalized.operation === "unresolved") {
    const unresolved = unresolvedResults(graph, target, normalized);
    const limited = limitedResults(unresolved, normalized.max_results, queryDiagnostics, "The unresolved evidence result limit was reached.");
    results = limited.results;
    truncated = limited.truncated;
    visitedNodeCount = target ? 1 : new Set(unresolved.map((item) => item.source_node)).size;
    visitedEdgeCount = 0;
  } else if (["tables", "routes", "scope-flow"].includes(normalized.operation)) {
    const edgeTypes = selectedEdgeTypes(normalized, normalized.operation);
    const values = target ? adjacentResults(indexes, target.id, normalized.direction ?? "both", edgeTypes) : allEdgeResults(indexes, edgeTypes);
    const limited = limitedResults(values, normalized.max_results, queryDiagnostics);
    results = limited.results;
    truncated = limited.truncated;
    visitedNodeCount = target ? 1 + new Set(results.map((item) => item.node.id)).size : new Set(values.flatMap((item) => [item.edge.from, item.edge.to])).size;
    visitedEdgeCount = values.length;
  } else if (["related", "callers", "callees", "includes", "included-by"].includes(normalized.operation)) {
    const values = adjacentResults(indexes, target.id, normalized.direction ?? DEFAULT_DIRECTIONS[normalized.operation], selectedEdgeTypes(normalized, normalized.operation));
    const limited = limitedResults(values, normalized.max_results, queryDiagnostics);
    results = limited.results;
    truncated = limited.truncated;
    visitedNodeCount = 1 + new Set(results.map((item) => item.node.id)).size;
    visitedEdgeCount = values.length;
  } else if (normalized.operation === "trace" || normalized.operation === "impact-evidence") {
    const mode = normalized.operation === "trace" ? "trace" : "impact";
    const traversal = traverse(indexes, target.id, normalized.direction ?? DEFAULT_DIRECTIONS[normalized.operation], selectedEdgeTypes(normalized, normalized.operation), normalized, queryDiagnostics, mode);
    results = traversal.results;
    truncated = traversal.truncated;
    visitedNodeCount = traversal.visitedNodeCount;
    visitedEdgeCount = traversal.visitedEdgeCount;
  }

  diagnostics.push(...queryDiagnostics);
  diagnostics.sort((left, right) => compareStrings(diagnosticSortKey(left), diagnosticSortKey(right)));
  const queryFailed = queryDiagnostics.length > 0 && queryDiagnostics.some((item) => ["QUERY_TARGET_REQUIRED", "QUERY_TARGET_NOT_FOUND", "QUERY_TARGET_AMBIGUOUS", "QUERY_EDGE_REQUIRED", "QUERY_EDGE_NOT_FOUND"].includes(item.code));
  return {
    schema_version: QUERY_SCHEMA_VERSION,
    operation: normalized.operation,
    complete: graph.complete === true && !truncated && !queryFailed,
    truncated,
    results,
    diagnostics,
    stats: queryStats(graph, results.length, visitedNodeCount, visitedEdgeCount),
  };
}

export { OPERATIONS };
