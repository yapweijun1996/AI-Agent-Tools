import crypto from "node:crypto";

const RESOLUTION_SCHEMA_VERSION = "agent-cfml-linkage-web-flow-resolution/v0.1";
const RESOLVER = Object.freeze({ name: "web-flow-resolver", version: "v0.1" });
const DEFAULT_MAX_RECORDS = 100_000;
const WEB_FLOW_RELATIONS = Object.freeze({ FORM: "FORM_SUBMITS_TO", REDIRECT: "REDIRECTS_TO", AJAX: "AJAX_CALLS", FETCH: "FETCHES" });

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function factSortKey(fact) {
  const span = fact.span ?? {};
  return [fact.file ?? "", span.start_line ?? 0, span.start_col ?? 0, span.end_line ?? 0, span.end_col ?? 0, fact.kind ?? "", fact.fact_id ?? ""].join("\0");
}

function compareFacts(left, right) {
  return compareStrings(factSortKey(left), factSortKey(right));
}

function hash(values) {
  return crypto.createHash("sha256").update(values.join("\0"), "utf8").digest("hex");
}

function spanKey(span) {
  if (!span) return null;
  return [span.start_line, span.start_col, span.end_line, span.end_col].join("\0");
}

function conditionCandidates(flowFact, conditionFacts) {
  const sourceSpan = flowFact.condition?.source_span;
  const key = spanKey(sourceSpan);
  if (!key) return [];
  return conditionFacts.filter((fact) => fact.file === flowFact.file && spanKey(fact.span) === key);
}

function flowKind(fact) {
  if (WEB_FLOW_RELATIONS[fact.kind]) return fact.kind;
  if (fact.kind === "DYNAMIC_REFERENCE" && WEB_FLOW_RELATIONS[fact.attributes?.source_kind]) return fact.attributes.source_kind;
  return null;
}

function pathTarget(flowFact, resolutions) {
  const relationType = WEB_FLOW_RELATIONS[flowKind(flowFact)];
  const targets = [...new Set((resolutions?.resolutions ?? []).filter((item) => item.source_fact_id === flowFact.fact_id && item.relation_type === relationType && typeof item.to_file === "string").map((item) => item.to_file))].sort(compareStrings);
  return targets.length === 1 ? targets[0] : null;
}

function makeResolution({ conditionFact, flowFact, targetFile }) {
  const condition = flowFact.condition;
  const kind = flowKind(flowFact);
  const identity = [RESOLVER.version, conditionFact.fact_id, flowFact.fact_id, kind, targetFile, condition.expression_normalized].join("\0");
  return {
    resolution_id: `resolution:${hash(identity.split("\0"))}`,
    source_fact_id: conditionFact.fact_id,
    relation_type: "ROUTES_WHEN",
    from_file: conditionFact.file,
    to_file: targetFile,
    span: conditionFact.span,
    normalized_expression: condition.expression_normalized,
    confidence: "confirmed",
    resolver: RESOLVER,
    resolution_kind: "explicit-condition",
    source_node_kind: "fact",
    attributes: {
      branch_kind: condition.branch_kind,
      evaluation: condition.evaluation,
      flow_kind: kind,
      source_flow_fact_id: flowFact.fact_id,
      source_fact_ids: [flowFact.fact_id],
    },
  };
}

function pathUnresolved(flowFact, resolutions) {
  const relationType = WEB_FLOW_RELATIONS[flowKind(flowFact)];
  return (resolutions?.unresolved ?? []).find((item) => item.source_fact_id === flowFact.fact_id && item.relation_type === relationType) ?? null;
}

function makeUnresolved({ flowFact, candidates = [], reason = "MAPPING_UNKNOWN" }) {
  const expression = flowFact.condition?.expression_normalized ?? "condition";
  const kind = flowKind(flowFact);
  const normalizedCandidates = [...new Set(candidates.map((value) => typeof value === "string" ? value : value.fact_id))].sort(compareStrings);
  const identity = [flowFact.fact_id, "ROUTES_WHEN", kind, expression, reason, ...normalizedCandidates].join("\0");
  return {
    unresolved_id: `unresolved:${hash(identity.split("\0"))}`,
    source_fact_id: flowFact.fact_id,
    relation_type: "ROUTES_WHEN",
    file: flowFact.file,
    span: flowFact.span,
    normalized_expression: `${kind ?? flowFact.kind} under ${expression}`,
    reason,
    candidates: normalizedCandidates,
  };
}

/**
 * Resolve only explicit condition containment for statically extracted web
 * flow facts. Existing path resolutions remain owned by the path resolver.
 * No URL, JavaScript, browser, or CFML expression is evaluated.
 */
export function resolveWebFlowLinks({ factBundle, resolutions = null, maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  if (!factBundle || !Array.isArray(factBundle.facts) || !Array.isArray(factBundle.source_files)) throw new TypeError("factBundle with facts and source_files is required");
  if (!Number.isSafeInteger(maxRecords) || maxRecords <= 0) throw new TypeError("maxRecords must be a positive safe integer");

  const facts = factBundle.facts.slice().sort(compareFacts);
  const conditionFacts = facts.filter((fact) => fact.kind === "CONDITION");
  const flowFacts = facts.filter((fact) => flowKind(fact) !== null && fact.condition !== null);
  const output = [];
  const unresolved = [];
  const diagnostics = [];
  let complete = factBundle.complete === true && (resolutions === null || resolutions.complete === true);
  let limitReached = false;

  for (const flowFact of flowFacts) {
    const candidates = conditionCandidates(flowFact, conditionFacts);
    const targetFile = pathTarget(flowFact, resolutions);
    if (candidates.length === 1 && targetFile !== null) {
      if (output.length + unresolved.length >= maxRecords) {
        limitReached = true;
        complete = false;
        break;
      }
      output.push(makeResolution({ conditionFact: candidates[0], flowFact, targetFile }));
    } else {
      complete = false;
      if (output.length + unresolved.length >= maxRecords) {
        limitReached = true;
        break;
      }
      const pathFailure = pathUnresolved(flowFact, resolutions);
      const reason = pathFailure?.reason ?? (flowFact.kind === "DYNAMIC_REFERENCE" ? flowFact.attributes?.unresolved_reason ?? "DYNAMIC_EXPRESSION" : resolutions === null ? "MAPPING_UNKNOWN" : "PATH_NOT_FOUND");
      const candidateIds = candidates.length === 1 ? pathFailure?.candidates ?? [] : candidates;
      unresolved.push(makeUnresolved({ flowFact, candidates: candidateIds, reason }));
    }
  }

  if (limitReached) diagnostics.push({ code: "WEB_FLOW_RESOURCE_LIMIT", severity: "error", message: `Web-flow resolver record limit exceeded: ${maxRecords}.` });
  output.sort((left, right) => compareStrings([left.from_file, left.to_file, left.relation_type, left.source_fact_id, left.to_fact_id, left.resolution_id].join("\0"), [right.from_file, right.to_file, right.relation_type, right.source_fact_id, right.to_fact_id, right.resolution_id].join("\0")));
  unresolved.sort((left, right) => compareStrings([left.file, left.relation_type, left.span?.start_line ?? 0, left.span?.start_col ?? 0, left.unresolved_id].join("\0"), [right.file, right.relation_type, right.span?.start_line ?? 0, right.span?.start_col ?? 0, right.unresolved_id].join("\0")));
  return {
    schema_version: RESOLUTION_SCHEMA_VERSION,
    resolver: RESOLVER,
    complete,
    resolutions: output,
    unresolved,
    diagnostics,
    stats: {
      source_file_count: factBundle.source_files.length,
      input_fact_count: facts.length,
      resolution_count: output.length,
      unresolved_count: unresolved.length,
      diagnostic_count: diagnostics.length,
    },
  };
}
