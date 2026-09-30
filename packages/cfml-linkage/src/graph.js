import crypto from "node:crypto";
import path from "node:path";

const GRAPH_SCHEMA_VERSION = "agent-cfml-linkage-graph/v0.1";
const TOOL_NAME = "agent-cfml-linkage";
const DEFAULT_TOOL_VERSION = "0.1.0";
const DEFAULT_RESOLVER = { name: "literal-path-resolver", version: "v0.1" };
const DEFAULT_MAX_EDGES = 100_000;
const DEFAULT_MAX_EVIDENCE = 1_000_000;
const PATH_RELATIONS = Object.freeze({
  INCLUDE: "INCLUDES",
  CUSTOM_TAG: "CUSTOM_TAG_CALL",
  FORM: "FORM_SUBMITS_TO",
  REDIRECT: "REDIRECTS_TO",
  AJAX: "AJAX_CALLS",
  FETCH: "FETCHES",
  CSS_ASSET: "CSS_ASSET_REFERENCES",
});
const SUPPORTED_LANGUAGES = Object.freeze(["cfml", "html", "javascript", "css", "sql", "unknown"]);
const ALLOWED_EDGE_TYPES = new Set([
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
const FACT_NODE_KINDS = Object.freeze({
  FILE: "FILE",
  COMPONENT: "CFC_COMPONENT",
  METHOD: "CFC_METHOD",
  CUSTOM_TAG: "CUSTOM_TAG",
  FORM: "FORM",
  QUERY: "QUERY",
  SCOPE_WRITE: "SCOPE_VARIABLE",
  CONDITION: "ROUTE_CONDITION",
  CONTROL_FLOW: "CONTROL_FLOW",
  APPLICATION_HOOK: "APPLICATION",
  REPOSITORY_ACTION: "REPOSITORY_ACTION",
});
const FALLBACK_SPAN = Object.freeze({ start_line: 1, start_col: 0, end_line: 1, end_col: 0 });
const CONFIDENCE_LEVELS = new Set(["confirmed", "strong", "candidate", "unresolved"]);

function relationForFact(fact) {
  return PATH_RELATIONS[fact.kind] ?? null;
}

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function factSortKey(fact) {
  const span = fact.span ?? FALLBACK_SPAN;
  return [fact.file ?? "", span.start_line ?? 0, span.start_col ?? 0, span.end_line ?? 0, span.end_col ?? 0, fact.kind ?? "", fact.fact_id ?? ""].join("\0");
}

function compareFacts(left, right) {
  return compareStrings(factSortKey(left), factSortKey(right));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function cloneJson(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function normalizePositiveLimit(value, name, fallback) {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  return result;
}

function spanFor(value) {
  if (!value || !Number.isSafeInteger(value.start_line) || !Number.isSafeInteger(value.start_col) || !Number.isSafeInteger(value.end_line) || !Number.isSafeInteger(value.end_col)) return { ...FALLBACK_SPAN };
  return { start_line: value.start_line, start_col: value.start_col, end_line: value.end_line, end_col: value.end_col };
}

function evidenceKind(fact) {
  if (fact.kind === "QUERY") return "sql_parse";
  if (fact.kind === "MAPPING") return "mapping";
  if (fact.kind === "CONDITION") return "condition";
  return "syntax";
}

function factEvidence(fact, kind = evidenceKind(fact), normalized = fact.normalized_expression, ruleId = fact.extraction_rule_id) {
  return {
    kind,
    file: fact.file,
    span: spanFor(fact.span),
    normalized: String(normalized || fact.kind).slice(0, 2048),
    rule_id: String(ruleId || "graph-fact-v0.1"),
  };
}

function evidenceSortKey(evidence) {
  const span = evidence.span ?? FALLBACK_SPAN;
  return [evidence.file ?? "", span.start_line ?? 0, span.start_col ?? 0, span.end_line ?? 0, span.end_col ?? 0, evidence.kind ?? "", evidence.rule_id ?? "", evidence.normalized ?? ""].join("\0");
}

function sortEvidence(values) {
  const unique = new Map();
  for (const value of values) unique.set(evidenceSortKey(value), value);
  return [...unique.values()].sort((left, right) => compareStrings(evidenceSortKey(left), evidenceSortKey(right)));
}

function sourceFingerprintMap(factBundle, snapshot) {
  const values = snapshot?.files ?? factBundle.source_files ?? [];
  const output = new Map();
  for (const value of values) {
    const file = value.file ?? value.path;
    const fingerprint = value.fingerprint ?? value.content_sha256;
    if (typeof file === "string" && typeof fingerprint === "string" && fingerprint !== "") output.set(file, fingerprint);
  }
  return output;
}

function fileNodeName(file) {
  return file.toLowerCase().endsWith("/application.cfc") || file.toLowerCase() === "application.cfc" || file.toLowerCase().endsWith("/application.cfm") || file.toLowerCase() === "application.cfm" ? file : file;
}

function nodeSpec(fact) {
  const attributes = fact.attributes ?? {};
  const kind = FACT_NODE_KINDS[fact.kind];
  if (!kind) return null;
  if (fact.kind === "FILE") return { kind, name: fileNodeName(fact.file), canonicalName: fact.file, path: fact.file };
  if (fact.kind === "COMPONENT") {
    const name = attributes.component_name || fact.normalized_expression;
    return { kind, name, canonicalName: name, path: fact.file, symbol: { kind: "component", name } };
  }
  if (fact.kind === "METHOD") {
    const name = fact.normalized_expression.replace(/^method\s+/u, "") || attributes.method_name || fact.normalized_expression;
    return { kind, name, canonicalName: name, path: fact.file, symbol: { kind: "method", name } };
  }
  if (fact.kind === "CUSTOM_TAG") {
    const name = attributes.name || fact.normalized_expression;
    return { kind, name, canonicalName: `${fact.file}:${name}`, path: fact.file };
  }
  if (fact.kind === "FORM") return { kind, name: `form ${fact.normalized_expression}`, canonicalName: `${fact.file}:form:${fact.normalized_expression}`, path: fact.file };
  if (fact.kind === "QUERY") return { kind, name: `query ${fact.normalized_expression}`, canonicalName: `${fact.file}:query:${fact.normalized_expression}`, path: fact.file };
  if (fact.kind === "SCOPE_WRITE") {
    const name = attributes.target || fact.normalized_expression;
    return { kind, name, canonicalName: `${fact.file}:scope:${name}`, path: fact.file, symbol: { kind: "scope_variable", name } };
  }
  if (fact.kind === "CONDITION") return { kind, name: fact.normalized_expression, canonicalName: `${fact.file}:condition:${fact.normalized_expression}`, path: fact.file };
  if (fact.kind === "CONTROL_FLOW") return { kind, name: fact.normalized_expression, canonicalName: `${fact.file}:control:${fact.fact_id}`, path: fact.file };
  if (fact.kind === "APPLICATION_HOOK") return { kind, name: fact.file, canonicalName: fact.file, path: fact.file, symbol: { kind: "application", name: fact.file } };
  if (fact.kind === "REPOSITORY_ACTION") {
    const name = attributes.action_name || fact.normalized_expression;
    return { kind, name, canonicalName: `${fact.file}:repository:${name}`, path: fact.file, symbol: { kind: "repository_action", name } };
  }
  return null;
}

function nodeId(kind, pathName, canonicalName) {
  return `node:${sha256(["v0.1", "node", kind, pathName ?? "", canonicalName].join("\0"))}`;
}

function edgeId(type, from, to, factIds, conditionKey = "") {
  return `edge:${sha256(["v0.1", "edge", type, from, to, ...[...new Set(factIds)].sort(compareStrings), conditionKey].join("\0"))}`;
}

function defaultConfidence(level, reason) {
  return { level: CONFIDENCE_LEVELS.has(level) ? level : "unresolved", reason };
}

function resolutionEvidenceKind(relationType) {
  if (relationType === "ROUTES_WHEN") return "condition";
  if (relationType === "CALLS_REPOSITORY") return "symbol_resolution";
  if (relationType.startsWith("SCOPE_")) return "scope_flow";
  if (relationType.startsWith("APPLICATION") || relationType.startsWith("REQUEST_HOOK") || ["EXTENDS", "IMPLEMENTS", "INSTANTIATES", "CFINVOKES", "CALLS_METHOD"].includes(relationType)) return "symbol_resolution";
  return "path_resolution";
}

function confidenceReason(resolution) {
  if (resolution.resolution_kind === "exact") return "Unique exact literal path within the admitted snapshot.";
  if (resolution.resolution_kind === "extension-fallback") return "Unique bounded extension fallback within the admitted snapshot.";
  if (resolution.resolution_kind === "nearest-application") return "Unique nearest Application file convention.";
  if (resolution.resolution_kind === "nearest-application-hook") return "Known Application hook under the unique nearest Application file.";
  if (resolution.resolution_kind === "structural-repository-action") return "Unique CFC method contains a statically visible query.";
  return "Bounded deterministic resolver evidence.";
}

function unresolvedGraphRecord(unresolved, fact, sourceNodeId) {
  const reason = ["DYNAMIC_EXPRESSION", "AMBIGUOUS_PATH", "AMBIGUOUS_COMPONENT", "AMBIGUOUS_METHOD", "MAPPING_UNKNOWN", "OUTSIDE_ROOT", "PATH_NOT_FOUND", "EXTERNAL_TARGET", "GENERATED_SYMBOL", "SQL_DYNAMIC_IDENTIFIER", "UNSUPPORTED_SYNTAX", "PARSE_PARTIAL"].includes(unresolved.reason) ? unresolved.reason : "UNSUPPORTED_SYNTAX";
  return {
    id: unresolved.unresolved_id?.startsWith("unresolved:") ? unresolved.unresolved_id : `unresolved:${sha256([fact.fact_id, unresolved.relation_type, unresolved.reason, unresolved.normalized_expression ?? fact.normalized_expression, ...(Array.isArray(unresolved.candidates) ? unresolved.candidates : [])].join("\0"))}`,
    source_node: sourceNodeId,
    relation_type: unresolved.relation_type,
    expression: String(unresolved.normalized_expression || fact.normalized_expression || fact.kind).slice(0, 4096),
    span: spanFor(unresolved.span ?? fact.span),
    reason_code: reason,
    candidates: [...new Set(Array.isArray(unresolved.candidates) ? unresolved.candidates : [])].sort(compareStrings),
    evidence: [factEvidence(fact)],
    suggested_resolution: null,
  };
}

function unresolvedRelationForFact(fact) {
  if (fact.kind === "INSTANTIATE") return "INSTANTIATES";
  if (fact.kind === "INVOKE") return "CFINVOKES";
  if (fact.kind === "MAPPING") return "MAPPING_APPLIES";
  if (fact.kind === "DYNAMIC_REFERENCE") {
    return {
      INCLUDE: "INCLUDES",
      CUSTOM_TAG: "CUSTOM_TAG_CALL",
      FORM: "FORM_SUBMITS_TO",
      REDIRECT: "REDIRECTS_TO",
      AJAX: "AJAX_CALLS",
      FETCH: "FETCHES",
      CSS_ASSET: "CSS_ASSET_REFERENCES",
      SCOPE_WRITE: "SCOPE_PRODUCES",
      CONDITION: "ROUTES_WHEN",
    }[fact.attributes?.source_kind] ?? "DYNAMIC_REFERENCE";
  }
  return null;
}

function validateGraph(graph) {
  const diagnostics = [];
  const nodeIds = new Set();
  for (const node of graph.nodes) {
    if (nodeIds.has(node.id)) diagnostics.push({ code: "INTERNAL_INVARIANT", severity: "error", message: `Duplicate graph node ID: ${node.id}.` });
    nodeIds.add(node.id);
  }
  const edgeIds = new Set();
  for (const edge of graph.edges) {
    if (!ALLOWED_EDGE_TYPES.has(edge.type)) diagnostics.push({ code: "INTERNAL_INVARIANT", severity: "error", message: `Unsupported graph edge type: ${edge.type}.` });
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) diagnostics.push({ code: "INTERNAL_INVARIANT", severity: "error", message: `Graph edge endpoint is missing: ${edge.id}.` });
    if (edgeIds.has(edge.id)) diagnostics.push({ code: "INTERNAL_INVARIANT", severity: "error", message: `Duplicate graph edge ID: ${edge.id}.` });
    edgeIds.add(edge.id);
  }
  for (const item of graph.unresolved) {
    if (!nodeIds.has(item.source_node)) diagnostics.push({ code: "INTERNAL_INVARIANT", severity: "error", message: `Unresolved source node is missing: ${item.id}.` });
  }
  return diagnostics;
}

function enforceEdgeLimit(graph, maxEdges) {
  if (graph.edges.length <= maxEdges) return;
  graph.edges = graph.edges.slice(0, maxEdges);
  graph.complete = false;
  graph.diagnostics.push({
    id: `diagnostic:${sha256(["edge-limit", maxEdges].join("\0"))}`,
    severity: "error",
    code: "RESOURCE_LIMIT",
    message: `Edge limit exceeded: ${maxEdges}.`,
    details: { max_edges: maxEdges },
  });
  graph.stats.edge_count = graph.edges.length;
}

function enforceEvidenceLimit(graph, maxEvidence) {
  // Preserve relationship evidence before supporting node evidence when the global cap is tight.
  const records = [
    ...graph.edges,
    ...graph.unresolved,
    ...graph.nodes,
  ];
  let remaining = maxEvidence;
  let truncated = false;
  for (const record of records) {
    const evidence = Array.isArray(record.evidence) ? record.evidence : [];
    if (evidence.length > remaining) {
      record.evidence = evidence.slice(0, remaining);
      truncated = true;
      remaining = 0;
    } else {
      remaining -= evidence.length;
    }
  }
  if (truncated) {
    graph.complete = false;
    graph.diagnostics.push({
      id: `diagnostic:${sha256(["evidence-limit", maxEvidence].join("\0"))}`,
      severity: "error",
      code: "RESOURCE_LIMIT",
      message: `Evidence limit exceeded: ${maxEvidence}.`,
      details: { max_evidence: maxEvidence },
    });
  }
  graph.stats.evidence_count = [...graph.nodes, ...graph.edges, ...graph.unresolved].reduce((count, record) => count + (record.evidence?.length ?? 0), 0);
}

/**
 * Build a bounded Graph IR document from Fact IR and resolver output. This
 * creates only evidence-backed nodes/edges; it does not infer missing links.
 */
export function buildGraph({ factBundle, resolutions = null, snapshot = null, rootGuard, toolVersion = DEFAULT_TOOL_VERSION, maxEdges = DEFAULT_MAX_EDGES, maxEvidence = DEFAULT_MAX_EVIDENCE, createdAt = new Date().toISOString() } = {}) {
  if (!factBundle || !Array.isArray(factBundle.facts) || !Array.isArray(factBundle.source_files)) throw new TypeError("factBundle with facts and source_files is required");
  if (!rootGuard || typeof rootGuard.rootPath !== "string") throw new TypeError("rootGuard must be created by createRootGuard");
  if (typeof createdAt !== "string" || Number.isNaN(Date.parse(createdAt))) throw new TypeError("createdAt must be a date-time string");
  if (typeof toolVersion !== "string" || toolVersion.trim() === "") throw new TypeError("toolVersion must be a non-empty string");
  const edgeLimit = normalizePositiveLimit(maxEdges, "maxEdges", DEFAULT_MAX_EDGES);
  const evidenceLimit = normalizePositiveLimit(maxEvidence, "maxEvidence", DEFAULT_MAX_EVIDENCE);

  const facts = factBundle.facts.slice().sort(compareFacts);
  const fingerprints = sourceFingerprintMap(factBundle, snapshot);
  const factById = new Map(facts.map((fact) => [fact.fact_id, fact]));
  const sourceFiles = new Map(factBundle.source_files.map((file) => [file.file, file]));
  const nodes = new Map();
  const edges = new Map();
  const unresolved = new Map();

  function fileNode(file) {
    const fileEntry = sourceFiles.get(file);
    const anyFact = facts.find((fact) => fact.file === file);
    const sourceFact = facts.find((fact) => fact.kind === "FILE" && fact.file === file) ?? {
      fact_id: `file:${sha256(["v0.1", "synthetic-file", file].join("\0"))}`,
      kind: "FILE",
      file,
      language: fileEntry?.language ?? anyFact?.language ?? "unknown",
      span: spanFor(anyFact?.span),
      normalized_expression: `source_file ${file}`,
      extraction_rule_id: "graph-synthetic-file-v0.1",
      attributes: {},
    };
    const spec = nodeSpec(sourceFact);
    const key = `${spec.kind}\0${spec.canonicalName}`;
    if (!nodes.has(key)) nodes.set(key, { ...spec, id: nodeId(spec.kind, spec.path, spec.canonicalName), sourceFact });
    return nodes.get(key);
  }

  function addFactNode(fact) {
    const spec = nodeSpec(fact);
    if (!spec) return null;
    const key = `${spec.kind}\0${spec.canonicalName}`;
    const existing = nodes.get(key);
    const entry = existing ?? { ...spec, id: nodeId(spec.kind, spec.path, spec.canonicalName), sourceFact: fact, evidence: [] };
    entry.evidence = sortEvidence([...(entry.evidence ?? []), factEvidence(fact)]);
    if (!existing) nodes.set(key, entry);
    return entry;
  }

  for (const fact of facts) addFactNode(fact);
  for (const sourceFile of factBundle.source_files) fileNode(sourceFile.file);

  function addUnresolved(value, fact) {
    const source = fileNode(fact.file);
    if (!source) return;
    const record = unresolvedGraphRecord(value, fact, source.id);
    const existing = unresolved.get(record.id);
    if (existing) existing.evidence = sortEvidence([...existing.evidence, ...record.evidence]);
    else unresolved.set(record.id, record);
  }

  function addEdge({ type, from, to, fact, confidence = "confirmed", reason, resolutionKind, attributes = {}, evidenceKind, resolver = DEFAULT_RESOLVER, order = null }) {
    if (!ALLOWED_EDGE_TYPES.has(type) || !from || !to) return;
    const sourceFactIds = [fact.fact_id, ...(Array.isArray(attributes.source_fact_ids) ? attributes.source_fact_ids : [])];
    const id = edgeId(type, from.id, to.id, sourceFactIds, fact.condition ? JSON.stringify(fact.condition) : "");
    if (edges.has(id)) return;
    const edge = {
      id,
      type,
      from: from.id,
      to: to.id,
      direction: "forward",
      span: spanFor(fact.span),
      evidence: [factEvidence(fact, evidenceKind ?? "path_resolution")],
      resolver: cloneJson(resolver),
      confidence: defaultConfidence(confidence, reason ?? "Bounded deterministic resolver evidence."),
      ...(fact.condition ? { condition: cloneJson(fact.condition) } : {}),
      dynamic: false,
      freshness: { source_fingerprint: snapshot?.source_fingerprint ?? fingerprints.get(fact.file) ?? "sha256:unknown" },
      attributes: { ...(resolutionKind ? { resolution_kind: resolutionKind } : {}), ...cloneJson(attributes) },
    };
    if (Number.isSafeInteger(order)) edge.order = order;
    else if (Number.isSafeInteger(fact.attributes?.order_index)) edge.order = fact.attributes.order_index;
    edges.set(id, edge);
  }

  const resolvedFactIds = new Set();
  const resolverUnresolvedFactIds = new Set();
  for (const item of resolutions?.resolutions ?? []) {
    const fact = factById.get(item.source_fact_id);
    const targetFact = item.to_fact_id ? factById.get(item.to_fact_id) : null;
    const from = item.source_node_kind === "fact" ? addFactNode(fact) : fileNode(item.from_file);
    const to = targetFact ? addFactNode(targetFact) : fileNode(item.to_file);
    if (!fact || !from || !to) continue;
    resolvedFactIds.add(fact.fact_id);
    addEdge({ type: item.relation_type, from, to, fact, confidence: item.confidence, reason: confidenceReason(item), resolutionKind: item.resolution_kind, attributes: item, evidenceKind: resolutionEvidenceKind(item.relation_type), resolver: item.resolver ?? DEFAULT_RESOLVER, order: item.order });
  }
  for (const item of resolutions?.unresolved ?? []) {
    const fact = factById.get(item.source_fact_id);
    if (!fact) continue;
    resolverUnresolvedFactIds.add(fact.fact_id);
    addUnresolved(item, fact);
  }

  for (const fact of facts) {
    if (fact.kind === "QUERY") {
      const queryNode = addFactNode(fact);
      const tables = Array.isArray(fact.attributes?.tables) ? fact.attributes.tables : [];
      for (const table of [...new Set(tables)].sort(compareStrings)) {
        const tableSpec = { kind: "DATABASE_TABLE", name: table, canonicalName: table };
        const key = `${tableSpec.kind}\0${tableSpec.canonicalName}`;
        const tableNode = nodes.get(key) ?? { ...tableSpec, id: nodeId(tableSpec.kind, "", tableSpec.canonicalName), sourceFact: fact, evidence: [] };
        tableNode.evidence = sortEvidence([...(tableNode.evidence ?? []), factEvidence(fact, "sql_parse", table)]);
        nodes.set(key, tableNode);
        addEdge({ type: "QUERY_READS_TABLE", from: queryNode, to: tableNode, fact, reason: "Visible SQL table reference is statically recoverable.", evidenceKind: "sql_parse", resolver: { name: "fact-extractor", version: "v0.1" } });
      }
      const datasource = typeof fact.attributes?.datasource === "string" && fact.attributes.datasource.trim() !== "" ? fact.attributes.datasource.trim() : null;
      if (datasource) {
        const datasourceSpec = { kind: "DATASOURCE", name: datasource, canonicalName: datasource };
        const key = `${datasourceSpec.kind}\0${datasourceSpec.canonicalName}`;
        const datasourceNode = nodes.get(key) ?? { ...datasourceSpec, id: nodeId(datasourceSpec.kind, "", datasourceSpec.canonicalName), sourceFact: fact, evidence: [] };
        datasourceNode.evidence = sortEvidence([...(datasourceNode.evidence ?? []), factEvidence(fact, "sql_parse", datasource)]);
        nodes.set(key, datasourceNode);
        addEdge({ type: "QUERY_USES_DATASOURCE", from: queryNode, to: datasourceNode, fact, reason: "Literal datasource is statically recoverable.", evidenceKind: "sql_parse", resolver: { name: "fact-extractor", version: "v0.1" } });
      }
    }
    if (relationForFact(fact) && !resolvedFactIds.has(fact.fact_id) && !resolverUnresolvedFactIds.has(fact.fact_id)) addUnresolved({ relation_type: relationForFact(fact), reason: "UNSUPPORTED_SYNTAX", normalized_expression: fact.normalized_expression, span: fact.span }, fact);
    if (fact.kind === "DYNAMIC_REFERENCE" && !resolverUnresolvedFactIds.has(fact.fact_id)) addUnresolved({ relation_type: unresolvedRelationForFact(fact), reason: fact.attributes?.unresolved_reason ?? "DYNAMIC_EXPRESSION", normalized_expression: fact.normalized_expression, span: fact.span }, fact);
    if (fact.kind === "QUERY") {
      const dynamicTables = Array.isArray(fact.attributes?.dynamic_tables) ? fact.attributes.dynamic_tables : [];
      for (const identifier of dynamicTables) addUnresolved({ relation_type: "QUERY_READS_TABLE", reason: "SQL_DYNAMIC_IDENTIFIER", normalized_expression: identifier, span: fact.span }, fact);
      if (fact.attributes?.dynamic_sql === true && dynamicTables.length === 0) addUnresolved({ relation_type: "QUERY_READS_TABLE", reason: "DYNAMIC_EXPRESSION", normalized_expression: fact.attributes?.sql_expression ?? fact.normalized_expression, span: fact.span }, fact);
      if (fact.attributes?.datasource_dynamic === true) addUnresolved({ relation_type: "QUERY_USES_DATASOURCE", reason: "DYNAMIC_EXPRESSION", normalized_expression: fact.attributes?.datasource_expression ?? fact.normalized_expression, span: fact.span }, fact);
    }
    if ((fact.kind === "INSTANTIATE" || fact.kind === "INVOKE" || fact.kind === "MAPPING") && !resolvedFactIds.has(fact.fact_id) && !resolverUnresolvedFactIds.has(fact.fact_id)) addUnresolved({ relation_type: unresolvedRelationForFact(fact), reason: "MAPPING_UNKNOWN", normalized_expression: fact.normalized_expression, span: fact.span }, fact);
    if (fact.kind === "COMPONENT") {
      const extendsName = fact.attributes?.extends;
      if (typeof extendsName === "string" && extendsName !== "") addUnresolved({ relation_type: "EXTENDS", reason: "MAPPING_UNKNOWN", normalized_expression: extendsName, span: fact.span }, fact);
      for (const implementsName of Array.isArray(fact.attributes?.implements) ? fact.attributes.implements : []) addUnresolved({ relation_type: "IMPLEMENTS", reason: "MAPPING_UNKNOWN", normalized_expression: implementsName, span: fact.span }, fact);
    }
  }

  const graphNodes = [...nodes.values()].map((entry) => {
    const fact = entry.sourceFact;
    const fingerprint = fingerprints.get(fact.file) ?? "sha256:unknown";
    return {
      id: entry.id,
      kind: entry.kind,
      name: String(entry.name).slice(0, 4096),
      canonical_name: String(entry.canonicalName).slice(0, 4096),
      ...(entry.path ? { path: entry.path } : {}),
      ...(entry.symbol ? { symbol: entry.symbol } : {}),
      language: fact.language ?? "unknown",
      evidence: sortEvidence(entry.evidence ?? [factEvidence(fact)]),
      attributes: cloneJson(fact.attributes ?? {}),
      fingerprint,
    };
  }).sort((left, right) => compareStrings(left.id, right.id));
  const graphEdges = [...edges.values()].sort((left, right) => compareStrings([left.from, left.type, left.to, left.id].join("\0"), [right.from, right.type, right.to, right.id].join("\0")));
  const graphUnresolved = [...unresolved.values()].sort((left, right) => compareStrings([left.source_node, left.relation_type, left.span.start_line, left.span.start_col, left.id].join("\0"), [right.source_node, right.relation_type, right.span.start_line, right.span.start_col, right.id].join("\0")));
  const diagnostics = [
    ...(factBundle.diagnostics ?? []).map((item) => ({ ...item })),
    ...(resolutions?.diagnostics ?? []).map((item, index) => ({ id: `diagnostic:${sha256([item.file, item.code, item.message, index].join("\0"))}`, severity: item.severity ?? "error", code: item.code, message: item.message })),
  ];
  const draft = {
    schema_version: GRAPH_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: toolVersion },
    project: { root_id: `root:${sha256(["v0.1", "root", rootGuard.rootPath].join("\0"))}`, root_name: path.basename(rootGuard.rootPath) || "project" },
    snapshot: { created_at: createdAt, source_fingerprint: snapshot?.source_fingerprint ?? factBundle.source_fingerprint ?? "sha256:unknown", file_count: snapshot?.file_count ?? factBundle.source_files.length },
    capabilities: {
      supported_languages: [...new Set(factBundle.source_files.map((file) => file.language ?? "unknown"))].filter((language) => SUPPORTED_LANGUAGES.includes(language)).sort(compareStrings),
      node_kinds: [...new Set(graphNodes.map((node) => node.kind))].sort(compareStrings),
      edge_types: [...new Set(graphEdges.map((edge) => edge.type))].sort(compareStrings),
      resolvers: ["cfc-resolver/v0.1", "literal-path-resolver/v0.1", "repository-resolver/v0.1", "scope-resolver/v0.1", "web-flow-resolver/v0.1"],
    },
    complete: factBundle.complete === true && resolutions !== null && resolutions.complete === true,
    nodes: graphNodes,
    edges: graphEdges,
    unresolved: graphUnresolved,
    diagnostics,
    stats: {
      file_count: snapshot?.file_count ?? factBundle.source_files.length,
      node_count: graphNodes.length,
      edge_count: graphEdges.length,
      unresolved_count: graphUnresolved.length,
      diagnostic_count: diagnostics.length,
      evidence_count: graphNodes.reduce((count, node) => count + node.evidence.length, 0) + graphEdges.reduce((count, edge) => count + edge.evidence.length, 0) + graphUnresolved.reduce((count, item) => count + item.evidence.length, 0),
    },
  };
  enforceEdgeLimit(draft, edgeLimit);
  enforceEvidenceLimit(draft, evidenceLimit);
  const validationDiagnostics = validateGraph(draft);
  for (const [index, item] of validationDiagnostics.entries()) diagnostics.push({ id: `diagnostic:${sha256([item.code, item.message, index].join("\0"))}`, ...item });
  diagnostics.sort((left, right) => compareStrings([left.severity === "info" ? 0 : left.severity === "warning" ? 1 : 2, left.code, left.id].join("\0"), [right.severity === "info" ? 0 : right.severity === "warning" ? 1 : 2, right.code, right.id].join("\0")));
  draft.diagnostics = diagnostics;
  draft.complete = draft.complete && validationDiagnostics.length === 0;
  draft.stats.diagnostic_count = diagnostics.length;
  return draft;
}

export function buildReverseAdjacency(graph) {
  if (!graph || !Array.isArray(graph.nodes) || !Array.isArray(graph.edges)) throw new TypeError("graph with nodes and edges is required");
  const incoming = Object.create(null);
  const outgoing = Object.create(null);
  for (const node of graph.nodes) {
    incoming[node.id] = [];
    outgoing[node.id] = [];
  }
  for (const edge of graph.edges) {
    if (!incoming[edge.to] || !outgoing[edge.from]) throw new Error(`Graph edge endpoint is missing: ${edge.id}.`);
    incoming[edge.to].push(edge.id);
    outgoing[edge.from].push(edge.id);
  }
  for (const values of Object.values(incoming)) values.sort(compareStrings);
  for (const values of Object.values(outgoing)) values.sort(compareStrings);
  for (const [key, values] of Object.entries(incoming)) incoming[key] = Object.freeze(values);
  for (const [key, values] of Object.entries(outgoing)) outgoing[key] = Object.freeze(values);
  return Object.freeze({ incoming: Object.freeze(incoming), outgoing: Object.freeze(outgoing) });
}

export { validateGraph };
