import crypto from "node:crypto";
import path from "node:path";

const RESOLUTION_SCHEMA_VERSION = "agent-cfml-linkage-resolution/v0.1";
const RESOLVER_NAME = "literal-path-resolver";
const RESOLVER_VERSION = "v0.1";
const PATH_FACT_RELATIONS = Object.freeze({
  INCLUDE: "INCLUDES",
  CUSTOM_TAG: "CUSTOM_TAG_CALL",
  FORM: "FORM_SUBMITS_TO",
  REDIRECT: "REDIRECTS_TO",
  AJAX: "AJAX_CALLS",
  FETCH: "FETCHES",
  CSS_ASSET: "CSS_ASSET_REFERENCES",
});
const DYNAMIC_RELATIONS = Object.freeze({
  INCLUDE: "INCLUDES",
  CUSTOM_TAG: "CUSTOM_TAG_CALL",
  FORM: "FORM_SUBMITS_TO",
  REDIRECT: "REDIRECTS_TO",
  AJAX: "AJAX_CALLS",
  FETCH: "FETCHES",
  CSS_ASSET: "CSS_ASSET_REFERENCES",
});
const SOURCE_EXTENSIONS = Object.freeze([".cfm", ".cfml", ".cfc", ".html", ".htm", ".js", ".mjs", ".css", ".sql"]);

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function compareFacts(left, right) {
  const leftSpan = left.span ?? {};
  const rightSpan = right.span ?? {};
  return compareStrings([
    left.file ?? "",
    leftSpan.start_line ?? 0,
    leftSpan.start_col ?? 0,
    left.kind ?? "",
    left.fact_id ?? "",
  ].join("\0"), [
    right.file ?? "",
    rightSpan.start_line ?? 0,
    rightSpan.start_col ?? 0,
    right.kind ?? "",
    right.fact_id ?? "",
  ].join("\0"));
}

function hash(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function relativePath(rootPath, targetPath) {
  return path.relative(rootPath, targetPath).split(path.sep).join("/");
}

function relationForFact(fact) {
  return PATH_FACT_RELATIONS[fact.kind] ?? null;
}

function pathExpressionForFact(fact) {
  const attributeNames = {
    INCLUDE: "template",
    CUSTOM_TAG: "name",
    FORM: "action",
    REDIRECT: "url",
    AJAX: "target",
    FETCH: "target",
    CSS_ASSET: "target",
  };
  const attributeName = attributeNames[fact.kind];
  const value = attributeName ? fact.attributes?.[attributeName] : null;
  return typeof value === "string" && value.trim() !== "" ? value : fact.normalized_expression;
}

function addDiagnostic(diagnostics, code, file, message) {
  diagnostics.push({ code, severity: "error", file, message });
}

function makeUnresolved({ fact, relationType, reason, candidates = [], expression, details = {} }) {
  const normalizedCandidates = [...new Set(candidates)].sort(compareStrings);
  const identity = [fact.fact_id, relationType, reason, expression, ...normalizedCandidates].join("\0");
  return {
    unresolved_id: `unresolved:${hash(identity)}`,
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

function makeResolution({ fact, relationType, target, expression, confidence, resolutionKind, details = {} }) {
  const identity = [RESOLVER_VERSION, fact.fact_id, relationType, target, resolutionKind].join("\0");
  return {
    resolution_id: `resolution:${hash(identity)}`,
    source_fact_id: fact.fact_id,
    relation_type: relationType,
    from_file: fact.file,
    to_file: target,
    span: fact.span,
    normalized_expression: expression,
    confidence,
    resolver: { name: RESOLVER_NAME, version: RESOLVER_VERSION },
    resolution_kind: resolutionKind,
    ...details,
  };
}

function stripUrlSuffix(value) {
  const firstSuffix = value.search(/[?#]/u);
  return firstSuffix === -1 ? value : value.slice(0, firstSuffix);
}

function isExternalTarget(value) {
  return /^[A-Za-z][A-Za-z0-9+.-]*:/u.test(value) || value.startsWith("//");
}

function sourceDirectory(file) {
  const directory = path.posix.dirname(file);
  return directory === "." ? "" : directory;
}

function hasParentSegment(value) {
  return value.split(/[\\/]+/u).some((segment) => segment === "..");
}

function targetCandidates(fact, rawExpression) {
  const stripped = stripUrlSuffix(rawExpression.trim());
  if (stripped === "") return { kind: "empty", values: [] };
  if (isExternalTarget(stripped)) return { kind: "external", values: [] };
  if (stripped.includes("\0") || stripped.includes("\\") || hasParentSegment(stripped)) return { kind: "outside", values: [] };
  const rootRelative = stripped.startsWith("/");
  const clean = stripped.replace(/^\/+/, "");
  if (clean === "") return { kind: "empty", values: [] };
  const values = [];
  const add = (value) => {
    const normalized = value.replace(/^\.\//u, "");
    if (normalized !== "" && !values.includes(normalized)) values.push(normalized);
  };
  if (rootRelative) add(clean);
  else add(sourceDirectory(fact.file) ? `${sourceDirectory(fact.file)}/${clean}` : clean);
  if (rootRelative === false) add(clean);
  return { kind: "path", values };
}

function extensionCandidates(value) {
  const extension = path.posix.extname(value).toLowerCase();
  if (extension !== "") return [value];
  return [value, ...SOURCE_EXTENSIONS.map((suffix) => `${value}${suffix}`), ...SOURCE_EXTENSIONS.filter((suffix) => suffix === ".cfm" || suffix === ".cfml" || suffix === ".html").map((suffix) => `${value}/index${suffix}`)];
}

function pathIndexKeys(indexes) {
  return Object.keys(indexes.pathIndex ?? {}).sort(compareStrings);
}

function resolvePathTarget({ fact, expression, rootGuard, knownPaths }) {
  const target = targetCandidates(fact, expression);
  const relationType = relationForFact(fact);
  if (target.kind === "external") return { unresolved: makeUnresolved({ fact, relationType, reason: "EXTERNAL_TARGET", expression }) };
  if (target.kind === "outside") return { unresolved: makeUnresolved({ fact, relationType, reason: "OUTSIDE_ROOT", expression }) };
  if (target.kind === "empty") return { unresolved: makeUnresolved({ fact, relationType, reason: "PATH_NOT_FOUND", expression }) };

  const matches = [];
  let accessError = null;
  for (const base of target.values) {
    for (const candidate of extensionCandidates(base)) {
      try {
        const canonical = rootGuard.resolve(candidate, { mustExist: true });
        const relative = relativePath(rootGuard.rootPath, canonical);
        if (knownPaths.includes(relative) && !matches.some((item) => item.path === relative)) {
          matches.push({ path: relative, kind: candidate === base ? "exact" : "extension-fallback" });
        }
      } catch (error) {
        if (error?.code === "REFERENCE_NOT_FOUND" || error?.code === "PATH_TRAVERSAL" || error?.code === "ABSOLUTE_REFERENCE" || error?.code === "OUTSIDE_ROOT") continue;
        accessError = error;
      }
    }
  }
  if (accessError) return { diagnostic: { code: accessError.code ?? "REFERENCE_ACCESS_ERROR", file: fact.file, message: accessError.message ?? "Unable to inspect a referenced path." } };
  if (matches.length === 0) return { unresolved: makeUnresolved({ fact, relationType, reason: "PATH_NOT_FOUND", expression, candidates: target.values }) };
  if (matches.length > 1) return { unresolved: makeUnresolved({ fact, relationType, reason: "AMBIGUOUS_PATH", expression, candidates: matches.map((item) => item.path) }) };
  return { resolution: makeResolution({ fact, relationType, target: matches[0].path, expression, confidence: matches[0].kind === "exact" ? "confirmed" : "strong", resolutionKind: matches[0].kind }) };
}

function applicationFiles(knownPaths) {
  return knownPaths.filter((file) => /(?:^|\/)Application\.(?:cfc|cfm)$/iu.test(file));
}

function applicationForFile(file, applications) {
  const directories = [];
  let current = sourceDirectory(file);
  while (true) {
    directories.push(current);
    if (current === "") break;
    current = path.posix.dirname(current);
    if (current === ".") current = "";
  }
  for (const directory of directories) {
    const matches = applications.filter((candidate) => sourceDirectory(candidate) === directory);
    if (matches.length > 0) return { directory, matches };
  }
  return { directory: null, matches: [] };
}

function addApplicationResolutions({ facts, knownPaths, resolutions }) {
  const applications = applicationFiles(knownPaths);
  if (applications.length === 0) return;
  const fileFacts = new Map();
  for (const fact of facts) {
    if (fact.kind === "FILE" && !fileFacts.has(fact.file)) fileFacts.set(fact.file, fact);
  }
  for (const application of applications) {
    const applicationFact = fileFacts.get(application);
    if (!applicationFact) continue;
    for (const target of knownPaths) {
      if (target === application) continue;
      const owner = applicationForFile(target, applications);
      if (owner.matches.length !== 1 || owner.matches[0] !== application) continue;
      resolutions.push(makeResolution({
        fact: applicationFact,
        relationType: "APPLICATION_GOVERNS",
        target,
        expression: application,
        confidence: "strong",
        resolutionKind: "nearest-application",
        details: { application_file: application },
      }));
    }
  }
  const hooks = facts.filter((fact) => fact.kind === "APPLICATION_HOOK").sort(compareFacts);
  for (const hook of hooks) {
    const owner = applicationForFile(hook.file, applications);
    if (owner.matches.length !== 1 || owner.matches[0] !== hook.file) continue;
    for (const target of knownPaths) {
      if (target === hook.file) continue;
      const targetOwner = applicationForFile(target, applications);
      if (targetOwner.matches.length !== 1 || targetOwner.matches[0] !== hook.file) continue;
      resolutions.push(makeResolution({
        fact: hook,
        relationType: "REQUEST_HOOK_APPLIES_TO",
        target,
        expression: hook.normalized_expression,
        confidence: "strong",
        resolutionKind: "nearest-application-hook",
        details: { application_file: hook.file, hook_name: hook.attributes?.hook_name ?? null },
      }));
    }
  }
}

/**
 * Resolve only literal in-root file references from Fact IR. Dynamic,
 * external, missing, ambiguous, and rejected paths remain explicit records.
 */
export function resolveLiteralPaths({ factBundle, indexes, rootGuard } = {}) {
  if (!factBundle || !Array.isArray(factBundle.facts)) throw new TypeError("factBundle with facts is required");
  if (!indexes || !indexes.pathIndex || !indexes.factByFile) throw new TypeError("immutable project indexes are required");
  if (!rootGuard || typeof rootGuard.rootPath !== "string" || typeof rootGuard.resolve !== "function") throw new TypeError("rootGuard must be created by createRootGuard");

  const facts = factBundle.facts.slice().sort(compareFacts);
  const knownPaths = pathIndexKeys(indexes);
  const resolutions = [];
  const unresolved = [];
  const diagnostics = [];
  for (const fact of facts) {
    const relationType = relationForFact(fact);
    if (relationType) {
      const result = resolvePathTarget({ fact, expression: pathExpressionForFact(fact), rootGuard, knownPaths });
      if (result.resolution) resolutions.push(result.resolution);
      if (result.unresolved) unresolved.push(result.unresolved);
      if (result.diagnostic) addDiagnostic(diagnostics, result.diagnostic.code, result.diagnostic.file, result.diagnostic.message);
      continue;
    }
    if (fact.kind !== "DYNAMIC_REFERENCE") continue;
    const sourceKind = fact.attributes?.source_kind;
    const dynamicRelation = DYNAMIC_RELATIONS[sourceKind];
    if (dynamicRelation) unresolved.push(makeUnresolved({ fact, relationType: dynamicRelation, reason: fact.attributes?.unresolved_reason ?? "DYNAMIC_EXPRESSION", expression: fact.normalized_expression, details: { source_kind: sourceKind } }));
  }
  addApplicationResolutions({ facts, knownPaths, resolutions });
  resolutions.sort((left, right) => compareStrings([left.from_file, left.relation_type, left.to_file, left.resolution_id].join("\0"), [right.from_file, right.relation_type, right.to_file, right.resolution_id].join("\0")));
  unresolved.sort((left, right) => compareStrings([left.file, left.relation_type, left.span?.start_line ?? 0, left.span?.start_col ?? 0, left.unresolved_id].join("\0"), [right.file, right.relation_type, right.span?.start_line ?? 0, right.span?.start_col ?? 0, right.unresolved_id].join("\0")));
  diagnostics.sort((left, right) => compareStrings([left.file, left.code, left.message].join("\0"), [right.file, right.code, right.message].join("\0")));
  return {
    schema_version: RESOLUTION_SCHEMA_VERSION,
    resolver: { name: RESOLVER_NAME, version: RESOLVER_VERSION },
    complete: factBundle.complete === true && diagnostics.length === 0,
    resolutions,
    unresolved,
    diagnostics,
    stats: {
      source_file_count: knownPaths.length,
      input_fact_count: facts.length,
      resolution_count: resolutions.length,
      unresolved_count: unresolved.length,
      diagnostic_count: diagnostics.length,
    },
  };
}
