import fs from "node:fs";
import path from "node:path";

import { analyzeProject } from "./analyzer.js";
import { queryGraph, validateQueryRequest } from "./graph-query.js";
import { createMixedStructuralScannerBackend } from "./web-scanner.js";
import { serializeBoundedJson } from "./output.js";
import { createRootGuard, RootGuardError } from "./root-guard.js";

const TOOL_NAME = "agent-cfml-linkage";
const TOOL_VERSION = "0.1.0";
const ENVELOPE_VERSION = "agent-cfml-linkage-result/v0.1";
const DEFAULT_EXIT_CODES = Object.freeze({
  completed: 0,
  internal_failure: 1,
  invalid_input: 2,
  incomplete: 3,
  path_rejected: 4,
});
const MAX_CONFIG_BYTES = 1024 * 1024;
const MIN_OUTPUT_BYTES = 300;
const QUERY_COMMANDS = Object.freeze(["related", "callers", "callees", "trace", "unresolved", "explain", "stats"]);
const QUERY_OPERATIONS = Object.freeze({
  related: "related",
  callers: "callers",
  callees: "callees",
  trace: "trace",
  unresolved: "unresolved",
  explain: "explain-edge",
  stats: "stats",
});
const COMMANDS = Object.freeze(["capabilities", "analyze", "index", ...QUERY_COMMANDS]);

function diagnostic(code, severity, message, details = {}) {
  return Object.freeze({ code, severity, message, ...details });
}

function invalidConfig(message) {
  throw diagnostic("INVALID_CONFIG", "error", message);
}

function requireConfigObject(value, name, requiredKeys, allowedKeys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) invalidConfig(`${name} must be an object.`);
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) invalidConfig(`${name}.${key} is required.`);
  }
  for (const key of Object.keys(value)) {
    if (allowedKeys !== null && !allowedKeys.has(key)) invalidConfig(`${name}.${key} is not supported.`);
  }
}

function requireConfigString(value, name, maxLength = Infinity) {
  if (typeof value !== "string" || value.trim() === "") invalidConfig(`${name} must be a non-empty string.`);
  if (value.length > maxLength) invalidConfig(`${name} exceeds ${maxLength} characters.`);
}

function requireConfigArray(value, name, { minItems = 0, maxItems = Infinity, itemMaxLength = Infinity } = {}) {
  if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) invalidConfig(`${name} has an invalid item count.`);
  const seen = new Set();
  for (const item of value) {
    requireConfigString(item, `${name} entry`, itemMaxLength);
    if (seen.has(item)) invalidConfig(`${name} must not contain duplicate entries.`);
    seen.add(item);
  }
}

function requireConfigPositiveInteger(value, name) {
  if (!Number.isSafeInteger(value) || value <= 0) invalidConfig(`${name} must be a positive safe integer.`);
}

function envelope(command, status, diagnostics = [], data = null) {
  return {
    schema_version: ENVELOPE_VERSION,
    tool: { name: TOOL_NAME, version: TOOL_VERSION },
    command,
    status,
    data,
    diagnostics,
  };
}

function usageData() {
  return {
    usage: `${TOOL_NAME} <command> [--config <path>]`,
    commands: COMMANDS,
    implemented_commands: ["capabilities", "analyze", "index", ...QUERY_COMMANDS],
    notes: [
      "analyze and index run the bounded, explicit mixed structural scanner pipeline; query commands run the same pipeline and query its resulting graph.",
      "Source is never executed; diagnostics are emitted on stderr and in the JSON envelope.",
    ],
  };
}

function parseArguments(argv) {
  let command = null;
  let configPath = null;
  let help = false;
  let version = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") {
      help = true;
      continue;
    }
    if (argument === "--version" || argument === "-v") {
      version = true;
      continue;
    }
    if (argument === "--config") {
      if (configPath !== null || index + 1 >= argv.length || argv[index + 1].startsWith("-")) {
        throw diagnostic("INVALID_INPUT", "error", "--config requires exactly one path.");
      }
      configPath = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument.startsWith("-")) {
      throw diagnostic("INVALID_INPUT", "error", `Unknown option: ${argument}`);
    }
    if (command !== null) {
      throw diagnostic("INVALID_INPUT", "error", "Exactly one command is required.");
    }
    command = argument;
  }

  if (help || version) {
    if (command !== null || configPath !== null || (help && version)) {
      throw diagnostic("INVALID_INPUT", "error", "--help/--version cannot be combined with a command or --config.");
    }
    return { command: help ? "help" : "version", configPath: null };
  }
  if (command === null || !COMMANDS.includes(command)) {
    throw diagnostic("INVALID_INPUT", "error", command === null ? "A supported command is required." : `Unknown command: ${command}`);
  }
  if (configPath === null && command !== "capabilities") {
    throw diagnostic("INVALID_INPUT", "error", "--config is required for this command.");
  }
  if (configPath !== null && command === "capabilities") {
    throw diagnostic("INVALID_INPUT", "error", "capabilities does not accept --config.");
  }
  return { command, configPath };
}

function readConfig(configPath, cwd) {
  if (typeof configPath !== "string" || configPath.trim() === "" || configPath.includes("\0")) {
    throw diagnostic("INVALID_INPUT", "error", "Configuration path must be a non-empty path without null bytes.");
  }
  const resolvedPath = path.resolve(cwd, configPath);
  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch (error) {
    throw diagnostic("INVALID_INPUT", "error", `Configuration file cannot be inspected: ${error?.code ?? "unknown"}`, { path: configPath });
  }
  if (!stat.isFile()) {
    throw diagnostic("INVALID_INPUT", "error", "Configuration path is not a regular file.", { path: configPath });
  }
  if (stat.size > MAX_CONFIG_BYTES) {
    throw diagnostic("INVALID_INPUT", "error", `Configuration file exceeds ${MAX_CONFIG_BYTES} bytes.`, { path: configPath });
  }

  let text;
  try {
    text = fs.readFileSync(resolvedPath, "utf8");
  } catch (error) {
    throw diagnostic("INVALID_INPUT", "error", `Configuration file cannot be read: ${error?.code ?? "unknown"}`, { path: configPath });
  }
  try {
    return JSON.parse(text);
  } catch {
    throw diagnostic("INVALID_INPUT", "error", "Configuration must be valid JSON.", { path: configPath });
  }
}

function validateConfig(config) {
  requireConfigObject(config, "config", ["schema_version", "root", "path_policy", "ignore", "analysis", "limits", "output", "prohibited_actions", "exit_codes"], new Set(["schema_version", "root", "path_policy", "ignore", "analysis", "limits", "query", "output", "prohibited_actions", "exit_codes"]));
  if (config.schema_version !== "agent-cfml-linkage-config/v0.1") invalidConfig("Unsupported or missing configuration schema_version.");
  requireConfigString(config.root, "Configuration root", 4096);

  requireConfigObject(config.path_policy, "path_policy", ["reject_outside_root", "follow_symlinks", "allow_absolute_references", "case_collision_policy"], new Set(["reject_outside_root", "follow_symlinks", "allow_absolute_references", "case_collision_policy"]));
  if (config.path_policy.reject_outside_root !== true || config.path_policy.follow_symlinks !== false || config.path_policy.allow_absolute_references !== false) invalidConfig("Unsafe path policy flags do not satisfy the v0.1 contract.");
  if (!["diagnostic", "reject"].includes(config.path_policy.case_collision_policy)) invalidConfig("path_policy.case_collision_policy is invalid.");

  requireConfigObject(config.ignore, "ignore", ["globs", "hidden_files", "generated_files"], new Set(["globs", "hidden_files", "generated_files"]));
  requireConfigArray(config.ignore.globs, "ignore.globs", { maxItems: 256, itemMaxLength: 512 });
  for (const glob of config.ignore.globs) {
    const normalized = glob.trim().replaceAll("\\", "/");
    if (normalized.includes("\0") || normalized.startsWith("/") || normalized.split("/").includes("..") || (normalized.length >= 3 && /^[A-Za-z]:/u.test(normalized) && normalized[2] === "/")) invalidConfig("ignore.globs must contain root-relative patterns without null bytes.");
  }
  if (!["include", "ignore"].includes(config.ignore.hidden_files) || !["include", "ignore"].includes(config.ignore.generated_files)) invalidConfig("ignore file policies are invalid.");

  requireConfigObject(config.analysis, "analysis", ["languages", "mappings", "enabled_plugins"], new Set(["languages", "mappings", "enabled_plugins"]));
  requireConfigArray(config.analysis.languages, "analysis.languages", { minItems: 1 });
  if (config.analysis.languages.some((language) => !["cfml", "html", "javascript", "css", "sql"].includes(language))) invalidConfig("analysis.languages contains an unsupported language.");
  requireConfigObject(config.analysis.mappings, "analysis.mappings", [], null);
  for (const [key, value] of Object.entries(config.analysis.mappings)) {
    requireConfigString(key, "analysis.mappings key", 4096);
    requireConfigString(value, `analysis.mappings.${key}`, 4096);
  }
  requireConfigArray(config.analysis.enabled_plugins, "analysis.enabled_plugins", { maxItems: 32 });
  if (config.analysis.enabled_plugins.length > 0) invalidConfig("analysis.enabled_plugins is unsupported until a bounded plugin loader is implemented.");

  const limitKeys = ["max_files", "max_file_bytes", "max_total_bytes", "max_facts", "max_edges", "max_evidence", "max_traversal_depth", "max_output_bytes", "max_wall_time_ms", "max_workers"];
  requireConfigObject(config.limits, "limits", limitKeys, new Set(limitKeys));
  for (const key of limitKeys) requireConfigPositiveInteger(config.limits[key], `limits.${key}`);
  if (config.limits.max_output_bytes < MIN_OUTPUT_BYTES) invalidConfig(`limits.max_output_bytes must be at least ${MIN_OUTPUT_BYTES} bytes.`);

  requireConfigObject(config.output, "output", ["format", "diagnostics_stream", "include_raw_evidence"], new Set(["format", "diagnostics_stream", "include_raw_evidence"]));
  if (config.output.format !== "json" || config.output.diagnostics_stream !== "stderr") invalidConfig("Output must be JSON with diagnostics on stderr.");
  if (!["never", "bounded"].includes(config.output.include_raw_evidence)) invalidConfig("output.include_raw_evidence is invalid.");

  requireConfigObject(config.prohibited_actions, "prohibited_actions", ["execute_source", "network", "database", "shell", "browser"], new Set(["execute_source", "network", "database", "shell", "browser"]));
  for (const key of ["execute_source", "network", "database", "shell", "browser"]) {
    if (config.prohibited_actions[key] !== false) invalidConfig(`prohibited_actions.${key} must be false.`);
  }

  requireConfigObject(config.exit_codes, "exit_codes", Object.keys(DEFAULT_EXIT_CODES), new Set(Object.keys(DEFAULT_EXIT_CODES)));
  for (const [key, value] of Object.entries(DEFAULT_EXIT_CODES)) {
    if (config.exit_codes[key] !== value) invalidConfig(`exit_codes.${key} must equal ${value}.`);
  }
  return config;
}

function validateQueryConfig(config, command) {
  if (config.query === undefined) return;
  if (!QUERY_COMMANDS.includes(command)) {
    throw diagnostic("INVALID_CONFIG", "error", "Configuration query is only valid for a query command.");
  }
  if (!config.query || typeof config.query !== "object" || Array.isArray(config.query)) {
    throw diagnostic("INVALID_CONFIG", "error", "Configuration query must be an object.");
  }
  if (Object.hasOwn(config.query, "operation")) {
    throw diagnostic("INVALID_CONFIG", "error", "Configuration query must not contain operation; the command selects it.");
  }
  try {
    validateQueryRequest({ ...config.query, operation: QUERY_OPERATIONS[command] });
  } catch (error) {
    throw diagnostic("INVALID_CONFIG", "error", `Query configuration is invalid: ${error?.message ?? "unknown"}.`);
  }
}

function stderrFor(diagnostics) {
  return diagnostics.map((item) => {
    const location = item.path ? ` [${item.path}]` : "";
    return `${item.severity.toUpperCase()} ${item.code}${location}: ${item.message}\n`;
  }).join("");
}

function result(command, status, diagnostics, data, exitCode, { maxOutputBytes = null, incompleteExitCode = exitCode } = {}) {
  let output = envelope(command, status, diagnostics, data);
  let serialized = serializeBoundedJson(output, { maxBytes: maxOutputBytes, trailingText: "\n" });
  let outputDiagnostics = diagnostics;
  let finalExitCode = exitCode;
  if (!serialized.complete) {
    outputDiagnostics = serialized.diagnostics.map((item) => diagnostic(item.code, item.severity, item.message, item.details));
    output = envelope(command, "incomplete", outputDiagnostics, null);
    serialized = serializeBoundedJson(output, { trailingText: "\n" });
    finalExitCode = incompleteExitCode;
  }
  return { exitCode: finalExitCode, envelope: output, stdout: serialized.output, stderr: stderrFor(outputDiagnostics) };
}

/**
 * Run the stable CLI boundary, including bounded analysis-backed queries.
 *
 * @param {string[]} argv command-line arguments excluding the Node/script prefixes
 * @param {{cwd?: string}} options process-independent test options
 */
export function runCli(argv, { cwd = process.cwd() } = {}) {
  let parsed;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    const item = error?.code ? error : diagnostic("INVALID_INPUT", "error", "Invalid command-line input.");
    return result("unknown", "error", [item], null, DEFAULT_EXIT_CODES.invalid_input);
  }

  if (parsed.command === "help") {
    return result(parsed.command, "completed", [], usageData(), DEFAULT_EXIT_CODES.completed);
  }
  if (parsed.command === "version") {
    return result(parsed.command, "completed", [], { name: TOOL_NAME, version: TOOL_VERSION }, DEFAULT_EXIT_CODES.completed);
  }
  if (parsed.command === "capabilities") {
    return result(parsed.command, "completed", [], {
      commands: { capabilities: "implemented", analyze: "bounded", index: "bounded", queries: "bounded" },
      source_extensions: [".cfm", ".cfml", ".cfc", ".html", ".htm", ".js", ".mjs", ".css", ".sql"],
      foundation: ["root_guard", "deterministic_snapshot", "strict_utf8_decoder", "source_map"],
      safety: { source_execution: false, network: false, database: false, shell: false, browser: false },
    }, DEFAULT_EXIT_CODES.completed);
  }

  let config;
  try {
    config = validateConfig(readConfig(parsed.configPath, cwd));
    validateQueryConfig(config, parsed.command);
  } catch (error) {
    const item = error?.code ? error : diagnostic("INVALID_INPUT", "error", "Configuration validation failed.");
    const code = item.code === "ROOT_NOT_FOUND" || item.code === "ROOT_NOT_DIRECTORY" || item.code === "ROOT_ACCESS_ERROR" ? DEFAULT_EXIT_CODES.path_rejected : DEFAULT_EXIT_CODES.invalid_input;
    return result(parsed.command, "error", [item], null, code);
  }

  try {
    createRootGuard(path.resolve(cwd, config.root));
  } catch (error) {
    const item = error instanceof RootGuardError
      ? diagnostic(error.code, "error", error.message, error.details)
      : diagnostic("ROOT_ACCESS_ERROR", "error", "Analysis root could not be admitted.");
    return result(parsed.command, "error", [item], null, config.exit_codes.path_rejected);
  }

  try {
    const analysis = analyzeProject({
      rootPath: path.resolve(cwd, config.root),
      config,
      parserBackend: createMixedStructuralScannerBackend(),
      parserVersion: "mixed-structural-scanner/v0.1",
      parserName: "mixed-structural-scanner",
      maxFacts: config.limits.max_facts,
      maxEdges: config.limits.max_edges,
      maxResolverRecords: config.limits.max_edges,
      maxTraversalDepth: config.limits.max_traversal_depth,
    });

    if (QUERY_COMMANDS.includes(parsed.command)) {
      let query;
      try {
        query = queryGraph(analysis.graph, { ...(config.query ?? {}), operation: QUERY_OPERATIONS[parsed.command] });
      } catch (error) {
        const item = diagnostic("INVALID_CONFIG", "error", `Query configuration is invalid: ${error?.message ?? "unknown"}.`);
        return result(parsed.command, "error", [item], null, config.exit_codes.invalid_input);
      }
      const status = query.complete ? "completed" : "incomplete";
      const exitCode = query.complete ? config.exit_codes.completed : config.exit_codes.incomplete;
      return result(parsed.command, status, query.diagnostics, query, exitCode, {
        maxOutputBytes: config.limits.max_output_bytes,
        incompleteExitCode: config.exit_codes.incomplete,
      });
    }

    const status = analysis.complete ? "completed" : "incomplete";
    const exitCode = analysis.complete ? config.exit_codes.completed : config.exit_codes.incomplete;
    return result(parsed.command, status, analysis.diagnostics, {
      graph: analysis.graph,
      fact_bundle: analysis.fact_bundle,
      resolutions: analysis.resolutions,
      stats: analysis.stats,
    }, exitCode, { maxOutputBytes: config.limits.max_output_bytes, incompleteExitCode: config.exit_codes.incomplete });
  } catch (error) {
    if (error?.code === "NO_SOURCE_FILES") {
      const item = diagnostic("NO_SOURCE_FILES", "warning", error.message);
      return result(parsed.command, "incomplete", [item], null, config.exit_codes.incomplete);
    }
    const item = diagnostic("ANALYSIS_FAILURE", "error", `Analysis failed: ${error?.code ?? "unknown"}.`);
    return result(parsed.command, "error", [item], null, config.exit_codes.internal_failure);
  }
}
