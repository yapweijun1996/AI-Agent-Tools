import crypto from "node:crypto";

const RESOLUTION_SCHEMA_VERSION = "agent-cfml-linkage-scope-resolution/v0.1";
const RESOLVER = Object.freeze({ name: "scope-resolver", version: "v0.1" });
const DEFAULT_MAX_EVENTS = 100_000;
const DEFAULT_MAX_DEPTH = 256;
const DEFAULT_MAX_RECORDS = 500_000;
const SCOPE_RELATIONS = Object.freeze({
  PRODUCES: "SCOPE_PRODUCES",
  CONSUMES: "SCOPE_CONSUMES",
  OVERRIDES: "SCOPE_OVERRIDES",
});

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function spanKey(value) {
  const span = value?.span ?? {};
  return [span.start_line ?? 0, span.start_col ?? 0, span.end_line ?? 0, span.end_col ?? 0, value.fact_id ?? ""].join("\0");
}

function compareFacts(left, right) {
  return compareStrings([left.file ?? "", spanKey(left), left.kind ?? ""].join("\0"), [right.file ?? "", spanKey(right), right.kind ?? ""].join("\0"));
}

function hash(values) {
  return crypto.createHash("sha256").update(values.join("\0"), "utf8").digest("hex");
}

function normalizeName(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function makeResolution({ fact, relationType, targetFact, scopeName, contextFile, order, resolutionKind, confidence }) {
  const identity = [RESOLVER.version, fact.fact_id, relationType, targetFact.fact_id, contextFile, order, resolutionKind].join("\0");
  return {
    resolution_id: `resolution:${hash(identity.split("\0"))}`,
    source_fact_id: fact.fact_id,
    relation_type: relationType,
    from_file: fact.file,
    to_file: targetFact.file,
    to_fact_id: targetFact.fact_id,
    span: fact.span,
    normalized_expression: `scope ${scopeName}`,
    confidence,
    resolver: RESOLVER,
    resolution_kind: resolutionKind,
    order,
    scope_name: scopeName,
    context_file: contextFile,
  };
}

function makeUnresolved({ fact, relationType, scopeName, candidates = [], reason = "MAPPING_UNKNOWN" }) {
  const normalizedCandidates = [...new Set(candidates)].sort(compareStrings);
  const identity = [fact.fact_id, relationType, scopeName, reason, ...normalizedCandidates].join("\0");
  return {
    unresolved_id: `unresolved:${hash(identity.split("\0"))}`,
    source_fact_id: fact.fact_id,
    relation_type: relationType,
    file: fact.file,
    span: fact.span,
    normalized_expression: `scope ${scopeName}`,
    reason,
    candidates: normalizedCandidates,
    scope_name: scopeName,
  };
}

function eventKey(event) {
  return [event.fact?.file ?? event.file ?? "", spanKey(event.fact ?? event), event.type ?? ""].join("\0");
}

function staticScopeFacts(facts) {
  return facts.filter((fact) => fact.kind === "SCOPE_WRITE" || fact.kind === "CONDITION").sort(compareFacts);
}

function scopeNameForWrite(fact) {
  return normalizeName(fact.attributes?.target) ?? normalizeName(fact.normalized_expression);
}

function referencesForFact(fact) {
  if (fact.kind === "SCOPE_WRITE") return Array.isArray(fact.attributes?.references) ? fact.attributes.references.map(normalizeName).filter(Boolean).sort(compareStrings) : [];
  if (fact.kind === "CONDITION") return Array.isArray(fact.condition?.variables) ? fact.condition.variables.map(normalizeName).filter(Boolean).sort(compareStrings) : [];
  return [];
}

function writeFactsByName(facts) {
  const output = new Map();
  for (const fact of facts.filter((item) => item.kind === "SCOPE_WRITE")) {
    const name = scopeNameForWrite(fact);
    if (!name) continue;
    if (!output.has(name)) output.set(name, []);
    output.get(name).push(fact);
  }
  for (const values of output.values()) values.sort(compareFacts);
  return output;
}

function includeEvents(facts, resolutions) {
  const factById = new Map(facts.map((fact) => [fact.fact_id, fact]));
  const events = new Map();
  for (const fact of facts) events.set(fact.file, []);
  for (const fact of staticScopeFacts(facts)) events.get(fact.file)?.push({ type: "fact", fact });
  for (const resolution of resolutions?.resolutions ?? []) {
    if (resolution.relation_type !== "INCLUDES") continue;
    const fact = factById.get(resolution.source_fact_id);
    if (!fact || !events.has(resolution.from_file) || typeof resolution.to_file !== "string") continue;
    events.get(resolution.from_file).push({ type: "include", fact, toFile: resolution.to_file });
  }
  for (const values of events.values()) values.sort((left, right) => compareStrings(eventKey(left), eventKey(right)));
  return events;
}

function visibleEvents(file, events, stack = [], budget, depth = 0) {
  if (stack.includes(file)) return { values: [], cycle: true, limited: false };
  if (depth > budget.maxDepth) {
    budget.depthLimit = true;
    return { values: [], cycle: false, limited: true };
  }
  const output = [];
  let cycle = false;
  let limited = false;
  for (const event of events.get(file) ?? []) {
    if (budget.events >= budget.maxEvents) {
      limited = true;
      budget.eventLimit = true;
      break;
    }
    if (event.type === "fact") {
      output.push({ ...event, contextFile: file });
      budget.events += 1;
    } else {
      budget.events += 1;
      const nested = visibleEvents(event.toFile, events, [...stack, file], budget, depth + 1);
      cycle ||= nested.cycle;
      limited ||= nested.limited;
      for (const value of nested.values) output.push({ ...value, contextFile: file, includeFrom: file });
      if (limited) break;
    }
  }
  return { values: output, cycle, limited };
}

/**
 * Resolve bounded shared-scope relationships from ordered literal includes
 * and statically recovered scope names. No CFML expressions are evaluated.
 */
export function resolveScopeLinks({ factBundle, resolutions = null, indexes = null, maxEvents = DEFAULT_MAX_EVENTS, maxDepth = DEFAULT_MAX_DEPTH, maxRecords = DEFAULT_MAX_RECORDS } = {}) {
  if (!factBundle || !Array.isArray(factBundle.facts) || !Array.isArray(factBundle.source_files)) throw new TypeError("factBundle with facts and source_files is required");
  if (indexes && !indexes.factByFile) throw new TypeError("project indexes must include factByFile");
  if (!Number.isSafeInteger(maxEvents) || maxEvents <= 0) throw new TypeError("maxEvents must be a positive safe integer");
  if (!Number.isSafeInteger(maxDepth) || maxDepth <= 0) throw new TypeError("maxDepth must be a positive safe integer");
  if (!Number.isSafeInteger(maxRecords) || maxRecords <= 0) throw new TypeError("maxRecords must be a positive safe integer");

  const facts = factBundle.facts.slice().sort(compareFacts);
  const writesByName = writeFactsByName(facts);
  const events = includeEvents(facts, resolutions);
  const resolutionsOut = [];
  const unresolved = [];
  const diagnostics = [];
  const produced = new Set();
  const consumed = new Set();
  const overrides = new Set();
  const unresolvedKeys = new Set();
  let complete = factBundle.complete === true && (resolutions === null || resolutions.complete === true);
  const budget = { events: 0, maxEvents, maxDepth, records: 0, maxRecords, eventLimit: false, depthLimit: false, recordLimit: false };
  const addResolution = (value) => {
    if (budget.records >= budget.maxRecords) {
      budget.recordLimit = true;
      complete = false;
      return false;
    }
    resolutionsOut.push(value);
    budget.records += 1;
    return true;
  };
  const addUnresolved = (value) => {
    if (budget.records >= budget.maxRecords) {
      budget.recordLimit = true;
      complete = false;
      return false;
    }
    unresolved.push(value);
    budget.records += 1;
    return true;
  };

  const includeFacts = facts.filter((fact) => fact.kind === "INCLUDE");
  const resolvedIncludeIds = new Set((resolutions?.resolutions ?? []).filter((item) => item.relation_type === "INCLUDES").map((item) => item.source_fact_id));
  const unresolvedIncludeIds = new Set((resolutions?.unresolved ?? []).filter((item) => item.relation_type === "INCLUDES").map((item) => item.source_fact_id));
  if (includeFacts.some((fact) => !resolvedIncludeIds.has(fact.fact_id))) {
    complete = false;
    for (const fact of includeFacts.filter((item) => !resolvedIncludeIds.has(item.fact_id) && !unresolvedIncludeIds.has(item.fact_id))) diagnostics.push({ code: "SCOPE_INCLUDE_RESOLUTION_MISSING", severity: "error", file: fact.file, message: "Scope flow requires a bounded include resolution for this include fact." });
  }

  const contextFiles = [...events.keys()].sort(compareStrings);
  for (let contextIndex = 0; contextIndex < contextFiles.length; contextIndex += 1) {
    const contextFile = contextFiles[contextIndex];
    if (budget.events >= budget.maxEvents) {
      if (contextFiles.slice(contextIndex).some((file) => (events.get(file) ?? []).length > 0)) {
        budget.eventLimit = true;
        complete = false;
      }
      break;
    }
    const visible = visibleEvents(contextFile, events, [], budget);
    if (visible.limited) complete = false;
    if (visible.cycle) {
      complete = false;
      diagnostics.push({ code: "SCOPE_INCLUDE_CYCLE", severity: "warning", file: contextFile, message: "Include cycle prevents complete ordered scope expansion." });
    }
    const previousByName = new Map();
    let order = 0;
    for (const event of visible.values) {
      if (budget.recordLimit) break;
      const fact = event.fact;
      const name = fact.kind === "SCOPE_WRITE" ? scopeNameForWrite(fact) : null;
      if (name && fact.kind === "SCOPE_WRITE") {
        const produceKey = `${fact.fact_id}\0${name}`;
        if (!produced.has(produceKey)) {
          addResolution(makeResolution({ fact, relationType: SCOPE_RELATIONS.PRODUCES, targetFact: fact, scopeName: name, contextFile, order, resolutionKind: "ordered-scope-produce", confidence: "confirmed" }));
          produced.add(produceKey);
        }
        const previous = previousByName.get(name);
        if (previous && previous.fact_id !== fact.fact_id) {
          const overrideKey = `${fact.fact_id}\0${previous.fact_id}\0${name}`;
          if (!overrides.has(overrideKey)) {
            addResolution(makeResolution({ fact, relationType: SCOPE_RELATIONS.OVERRIDES, targetFact: previous, scopeName: name, contextFile, order, resolutionKind: "ordered-scope-override", confidence: "strong" }));
            overrides.add(overrideKey);
          }
        }
        previousByName.set(name, fact);
      }
      for (const reference of referencesForFact(fact)) {
        const producer = previousByName.get(reference);
        if (producer) {
          const consumeKey = `${fact.fact_id}\0${producer.fact_id}\0${reference}`;
          if (!consumed.has(consumeKey)) {
            addResolution(makeResolution({ fact, relationType: SCOPE_RELATIONS.CONSUMES, targetFact: producer, scopeName: reference, contextFile, order, resolutionKind: "ordered-scope-consume", confidence: "strong" }));
            consumed.add(consumeKey);
          }
        } else {
          const candidates = (writesByName.get(reference) ?? []).filter((candidate) => candidate.fact_id !== fact.fact_id).map((candidate) => candidate.fact_id);
          const unresolvedKey = `${fact.fact_id}\0${reference}`;
          if (!unresolvedKeys.has(unresolvedKey)) {
            addUnresolved(makeUnresolved({ fact, relationType: SCOPE_RELATIONS.CONSUMES, scopeName: reference, candidates }));
            unresolvedKeys.add(unresolvedKey);
          }
        }
      }
      order += 1;
    }
  }

  for (const fact of facts.filter((item) => item.kind === "DYNAMIC_REFERENCE" && item.attributes?.source_kind === "SCOPE_WRITE")) addUnresolved(makeUnresolved({ fact, relationType: SCOPE_RELATIONS.PRODUCES, scopeName: fact.normalized_expression, reason: fact.attributes?.unresolved_reason ?? "DYNAMIC_EXPRESSION" }));
  if (budget.eventLimit || budget.depthLimit || budget.recordLimit) {
    const limit = budget.eventLimit ? "events" : budget.depthLimit ? "include depth" : "records";
    diagnostics.push({ code: "SCOPE_RESOURCE_LIMIT", severity: "error", message: `Scope resolver limit exceeded: ${limit}.` });
  }

  resolutionsOut.sort((left, right) => compareStrings([left.from_file, left.relation_type, left.to_file, left.to_fact_id, left.resolution_id].join("\0"), [right.from_file, right.relation_type, right.to_file, right.to_fact_id, right.resolution_id].join("\0")));
  unresolved.sort((left, right) => compareStrings([left.file, left.relation_type, left.span?.start_line ?? 0, left.span?.start_col ?? 0, left.unresolved_id].join("\0"), [right.file, right.relation_type, right.span?.start_line ?? 0, right.span?.start_col ?? 0, right.unresolved_id].join("\0")));
  diagnostics.sort((left, right) => compareStrings([left.file ?? "", left.code, left.message].join("\0"), [right.file ?? "", right.code, right.message].join("\0")));
  return {
    schema_version: RESOLUTION_SCHEMA_VERSION,
    resolver: RESOLVER,
    complete,
    resolutions: resolutionsOut,
    unresolved,
    diagnostics,
    stats: {
      source_file_count: factBundle.source_files.length,
      input_fact_count: facts.length,
      resolution_count: resolutionsOut.length,
      unresolved_count: unresolved.length,
      diagnostic_count: diagnostics.length,
    },
  };
}
