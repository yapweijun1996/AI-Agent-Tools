import { createHash } from "node:crypto";
import path from "node:path";
import { ToolFailure } from "../schema/errors.js";
import type { CapabilitiesData, CheckData, CheckLimits, Envelope, CheckOptions } from "../schema/types.js";
import { PROFILE_ID, TOOL_ID, TOOL_VERSION } from "../schema/types.js";
import { normalizeLimits } from "./limits.js";
import { loadSource } from "./source-reader.js";
import { checkPureScriptCfc, scanCfml, PAIRED_TAGS, BRANCH_TAGS, BODYLESS_TAGS } from "./lexer.js";

function meta(limits: CheckLimits) {
  return { scope: "One explicitly selected local UTF-8 .cfm or .cfc file under an explicit root", limits };
}

function emptyEnvelope<T>(status: Envelope<T>["status"], limits: CheckLimits, errors: Array<{ code: string; message: string }>): Envelope<T> {
  return { schema_version: "1.0.0", tool: { id: TOOL_ID, version: TOOL_VERSION }, status, complete: false, data: null, errors, warnings: [], meta: meta(limits) };
}

function fitOutput<T>(envelope: Envelope<T>, limits: CheckLimits): Envelope<T> {
  const serialized = JSON.stringify(envelope);
  if (Buffer.byteLength(serialized, "utf8") <= limits.max_output_bytes) return envelope;
  const fallback: Envelope<T> = emptyEnvelope<T>("incomplete", limits, [{ code: "LIMIT_EXCEEDED", message: "The output limit was reached; result data was withheld" }]);
  if (Buffer.byteLength(JSON.stringify(fallback), "utf8") <= limits.max_output_bytes) return fallback;
  return { schema_version: "1.0.0", tool: { id: TOOL_ID, version: TOOL_VERSION }, status: "incomplete", complete: false, data: null, errors: [{ code: "LIMIT_EXCEEDED", message: "Output limit exceeded" }], warnings: [], meta: meta(limits) };
}

export function capabilities(limitsInput?: Partial<CheckLimits>): Envelope<CapabilitiesData> {
  const limits = normalizeLimits(limitsInput);
  return {
    schema_version: "1.0.0",
    tool: { id: TOOL_ID, version: TOOL_VERSION },
    status: "ok",
    complete: true,
    data: {
      profile: PROFILE_ID,
      operations: ["capabilities", "check"],
      extensions: [".cfm", ".cfc"],
      supported_tags: {
        paired_bodies: [...PAIRED_TAGS].sort(),
        branches: [...BRANCH_TAGS].sort(),
        bodyless: [...BODYLESS_TAGS].sort(),
      },
      limits,
      exclusions: [
        "Full CFML grammar and expression/type/runtime semantics",
        "HTML validity, SQL correctness, include expansion, and Lucee execution",
        "Unknown/custom/imported tag libraries and CFML tag islands inside cfscript",
      ],
    },
    errors: [],
    warnings: [],
    meta: meta(limits),
  };
}

export function checkFile(options: CheckOptions): { envelope: Envelope<CheckData>; exit_code: 0 | 1 | 2 | 3 | 4 } {
  let limits: CheckLimits;
  try {
    limits = normalizeLimits(options.limits);
  } catch (error) {
    const fallback = normalizeLimits(undefined);
    const failure = error instanceof ToolFailure ? error : new ToolFailure("INVALID_LIMIT", "Invalid limits", 2);
    return { envelope: emptyEnvelope("error", fallback, [{ code: failure.code, message: failure.message }]), exit_code: failure.exitCode };
  }
  try {
    const source = loadSource({ root: options.root, file: options.file, limits });
    const extension = path.extname(source.relative_path);
    const scanned = checkPureScriptCfc(source.source, extension, limits);
    if (scanned.incomplete.length > 0) {
      return { envelope: fitOutput(emptyEnvelope("incomplete", limits, scanned.incomplete), limits), exit_code: 3 };
    }
    const data: CheckData = {
      profile: PROFILE_ID,
      source: {
        path: source.relative_path,
        sha256: createHash("sha256").update(source.bytes).digest("hex"),
        byte_size: source.bytes.byteLength,
        encoding: "utf-8",
        bom: source.bom,
      },
      verdict: scanned.findings.length === 0 ? "pass" : "violations",
      checks: ["tag-nesting", "branch-structure", "cfscript-delimiters"],
      exclusions: [
        "Expression, type, SQL, HTML, include, and runtime semantics are unverified",
        "Unknown/custom/imported tags and CFML tag islands inside cfscript are unsupported",
      ],
      findings: scanned.findings,
    };
    return {
      envelope: fitOutput({ schema_version: "1.0.0", tool: { id: TOOL_ID, version: TOOL_VERSION }, status: "ok", complete: true, data, errors: [], warnings: [], meta: meta(limits) }, limits),
      exit_code: 0,
    };
  } catch (error) {
    const failure = error instanceof ToolFailure ? error : new ToolFailure("INTERNAL_ERROR", "The checker failed without a safe result", 1);
    return { envelope: fitOutput(emptyEnvelope(failure.exitCode === 3 ? "incomplete" : "error", limits, [{ code: failure.code, message: failure.message }]), limits), exit_code: failure.exitCode };
  }
}
