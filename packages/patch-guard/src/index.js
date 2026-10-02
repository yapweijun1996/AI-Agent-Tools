import { parseDiff, patchError, safeRelativePath } from "./diff.js";

export const LIMITS = Object.freeze({
  max_input_bytes: 1048576,
  max_files: 256,
  max_changed_lines: 20000,
  max_findings: 256,
  max_output_bytes: 65536,
});
export const BUILTIN_RULES = Object.freeze([
  "OUT_OF_SCOPE", "PROTECTED_PATH", "DELETION", "RENAME", "BINARY", "SYMLINK",
  "GENERATED_PATH", "LOCKFILE", "MAX_FILES", "MAX_ADDED_LINES", "MAX_DELETED_LINES",
]);
const SCOPE = "Explicit supplied Git unified diff artifact; no repository traversal or patch application";
const ORIGINS = ["snapshot", "staged", "unstaged", "untracked"];
const POLICY_BYTES = 65536;
const POLICY_ENTRIES = 256;
const MESSAGES = Object.freeze({
  INVALID_INPUT: "Input does not match the documented contract.",
  INVALID_ENCODING: "An input artifact is not valid UTF-8.",
  INPUT_IO: "Unable to read an explicit input artifact.",
  INPUT_CHANGED: "An input artifact changed during capture.",
  INCOMPLETE_RESULT: "The supplied evidence is incomplete.",
  UNSUPPORTED_INPUT: "The supplied evidence includes unsupported content.",
  AMBIGUOUS_INPUT: "The supplied evidence cannot be interpreted unambiguously.",
  UNSAFE_PATH: "A supplied path violates the root-relative path boundary.",
  RESOURCE_LIMIT: "The request exceeds a declared resource limit.",
  INTERNAL_ERROR: "The operation could not complete.",
});
const record = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = () => { throw patchError("INVALID_INPUT"); };
const resource = () => { throw patchError("RESOURCE_LIMIT", "incomplete"); };
const compare = (left, right) => left < right ? -1 : left > right ? 1 : 0;
const own = (value, key) => Object.hasOwn(value, key);
function keys(value, allowed) {
  if (!record(value) || Object.keys(value).some((key) => !allowed.includes(key))) invalid();
}

function envelope(status, data, errors, limits) {
  return {
    schema_version: "1.0.0",
    tool: { id: "agent-patch-guard", version: "0.1.0" },
    status,
    complete: status === "ok",
    data,
    errors,
    warnings: [],
    meta: { scope: SCOPE, limits: { ...limits } },
  };
}

export function failure(code, status = "error", limits = LIMITS) {
  const safeCode = own(MESSAGES, code) ? code : "INTERNAL_ERROR";
  const safeStatus = ["error", "incomplete"].includes(status) ? status : "error";
  return envelope(safeStatus, null, [{ code: safeCode, message: MESSAGES[safeCode] }], limits);
}

function effectiveLimits(overrides = {}) {
  keys(overrides, Object.keys(LIMITS));
  const limits = { ...LIMITS };
  for (const [key, value] of Object.entries(overrides)) {
    const minimum = key === "max_output_bytes" ? 1024 : 1;
    if (!Number.isSafeInteger(value) || value < minimum || value > LIMITS[key]) invalid();
    limits[key] = value;
  }
  return limits;
}

function countPolicyText(value, budget) {
  budget.bytes += Buffer.byteLength(value, "utf8");
  if (budget.bytes > POLICY_BYTES) resource();
}
function selectors(value, required = false, budget = { bytes: 0 }) {
  if (!Array.isArray(value) || (required && value.length === 0)) invalid();
  if (value.length > POLICY_ENTRIES) resource();
  const paths = new Set();
  for (const selector of value) {
    if (typeof selector !== "string" || !selector || selector.length > 1024) invalid();
    countPolicyText(selector, budget);
    if (selector !== "*") {
      if (/[*?\[\]{}"]/.test(selector)) invalid();
      try { safeRelativePath(selector.endsWith("/") ? selector.slice(0, -1) : selector); }
      catch { invalid(); }
    }
    if (paths.has(selector)) invalid();
    paths.add(selector);
  }
  return [...paths].sort(compare);
}

const PATH_ARRAYS = ["allowed_paths", "protected_paths", "generated_paths", "lockfile_paths"];
const ALLOW_FLAGS = ["allow_deletions", "allow_renames", "allow_binary", "allow_symlinks", "allow_generated", "allow_lockfiles"];
const COUNT_FIELDS = ["max_files", "max_added_lines", "max_deleted_lines"];

export function validatePolicy(input) {
  keys(input, ["schema_version", ...PATH_ARRAYS, ...ALLOW_FLAGS, ...COUNT_FIELDS, "content_rules", "exceptions"]);
  if (input.schema_version !== "1.0.0" || !own(input, "allowed_paths")) invalid();
  const policy = { schema_version: "1.0.0" };
  const budget = { bytes: 0 };
  for (const key of PATH_ARRAYS) policy[key] = selectors(own(input, key) ? input[key] : [], key === "allowed_paths", budget);
  for (const key of ALLOW_FLAGS) {
    if (own(input, key) && typeof input[key] !== "boolean") invalid();
    policy[key] = input[key] ?? false;
  }
  for (const key of COUNT_FIELDS) {
    if (own(input, key)) {
      const bound = key === "max_files" ? LIMITS.max_files : LIMITS.max_changed_lines;
      if (!Number.isSafeInteger(input[key]) || input[key] < (key === "max_files" ? 1 : 0) || input[key] > bound) invalid();
      policy[key] = input[key];
    }
  }
  if (own(input, "content_rules") && !Array.isArray(input.content_rules)) invalid();
  const rules = input.content_rules ?? [];
  if (rules.length > POLICY_ENTRIES) resource();
  const ids = new Set(BUILTIN_RULES);
  policy.content_rules = [];
  for (const rule of rules) {
    keys(rule, ["id", "needle", "severity"]);
    if (typeof rule.id !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(rule.id) || ids.has(rule.id) ||
        typeof rule.needle !== "string" || !rule.needle || rule.needle.length > 128 || /[\r\n\0]/.test(rule.needle) ||
        !["error", "warning"].includes(rule.severity)) invalid();
    ids.add(rule.id);
    countPolicyText(rule.id, budget);
    countPolicyText(rule.needle, budget);
    policy.content_rules.push({ id: rule.id, needle: rule.needle, severity: rule.severity });
  }
  policy.content_rules.sort((left, right) => compare(left.id, right.id));
  if (own(input, "exceptions") && !Array.isArray(input.exceptions)) invalid();
  const exceptions = input.exceptions ?? [];
  if (exceptions.length > POLICY_ENTRIES) resource();
  policy.exceptions = [];
  for (const exception of exceptions) {
    keys(exception, ["rule_id", "paths"]);
    if (typeof exception.rule_id !== "string" || !ids.has(exception.rule_id) || COUNT_FIELDS.some((key) => key.toUpperCase() === exception.rule_id)) invalid();
    countPolicyText(exception.rule_id, budget);
    policy.exceptions.push({ rule_id: exception.rule_id, paths: selectors(exception.paths, true, budget) });
  }
  policy.exceptions.sort((left, right) => compare(left.rule_id, right.rule_id) || compare(left.paths.join("\0"), right.paths.join("\0")));
  let text;
  try { text = JSON.stringify(input); } catch { invalid(); }
  if (Buffer.byteLength(text, "utf8") > POLICY_BYTES) resource();
  return policy;
}

function matches(path, selector) {
  return selector === "*" || (selector.endsWith("/") ? path.startsWith(selector) : path === selector);
}
function inPaths(path, paths) { return paths.some((selector) => matches(path, selector)); }
function orderFindings(left, right) {
  return compare(left.path ?? "", right.path ?? "") || compare(left.rule_id, right.rule_id) ||
    (left.line ?? 0) - (right.line ?? 0) || (left.diff_line ?? 0) - (right.diff_line ?? 0) || compare(left.severity, right.severity);
}
function bounded(result, limits) {
  return Buffer.byteLength(JSON.stringify(result), "utf8") + 1 > limits.max_output_bytes
    ? failure("RESOURCE_LIMIT", "incomplete", limits) : result;
}

export function checkPatch(diffText, inputPolicy, options = {}) {
  let limits = LIMITS;
  try {
    keys(options, ["origin", "limits"]);
    if (own(options, "limits") && !record(options.limits)) invalid();
    limits = effectiveLimits(own(options, "limits") ? options.limits : {});
    const origin = own(options, "origin") ? options.origin : "snapshot";
    if (!ORIGINS.includes(origin)) invalid();
    if (typeof diffText !== "string") invalid();
    const policy = validatePolicy(inputPolicy);
    if (Buffer.byteLength(JSON.stringify(inputPolicy), "utf8") > limits.max_input_bytes) resource();
    const parsed = parseDiff(diffText, limits);
    if (origin === "untracked" && parsed.some((file) => file.kind !== "added")) invalid();
    if (parsed.some((file) => file.binary) && (policy.content_rules.length ||
        own(policy, "max_added_lines") || own(policy, "max_deleted_lines"))) {
      throw patchError("UNSUPPORTED_INPUT", "incomplete");
    }
    parsed.sort((left, right) => compare(left.path, right.path) || compare(left.previous_path ?? "", right.previous_path ?? ""));
    const findings = [];
    const exceptionsApplied = [];
    let observed = 0;
    const add = (ruleId, path = null, severity = "error", line = null, diffLine = null) => {
      observed += 1;
      if (observed > limits.max_findings) resource();
      const finding = { rule_id: ruleId, severity, path, line, diff_line: diffLine };
      const excepted = path !== null && policy.exceptions.some((exception) => exception.rule_id === ruleId && inPaths(path, exception.paths));
      (excepted ? exceptionsApplied : findings).push(finding);
    };
    const files = [];
    const summary = { files: parsed.length, added_lines: 0, deleted_lines: 0 };
    for (const file of parsed) {
      const { addedContent, ...publicFile } = file;
      files.push(publicFile);
      summary.added_lines += file.added_lines;
      summary.deleted_lines += file.deleted_lines;
      const paths = [...new Set([file.path, file.previous_path].filter((path) => path !== null))].sort(compare);
      for (const path of paths) {
        if (!inPaths(path, policy.allowed_paths)) add("OUT_OF_SCOPE", path);
        if (inPaths(path, policy.protected_paths)) add("PROTECTED_PATH", path);
        if (file.kind === "deleted" && !policy.allow_deletions) add("DELETION", path);
        if (file.kind === "renamed" && !policy.allow_renames) add("RENAME", path);
        if (file.binary && !policy.allow_binary) add("BINARY", path);
        if (file.symlink && !policy.allow_symlinks) add("SYMLINK", path);
        if (inPaths(path, policy.generated_paths) && !policy.allow_generated) add("GENERATED_PATH", path);
        if (inPaths(path, policy.lockfile_paths) && !policy.allow_lockfiles) add("LOCKFILE", path);
      }
      for (const row of addedContent) {
        for (const rule of policy.content_rules) {
          if (row.text.includes(rule.needle)) add(rule.id, file.path, rule.severity, row.line, row.diff_line);
        }
      }
    }
    if (own(policy, "max_files") && summary.files > policy.max_files) add("MAX_FILES");
    if (own(policy, "max_added_lines") && summary.added_lines > policy.max_added_lines) add("MAX_ADDED_LINES");
    if (own(policy, "max_deleted_lines") && summary.deleted_lines > policy.max_deleted_lines) add("MAX_DELETED_LINES");
    findings.sort(orderFindings);
    exceptionsApplied.sort(orderFindings);
    return bounded(envelope("ok", {
      verdict: findings.some((finding) => finding.severity === "error") ? "violations" : "pass",
      origin,
      summary,
      files,
      findings,
      exceptions_applied: exceptionsApplied,
    }, [], limits), limits);
  } catch (error) {
    const code = own(MESSAGES, error?.code) ? error.code : "INTERNAL_ERROR";
    return failure(code, error?.status ?? "error", limits);
  }
}

export function capabilities() {
  return envelope("ok", {
    operations: ["capabilities", "check"],
    origins: [...ORIGINS],
    policy_schema_version: "1.0.0",
    rule_ids: [...BUILTIN_RULES],
    limits: { ...LIMITS },
    supports: { git_unified_diff: true, renames: true, mode_changes: true, binary_markers: true, symlink_metadata: true },
    limitations: [
      "Only explicit supplied Git unified diff artifacts are inspected; origin is caller-labelled.",
      "No patch application, repository traversal, secret classification, or filesystem target inspection.",
      "Quoted paths, combined/copy/gitlink diffs, Git binary payloads, and unknown metadata are unsupported.",
      "Binary-marker contents are uninspected; content rules or line-count policies make that evidence incomplete.",
      "Literal content rules inspect added lines only; findings never include source contents.",
      "Policy artifacts are bounded to 65536 UTF-8 bytes and 256 entries per array.",
    ],
  }, [], LIMITS);
}

export function encodeResult(result) {
  try {
    const limits = effectiveLimits(result?.meta?.limits ?? {});
    return JSON.stringify(bounded(result, limits));
  } catch {
    return JSON.stringify(failure("INTERNAL_ERROR"));
  }
}

export function exitCode(result) {
  if (result?.status === "ok" && result.complete === true) return 0;
  if (result?.status === "incomplete" && result.complete === false) return 3;
  const code = result?.errors?.[0]?.code;
  if (code === "UNSAFE_PATH") return 4;
  if (code === "INTERNAL_ERROR") return 1;
  return 2;
}
