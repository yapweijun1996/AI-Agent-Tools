import type { ParseRequest } from "../../contract/agent-error-lens-v1.types.js";
import { LIMITS } from "./limits.js";

export interface ValidationIssue {
  code: string;
  message: string;
  artifactId: string | null;
}

export type RequestValidation =
  | { ok: true; request: ParseRequest; bytesReceived: number; artifactsReceived: number }
  | {
      ok: false;
      issue: ValidationIssue;
      bytesReceived: number;
      artifactsReceived: number;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  const allowedKeys = new Set(allowed);
  return Object.keys(value).every((key) => allowedKeys.has(key));
}

function isWellFormedUnicode(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff || Number.isNaN(next)) return false;
      index += 1;
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function stringLength(value: string): number {
  return Array.from(value).length;
}

function validBoundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && isWellFormedUnicode(value) && stringLength(value) >= min && stringLength(value) <= max;
}

function issue(code: string, message: string, artifactId: string | null = null): RequestValidation {
  return { ok: false, issue: { code, message, artifactId }, bytesReceived: 0, artifactsReceived: 0 };
}

function validateProducerOutcome(value: unknown): ValidationIssue | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["command", "exitCode", "signal"])) {
    return { code: "REQUEST_INVALID", message: "producerOutcome must be an object with only supported fields", artifactId: null };
  }
  if (value.command !== undefined && !validBoundedString(value.command, 0, 8192)) {
    return { code: "REQUEST_INVALID", message: "producerOutcome.command is invalid", artifactId: null };
  }
  if (value.exitCode !== undefined && value.exitCode !== null && !Number.isInteger(value.exitCode)) {
    return { code: "REQUEST_INVALID", message: "producerOutcome.exitCode must be an integer or null", artifactId: null };
  }
  if (value.signal !== undefined && value.signal !== null && !validBoundedString(value.signal, 0, 128)) {
    return { code: "REQUEST_INVALID", message: "producerOutcome.signal is invalid", artifactId: null };
  }
  return null;
}

function validateOptions(value: unknown): ValidationIssue | null {
  if (!isRecord(value) || !hasOnlyKeys(value, ["root"])) {
    return { code: "REQUEST_INVALID", message: "options must be an object with only supported fields", artifactId: null };
  }
  if (value.root !== undefined && !validBoundedString(value.root, 1, 4096)) {
    return { code: "REQUEST_INVALID", message: "options.root is invalid", artifactId: null };
  }
  return null;
}

export function validateRequest(value: unknown): RequestValidation {
  if (!isRecord(value) || !hasOnlyKeys(value, ["schemaVersion", "artifacts", "producerOutcome", "options"])) {
    return issue("REQUEST_INVALID", "request must be an object with only supported fields");
  }
  if (value.schemaVersion !== "1") return issue("REQUEST_INVALID", "schemaVersion must be \"1\"");
  if (!Array.isArray(value.artifacts) || value.artifacts.length > 64) {
    return issue("REQUEST_INVALID", "artifacts must be an array with at most 64 entries");
  }

  const artifactIds = new Set<string>();
  let bytesReceived = 0;
  for (const artifactValue of value.artifacts) {
    if (!isRecord(artifactValue) || !hasOnlyKeys(artifactValue, ["id", "stream", "content", "encoding"])) {
      return { ...issue("REQUEST_INVALID", "artifact has unsupported fields"), bytesReceived, artifactsReceived: artifactIds.size };
    }
    const artifactId = artifactValue.id;
    const validArtifactId = typeof artifactId === "string" && /^[A-Za-z0-9._-]{1,128}$/u.test(artifactId);
    if (!validArtifactId || artifactIds.has(artifactId as string)) {
      return {
        ...issue("REQUEST_INVALID", "artifact id is invalid or duplicated", validArtifactId ? artifactId : null),
        bytesReceived,
        artifactsReceived: artifactIds.size,
      };
    }
    artifactIds.add(artifactId);
    if (typeof artifactValue.stream !== "string" || !["stdout", "stderr", "combined", "unknown"].includes(artifactValue.stream)) {
      return { ...issue("REQUEST_INVALID", "artifact stream is invalid", artifactId), bytesReceived, artifactsReceived: artifactIds.size };
    }
    if (artifactValue.encoding !== undefined && artifactValue.encoding !== "utf-8") {
      return { ...issue("REQUEST_INVALID", "artifact encoding must be utf-8", artifactId), bytesReceived, artifactsReceived: artifactIds.size };
    }
    if (typeof artifactValue.content !== "string" || !isWellFormedUnicode(artifactValue.content)) {
      return { ...issue("UNICODE_INVALID", "artifact content must be well-formed Unicode", artifactId), bytesReceived, artifactsReceived: artifactIds.size };
    }
    const artifactBytes = Buffer.byteLength(artifactValue.content, "utf8");
    bytesReceived += artifactBytes;
    if (artifactBytes > LIMITS.maxArtifactBytes) {
      return { ...issue("ARTIFACT_BYTES_EXCEEDED", "artifact exceeds the per-artifact byte budget", artifactId), bytesReceived: Math.min(bytesReceived, LIMITS.maxRequestBytes), artifactsReceived: artifactIds.size };
    }
    if (bytesReceived > LIMITS.maxRequestBytes) {
      return { ...issue("REQUEST_BYTES_EXCEEDED", "request exceeds the aggregate byte budget"), bytesReceived: LIMITS.maxRequestBytes, artifactsReceived: artifactIds.size };
    }
  }

  if (value.producerOutcome !== undefined) {
    const producerIssue = validateProducerOutcome(value.producerOutcome);
    if (producerIssue) return { ok: false, issue: producerIssue, bytesReceived, artifactsReceived: artifactIds.size };
  }
  if (value.options !== undefined) {
    const optionsIssue = validateOptions(value.options);
    if (optionsIssue) return { ok: false, issue: optionsIssue, bytesReceived, artifactsReceived: artifactIds.size };
  }

  return {
    ok: true,
    request: value as unknown as ParseRequest,
    bytesReceived,
    artifactsReceived: artifactIds.size,
  };
}

export { isWellFormedUnicode };
