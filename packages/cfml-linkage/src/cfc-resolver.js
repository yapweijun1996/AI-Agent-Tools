import crypto from "node:crypto";

const RESOLUTION_SCHEMA_VERSION = "agent-cfml-linkage-cfc-resolution/v0.1";
const RESOLVER = Object.freeze({ name: "cfc-resolver", version: "v0.1" });
const COMPONENT_RELATIONS = Object.freeze({
  EXTENDS: "EXTENDS",
  IMPLEMENTS: "IMPLEMENTS",
  INSTANTIATE: "INSTANTIATES",
  INVOKE: "CFINVOKES",
  METHOD: "CALLS_METHOD",
});

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function factSortKey(fact) {
  const span = fact.span ?? {};
  return [fact.file ?? "", span.start_line ?? 0, span.start_col ?? 0, fact.kind ?? "", fact.fact_id ?? ""].join("\0");
}

function compareFacts(left, right) {
  return compareStrings(factSortKey(left), factSortKey(right));
}

function hash(values) {
  return crypto.createHash("sha256").update(values.join("\0"), "utf8").digest("hex");
}

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function attribute(fact, name) {
  return text(fact.attributes?.[name]);
}

function candidateIds(values) {
  return values.map((fact) => fact.fact_id).sort(compareStrings);
}

function makeResolution({ fact, relationType, targetFact, expression, confidence, resolutionKind, details = {}, sourceNodeKind = null }) {
  const identity = [RESOLVER.version, fact.fact_id, relationType, targetFact.fact_id, resolutionKind].join("\0");
  return {
    resolution_id: `resolution:${hash(identity.split("\0"))}`,
    source_fact_id: fact.fact_id,
    relation_type: relationType,
    from_file: fact.file,
    to_file: targetFact.file,
    to_fact_id: targetFact.fact_id,
    ...(sourceNodeKind ? { source_node_kind: sourceNodeKind } : {}),
    span: fact.span,
    normalized_expression: expression,
    confidence,
    resolver: RESOLVER,
    resolution_kind: resolutionKind,
    ...details,
  };
}

function makeUnresolved({ fact, relationType, expression, reason, candidates = [], details = {} }) {
  const normalizedCandidates = [...new Set(candidates)].sort(compareStrings);
  const identity = [fact.fact_id, relationType, reason, expression, ...normalizedCandidates].join("\0");
  return {
    unresolved_id: `unresolved:${hash(identity.split("\0"))}`,
    source_fact_id: fact.fact_id,
    relation_type: relationType,
    file: fact.file,
    span: fact.span,
    normalized_expression: expression,
    reason,
    candidates: normalizedCandidates,
    ...details,
  };
}

function uniqueFacts(values) {
  const byId = new Map();
  for (const value of values) byId.set(value.fact_id, value);
  return [...byId.values()].sort(compareFacts);
}

function mappingFacts(indexes, configuredMappings = {}) {
  const values = [];
  for (const facts of Object.values(indexes.mappingIndex ?? {})) values.push(...facts);
  const configured = configuredMappings && typeof configuredMappings === "object" && !Array.isArray(configuredMappings)
    ? Object.entries(configuredMappings).map(([prefix, mappingPath]) => ({
      attributes: { prefix, path: mappingPath },
      file: "<configuration>",
      fact_id: `config-mapping:${hash([prefix, mappingPath])}`,
      kind: "MAPPING",
      normalized_expression: `${prefix}=${mappingPath}`,
      span: { start_line: 0, start_col: 0, end_line: 0, end_col: 0 },
    }))
    : [];
  return uniqueFacts([...values, ...configured]);
}

function componentCandidates(indexes, name, mappings) {
  const direct = [...(indexes.componentIndex?.[name] ?? [])];
  const aliases = [];
  for (const mapping of mappings) {
    const mappingPath = attribute(mapping, "path");
    const prefix = attribute(mapping, "prefix");
    if (!mappingPath || !prefix || (name !== prefix && !name.startsWith(`${prefix}.`))) continue;
    const remainder = name === prefix ? "" : name.slice(prefix.length + 1);
    const translated = remainder ? `${mappingPath}.${remainder}` : mappingPath;
    aliases.push(...(indexes.componentIndex?.[translated] ?? []));
  }
  return uniqueFacts([...direct, ...aliases]);
}

function methodCandidates(indexes, component, methodName) {
  const componentName = attribute(component, "component_name");
  if (!componentName) return [];
  return uniqueFacts(indexes.methodIndex?.[`${componentName}.${methodName}`] ?? []);
}

function resolveComponent({ indexes, mappings, name }) {
  const candidates = componentCandidates(indexes, name, mappings);
  if (candidates.length === 1) return { state: "unique", fact: candidates[0], resolutionKind: candidates[0].attributes?.component_name === name ? "direct-component" : "mapped-component" };
  if (candidates.length > 1) return { state: "ambiguous", candidates };
  return { state: "missing", candidates: [] };
}

function appendComponentResult({ fact, relationType, expression, componentResult, resolutions, unresolved, sourceNodeKind = null }) {
  if (componentResult.state === "unique") {
    resolutions.push(makeResolution({ fact, relationType, targetFact: componentResult.fact, expression, confidence: componentResult.resolutionKind === "direct-component" ? "confirmed" : "strong", resolutionKind: componentResult.resolutionKind, sourceNodeKind, details: { component_name: componentResult.fact.attributes?.component_name ?? null } }));
    return;
  }
  unresolved.push(makeUnresolved({ fact, relationType, expression, reason: componentResult.state === "ambiguous" ? "AMBIGUOUS_COMPONENT" : "MAPPING_UNKNOWN", candidates: candidateIds(componentResult.candidates) }));
}

function dynamicRelation(sourceKind) {
  return {
    COMPONENT: "DYNAMIC_REFERENCE",
    METHOD: "CALLS_METHOD",
    INSTANTIATE: "INSTANTIATES",
    INVOKE: "CFINVOKES",
  }[sourceKind] ?? "DYNAMIC_REFERENCE";
}

/**
 * Resolve only literal CFC component and method relationships from immutable
 * Fact indexes. It never evaluates expressions or chooses among ambiguous
 * candidates.
 */
export function resolveCfcLinks({ factBundle, indexes, configuredMappings = {} } = {}) {
  if (!factBundle || !Array.isArray(factBundle.facts)) throw new TypeError("factBundle with facts is required");
  if (!indexes || !indexes.componentIndex || !indexes.methodIndex || !indexes.mappingIndex) throw new TypeError("project indexes with component, method, and mapping indexes are required");

  const facts = factBundle.facts.slice().sort(compareFacts);
  const mappings = mappingFacts(indexes, configuredMappings);
  const resolutions = [];
  const unresolved = [];
  const diagnostics = [];

  for (const fact of facts) {
    if (fact.kind === "DYNAMIC_REFERENCE") {
      const sourceKind = attribute(fact, "source_kind");
      if (["COMPONENT", "METHOD", "INSTANTIATE", "INVOKE"].includes(sourceKind)) unresolved.push(makeUnresolved({ fact, relationType: dynamicRelation(sourceKind), expression: fact.normalized_expression, reason: fact.attributes?.unresolved_reason ?? "DYNAMIC_EXPRESSION", details: { source_kind: sourceKind } }));
      continue;
    }
    if (fact.kind === "COMPONENT") {
      const extendsName = attribute(fact, "extends");
      if (extendsName) appendComponentResult({ fact, relationType: COMPONENT_RELATIONS.EXTENDS, expression: extendsName, componentResult: resolveComponent({ indexes, mappings, name: extendsName }), resolutions, unresolved, sourceNodeKind: "fact" });
      for (const implementsName of Array.isArray(fact.attributes?.implements) ? fact.attributes.implements.map(text).filter(Boolean).sort(compareStrings) : []) appendComponentResult({ fact, relationType: COMPONENT_RELATIONS.IMPLEMENTS, expression: implementsName, componentResult: resolveComponent({ indexes, mappings, name: implementsName }), resolutions, unresolved, sourceNodeKind: "fact" });
      continue;
    }
    if (fact.kind === "INSTANTIATE") {
      const componentName = attribute(fact, "component");
      if (!componentName) {
        unresolved.push(makeUnresolved({ fact, relationType: COMPONENT_RELATIONS.INSTANTIATE, expression: fact.normalized_expression, reason: "DYNAMIC_EXPRESSION" }));
        continue;
      }
      appendComponentResult({ fact, relationType: COMPONENT_RELATIONS.INSTANTIATE, expression: componentName, componentResult: resolveComponent({ indexes, mappings, name: componentName }), resolutions, unresolved });
      continue;
    }
    if (fact.kind !== "INVOKE") continue;
    const componentName = attribute(fact, "component");
    const methodName = attribute(fact, "method");
    if (!componentName || !methodName) {
      unresolved.push(makeUnresolved({ fact, relationType: COMPONENT_RELATIONS.INVOKE, expression: fact.normalized_expression, reason: "DYNAMIC_EXPRESSION" }));
      continue;
    }
    const componentResult = resolveComponent({ indexes, mappings, name: componentName });
    if (componentResult.state !== "unique") {
      appendComponentResult({ fact, relationType: COMPONENT_RELATIONS.INVOKE, expression: componentName, componentResult, resolutions, unresolved });
      unresolved.push(makeUnresolved({ fact, relationType: COMPONENT_RELATIONS.METHOD, expression: `${componentName}.${methodName}`, reason: componentResult.state === "ambiguous" ? "AMBIGUOUS_COMPONENT" : "MAPPING_UNKNOWN", candidates: candidateIds(componentResult.candidates) }));
      continue;
    }
    resolutions.push(makeResolution({ fact, relationType: COMPONENT_RELATIONS.INVOKE, targetFact: componentResult.fact, expression: componentName, confidence: componentResult.resolutionKind === "direct-component" ? "confirmed" : "strong", resolutionKind: componentResult.resolutionKind, details: { component_name: componentName, method_name: methodName } }));
    const methods = methodCandidates(indexes, componentResult.fact, methodName);
    if (methods.length === 1) resolutions.push(makeResolution({ fact, relationType: COMPONENT_RELATIONS.METHOD, targetFact: methods[0], expression: `${componentName}.${methodName}`, confidence: "confirmed", resolutionKind: "direct-method", details: { component_name: componentName, method_name: methodName } }));
    else unresolved.push(makeUnresolved({ fact, relationType: COMPONENT_RELATIONS.METHOD, expression: `${componentName}.${methodName}`, reason: methods.length > 1 ? "AMBIGUOUS_METHOD" : "MAPPING_UNKNOWN", candidates: candidateIds(methods) }));
  }

  resolutions.sort((left, right) => compareStrings([left.from_file, left.relation_type, left.to_file, left.resolution_id].join("\0"), [right.from_file, right.relation_type, right.to_file, right.resolution_id].join("\0")));
  unresolved.sort((left, right) => compareStrings([left.file, left.relation_type, left.span?.start_line ?? 0, left.span?.start_col ?? 0, left.unresolved_id].join("\0"), [right.file, right.relation_type, right.span?.start_line ?? 0, right.span?.start_col ?? 0, right.unresolved_id].join("\0")));
  return {
    schema_version: RESOLUTION_SCHEMA_VERSION,
    resolver: RESOLVER,
    complete: factBundle.complete === true && diagnostics.length === 0,
    resolutions,
    unresolved,
    diagnostics,
    stats: {
      source_file_count: factBundle.source_files?.length ?? 0,
      input_fact_count: facts.length,
      resolution_count: resolutions.length,
      unresolved_count: unresolved.length,
      diagnostic_count: diagnostics.length,
    },
  };
}
