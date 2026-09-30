import crypto from "node:crypto";

const RESOLUTION_SCHEMA_VERSION = "agent-cfml-linkage-repository-resolution/v0.1";
const RESOLVER = Object.freeze({ name: "repository-resolver", version: "v0.1" });
const DEFAULT_MAX_RECORDS = 100_000;

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

function makeResolution({ sourceFact, actionFact, methodFact, queryFactIds }) {
  const identity = [RESOLVER.version, sourceFact.fact_id, actionFact.fact_id, "structural-repository-action"].join("\0");
  return {
    resolution_id: `resolution:${hash(identity.split("\0"))}`,
    source_fact_id: sourceFact.fact_id,
    relation_type: "CALLS_REPOSITORY",
    from_file: sourceFact.file,
    to_file: actionFact.file,
    to_fact_id: actionFact.fact_id,
    span: sourceFact.span,
    normalized_expression: sourceFact.normalized_expression,
    confidence: "confirmed",
    resolver: RESOLVER,
    resolution_kind: "structural-repository-action",
    method_fact_id: methodFact.fact_id,
    query_fact_ids: [...queryFactIds].sort(compareStrings),
    repository_action: actionFact.attributes?.action_name ?? actionFact.normalized_expression,
  };
}

/**
 * Resolve repository/action calls only when a unique CFC method resolution
 * points to a Fact explicitly produced from that method containing a query.
 * Naming conventions, filenames, and runtime execution are never used.
 */
export function resolveRepositoryLinks({ factBundle, cfcResolution, maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  if (!factBundle || !Array.isArray(factBundle.facts)) throw new TypeError("factBundle with facts is required");
  if (!cfcResolution || !Array.isArray(cfcResolution.resolutions)) throw new TypeError("cfcResolution with resolutions is required");
  if (!Number.isSafeInteger(maxRecords) || maxRecords <= 0) throw new TypeError("maxRecords must be a positive safe integer");

  const facts = factBundle.facts.slice().sort(compareFacts);
  const factById = new Map(facts.map((fact) => [fact.fact_id, fact]));
  const actionsByMethodId = new Map();
  for (const action of facts.filter((fact) => fact.kind === "REPOSITORY_ACTION")) {
    const methodFactId = action.attributes?.method_fact_id;
    if (typeof methodFactId !== "string" || methodFactId === "") continue;
    const actions = actionsByMethodId.get(methodFactId) ?? [];
    actions.push(action);
    actionsByMethodId.set(methodFactId, actions);
  }
  for (const actions of actionsByMethodId.values()) actions.sort(compareFacts);

  const resolutions = [];
  const diagnostics = [];
  const seen = new Set();
  const methodCalls = cfcResolution.resolutions
    .filter((item) => item?.relation_type === "CALLS_METHOD")
    .slice()
    .sort((left, right) => compareStrings([left.source_fact_id, left.to_fact_id, left.resolution_id].join("\0"), [right.source_fact_id, right.to_fact_id, right.resolution_id].join("\0")));

  for (const methodCall of methodCalls) {
    const sourceFact = factById.get(methodCall.source_fact_id);
    const methodFact = factById.get(methodCall.to_fact_id);
    const actions = actionsByMethodId.get(methodCall.to_fact_id) ?? [];
    if (!sourceFact || methodFact?.kind !== "METHOD" || actions.length !== 1) continue;
    const actionFact = actions[0];
    const queryFactIds = Array.isArray(actionFact.attributes?.query_fact_ids) ? [...new Set(actionFact.attributes.query_fact_ids)].filter((factId) => typeof factId === "string") : [];
    if (actionFact.file !== methodFact.file || queryFactIds.length === 0 || !queryFactIds.every((factId) => factById.get(factId)?.kind === "QUERY" && factById.get(factId)?.file === methodFact.file)) continue;
    const resolution = makeResolution({
      sourceFact,
      actionFact,
      methodFact,
      queryFactIds,
    });
    if (seen.has(resolution.resolution_id)) continue;
    if (resolutions.length >= maxRecords) {
      diagnostics.push({ code: "REPOSITORY_RESOURCE_LIMIT", severity: "error", message: `Repository resolver record limit exceeded: ${maxRecords}.` });
      break;
    }
    seen.add(resolution.resolution_id);
    resolutions.push(resolution);
  }

  resolutions.sort((left, right) => compareStrings([left.from_file, left.relation_type, left.to_file, left.resolution_id].join("\0"), [right.from_file, right.relation_type, right.to_file, right.resolution_id].join("\0")));
  diagnostics.sort((left, right) => compareStrings([left.code, left.message].join("\0"), [right.code, right.message].join("\0")));
  return {
    schema_version: RESOLUTION_SCHEMA_VERSION,
    resolver: RESOLVER,
    complete: factBundle.complete === true && cfcResolution.complete === true && diagnostics.length === 0,
    resolutions,
    unresolved: [],
    diagnostics,
    stats: {
      source_file_count: factBundle.source_files?.length ?? 0,
      input_fact_count: facts.length,
      resolution_count: resolutions.length,
      unresolved_count: 0,
      diagnostic_count: diagnostics.length,
    },
  };
}
