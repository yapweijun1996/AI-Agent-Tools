import { createHash } from "node:crypto";
import { relative, resolve, sep } from "node:path";
import type { Diagnostic, Limits, Position, TextRange } from "./types";
import { DEFAULT_LIMITS } from "./types";
import { ImpactError } from "./errors";

export const HARD_LIMITS: Readonly<Limits> = {
  depth: 5,
  maxNodes: 5000,
  maxEdges: 15000,
  maxPathsPerTarget: 8,
  maxOutputBytes: 16 * 1024 * 1024,
  maxFiles: 100000,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalFileBytes: 512 * 1024 * 1024,
  maxDiagnostics: 10000,
};

export const DIAGNOSTIC_LIMIT_CODE = "DIAGNOSTIC_LIMIT";

export interface DiagnosticCollector {
  add(value: Diagnostic): void;
  toArray(): Diagnostic[];
}

/** Keep diagnostic collection bounded before it reaches result serialization. */
export function createDiagnosticCollector(limit: number): DiagnosticCollector {
  const safeLimit = Math.max(1, limit);
  const retained: Diagnostic[] = [];
  let truncated = false;
  return {
    add(value) {
      if (value.code === DIAGNOSTIC_LIMIT_CODE) {
        truncated = true;
        return;
      }
      if (retained.length < safeLimit - 1) {
        retained.push(value);
      } else {
        truncated = true;
      }
    },
    toArray() {
      if (!truncated) {
        return [...retained];
      }
      return [
        ...retained.slice(0, Math.max(0, safeLimit - 1)),
        diagnostic(DIAGNOSTIC_LIMIT_CODE, `Diagnostic collection was capped at ${safeLimit}; additional diagnostics were omitted`),
      ];
    },
  };
}

export function normalizeRepoPath(input: string): string {
  const normalized = input.replaceAll("\\", "/");
  const segments = normalized.split("/").filter((segment) => segment.length > 0 && segment !== ".");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || normalized.split("/").includes("..") || segments.length === 0) {
    throw new ImpactError("FILE_OUTSIDE_ROOT", `Path is not a repository-relative file: ${input}`);
  }
  return segments.join("/");
}

export function relativeRepoPath(root: string, fileName: string): string {
  const resolvedRoot = resolve(root);
  const resolvedFile = resolve(fileName);
  const value = relative(resolvedRoot, resolvedFile).split(sep).join("/");
  if (!value || value === ".." || value.startsWith("../")) {
    throw new ImpactError("FILE_OUTSIDE_ROOT", `File is outside repository root: ${fileName}`);
  }
  return normalizeRepoPath(value);
}

export function toPosition(text: string, offset: number): Position {
  const safeOffset = Math.max(0, Math.min(offset, text.length));
  const before = text.slice(0, safeOffset);
  const line = before.split("\n").length;
  const lastNewline = before.lastIndexOf("\n");
  return { line, column: safeOffset - lastNewline };
}

export function toRange(text: string, start: number, length: number): TextRange {
  return {
    start: toPosition(text, start),
    end: toPosition(text, start + Math.max(0, length)),
  };
}

export function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

export function snapshotId(kind: "working-tree" | "revision", revision: string | undefined, files: ReadonlyMap<string, string>): string {
  const hash = createHash("sha256");
  for (const [file, content] of [...files.entries()].sort(([a], [b]) => compareText(a, b))) {
    hash.update(file).update("\0").update(content).update("\0");
  }
  const suffix = hash.digest("hex").slice(0, 16);
  return kind === "revision" ? `git:${revision ?? "unknown"}:${suffix}` : `worktree:${suffix}`;
}

export function mergeLimits(input: Partial<Limits> | undefined): Limits {
  const integerNames: Array<keyof Limits> = [
    "depth",
    "maxNodes",
    "maxEdges",
    "maxPathsPerTarget",
    "maxOutputBytes",
    "maxFiles",
    "maxFileBytes",
    "maxTotalFileBytes",
    "maxDiagnostics",
  ];
  if (input !== undefined) {
    for (const key of Object.keys(input)) {
      if (!integerNames.includes(key as keyof Limits)) {
        throw new ImpactError("INVALID_ARGUMENT", `Unknown limit ${key}`);
      }
    }
  }
  const merged: Limits = { ...DEFAULT_LIMITS, ...(input ?? {}) };
  for (const name of integerNames) {
    const value = merged[name];
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new ImpactError("INVALID_ARGUMENT", `Limit ${name} must be a positive integer`);
    }
  }
  if (
    merged.depth > HARD_LIMITS.depth
    || merged.maxNodes > HARD_LIMITS.maxNodes
    || merged.maxEdges > HARD_LIMITS.maxEdges
    || merged.maxPathsPerTarget > HARD_LIMITS.maxPathsPerTarget
    || merged.maxOutputBytes > HARD_LIMITS.maxOutputBytes
    || merged.maxFiles > HARD_LIMITS.maxFiles
    || merged.maxFileBytes > HARD_LIMITS.maxFileBytes
    || merged.maxTotalFileBytes > HARD_LIMITS.maxTotalFileBytes
    || merged.maxDiagnostics > HARD_LIMITS.maxDiagnostics
  ) {
    throw new ImpactError("INVALID_ARGUMENT", "Requested limit exceeds the supported hard cap");
  }
  if (merged.maxOutputBytes < 256) {
    throw new ImpactError("INVALID_ARGUMENT", "maxOutputBytes must be at least 256 bytes");
  }
  return merged;
}

export function stableSort<T>(values: readonly T[], key: (value: T) => string): T[] {
  return [...values].sort((a, b) => compareText(key(a), key(b)));
}

export function compareText(a: string, b: string): number {
  return a === b ? 0 : a < b ? -1 : 1;
}

export function diagnostic(code: string, message: string, extra: Partial<Diagnostic> = {}): Diagnostic {
  return { code, message, severity: "warning", ...extra };
}

export function jsonByteLength(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value));
}

export function boundedJson(value: unknown, maxBytes: number): string {
  const output = JSON.stringify(value);
  if (Buffer.byteLength(output) > maxBytes) {
    throw new ImpactError("OUTPUT_LIMIT_EXCEEDED", `JSON output exceeds ${maxBytes} bytes`, {
      maxOutputBytes: maxBytes,
      actualBytes: Buffer.byteLength(output),
    });
  }
  return output;
}
