import { lstatSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve as resolvePath, sep } from "node:path";
import type { Diagnostic } from "../types";

export interface RootInfo {
  input: string;
  absolute: string;
}

export interface ResolvedPath {
  absolute: string;
  relative: string;
  isSymlink: boolean;
}

export interface PathFailure {
  diagnostic: Diagnostic;
}

export type PathResult<T> = { value: T } | PathFailure;

function diagnostic(code: Diagnostic["code"], message: string, severity: Diagnostic["severity"] = "error", path?: string, details?: Record<string, unknown>): Diagnostic {
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

export function canonicalizeRoot(input: string): PathResult<RootInfo> {
  try {
    const absolute = realpathSync.native(input);
    if (!statSync(absolute).isDirectory()) {
      return { diagnostic: diagnostic("INVALID_ROOT", `Root is not a directory: ${input}`, "error", input) };
    }
    return { value: { input, absolute } };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { diagnostic: diagnostic("INVALID_ROOT", `Unable to access root ${input}: ${message}`, "error", input) };
  }
}

export function resolveExistingInsideRoot(root: RootInfo, input: string, label: string): PathResult<ResolvedPath> {
  if (/^[A-Za-z]:[\\/]/.test(input)) {
    return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} uses an unsupported absolute Windows path outside the current root boundary`, "error", input) };
  }

  const normalizedInput = input.replaceAll("\\", "/");
  const candidate = isAbsolute(normalizedInput) ? resolvePath(normalizedInput) : resolvePath(root.absolute, normalizedInput);
  try {
    const linkStat = lstatSync(candidate);
    const absolute = realpathSync.native(candidate);
    if (!isInsideRoot(root.absolute, absolute)) {
      return { diagnostic: diagnostic("PATH_OUTSIDE_ROOT", `${label} resolves outside the repository root`, "error", input, { root: root.absolute }) };
    }
    const stat = statSync(absolute);
    if (!stat.isFile()) {
      return { diagnostic: diagnostic("INVALID_REQUEST", `${label} must identify a file`, "error", input) };
    }
    return {
      value: {
        absolute,
        relative: repositoryRelative(root.absolute, absolute),
        isSymlink: linkStat.isSymbolicLink()
      }
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { diagnostic: diagnostic("INVALID_REQUEST", `Unable to access ${label} ${input}: ${message}`, "error", input) };
  }
}

export function isSecretLike(relativePath: string): boolean {
  const base = relativePath.split("/").at(-1)?.toLowerCase() ?? "";
  return base === ".env" || base.startsWith(".env.") || base.endsWith(".pem") || base.endsWith(".key") || base.startsWith("credentials.") || base.startsWith("secrets.");
}
