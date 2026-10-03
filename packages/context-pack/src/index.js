import { InputError, parseJson, readArtifact, relativePath } from "./input.js";

export const LIMITS = Object.freeze({
  max_items: 64,
  max_locators: 16,
  max_manifest_bytes: 65536,
  max_artifact_bytes: 262144,
  max_total_bytes: 1048576,
  max_budget_bytes: 1048576,
  max_output_bytes: 1048576,
});
const MIN_BUDGET = 1024;
const PROFILE = "context-pack-v1";
const UNIT = "utf8-bytes";
const SCOPE = "Explicit supplied Hub-envelope artifacts under one declared snapshot; caller-declared relevance, exact duplicates and a UTF-8 byte budget";
const ERRORS = new Set(["INVALID_INPUT", "INVALID_ENCODING", "INPUT_IO", "UNSAFE_PATH", "INTERNAL_ERROR"]);
const MESSAGES = Object.freeze({
  INVALID_INPUT: "Input does not match the documented contract.",
  INVALID_ENCODING: "An input file is not valid UTF-8.",
  INPUT_IO: "Unable to read an explicit local input.",
  UNSAFE_PATH: "A supplied path violates the root-relative path boundary.",
  INTERNAL_ERROR: "The operation could not complete.",
  UNSUPPORTED_INPUT: "The manifest requests an unsupported version, profile or budget unit.",
  UNSUPPORTED_CONTRACT: "A mandatory artifact is not a supported Hub result envelope.",
  INCOMPLETE_EVIDENCE: "A mandatory artifact reports an incomplete or failed result.",
  SNAPSHOT_MISMATCH: "An item declares a snapshot different from the manifest snapshot.",
  ARTIFACT_MISMATCH: "An artifact does not match its declared tool identity or digest.",
  MANDATORY_OVERFLOW: "Mandatory items do not fit the declared budget.",
  BUDGET_TOO_SMALL: "The budget cannot hold the result metadata.",
  RESOURCE_LIMIT: "The request exceeds a declared resource limit.",
  INPUT_CHANGED: "A local input changed during capture.",
});
const REASONS = Object.freeze(["budget", "duplicate-artifact", "duplicate-locator", "incomplete-evidence", "unsupported-contract"]);
const LONGEST_REASON = REASONS.reduce((a, b) => (b.length > a.length ? b : a));
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const TOOL_ID = /^[a-z][a-z0-9-]{0,63}$/;
const VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const SNAPSHOT = /^[A-Za-z0-9._:/@+=-]{1,128}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const own = (value, key) => Object.hasOwn(value, key);
const record = (value) => value !== null && typeof value === "object" && !Array.isArray(value) &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = () => { throw new InputError("INVALID_INPUT"); };
const bytesOf = (text) => Buffer.byteLength(text, "utf8");
function keys(value, allowed, required = []) {
  if (!record(value) || Reflect.ownKeys(value).some((key) => !allowed.includes(key)) ||
      required.some((key) => !own(value, key))) invalid();
}

function effectiveLimits(overrides = {}) {
  keys(overrides, Object.keys(LIMITS));
  const limits = { ...LIMITS };
  for (const key of Reflect.ownKeys(overrides)) {
    const value = overrides[key];
    const floor = key === "max_output_bytes" ? 1024 : key === "max_budget_bytes" ? MIN_BUDGET : 1;
    if (!Number.isSafeInteger(value) || value < floor || value > LIMITS[key]) invalid();
    limits[key] = value;
  }
  return limits;
}
function envelope(status, data, errors, limits) {
  return {
    schema_version: "1.0.0",
    tool: { id: "agent-context-pack", version: "0.1.0" },
    status, complete: status === "ok", data, errors, warnings: [],
    meta: { scope: SCOPE, limits: { ...limits } },
  };
}
export function failure(code, limits = LIMITS) {
  const safeCode = typeof code === "string" && own(MESSAGES, code) ? code : "INTERNAL_ERROR";
  let safeLimits;
  try { safeLimits = effectiveLimits(limits); } catch { safeLimits = { ...LIMITS }; }
  return envelope(ERRORS.has(safeCode) ? "error" : "incomplete", null,
    [{ code: safeCode, message: MESSAGES[safeCode] }], safeLimits);
}
function bounded(result, limits) {
  return bytesOf(JSON.stringify(result)) + 1 > limits.max_output_bytes ? failure("RESOURCE_LIMIT", limits) : result;
}

function snapshotOf(value) {
  if (typeof value !== "string" || !SNAPSHOT.test(value)) invalid();
  return value;
}
function parseLocators(value, limits) {
  if (value === undefined) return [];
  if (!Array.isArray(value)) invalid();
  if (value.length > limits.max_locators) throw new InputError("RESOURCE_LIMIT");
  const seen = new Set();
  const locators = value.map((locator) => {
    keys(locator, ["path", "start_line", "end_line"], ["path", "start_line", "end_line"]);
    const { start_line: start, end_line: end } = locator;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 1 || end < start || end > 1e9) invalid();
    const parsed = { path: relativePath(locator.path, "INVALID_INPUT"), start_line: start, end_line: end };
    const key = `${parsed.path}:${start}-${end}`;
    if (seen.has(key)) invalid();
    seen.add(key);
    return parsed;
  });
  return locators.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.start_line - b.start_line || a.end_line - b.end_line));
}
function parseManifest(text, limits) {
  const manifest = parseJson(text);
  keys(manifest, ["manifest_version", "profile", "task", "snapshot", "budget", "items"],
    ["manifest_version", "profile", "task", "snapshot", "budget", "items"]);
  if (typeof manifest.manifest_version !== "string" || typeof manifest.profile !== "string") invalid();
  keys(manifest.task, ["id", "target"], ["id"]);
  if (typeof manifest.task.id !== "string" || !ID.test(manifest.task.id)) invalid();
  const target = manifest.task.target ?? null;
  if (target !== null && (typeof target !== "string" || !target || bytesOf(target) > 1024 ||
      /[\u0000-\u001f\u007f-\u009f]/u.test(target))) invalid();
  const snapshot = snapshotOf(manifest.snapshot);
  keys(manifest.budget, ["unit", "max"], ["unit", "max"]);
  if (typeof manifest.budget.unit !== "string" || !Number.isSafeInteger(manifest.budget.max) ||
      manifest.budget.max < MIN_BUDGET) invalid();
  if (manifest.budget.max > limits.max_budget_bytes) throw new InputError("RESOURCE_LIMIT");
  if (!Array.isArray(manifest.items) || !manifest.items.length) invalid();
  if (manifest.items.length > limits.max_items) throw new InputError("RESOURCE_LIMIT");
  const ids = new Set();
  const items = manifest.items.map((item) => {
    keys(item, ["id", "artifact", "tool", "snapshot", "sha256", "mandatory", "priority", "locators"],
      ["id", "artifact", "tool", "snapshot"]);
    if (typeof item.id !== "string" || !ID.test(item.id) || ids.has(item.id)) invalid();
    ids.add(item.id);
    keys(item.tool, ["id", "version"], ["id", "version"]);
    if (typeof item.tool.id !== "string" || !TOOL_ID.test(item.tool.id) ||
        typeof item.tool.version !== "string" || !VERSION.test(item.tool.version)) invalid();
    if (own(item, "sha256") && (typeof item.sha256 !== "string" || !SHA256.test(item.sha256))) invalid();
    if (own(item, "mandatory") && typeof item.mandatory !== "boolean") invalid();
    if (own(item, "priority") && (!Number.isSafeInteger(item.priority) || item.priority < 0 || item.priority > 1000)) invalid();
    const locators = parseLocators(item.locators, limits);
    return {
      id: item.id, artifact: relativePath(item.artifact), tool: { id: item.tool.id, version: item.tool.version },
      snapshot: snapshotOf(item.snapshot), sha256: item.sha256 ?? null,
      mandatory: item.mandatory ?? false, priority: item.priority ?? 0, locators,
    };
  }).sort((a, b) => (a.id < b.id ? -1 : 1));
  // Values below parsed fully before any support decision so shape errors win.
  if (manifest.manifest_version !== "1.0.0" || manifest.profile !== PROFILE || manifest.budget.unit !== UNIT) {
    if (!/^\d+\.\d+\.\d+$/.test(manifest.manifest_version)) invalid();
    throw new InputError("UNSUPPORTED_INPUT");
  }
  return { task: { id: manifest.task.id, target }, snapshot, max: manifest.budget.max, items };
}

// Consumer rules from the Hub JSON standard: major 1, consistent status, required fields.
function classify(artifact) {
  const e = artifact;
  if (!record(e)) return "unsupported-contract";
  const required = ["schema_version", "tool", "status", "complete", "data", "errors", "warnings", "meta"];
  if (required.some((key) => !own(e, key)) || typeof e.schema_version !== "string" ||
      !/^1\.\d+\.\d+$/.test(e.schema_version) || !record(e.tool) || typeof e.tool.id !== "string" ||
      typeof e.tool.version !== "string" || !["ok", "incomplete", "error"].includes(e.status) ||
      typeof e.complete !== "boolean" || !Array.isArray(e.errors) || !Array.isArray(e.warnings) ||
      !record(e.meta) || typeof e.meta.scope !== "string" || !record(e.meta.limits)) return "unsupported-contract";
  if (e.status === "ok") {
    if (e.complete !== true || !record(e.data) || e.errors.length) return "unsupported-contract";
    return "ok";
  }
  if (e.complete !== false || e.data !== null || !e.errors.length) return "unsupported-contract";
  return "incomplete-evidence";
}

function loadItems(root, manifest, limits) {
  for (const item of manifest.items) if (item.snapshot !== manifest.snapshot) throw new InputError("SNAPSHOT_MISMATCH");
  let total = 0;
  return manifest.items.map((item) => {
    const file = readArtifact(root, item.artifact, [".json"], Math.min(limits.max_artifact_bytes, limits.max_total_bytes - total));
    total += file.bytes;
    if (item.sha256 !== null && item.sha256 !== file.sha256) throw new InputError("ARTIFACT_MISMATCH");
    const parsed = parseJson(file.text);
    const state = classify(parsed);
    if (state !== "unsupported-contract" && (parsed.tool.id !== item.tool.id || parsed.tool.version !== item.tool.version))
      throw new InputError("ARTIFACT_MISMATCH");
    return {
      ...item, state, artifact: { path: item.artifact, sha256: file.sha256, bytes: file.bytes },
      data: state === "ok" ? parsed.data : null,
    };
  });
}

const rankOrder = (a, b) => Number(b.mandatory) - Number(a.mandatory) || b.priority - a.priority || (a.id < b.id ? -1 : 1);
const locatorKey = (l) => `${l.path}:${l.start_line}-${l.end_line}`;
function overlapsWith(candidate, included) {
  const found = [];
  for (const other of included) {
    const paths = new Set();
    for (const a of candidate.locators) for (const b of other.locators) {
      if (a.path === b.path && a.start_line <= b.end_line && b.start_line <= a.end_line) paths.add(a.path);
    }
    for (const path of paths) found.push({ path, ids: [other.id, candidate.id].sort() });
  }
  return found;
}
const byOverlap = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.ids[0] < b.ids[0] ? -1 : a.ids[0] > b.ids[0] ? 1 : a.ids[1] < b.ids[1] ? -1 : a.ids[1] > b.ids[1] ? 1 : 0);
const recordOf = (item, order) => ({
  id: item.id, order, mandatory: item.mandatory, priority: item.priority, tool: item.tool, snapshot: item.snapshot,
  artifact: item.artifact, locators: item.locators, data: item.data,
});

function assemble(manifestSha, manifest, items, limits) {
  const maxId = Math.max(...items.map((item) => item.id.length));
  const bound = (item) => ({ id: item.id, reason: LONGEST_REASON, duplicate_of: "x".repeat(maxId) });
  for (const item of items) if (item.mandatory && item.state !== "ok")
    throw new InputError(item.state === "incomplete-evidence" ? "INCOMPLETE_EVIDENCE" : "UNSUPPORTED_CONTRACT");
  const omitted = items.filter((item) => item.state !== "ok").map((item) => ({ id: item.id, reason: item.state, duplicate_of: null }));
  const ranked = items.filter((item) => item.state === "ok").sort(rankOrder);
  const base = (includedCount, pending, extraOmitted, overlaps, used) => ({
    profile: PROFILE, task: manifest.task, snapshot: manifest.snapshot, manifest_sha256: manifestSha,
    content_trust: "untrusted-data", budget: { unit: UNIT, max: manifest.max, used },
    counts: { declared: items.length, included: includedCount, omitted: omitted.length + extraOmitted.length + pending.length },
    included: [], omitted: [...omitted, ...extraOmitted, ...pending.map(bound)].sort((a, b) => (a.id < b.id ? -1 : 1)),
    overlaps: [...overlaps].sort(byOverlap),
  });
  // Exact size of the full envelope (with trailing newline) when `records` are included; used is
  // measured at its upper bound so the real figure, which has no more digits, always also fits.
  const measure = (pending, extraOmitted, overlaps, recordBytes) => {
    const skeleton = envelope("ok", base(recordBytes.length, pending, extraOmitted, overlaps, manifest.max), [], limits);
    return bytesOf(JSON.stringify(skeleton)) + 1 + recordBytes.reduce((sum, n) => sum + n, 0) + Math.max(0, recordBytes.length - 1);
  };
  if (measure(ranked, [], [], []) > manifest.max) throw new InputError("BUDGET_TOO_SMALL");
  const included = [];
  const recordBytes = [];
  const extraOmitted = [];
  let overlaps = [];
  const shaOwner = new Map();
  const locatorOwner = new Map();
  ranked.forEach((item, index) => {
    const same = shaOwner.get(item.artifact.sha256);
    if (same) { extraOmitted.push({ id: item.id, reason: "duplicate-artifact", duplicate_of: same }); return; }
    if (!item.mandatory && item.locators.length && item.locators.every((l) => locatorOwner.has(locatorKey(l)))) {
      extraOmitted.push({ id: item.id, reason: "duplicate-locator", duplicate_of: locatorOwner.get(locatorKey(item.locators[0])) });
      return;
    }
    const record = recordOf(item, included.length + 1);
    const candidateOverlaps = [...overlaps, ...overlapsWith(item, included)];
    const candidateBytes = [...recordBytes, bytesOf(JSON.stringify(record))];
    if (measure(ranked.slice(index + 1), extraOmitted, candidateOverlaps, candidateBytes) <= manifest.max) {
      included.push(item); recordBytes.push(candidateBytes.at(-1)); overlaps = candidateOverlaps;
      shaOwner.set(item.artifact.sha256, item.id);
      for (const l of item.locators) if (!locatorOwner.has(locatorKey(l))) locatorOwner.set(locatorKey(l), item.id);
    } else if (item.mandatory) throw new InputError("MANDATORY_OVERFLOW");
    else extraOmitted.push({ id: item.id, reason: "budget", duplicate_of: null });
  });
  let used = manifest.max;
  for (let attempt = 0; attempt < 8; attempt++) {
    const data = base(included.length, [], extraOmitted, overlaps, used);
    data.included = included.map((item, index) => recordOf(item, index + 1));
    const result = envelope("ok", data, [], limits);
    const actual = bytesOf(JSON.stringify(result)) + 1;
    if (actual > manifest.max) break;
    if (actual === used) return result;
    used = actual;
  }
  throw new InputError("INTERNAL_ERROR");
}

export function packContext(options) {
  let limits = LIMITS;
  try {
    keys(options, ["root", "manifest", "limits"], ["root", "manifest"]);
    if (own(options, "limits")) {
      if (!record(options.limits)) invalid();
      limits = effectiveLimits(options.limits);
    }
    if (typeof options.root !== "string" || typeof options.manifest !== "string") invalid();
    const file = readArtifact(options.root, options.manifest, [".json"], limits.max_manifest_bytes);
    const manifest = parseManifest(file.text, limits);
    const items = loadItems(options.root, manifest, limits);
    return bounded(assemble(file.sha256, manifest, items, limits), limits);
  } catch (error) {
    let code = "INTERNAL_ERROR";
    try { if (typeof error?.code === "string" && own(MESSAGES, error.code)) code = error.code; } catch { /* Accessors must not escape. */ }
    return failure(code, limits);
  }
}
export function capabilities() {
  return envelope("ok", {
    profiles: [{
      id: PROFILE, manifest_version: "1.0.0", budget_units: [UNIT], budget_counts: "serialized-result-with-newline",
      accepted_envelope: { schema_major: 1, status: "ok", complete: true },
      ordering: "mandatory-first,priority-desc,id-asc", duplicates: ["artifact-sha256", "locator-exact"],
      relevance: "caller-declared", content_trust: "untrusted-data",
    }],
    read_only: true, execution: "none",
  }, [], LIMITS);
}
export function encodeResult(result) {
  try {
    const limits = effectiveLimits(result?.meta?.limits ?? {});
    return JSON.stringify(bounded(result, limits));
  } catch { return JSON.stringify(failure("INTERNAL_ERROR")); }
}
export function exitCode(result) {
  if (result?.status === "ok" && result.complete === true) return 0;
  if (result?.status === "incomplete" && result.complete === false) return 3;
  const code = result?.errors?.[0]?.code;
  if (code === "UNSAFE_PATH") return 4;
  if (code === "INTERNAL_ERROR") return 1;
  return 2;
}
