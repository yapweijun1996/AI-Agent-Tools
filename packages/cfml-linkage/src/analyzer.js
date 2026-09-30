import crypto from "node:crypto";
import fs from "node:fs";
import { performance } from "node:perf_hooks";
import path from "node:path";

import { resolveCfcLinks } from "./cfc-resolver.js";
import { extractFactBundle } from "./fact-extractor.js";
import { buildGraph, buildReverseAdjacency } from "./graph.js";
import { createParserAdapter } from "./parser-adapter.js";
import { resolveLiteralPaths } from "./path-resolver.js";
import { buildProjectIndexes } from "./project-index.js";
import { createRootGuard } from "./root-guard.js";
import { resolveRepositoryLinks } from "./repository-resolver.js";
import { createSnapshot } from "./snapshot.js";
import { resolveScopeLinks } from "./scope-resolver.js";
import { resolveWebFlowLinks } from "./web-flow-resolver.js";

const TOOL_NAME = "agent-cfml-linkage";
const DEFAULT_TOOL_VERSION = "0.1.0";
const DEFAULT_PARSER_VERSION = "unselected";
const ANALYSIS_SCHEMA_VERSION = "agent-cfml-linkage-analysis/v0.1";
const DEFAULT_MAX_RESOLVER_RECORDS = 100_000;
const DEFAULT_MAX_EVIDENCE = 1_000_000;
const LANGUAGE_EXTENSIONS = Object.freeze({
  cfml: [".cfm", ".cfml", ".cfc"],
  html: [".html", ".htm"],
  javascript: [".js", ".mjs"],
  css: [".css"],
  sql: [".sql"],
});

function compareStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function hash(values) {
  return crypto.createHash("sha256").update(values.join("\0"), "utf8").digest("hex");
}

function hashBytes(bytes) {
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function diagnosticSortKey(item) {
  const severity = item.severity === "info" ? 0 : item.severity === "warning" ? 1 : 2;
  return [severity, item.code ?? "", item.id ?? "", item.message ?? ""].join("\0");
}

function sortDiagnostics(values) {
  return values.slice().sort((left, right) => compareStrings(diagnosticSortKey(left), diagnosticSortKey(right)));
}

function normalizePositiveLimit(value, name, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError(`${name} must be a positive safe integer`);
  return value;
}

function limitsFrom(config, options) {
  const configured = config?.limits ?? {};
  return {
    maxFiles: normalizePositiveLimit(options.maxFiles ?? configured.max_files, "maxFiles", undefined),
    maxFileBytes: normalizePositiveLimit(options.maxFileBytes ?? configured.max_file_bytes, "maxFileBytes", undefined),
    maxTotalBytes: normalizePositiveLimit(options.maxTotalBytes ?? configured.max_total_bytes, "maxTotalBytes", undefined),
    maxFacts: normalizePositiveLimit(options.maxFacts ?? configured.max_facts, "maxFacts", undefined),
    maxEdges: normalizePositiveLimit(options.maxEdges ?? configured.max_edges, "maxEdges", DEFAULT_MAX_RESOLVER_RECORDS),
    maxResolverRecords: normalizePositiveLimit(options.maxResolverRecords ?? configured.max_edges, "maxResolverRecords", DEFAULT_MAX_RESOLVER_RECORDS),
    maxEvidence: normalizePositiveLimit(options.maxEvidence ?? configured.max_evidence, "maxEvidence", DEFAULT_MAX_EVIDENCE),
    maxTraversalDepth: normalizePositiveLimit(options.maxTraversalDepth ?? configured.max_traversal_depth, "maxTraversalDepth", 32),
    maxWallTimeMs: normalizePositiveLimit(options.maxWallTimeMs ?? configured.max_wall_time_ms, "maxWallTimeMs", undefined),
    maxWorkers: normalizePositiveLimit(options.maxWorkers ?? configured.max_workers, "maxWorkers", 1),
  };
}

function createTimeBudget(maxWallTimeMs, now = () => performance.now()) {
  if (maxWallTimeMs === undefined) return { check: () => null };
  if (typeof now !== "function") throw new TypeError("clock must be a function");
  const startedAt = now();
  if (!Number.isFinite(startedAt)) throw new TypeError("clock must return a finite number");
  let diagnostic = null;
  return {
    check(stage) {
      if (diagnostic !== null) return diagnostic;
      const current = now();
      if (!Number.isFinite(current)) throw new TypeError("clock must return a finite number");
      if (current - startedAt >= maxWallTimeMs) {
        diagnostic = {
          code: "TIME_LIMIT",
          severity: "error",
          message: `Wall-time limit exceeded: ${maxWallTimeMs} ms.`,
          details: { max_wall_time_ms: maxWallTimeMs, stage },
        };
      }
      return diagnostic;
    },
  };
}

function appendFactDiagnostic(factBundle, item) {
  const diagnostics = sortDiagnostics([...factBundle.diagnostics, item]);
  return {
    ...factBundle,
    complete: false,
    diagnostics,
    stats: { ...factBundle.stats, diagnostic_count: diagnostics.length },
  };
}

function configuredMappings(config) {
  const mappings = config?.analysis?.mappings;
  if (mappings === undefined) return {};
  if (!mappings || typeof mappings !== "object" || Array.isArray(mappings)) throw new TypeError("analysis.mappings must be an object");
  for (const [prefix, mappingPath] of Object.entries(mappings)) {
    if (prefix.trim() === "" || typeof mappingPath !== "string" || mappingPath.trim() === "") throw new TypeError("analysis.mappings must contain non-empty prefix/path strings");
  }
  return mappings;
}

function rejectEnabledPlugins(config) {
  const plugins = config?.analysis?.enabled_plugins;
  if (plugins !== undefined && (!Array.isArray(plugins) || plugins.length > 0)) throw new TypeError("enabled analysis plugins are not supported by the bounded analyzer");
}

function extensionsFor(config, options) {
  if (options.extensions !== undefined) return options.extensions;
  const languages = config?.analysis?.languages;
  if (languages === undefined) return undefined;
  if (!Array.isArray(languages) || languages.length === 0) throw new TypeError("analysis.languages must be a non-empty array");
  const extensions = [];
  for (const language of languages) {
    if (!Object.hasOwn(LANGUAGE_EXTENSIONS, language)) throw new TypeError(`Unsupported analysis language: ${language}`);
    extensions.push(...LANGUAGE_EXTENSIONS[language]);
  }
  return [...new Set(extensions)].sort(compareStrings);
}

function parserResultForFailure(file, parserVersion, code, message) {
  return {
    file: file.path,
    parser_version: parserVersion,
    tree: null,
    complete: false,
    diagnostics: [{ code, severity: "error", message: message.slice(0, 1024), file: file.path }],
    sourceMap: null,
  };
}

function parserResultForReadFailure(file, parserVersion, error) {
  return parserResultForFailure(file, parserVersion, "FILE_READ_ERROR", `Unable to read source file: ${error?.code ?? "unknown"}.`);
}

function parseSnapshot({ snapshot, rootGuard, parser, parserVersion, shouldStop = () => false }) {
  const diagnostics = [];
  const parsedFiles = snapshot.files.map((file) => {
    if (shouldStop(`parse:${file.path}`)) return null;
    let bytes;
    let before;
    let after;
    try {
      const admittedPath = rootGuard.resolve(file.path, { mustExist: true });
      if (admittedPath !== file.real_path) {
        return parserResultForFailure(file, parserVersion, "SNAPSHOT_DRIFT", "The discovered file no longer resolves to the admitted canonical path.");
      }
      before = fs.statSync(admittedPath);
      bytes = fs.readFileSync(admittedPath);
      after = fs.statSync(admittedPath);
    } catch (error) {
      if (error?.code === "SYMLINK_NOT_ALLOWED" || error?.code === "OUTSIDE_ROOT" || error?.code === "PATH_TRAVERSAL") {
        return parserResultForFailure(file, parserVersion, error.code, error.message);
      }
      return parserResultForReadFailure(file, parserVersion, error);
    }
    if (before.size !== file.bytes || before.mtimeMs !== file.mtime_ms || after.size !== file.bytes || after.mtimeMs !== file.mtime_ms || hashBytes(bytes) !== file.content_sha256) {
      diagnostics.push({
        path: file.path,
        code: "SNAPSHOT_DRIFT",
        message: "File metadata or content changed after the discovery snapshot.",
      });
    }
    let parsed;
    try {
      parsed = parser.parse(bytes, file.path);
    } catch (error) {
      parsed = parserResultForReadFailure(file, parserVersion, error);
    }
    try {
      const finalAdmittedPath = rootGuard.resolve(file.path, { mustExist: true });
      if (finalAdmittedPath !== file.real_path) {
        diagnostics.push({
          path: file.path,
          code: "SNAPSHOT_DRIFT",
          message: "The file no longer resolves to the admitted canonical path after parsing.",
        });
      } else {
        const finalBytes = fs.readFileSync(finalAdmittedPath);
        const finalStat = fs.statSync(finalAdmittedPath);
        if (finalStat.size !== file.bytes || finalStat.mtimeMs !== file.mtime_ms || hashBytes(finalBytes) !== file.content_sha256) {
          diagnostics.push({
            path: file.path,
            code: "SNAPSHOT_DRIFT",
            message: "File metadata or content changed while the parser was running.",
          });
        }
      }
    } catch (error) {
      diagnostics.push({
        path: file.path,
        code: "SNAPSHOT_DRIFT",
        message: `Unable to confirm file stability after parsing: ${error?.code ?? "unknown"}.`,
      });
    }
    return parsed;
  });
  return { parsedFiles, diagnostics };
}

function snapshotDiagnostics(snapshot, additional = []) {
  return [...snapshot.diagnostics, ...additional].map((item, index) => ({
    id: `diagnostic:${hash(["snapshot", item.path ?? ".", item.code ?? "SNAPSHOT_DIAGNOSTIC", item.message ?? "", index])}`,
    severity: "error",
    code: item.code ?? "SNAPSHOT_DIAGNOSTIC",
    message: String(item.message ?? "Snapshot discovery reported an unspecified diagnostic.").slice(0, 2048),
    ...(item.path ? { details: { path: item.path } } : {}),
  }));
}

function attachSnapshotDiagnostics(factBundle, snapshot, additionalDiagnostics = []) {
  const diagnostics = sortDiagnostics([...factBundle.diagnostics, ...snapshotDiagnostics(snapshot, additionalDiagnostics)]);
  return {
    ...factBundle,
    complete: factBundle.complete === true && snapshot.complete === true && additionalDiagnostics.length === 0,
    diagnostics,
    stats: { ...factBundle.stats, diagnostic_count: diagnostics.length },
  };
}

function mergeResolutionResults(factBundle, results) {
  const resolutions = [];
  const unresolved = [];
  const diagnostics = [];
  const resolutionIds = new Set();
  const unresolvedIds = new Set();
  const diagnosticKeys = new Set();

  for (const result of results) {
    for (const item of result?.resolutions ?? []) {
      const key = item.resolution_id ?? JSON.stringify(item);
      if (!resolutionIds.has(key)) {
        resolutionIds.add(key);
        resolutions.push(item);
      }
    }
    for (const item of result?.unresolved ?? []) {
      const key = item.unresolved_id ?? JSON.stringify(item);
      if (!unresolvedIds.has(key)) {
        unresolvedIds.add(key);
        unresolved.push(item);
      }
    }
    for (const item of result?.diagnostics ?? []) {
      const key = [item.file ?? "", item.code ?? "", item.message ?? "", JSON.stringify(item.details ?? {})].join("\0");
      if (!diagnosticKeys.has(key)) {
        diagnosticKeys.add(key);
        diagnostics.push({ ...item });
      }
    }
  }

  resolutions.sort((left, right) => compareStrings([
    left.from_file ?? "",
    left.relation_type ?? "",
    left.to_file ?? "",
    left.to_fact_id ?? "",
    left.resolution_id ?? "",
  ].join("\0"), [
    right.from_file ?? "",
    right.relation_type ?? "",
    right.to_file ?? "",
    right.to_fact_id ?? "",
    right.resolution_id ?? "",
  ].join("\0")));
  unresolved.sort((left, right) => compareStrings([
    left.file ?? "",
    left.relation_type ?? "",
    left.span?.start_line ?? 0,
    left.span?.start_col ?? 0,
    left.unresolved_id ?? "",
  ].join("\0"), [
    right.file ?? "",
    right.relation_type ?? "",
    right.span?.start_line ?? 0,
    right.span?.start_col ?? 0,
    right.unresolved_id ?? "",
  ].join("\0")));
  const allDiagnostics = sortDiagnostics(diagnostics);
  return {
    schema_version: "agent-cfml-linkage-resolution/v0.1",
    resolver: { name: "analysis-orchestrator", version: "v0.1" },
    complete: factBundle.complete === true && results.every((result) => result?.complete === true),
    resolutions,
    unresolved,
    diagnostics: allDiagnostics,
    stats: {
      source_file_count: factBundle.source_files.length,
      input_fact_count: factBundle.facts.length,
      resolution_count: resolutions.length,
      unresolved_count: unresolved.length,
      diagnostic_count: allDiagnostics.length,
    },
  };
}

/**
 * Run the bounded, read-only analysis stages in dependency order. A parser
 * backend may be injected explicitly; without one the parser adapter returns
 * unavailable evidence and the resulting Graph IR remains incomplete.
 */
export function analyzeProject({
  rootPath,
  config = {},
  parserBackend = null,
  parserAdapter = null,
  parserVersion = parserBackend?.version ?? DEFAULT_PARSER_VERSION,
  parserName = parserBackend?.version ?? "cfml-parser-adapter",
  toolVersion = DEFAULT_TOOL_VERSION,
  createdAt,
  snapshotOptions = {},
  maxFacts,
  maxEdges,
  maxResolverRecords,
  maxEvidence,
  maxTraversalDepth,
  maxWallTimeMs,
  maxWorkers,
  clock,
} = {}) {
  if (typeof rootPath !== "string" || rootPath.trim() === "") throw new TypeError("rootPath must be a non-empty string");
  if (parserAdapter !== null && (!parserAdapter || typeof parserAdapter.parse !== "function")) throw new TypeError("parserAdapter must expose parse(bytes, file) or be null");
  if (parserAdapter !== null && parserBackend !== null) throw new TypeError("Provide parserAdapter or parserBackend, not both");
  if (typeof toolVersion !== "string" || toolVersion.trim() === "") throw new TypeError("toolVersion must be a non-empty string");
  if (typeof parserVersion !== "string" || parserVersion.trim() === "") throw new TypeError("parserVersion must be a non-empty string");
  if (typeof parserName !== "string" || parserName.trim() === "") throw new TypeError("parserName must be a non-empty string");
  if (!snapshotOptions || typeof snapshotOptions !== "object" || Array.isArray(snapshotOptions)) throw new TypeError("snapshotOptions must be an object");
  rejectEnabledPlugins(config);
  const mappingRules = configuredMappings(config);

  const limits = limitsFrom(config, { ...snapshotOptions, maxFacts, maxEdges, maxResolverRecords, maxEvidence, maxTraversalDepth, maxWallTimeMs, maxWorkers });
  const timeBudget = createTimeBudget(limits.maxWallTimeMs, clock ?? undefined);
  let timeLimit = null;
  const checkTime = (stage) => {
    if (timeLimit !== null) return false;
    timeLimit = timeBudget.check(stage);
    return timeLimit === null;
  };
  const extensions = extensionsFor(config, snapshotOptions);
  const ignoreGlobs = snapshotOptions.ignoreGlobs ?? config?.ignore?.globs;
  const hiddenFilePolicy = snapshotOptions.hiddenFilePolicy ?? config?.ignore?.hidden_files;
  const generatedFilePolicy = snapshotOptions.generatedFilePolicy ?? config?.ignore?.generated_files;
  const rootGuard = createRootGuard(rootPath);
  const snapshot = createSnapshot(rootGuard, {
    ...snapshotOptions,
    ...(extensions ? { extensions } : {}),
    ...(ignoreGlobs !== undefined ? { ignoreGlobs } : {}),
    ...(hiddenFilePolicy !== undefined ? { hiddenFilePolicy } : {}),
    ...(generatedFilePolicy !== undefined ? { generatedFilePolicy } : {}),
    ...(limits.maxFiles ? { maxFiles: limits.maxFiles } : {}),
    ...(limits.maxFileBytes ? { maxFileBytes: limits.maxFileBytes } : {}),
    ...(limits.maxTotalBytes ? { maxTotalBytes: limits.maxTotalBytes } : {}),
    shouldStop: (stage) => !checkTime(`snapshot:${stage}`),
  });
  checkTime("snapshot:complete");
  if (snapshot.files.length === 0) {
    const error = new Error("No supported source files were discovered beneath the analysis root.");
    error.code = "NO_SOURCE_FILES";
    throw error;
  }

  const parser = parserAdapter ?? createParserAdapter({ backend: parserBackend, parserVersion });
  const parsed = timeLimit === null && checkTime("parse:start")
    ? parseSnapshot({ snapshot, rootGuard, parser, parserVersion, shouldStop: (stage) => !checkTime(stage) })
    : { parsedFiles: [], diagnostics: [] };
  checkTime("parse:complete");
  const extracted = extractFactBundle({
    snapshot,
    parsedFiles: timeLimit === null ? parsed.parsedFiles : [],
    toolVersion,
    parserName,
    maxFacts: limits.maxFacts,
    shouldStop: (stage) => !checkTime(stage),
  });
  checkTime("facts:complete");
  let factBundle = attachSnapshotDiagnostics(extracted, snapshot, parsed.diagnostics);
  const timeLimitDiagnostic = () => timeLimit === null ? null : {
    id: `diagnostic:${hash(["time-limit", timeLimit.details.max_wall_time_ms, timeLimit.details.stage])}`,
    ...timeLimit,
  };
  const appendTimeLimitToFactBundle = () => {
    const diagnostic = timeLimitDiagnostic();
    if (diagnostic !== null && !factBundle.diagnostics.some((item) => item.id === diagnostic.id)) factBundle = appendFactDiagnostic(factBundle, diagnostic);
  };
  appendTimeLimitToFactBundle();
  const indexes = buildProjectIndexes({ factBundle, snapshot });

  let pathResolution = null;
  let cfcResolution = null;
  let scopeResolution = null;
  let webFlowResolution = null;
  let repositoryResolution = null;
  if (timeLimit === null && checkTime("path-resolution:start")) {
    pathResolution = resolveLiteralPaths({ factBundle, indexes, rootGuard });
    checkTime("path-resolution:complete");
  }
  if (timeLimit === null && checkTime("cfc-resolution:start")) {
    cfcResolution = resolveCfcLinks({ factBundle, indexes, configuredMappings: mappingRules });
    checkTime("cfc-resolution:complete");
  }
  const baseResolutions = mergeResolutionResults(factBundle, [pathResolution, cfcResolution].filter(Boolean));
  if (timeLimit === null && checkTime("scope-resolution:start")) {
    scopeResolution = resolveScopeLinks({
      factBundle,
      resolutions: baseResolutions,
      indexes,
      maxEvents: limits.maxResolverRecords,
      maxDepth: limits.maxTraversalDepth,
      maxRecords: limits.maxResolverRecords,
    });
    checkTime("scope-resolution:complete");
  }
  if (timeLimit === null && checkTime("web-flow-resolution:start")) {
    webFlowResolution = resolveWebFlowLinks({ factBundle, resolutions: baseResolutions, maxRecords: limits.maxResolverRecords });
    checkTime("web-flow-resolution:complete");
  }
  if (timeLimit === null && checkTime("repository-resolution:start")) {
    repositoryResolution = resolveRepositoryLinks({ factBundle, cfcResolution, maxRecords: limits.maxResolverRecords });
    checkTime("repository-resolution:complete");
  }
  let resolutions = mergeResolutionResults(factBundle, [pathResolution, cfcResolution, scopeResolution, webFlowResolution, repositoryResolution].filter(Boolean));
  const markResolutionTimeLimit = () => {
    if (timeLimit !== null && resolutions.complete === true) resolutions = { ...resolutions, complete: false };
  };
  checkTime("graph:start");
  appendTimeLimitToFactBundle();
  markResolutionTimeLimit();
  let graph = buildGraph({ factBundle, resolutions, snapshot, rootGuard, toolVersion, maxEdges: limits.maxEdges, maxEvidence: limits.maxEvidence, ...(createdAt === undefined ? {} : { createdAt }) });
  checkTime("graph:complete");
  appendTimeLimitToFactBundle();
  markResolutionTimeLimit();
  const graphTimeLimit = timeLimitDiagnostic();
  if (graphTimeLimit !== null && !graph.diagnostics.some((item) => item.id === graphTimeLimit.id)) {
    const diagnostics = sortDiagnostics([...graph.diagnostics, graphTimeLimit]);
    graph = { ...graph, complete: false, diagnostics, stats: { ...graph.stats, diagnostic_count: diagnostics.length } };
  }
  const reverseAdjacency = buildReverseAdjacency(graph);

  return {
    schema_version: ANALYSIS_SCHEMA_VERSION,
    tool: { name: TOOL_NAME, version: toolVersion },
    complete: graph.complete === true,
    fact_bundle: factBundle,
    resolutions,
    graph,
    reverse_adjacency: reverseAdjacency,
    diagnostics: graph.diagnostics,
    stats: {
      ...graph.stats,
      fact_count: factBundle.stats.fact_count,
      resolution_count: resolutions.stats.resolution_count,
      resolver_unresolved_count: resolutions.stats.unresolved_count,
      resolver_diagnostic_count: resolutions.stats.diagnostic_count,
      parsed_file_count: parsed.parsedFiles.filter(Boolean).length,
    },
  };
}

export { ANALYSIS_SCHEMA_VERSION };
