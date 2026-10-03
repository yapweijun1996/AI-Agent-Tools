import { captureRules, InputError } from "./input.js";

export const LIMITS = Object.freeze({
  max_depth: 64,
  max_files: 128,
  max_file_bytes: 65536,
  max_total_bytes: 262144,
  max_output_bytes: 524288,
  max_duration_ms: 5000,
});
const SCOPE = "Explicit root-to-target local instruction chain; fixed profile, references not followed";
const MESSAGES = Object.freeze({
  INVALID_INPUT: "Input does not match the documented contract.",
  INVALID_ENCODING: "An instruction file is not valid UTF-8.",
  INPUT_IO: "Unable to inspect an explicit local input.",
  UNSAFE_PATH: "A supplied path violates the root-relative path boundary.",
  INTERNAL_ERROR: "The operation could not complete.",
  UNSUPPORTED_PROFILE: "The requested instruction discovery profile is unsupported.",
  RESOURCE_LIMIT: "The request exceeds a declared resource limit.",
  INPUT_CHANGED: "A local input changed during capture.",
});
const own = (value, key) => Object.hasOwn(value, key);
const record = (value) => value !== null && typeof value === "object" &&
  !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = () => { throw new InputError("INVALID_INPUT"); };
function keys(value, allowed) {
  if (!record(value) || Reflect.ownKeys(value).some((key) => !allowed.includes(key))) invalid();
}
function effectiveLimits(overrides = {}) {
  keys(overrides, Object.keys(LIMITS));
  const limits = { ...LIMITS };
  for (const key of Reflect.ownKeys(overrides)) {
    const value = overrides[key];
    if (!Number.isSafeInteger(value) || value < (key === "max_output_bytes" ? 1024 : 1) || value > LIMITS[key]) invalid();
    limits[key] = value;
  }
  return limits;
}
function envelope(status, data, errors, limits) {
  return {
    schema_version: "1.0.0",
    tool: { id: "agent-rules-resolve", version: "0.1.0" },
    status, complete: status === "ok", data, errors, warnings: [],
    meta: { scope: SCOPE, limits: { ...limits } },
  };
}
export function failure(code, status = "error", limits = LIMITS) {
  const safeCode = typeof code === "string" && own(MESSAGES, code) ? code : "INTERNAL_ERROR";
  const safeStatus = ["error", "incomplete"].includes(status) ? status : "error";
  let safeLimits;
  try { safeLimits = effectiveLimits(limits); } catch { safeLimits = { ...LIMITS }; }
  return envelope(safeStatus, null, [{ code: safeCode, message: MESSAGES[safeCode] }], safeLimits);
}
function bounded(result, limits) {
  return Buffer.byteLength(JSON.stringify(result), "utf8") + 1 > limits.max_output_bytes
    ? failure("RESOURCE_LIMIT", "incomplete", limits) : result;
}
export function resolveRules(options) {
  let limits = LIMITS;
  try {
    keys(options, ["root", "target", "targetKind", "profile", "includeContent", "limits"]);
    if (own(options, "limits")) {
      if (!record(options.limits)) invalid();
      limits = effectiveLimits(options.limits);
    }
    for (const key of ["root", "target", "targetKind", "profile"]) {
      if (!own(options, key) || typeof options[key] !== "string") invalid();
    }
    if (!["file", "directory"].includes(options.targetKind) ||
        (own(options, "includeContent") && typeof options.includeContent !== "boolean")) invalid();
    if (options.profile !== "agents-chain-v1") throw new InputError("UNSUPPORTED_PROFILE", "incomplete");
    const includeContent = options.includeContent ?? false;
    const captured = captureRules(options.root, options.target, options.targetKind, includeContent, limits);
    return bounded(envelope("ok", {
      profile: "agents-chain-v1", target: captured.target, precedence: "root-to-target",
      sources: captured.sources, ignored: captured.ignored, directories: captured.directories,
      include_content: includeContent, references: "not-followed",
    }, [], limits), limits);
  } catch (error) {
    let code = "INTERNAL_ERROR";
    let status = "error";
    try {
      const suppliedCode = error?.code;
      if (typeof suppliedCode === "string" && own(MESSAGES, suppliedCode)) code = suppliedCode;
      status = error?.status ?? "error";
    } catch { /* User-provided accessors must not escape the result boundary. */ }
    return failure(code, status, limits);
  }
}
export function capabilities() {
  return envelope("ok", {
    profiles: [{
      id: "agents-chain-v1", filenames: ["AGENTS.override.md", "AGENTS.md"],
      selection: "first-nonempty-per-directory", order: "root-to-target", references: "not-followed",
    }],
    read_only: true, content_opt_in: true,
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
