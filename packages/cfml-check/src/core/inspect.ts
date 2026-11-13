import { createHash } from "node:crypto";
import path from "node:path";
import { checkPureScriptCfc } from "./lexer.js";
import { normalizeLimits } from "./limits.js";
import { loadSource } from "./source-reader.js";
import { ToolFailure } from "../schema/errors.js";
import { TOOL_ID, TOOL_VERSION } from "../schema/types.js";
import type { CheckLimits, Finding, SourceInfo, SourceLocation } from "../schema/types.js";

export interface LineRange { start: number; end: number }
export interface InspectOptions {
  root: string;
  files: string[];
  range?: LineRange;
  baseline?: string;
  limits?: Partial<CheckLimits>;
}
export interface InspectDiagnostic {
  code: string;
  message: string;
  file: string;
  location: SourceLocation | null;
  related_open: SourceLocation | null;
  hint: string;
  confidence: "confirmed" | "provisional";
}
export interface InspectedFile {
  path: string;
  status: "ok" | "incomplete" | "error";
  complete: boolean;
  scan_complete: boolean;
  verdict: "pass" | "violations" | null;
  source: SourceInfo | null;
  range: LineRange | null;
  findings: InspectDiagnostic[];
  unsupported: InspectDiagnostic[];
  errors: Array<{ code: string; message: string }>;
}
export interface InspectResult {
  schema_version: "2.0.0";
  tool: { id: typeof TOOL_ID; version: typeof TOOL_VERSION };
  status: "ok" | "incomplete" | "error";
  complete: boolean;
  mode: "inspect" | "compare";
  files: InspectedFile[];
  comparison: Array<{ finding: InspectDiagnostic; classification: "existing" | "new" | "uncertain" }> | null;
  comparison_basis: string | null;
  errors: Array<{ code: string; message: string }>;
  limits: CheckLimits;
}

const MAX_FILES = 32;
const MAX_TOTAL_SOURCE_BYTES = 16 * 1024 * 1024;
const HINTS: Record<Finding["code"], string> = {
  UNEXPECTED_CLOSE: "Check whether this closing tag has an opening tag.",
  MISMATCHED_CLOSE: "Check nesting and close the most recently opened tag first.",
  UNCLOSED_TAG: "Check whether the matching closing tag is missing.",
  INVALID_BRANCH: "Check the branch owner and ordering.",
  UNTERMINATED_STRING: "Check the string's closing quote.",
  UNTERMINATED_COMMENT: "Check the comment's closing delimiter.",
  UNBALANCED_DELIMITER: "Check the matching script delimiter.",
};

interface InternalFile { result: InspectedFile; sourceText: string; exitCode: number; bytes: number }

function inRange(location: SourceLocation | null, range: LineRange | undefined): boolean {
  return range === undefined || location === null || (location.start.line <= range.end && location.end.line >= range.start);
}

function inspectOne(root: string, file: string, limits: CheckLimits, deadline: number, range?: LineRange): InternalFile {
  try {
    const selected = path.isAbsolute(file) ? file : path.resolve(root, file);
    const loaded = loadSource({ root, file: selected, limits });
    if (range !== undefined) {
      const lines = loaded.source.split(/\r\n|\r|\n/u).length;
      if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 1 || range.end < range.start || range.end > lines) {
        throw new ToolFailure("INVALID_ARGUMENT", "The requested line range is invalid for the selected source", 2);
      }
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new ToolFailure("LIMIT_EXCEEDED", "The inspection time limit was reached", 3);
    const scan = checkPureScriptCfc(loaded.source, path.extname(loaded.relative_path), { ...limits, time_limit_ms: remaining }, true);
    if (Date.now() > deadline) throw new ToolFailure("LIMIT_EXCEEDED", "The inspection time limit was reached", 3);
    const complete = scan.incomplete.length === 0 && scan.scan_complete;
    const confidence = complete ? "confirmed" : "provisional";
    const findings = scan.findings.filter((item) => inRange(item.location, range)).map((item): InspectDiagnostic => ({
      ...item, file: loaded.relative_path, hint: HINTS[item.code], confidence,
    }));
    const unsupported = scan.incomplete.map((item): InspectDiagnostic => ({
      code: item.code, message: item.message, file: loaded.relative_path,
      location: item.location ?? null, related_open: null,
      hint: "Review the unsupported or incomplete syntax before relying on structural findings.", confidence: "provisional",
    }));
    return {
      result: {
        path: loaded.relative_path, status: complete ? "ok" : "incomplete", complete,
        scan_complete: scan.scan_complete, verdict: complete ? (findings.length === 0 ? "pass" : "violations") : null,
        source: { path: loaded.relative_path, sha256: createHash("sha256").update(loaded.bytes).digest("hex"), byte_size: loaded.bytes.byteLength, encoding: "utf-8", bom: loaded.bom },
        range: range ?? null, findings, unsupported, errors: [],
      },
      sourceText: loaded.source, exitCode: complete ? 0 : 3, bytes: loaded.bytes.byteLength,
    };
  } catch (error) {
    const failure = error instanceof ToolFailure ? error : new ToolFailure("INTERNAL_ERROR", "The checker failed without a safe result", 1);
    return {
      result: { path: file, status: failure.exitCode === 3 ? "incomplete" : "error", complete: false, scan_complete: false, verdict: null, source: null, range: range ?? null, findings: [], unsupported: [], errors: [{ code: failure.code, message: failure.message }] },
      sourceText: "", exitCode: failure.exitCode, bytes: 0,
    };
  }
}

function signature(finding: InspectDiagnostic, lines: string[]): string {
  const line = finding.location === null ? "" : (lines[finding.location.start.line - 1] ?? "").trim();
  const opening = finding.related_open === null ? "" : (lines[finding.related_open.start.line - 1] ?? "").trim();
  return createHash("sha256").update(JSON.stringify([finding.code, line, opening])).digest("hex");
}

function compare(before: InternalFile, after: InternalFile): InspectResult["comparison"] {
  const prior = before.result.findings;
  const current = after.result.findings;
  if (!before.result.complete || !after.result.complete) return current.map((finding) => ({ finding, classification: "uncertain" as const }));
  const beforeLines = before.sourceText.split(/\r\n|\r|\n/u);
  const afterLines = after.sourceText.split(/\r\n|\r|\n/u);
  const beforeCounts = new Map<string, number>();
  const afterCounts = new Map<string, number>();
  const priorCodes = new Set(prior.map((item) => item.code));
  for (const item of prior) {
    const key = signature(item, beforeLines);
    beforeCounts.set(key, (beforeCounts.get(key) ?? 0) + 1);
  }
  for (const item of current) {
    const key = signature(item, afterLines);
    afterCounts.set(key, (afterCounts.get(key) ?? 0) + 1);
  }
  return current.map((finding) => {
    const key = signature(finding, afterLines);
    const earlier = beforeCounts.get(key) ?? 0;
    const later = afterCounts.get(key) ?? 0;
    if (earlier === 1 && later === 1) return { finding, classification: "existing" as const };
    if (earlier === 0 && !priorCodes.has(finding.code)) return { finding, classification: "new" as const };
    return { finding, classification: "uncertain" as const };
  });
}

export function inspectFiles(options: InspectOptions): { result: InspectResult; exit_code: number } {
  let limits: CheckLimits;
  try { limits = normalizeLimits(options?.limits); }
  catch (error) {
    const failure = error instanceof ToolFailure ? error : new ToolFailure("INVALID_LIMIT", "Invalid limits", 2);
    return { result: { schema_version: "2.0.0", tool: { id: TOOL_ID, version: TOOL_VERSION }, status: "error", complete: false, mode: "inspect", files: [], comparison: null, comparison_basis: null, errors: [{ code: failure.code, message: failure.message }], limits: normalizeLimits(undefined) }, exit_code: failure.exitCode };
  }
  const mode = options?.baseline === undefined ? "inspect" : "compare";
  const result: InspectResult = { schema_version: "2.0.0", tool: { id: TOOL_ID, version: TOOL_VERSION }, status: "ok", complete: true, mode, files: [], comparison: null, comparison_basis: mode === "compare" ? "Diagnostic signatures are heuristic matches, not proof of semantic identity or causation." : null, errors: [], limits };
  const range = options?.range;
  const invalidRange = range !== undefined && (range === null || typeof range !== "object" || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 1 || range.end < range.start);
  if (!options || typeof options.root !== "string" || !options.root || !Array.isArray(options.files) || options.files.length < 1 || options.files.length > MAX_FILES || options.files.some((file) => typeof file !== "string" || !file) || (mode === "compare" && (options.files.length !== 1 || typeof options.baseline !== "string" || !options.baseline))) {
    result.status = "error"; result.complete = false; result.errors.push({ code: "INVALID_ARGUMENT", message: "Select one to 32 explicit files; comparison requires exactly one current file and one baseline" });
    return { result, exit_code: 2 };
  }
  if (invalidRange) {
    result.status = "error"; result.complete = false; result.errors.push({ code: "INVALID_ARGUMENT", message: "The line range must contain positive ordered integers" });
    return { result, exit_code: 2 };
  }
  const names = options.baseline === undefined ? options.files : [options.baseline, options.files[0]!];
  const internal: InternalFile[] = [];
  const deadline = Date.now() + limits.time_limit_ms;
  let totalBytes = 0;
  for (const [index, name] of names.entries()) {
    const remaining = deadline - Date.now();
    if (remaining <= 0 || totalBytes >= MAX_TOTAL_SOURCE_BYTES) {
      result.status = "incomplete"; result.complete = false; result.errors.push({ code: "LIMIT_EXCEEDED", message: "The aggregate inspection limit was reached; remaining files were not scanned" });
      break;
    }
    // A changed line range belongs to the current source; baseline line numbers
    // may have shifted, so compare against the entire baseline.
    const selectedRange = mode === "compare" && index === 0 ? undefined : options.range;
    const item = inspectOne(options.root, name, { ...limits, max_source_bytes: Math.min(limits.max_source_bytes, MAX_TOTAL_SOURCE_BYTES - totalBytes), time_limit_ms: remaining }, deadline, selectedRange);
    totalBytes += item.bytes;
    internal.push(item);
    result.files.push(item.result);
  }
  const failed = internal.find((item) => item.exitCode === 4) ?? internal.find((item) => item.exitCode === 1) ?? internal.find((item) => item.exitCode !== 0 && item.exitCode !== 3);
  if (failed !== undefined) { result.status = "error"; result.complete = false; }
  else if (result.status !== "incomplete" && internal.some((item) => item.exitCode === 3)) { result.status = "incomplete"; result.complete = false; }
  if (mode === "compare" && internal.length === 2 && Date.now() <= deadline) result.comparison = compare(internal[0]!, internal[1]!);
  if (Date.now() > deadline && failed === undefined) {
    result.status = "incomplete"; result.complete = false; result.comparison = null;
    result.errors.push({ code: "LIMIT_EXCEEDED", message: "The aggregate inspection time limit was reached" });
  }
  const exitCode = failed?.exitCode ?? (result.status === "incomplete" ? 3 : 0);
  if (Buffer.byteLength(`${JSON.stringify(result)}\n`, "utf8") > limits.max_output_bytes) {
    return { result: { ...result, status: "incomplete", complete: false, files: [], comparison: null, errors: [{ code: "LIMIT_EXCEEDED", message: "The output limit was reached; partial results were withheld" }] }, exit_code: 3 };
  }
  return { result, exit_code: exitCode };
}
