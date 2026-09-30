import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import type { Diagnostic } from "../types.js";

export interface RootInfo {
  input: string;
  absolute: string;
}

export interface PathResult {
  absolute: string;
  relative: string;
  isSymlink: boolean;
}

export function diagnostic(code: Diagnostic["code"], message: string, severity: Diagnostic["severity"] = "error", path?: string, details?: Record<string, unknown>): Diagnostic {
  return { code, message, severity, ...(path ? { path } : {}), ...(details ? { details } : {}) };
}

function toPosix(value: string): string {
  return value.split(sep).join("/").replaceAll("\\", "/");
}

export function isInsideRoot(root: string, candidate: string): boolean {
  const candidateRelative = relative(root, candidate);
  return candidateRelative === "" || (candidateRelative !== ".." && !candidateRelative.startsWith(`..${sep}`) && !isAbsolute(candidateRelative));
}

export function repositoryRelative(root: string, absolute: string): string {
  return toPosix(relative(root, absolute));
}

export function canonicalizeRoot(input: string): { value: RootInfo } | { diagnostic: Diagnostic } {
  try {
    const absolute = realpathSync.native(input);
    if (!statSync(absolute).isDirectory()) {
      return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `Root is not a directory: ${input}`, "error", input) };
    }
    return { value: { input, absolute } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `Unable to access root: ${message}`, "error", input) };
  }
}

function normalizedRelativeInput(input: string): string {
  return input.replaceAll("\\", "/").replace(/^\/+/, "");
}

export function resolveExistingInsideRoot(root: RootInfo, input: string, label: string): { value: PathResult } | { diagnostic: Diagnostic } {
  const normalized = input.replaceAll("\\", "/");
  const candidate = isAbsolute(normalized) ? resolve(normalized) : resolve(root.absolute, normalized);
  try {
    const linkStat = lstatSync(candidate);
    const absolute = realpathSync.native(candidate);
    if (!isInsideRoot(root.absolute, absolute)) {
      return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} resolves outside the repository root`, "error", input) };
    }
    if (!statSync(absolute).isFile()) {
      return { diagnostic: diagnostic("INVALID_REQUEST", `${label} must identify a file`, "error", input) };
    }
    return { value: { absolute, relative: repositoryRelative(root.absolute, absolute), isSymlink: linkStat.isSymbolicLink() } };
  } catch {
    return { diagnostic: diagnostic("INVALID_REQUEST", `Unable to access ${label}: ${input}`, "error", input) };
  }
}

export function normalizeRepositoryPath(root: RootInfo, input: string, label: string): { value: string } | { diagnostic: Diagnostic } {
  if (typeof input !== "string" || input.length === 0) {
    return { diagnostic: diagnostic("INVALID_REQUEST", `${label} must be a non-empty path`, "error") };
  }
  const normalized = normalizedRelativeInput(input);
  const candidate = isAbsolute(input.replaceAll("\\", "/")) ? resolve(input.replaceAll("\\", "/")) : resolve(root.absolute, normalized);
  if (!isInsideRoot(root.absolute, candidate)) {
    return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} resolves outside the repository root`, "error", input) };
  }
  const relativePath = repositoryRelative(root.absolute, candidate);
  if (!relativePath || relativePath === "." || relativePath.split("/").includes("..")) {
    return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} is not a repository-relative path`, "error", input) };
  }
  try {
    const link = lstatSync(candidate);
    if (link.isSymbolicLink()) {
      const canonical = realpathSync.native(candidate);
      if (!isInsideRoot(root.absolute, canonical)) {
        return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} symbolic link resolves outside the repository root`, "error", input) };
      }
      return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} symbolic links are not accepted for changed-file evidence`, "error", input) };
    }
  } catch {
    // Deleted changed files are valid inputs and have no filesystem entry.
  }
  return { value: relativePath };
}

export function isSecretLike(relativePath: string): boolean {
  const base = relativePath.split("/").at(-1)?.toLowerCase() ?? "";
  return base === ".env" || base.startsWith(".env.") || base.endsWith(".pem") || base.endsWith(".key") || base.startsWith("credentials.") || base.startsWith("secrets.");
}

export function sourceLanguage(path: string): "javascript" | "typescript" | "jsx" | "tsx" | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith(".tsx")) return "tsx";
  if (lower.endsWith(".ts") || lower.endsWith(".mts") || lower.endsWith(".cts")) return "typescript";
  if (lower.endsWith(".jsx")) return "jsx";
  if (lower.endsWith(".js") || lower.endsWith(".mjs") || lower.endsWith(".cjs")) return "javascript";
  return undefined;
}

export function isSupportedSource(path: string): boolean {
  return sourceLanguage(path) !== undefined;
}
