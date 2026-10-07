#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const TOOL_ID = "agent-cfml-policy-check";
const SCHEMA_VERSION = "1.0.0";
const PROFILE_SCHEMA_VERSION = "1.0.0";
const DEFAULT_LIMITS = Object.freeze({
  max_file_bytes: 262144,
  max_profile_bytes: 65536,
  max_tokens: 10000,
  max_depth: 64,
  max_findings: 1000,
  max_output_bytes: 1048576,
  max_processing_ms: 1000
});
const HARD_LIMITS = Object.freeze({
  max_file_bytes: 4194304,
  max_profile_bytes: 1048576,
  max_tokens: 100000,
  max_depth: 512,
  max_findings: 10000,
  max_output_bytes: 4194304,
  max_processing_ms: 10000
});
const EXIT_CODES = Object.freeze({ ok: 0, internal: 1, invalid: 2, incomplete: 3, security: 4 });
const RULE_IDS = Object.freeze([
  "html.table.requires-colgroup",
  "html.table.requires-col"
]);
const SEVERITIES = new Set(["error", "warning", "info"]);
const VOID_TAGS = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr"
]);

class PolicyError extends Error {
  constructor(code, message, exitCode = EXIT_CODES.invalid) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}

function envelope({ status, complete, data, errors = [], warnings = [], meta = {} }) {
  return {
    schema_version: SCHEMA_VERSION,
    tool: TOOL_ID,
    status,
    complete,
    data,
    errors,
    warnings,
    meta
  };
}

function errorResult(error, meta = {}) {
  return {
    result: envelope({
      status: error.exitCode === EXIT_CODES.incomplete ? "incomplete" : "error",
      complete: false,
      data: null,
      errors: [{ code: error.code, message: error.message }],
      meta
    }),
    exitCode: error.exitCode
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validateInteger(value, name, maximum) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new PolicyError("INVALID_LIMIT", `${name} must be an integer between 1 and ${maximum}.`);
  }
}

function normalizeLimits(input) {
  if (input === undefined) return { ...DEFAULT_LIMITS };
  if (!isPlainObject(input)) throw new PolicyError("INVALID_LIMITS", "limits must be an object.");
  const limits = { ...DEFAULT_LIMITS };
  for (const key of Object.keys(input)) {
    if (!(key in DEFAULT_LIMITS)) throw new PolicyError("INVALID_LIMIT", `Unsupported limit: ${key}.`);
    validateInteger(input[key], key, HARD_LIMITS[key]);
    limits[key] = input[key];
  }
  return limits;
}

function pathIsWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function resolveRoot(rootInput, cwd) {
  if (typeof rootInput !== "string" || rootInput.length === 0) {
    throw new PolicyError("INVALID_ROOT", "An explicit root is required.");
  }
  const root = path.resolve(cwd, rootInput);
  let realRoot;
  try {
    realRoot = fs.realpathSync(root);
  } catch {
    throw new PolicyError("ROOT_NOT_FOUND", "The explicit root does not exist.");
  }
  if (!fs.statSync(realRoot).isDirectory()) {
    throw new PolicyError("INVALID_ROOT", "The explicit root must be a directory.");
  }
  return realRoot;
}

function resolveChild(root, childInput, label) {
  if (typeof childInput !== "string" || childInput.length === 0) {
    throw new PolicyError(`INVALID_${label.toUpperCase()}`, `An explicit ${label} path is required.`);
  }
  if (path.isAbsolute(childInput)) {
    throw new PolicyError("PATH_ESCAPE", `The ${label} path must be relative to the explicit root.`, EXIT_CODES.security);
  }
  const candidate = path.resolve(root, childInput);
  if (!pathIsWithin(root, candidate)) {
    throw new PolicyError("PATH_ESCAPE", `The ${label} path escapes the explicit root.`, EXIT_CODES.security);
  }
  let realCandidate;
  try {
    realCandidate = fs.realpathSync(candidate);
  } catch {
    throw new PolicyError(label === "file" ? "FILE_NOT_FOUND" : "PROFILE_NOT_FOUND", `The selected ${label} does not exist.`);
  }
  if (!pathIsWithin(root, realCandidate)) {
    throw new PolicyError("PATH_ESCAPE", `The selected ${label} resolves outside the explicit root.`, EXIT_CODES.security);
  }
  if (!fs.statSync(realCandidate).isFile()) {
    throw new PolicyError(`INVALID_${label.toUpperCase()}`, `The selected ${label} must be a file.`);
  }
  return {
    absolute: realCandidate,
    relative: path.relative(root, realCandidate).split(path.sep).join("/")
  };
}

function readUtf8Bounded(filePath, maximum, label) {
  let bytes;
  let descriptor;
  const readError = () => new PolicyError(label === "source" ? "FILE_READ_ERROR" : "PROFILE_READ_ERROR", `The selected ${label} could not be read.`);
  const resourceLimit = () => new PolicyError("RESOURCE_LIMIT", `${label} exceeds the configured byte limit.`, EXIT_CODES.incomplete);
  try {
    const expected = fs.statSync(filePath, { bigint: true });
    if (!expected.isFile()) throw readError();
    if (expected.size > BigInt(maximum)) throw resourceLimit();
    descriptor = fs.openSync(filePath, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0) | (fs.constants.O_NONBLOCK ?? 0));
    const opened = fs.fstatSync(descriptor, { bigint: true });
    if (!opened.isFile() || opened.dev !== expected.dev || opened.ino !== expected.ino) throw readError();
    if (opened.size > BigInt(maximum)) throw resourceLimit();
    // Reserve one byte beyond the observed size to detect growth without a full read.
    const buffer = Buffer.alloc(Number(opened.size) + 1);
    let length = 0;
    while (length < buffer.length) {
      const count = fs.readSync(descriptor, buffer, length, buffer.length - length, length);
      if (count === 0) break;
      length += count;
      if (length > maximum) throw resourceLimit();
    }
    const after = fs.fstatSync(descriptor, { bigint: true });
    if (after.size > BigInt(maximum)) throw resourceLimit();
    if (after.size !== BigInt(length) || opened.size !== after.size ||
        opened.mtimeNs !== after.mtimeNs || opened.ctimeNs !== after.ctimeNs) throw readError();
    bytes = buffer.subarray(0, length);
  } catch (error) {
    if (error instanceof PolicyError) throw error;
    throw readError();
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new PolicyError("UNSUPPORTED_ENCODING", `The selected ${label} is not valid UTF-8.`);
  }
}

function validateProfile(profile) {
  if (!isPlainObject(profile)) throw new PolicyError("INVALID_PROFILE", "The policy profile must be a JSON object.");
  const topKeys = new Set(["schema_version", "profile", "rules"]);
  if (Object.keys(profile).some(key => !topKeys.has(key))) throw new PolicyError("INVALID_PROFILE", "The policy profile contains unsupported fields.");
  if (profile.schema_version !== PROFILE_SCHEMA_VERSION) throw new PolicyError("INVALID_PROFILE", `The profile schema_version must be ${PROFILE_SCHEMA_VERSION}.`);
  if (!isPlainObject(profile.profile) || typeof profile.profile.id !== "string" || typeof profile.profile.version !== "string") {
    throw new PolicyError("INVALID_PROFILE", "The profile must contain string id and version fields.");
  }
  if (!Array.isArray(profile.rules) || profile.rules.length === 0) throw new PolicyError("INVALID_PROFILE", "The profile must contain at least one rule.");
  const seen = new Set();
  for (const rule of profile.rules) {
    if (!isPlainObject(rule) || typeof rule.id !== "string" || typeof rule.enabled !== "boolean" || typeof rule.severity !== "string") {
      throw new PolicyError("INVALID_PROFILE", "Each rule requires id, enabled, and severity fields.");
    }
    if (!RULE_IDS.includes(rule.id)) throw new PolicyError("UNSUPPORTED_RULE", `Unsupported rule: ${rule.id}.`);
    if (seen.has(rule.id)) throw new PolicyError("INVALID_PROFILE", `Duplicate rule: ${rule.id}.`);
    if (!SEVERITIES.has(rule.severity)) throw new PolicyError("INVALID_PROFILE", `Unsupported severity for rule ${rule.id}.`);
    if (Object.keys(rule).some(key => !["id", "enabled", "severity"].includes(key))) throw new PolicyError("INVALID_PROFILE", `Unsupported fields in rule ${rule.id}.`);
    seen.add(rule.id);
  }
  return {
    id: profile.profile.id,
    version: profile.profile.version,
    rules: profile.rules.map(rule => ({ ...rule }))
  };
}

function lineStarts(source) {
  const starts = [0];
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function sourcePosition(starts, index) {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= index) low = middle + 1;
    else high = middle - 1;
  }
  const lineIndex = Math.max(0, high);
  return { line: lineIndex + 1, column: index - starts[lineIndex] + 1 };
}

function findTagEnd(source, start) {
  let quote = null;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];
    if (quote !== null) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (character === ">") return index;
  }
  return -1;
}

function parseMarkup(source, limits) {
  const starts = lineStarts(source);
  const stack = [];
  const tables = [];
  const colgroups = [];
  const commentRanges = [];
  let tokens = 0;
  let malformed = false;
  let uncertain = false;
  const started = Date.now();

  for (let index = 0; index < source.length; index += 1) {
    if (Date.now() - started > limits.max_processing_ms) {
      throw new PolicyError("RESOURCE_LIMIT", "Analysis exceeded the processing-time limit.", EXIT_CODES.incomplete);
    }
    if (source[index] !== "<") continue;

    const commentStart = source.startsWith("<!---", index) ? "--->" : source.startsWith("<!--", index) ? "-->" : null;
    if (commentStart !== null) {
      const commentEnd = source.indexOf(commentStart, index + 4);
      if (commentEnd < 0) {
        malformed = true;
        break;
      }
      commentRanges.push([index, commentEnd + commentStart.length]);
      index = commentEnd + commentStart.length - 1;
      continue;
    }

    const end = findTagEnd(source, index);
    if (end < 0) {
      malformed = true;
      break;
    }
    tokens += 1;
    if (tokens > limits.max_tokens) throw new PolicyError("RESOURCE_LIMIT", "Input exceeds the token limit.", EXIT_CODES.incomplete);
    const raw = source.slice(index, end + 1);
    const closingMatch = raw.match(/^<\s*\/\s*([A-Za-z][\w:-]*)/);
    const openingMatch = raw.match(/^<\s*([A-Za-z][\w:-]*)/);
    if (!closingMatch && !openingMatch) {
      index = end;
      continue;
    }
    const name = (closingMatch?.[1] ?? openingMatch[1]).toLowerCase();
    const position = sourcePosition(starts, index);
    if (name.startsWith("cf")) {
      if (name !== "cfoutput") uncertain = true;
      index = end;
      continue;
    }
    if (closingMatch) {
      if (stack.length === 0 || stack.at(-1).name !== name) {
        malformed = true;
        index = end;
        continue;
      }
      stack.pop();
      index = end;
      continue;
    }

    const node = { name, line: position.line, column: position.column, children: [] };
    if (stack.length > 0) stack.at(-1).children.push(node);
    if (name === "table") tables.push(node);
    if (name === "colgroup") colgroups.push(node);
    const selfClosing = /\/\s*>$/.test(raw) || VOID_TAGS.has(name);
    if (!selfClosing) {
      stack.push(node);
      if (stack.length > limits.max_depth) throw new PolicyError("RESOURCE_LIMIT", "Input exceeds the nesting-depth limit.", EXIT_CODES.incomplete);
    }
    index = end;
  }

  if (stack.length > 0) malformed = true;
  let visibleSource = source;
  for (const [start, end] of commentRanges) visibleSource = `${visibleSource.slice(0, start)}${" ".repeat(end - start)}${visibleSource.slice(end)}`;
  const hashExpression = visibleSource.replaceAll("##", "").includes("#");
  uncertain = uncertain || hashExpression;
  const relevantUncertainty = malformed || (uncertain && (tables.length > 0 || colgroups.length > 0));
  return { tables, colgroups, relevantUncertainty, tokens };
}

function checkSource(source, profile, limits) {
  const parsed = parseMarkup(source, limits);
  if (parsed.relevantUncertainty) {
    throw new PolicyError("CFML_STRUCTURE_UNCERTAIN", "The selected source contains malformed or dynamically generated structure affecting the requested policy.", EXIT_CODES.incomplete);
  }
  const enabled = new Map(profile.rules.filter(rule => rule.enabled).map(rule => [rule.id, rule]));
  const findings = [];
  if (enabled.has("html.table.requires-colgroup")) {
    for (const table of parsed.tables) {
      if (!table.children.some(child => child.name === "colgroup")) {
        findings.push({
          rule_id: "html.table.requires-colgroup",
          severity: enabled.get("html.table.requires-colgroup").severity,
          message: "Table must contain a direct colgroup element.",
          line: table.line,
          column: table.column
        });
      }
    }
  }
  if (enabled.has("html.table.requires-col")) {
    for (const colgroup of parsed.colgroups) {
      if (!colgroup.children.some(child => child.name === "col")) {
        findings.push({
          rule_id: "html.table.requires-col",
          severity: enabled.get("html.table.requires-col").severity,
          message: "Colgroup must contain at least one direct col element.",
          line: colgroup.line,
          column: colgroup.column
        });
      }
    }
  }
  findings.sort((left, right) => left.line - right.line || left.column - right.column || left.rule_id.localeCompare(right.rule_id));
  if (findings.length > limits.max_findings) throw new PolicyError("RESOURCE_LIMIT", "The finding limit was exceeded.", EXIT_CODES.incomplete);
  return findings;
}

function capabilities(limits) {
  return {
    result: envelope({
      status: "ok",
      complete: true,
      data: {
        profile: "cfml-policy-v1",
        operations: ["capabilities", "check"],
        source_extensions: [".cfm", ".cfc"],
        rules: [...RULE_IDS],
        input: {
          check_requires: ["root", "file", "profile"],
          profile_format: "local JSON",
          stdin: false
        }
      },
      meta: { scope: "capabilities", limits }
    }),
    exitCode: EXIT_CODES.ok
  };
}

function helpResult() {
  return {
    result: envelope({
      status: "ok",
      complete: true,
      data: {
        usage: "agent-cfml-policy-check check --root ROOT --file FILE --profile PROFILE --json",
        ait_usage: "echo '{\"operation\":\"check\",\"root\":\".\",\"file\":\"file.cfm\",\"profile\":\"profile.json\"}' | agent-cfml-policy-check ait"
      },
      meta: { scope: "help" }
    }),
    exitCode: EXIT_CODES.ok
  };
}

function versionResult() {
  return {
    result: envelope({
      status: "ok",
      complete: true,
      data: { version: "0.1.0" },
      meta: { scope: "version" }
    }),
    exitCode: EXIT_CODES.ok
  };
}

export function runRequest(request, { cwd = process.cwd() } = {}) {
  try {
    if (!isPlainObject(request)) throw new PolicyError("INVALID_REQUEST", "The request must be a JSON object.");
    const operation = request.operation;
    const limits = normalizeLimits(request.limits);
    if (operation === "help") return helpResult();
    if (operation === "version") return versionResult();
    if (operation === "capabilities") return capabilities(limits);
    if (operation !== "check") throw new PolicyError("INVALID_OPERATION", "operation must be capabilities or check.");
    const root = resolveRoot(request.root, cwd);
    const file = resolveChild(root, request.file, "file");
    const profileFile = resolveChild(root, request.profile, "profile");
    if (!file.relative.toLowerCase().endsWith(".cfm") && !file.relative.toLowerCase().endsWith(".cfc")) {
      throw new PolicyError("UNSUPPORTED_EXTENSION", "The selected file must use .cfm or .cfc.");
    }
    const profileText = readUtf8Bounded(profileFile.absolute, limits.max_profile_bytes, "profile");
    let profile;
    try {
      profile = validateProfile(JSON.parse(profileText));
    } catch (error) {
      if (error instanceof PolicyError) throw error;
      throw new PolicyError("INVALID_PROFILE", "The policy profile is not valid JSON.");
    }
    const source = readUtf8Bounded(file.absolute, limits.max_file_bytes, "source");
    const findings = checkSource(source, profile, limits);
    const result = envelope({
      status: "ok",
      complete: true,
      data: {
        verdict: findings.length === 0 ? "pass" : "violations",
        finding_count: findings.length,
        findings,
        profile: { id: profile.id, version: profile.version }
      },
      meta: {
        scope: "one explicit local CFML file",
        path: file.relative,
        profile_id: profile.id,
        profile_version: profile.version,
        limits
      }
    });
    return { result, exitCode: EXIT_CODES.ok };
  } catch (error) {
    const normalized = error instanceof PolicyError
      ? error
      : new PolicyError("INTERNAL_ERROR", "The policy check failed unexpectedly.", EXIT_CODES.internal);
    return errorResult(normalized);
  }
}

function parseCli(argv) {
  const operation = argv[0] === "--help" || argv[0] === "-h"
    ? "help"
    : argv[0] === "--version" ? "version" : argv[0] ?? "";
  const request = { operation, json: true };
  let index = 1;
  while (index < argv.length) {
    const argument = argv[index];
    if (argument === "--json") request.json = true;
    else if (argument === "--pretty") request.pretty = true;
    else if (["--root", "--file", "--profile", "--limits"].includes(argument)) {
      if (index + 1 >= argv.length) throw new PolicyError("INVALID_REQUEST", `${argument} requires a value.`);
      const value = argv[index + 1];
      if (argument === "--limits") {
        try { request.limits = JSON.parse(value); } catch { throw new PolicyError("INVALID_LIMITS", "--limits must contain valid JSON."); }
      } else request[argument.slice(2)] = value;
      index += 1;
    } else {
      throw new PolicyError("INVALID_FLAG", `Unknown option: ${argument}.`);
    }
    index += 1;
  }
  return request;
}

function serializeResult(result, pretty = false, maximum = DEFAULT_LIMITS.max_output_bytes) {
  const indent = pretty ? 2 : 0;
  let text = JSON.stringify(result, null, indent);
  if (Buffer.byteLength(text, "utf8") <= maximum) return { text: `${text}\n`, exitCode: null };
  const limited = envelope({
    status: "incomplete",
    complete: false,
    data: null,
    errors: [{ code: "RESOURCE_LIMIT", message: "The result exceeds the configured output limit." }],
    meta: { scope: "bounded output" }
  });
  text = JSON.stringify(limited);
  return { text: `${text}\n`, exitCode: EXIT_CODES.incomplete };
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

async function main() {
  let request;
  try {
    if (process.argv[2] === "ait") request = await readStdin();
    else request = parseCli(process.argv.slice(2));
  } catch (error) {
    const normalized = error instanceof PolicyError ? error : new PolicyError("INVALID_REQUEST", "The request is not valid.");
    const { result, exitCode } = errorResult(normalized);
    const serialized = serializeResult(result, false);
    process.stdout.write(serialized.text);
    process.exitCode = serialized.exitCode ?? exitCode;
    return;
  }
  const { result, exitCode } = runRequest(request);
  const maximum = request.limits?.max_output_bytes ?? DEFAULT_LIMITS.max_output_bytes;
  const serialized = serializeResult(result, request.pretty === true, maximum);
  process.stdout.write(serialized.text);
  process.exitCode = serialized.exitCode ?? exitCode;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
