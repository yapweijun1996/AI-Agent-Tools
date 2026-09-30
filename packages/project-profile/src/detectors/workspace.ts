import { BUDGETS } from "../constants.js";
import { DiagnosticCollector } from "../core/diagnostics.js";
import { compareCodePoint, EvidenceStore } from "../core/evidence.js";
import { Scanner } from "../core/scanner.js";
import type { WorkspaceDeclaration } from "../types.js";
import type { PackageManifest } from "./manifest.js";
import { hasOwn, isRecord, manifestEvidence } from "./manifest.js";

interface PatternSpec {
  exclude: boolean;
  segments: string[];
  source: string;
}

interface ParsedDeclaration {
  manager: "npm" | "pnpm" | "yarn" | null;
  path: string;
  pointer: string;
  patterns: string[];
  evidence: string[];
  valid: boolean;
}

export interface WorkspaceCandidate {
  path: string;
  evidence: string[];
}

export interface WorkspaceDiscovery {
  declarations: ParsedDeclaration[];
  candidates: WorkspaceCandidate[];
  complete: boolean;
  hasValidDeclaration: boolean;
  declarationSets: string[][];
}

export function discoverWorkspace(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  rootManifest: PackageManifest,
): WorkspaceDiscovery {
  const declarations: ParsedDeclaration[] = [];
  if (rootManifest.valid && rootManifest.data !== null && hasOwn(rootManifest.data, "workspaces")) {
    const pointerEvidence = manifestEvidence(evidence, rootManifest, "/workspaces");
    const patterns = parseManifestWorkspace(rootManifest.data.workspaces);
    if (patterns === null) {
      diagnostics.add("WORKSPACE_UNRESOLVED", "warning", "The package manifest workspace declaration is malformed or unsupported.", rootManifest.path, [pointerEvidence]);
      declarations.push({ manager: null, path: rootManifest.path, pointer: "/workspaces", patterns: [], evidence: [pointerEvidence], valid: false });
    } else {
      declarations.push({ manager: null, path: rootManifest.path, pointer: "/workspaces", patterns, evidence: [pointerEvidence], valid: true });
    }
  }

  const pnpmPath = "pnpm-workspace.yaml";
  const pnpmProbe = scanner.probe(pnpmPath);
  if (pnpmProbe.kind !== "missing") {
    const pnpmEvidence = scanner.fileEvidence(pnpmPath);
    if (pnpmProbe.kind !== "file") {
      diagnostics.add("WORKSPACE_UNRESOLVED", "warning", "The pnpm workspace declaration could not be inspected.", pnpmPath, [pnpmEvidence]);
      declarations.push({ manager: "pnpm", path: pnpmPath, pointer: "packages", patterns: [], evidence: [pnpmEvidence], valid: false });
    } else {
      const body = scanner.readMetadata(pnpmPath);
      if (body === null) {
        diagnostics.add("WORKSPACE_UNRESOLVED", "warning", "The pnpm workspace declaration could not be read.", pnpmPath, [pnpmEvidence]);
        declarations.push({ manager: "pnpm", path: pnpmPath, pointer: "packages", patterns: [], evidence: [pnpmEvidence], valid: false });
      } else {
        const patterns = parsePnpmWorkspace(body.text);
        if (patterns === null) {
          diagnostics.add("WORKSPACE_UNRESOLVED", "warning", "The pnpm workspace declaration is malformed or uses unsupported YAML features.", pnpmPath, [pnpmEvidence]);
          declarations.push({ manager: "pnpm", path: pnpmPath, pointer: "packages", patterns: [], evidence: [pnpmEvidence], valid: false });
        } else {
          declarations.push({ manager: "pnpm", path: pnpmPath, pointer: "packages", patterns, evidence: [pnpmEvidence], valid: true });
        }
      }
    }
  }

  const validDeclarations = declarations.filter((declaration) => declaration.valid);
  if (validDeclarations.length === 0) {
    return { declarations, candidates: [], complete: declarations.length === 0, hasValidDeclaration: false, declarationSets: [] };
  }

  const expanded = validDeclarations.map((declaration) => {
    const positive: PatternSpec[] = [];
    const exclusions: PatternSpec[] = [];
    let complete = true;
    for (const source of declaration.patterns) {
      const parsed = parsePattern(source);
      if (parsed === null) {
        diagnostics.add("WORKSPACE_UNRESOLVED", "warning", "A workspace pattern uses unsupported syntax or escapes the selected root.", declaration.path, declaration.evidence);
        complete = false;
      } else if (parsed.exclude) {
        exclusions.push(parsed);
      } else {
        positive.push(parsed);
      }
    }
    const candidateEvidence = new Map<string, string[]>();
    for (const pattern of positive) {
      const result = expandPattern(scanner, pattern.segments);
      complete = complete && result.complete;
      for (const relativePath of result.paths) {
        const current = candidateEvidence.get(relativePath) ?? [];
        candidateEvidence.set(relativePath, Array.from(new Set([...current, ...declaration.evidence])));
      }
    }
    const paths = Array.from(candidateEvidence.keys())
      .filter((relativePath) => !exclusions.some((exclusion) => matchesPattern(relativePath, exclusion.segments)))
      .sort(compareCodePoint);
    return { complete, paths, evidence: candidateEvidence };
  });

  let complete = expanded.every((value) => value.complete);
  let selectedPaths: string[] = [];
  if (expanded.length === 1) {
    selectedPaths = expanded[0]?.paths ?? [];
  } else {
    const first = expanded[0]?.paths ?? [];
    const same = expanded.every((value) => sameStringSet(first, value.paths));
    if (!same) {
      diagnostics.add(
        "WORKSPACE_UNRESOLVED",
        "warning",
        "Multiple workspace declarations resolved to different member sets; the inventory is not canonical.",
        null,
        declarations.flatMap((declaration) => declaration.evidence),
      );
      complete = false;
    }
    selectedPaths = Array.from(new Set(expanded.flatMap((value) => value.paths))).sort(compareCodePoint);
  }
  if (!complete) {
    diagnostics.add(
      "WORKSPACE_UNRESOLVED",
      "warning",
      "Workspace member discovery was incomplete; totals and absent-member conclusions remain unknown.",
      null,
      declarations.flatMap((declaration) => declaration.evidence),
    );
  }
  const candidateRecords = selectedPaths.map((relativePath) => ({
    path: relativePath,
    evidence: Array.from(
      new Set(
        expanded
          .filter((value) => value.paths.includes(relativePath))
          .flatMap((value) => value.evidence.get(relativePath) ?? []),
      ),
    ),
  }));
  return {
    declarations,
    candidates: candidateRecords,
    complete,
    hasValidDeclaration: true,
    declarationSets: expanded.map((value) => value.paths),
  };
}

export function workspaceOutputDeclarations(
  declarations: ParsedDeclaration[],
  rootManager: "npm" | "pnpm" | "yarn" | null,
): WorkspaceDeclaration[] {
  return declarations.map((declaration) => {
    let manager = declaration.manager;
    if (manager === null && (rootManager === "npm" || rootManager === "yarn")) manager = rootManager;
    if (manager !== null && rootManager !== null && manager !== rootManager) manager = null;
    const record: WorkspaceDeclaration = {
      manager,
      path: declaration.path,
      pointer: declaration.pointer,
      evidence: declaration.evidence,
    };
    return record;
  });
}

function parseManifestWorkspace(value: unknown): string[] | null {
  if (Array.isArray(value)) return value.every((item) => typeof item === "string" && item.length > 0) ? [...value] as string[] : null;
  if (isRecord(value) && Array.isArray(value.packages)) {
    return value.packages.every((item) => typeof item === "string" && item.length > 0) ? [...value.packages] as string[] : null;
  }
  return null;
}

function parsePnpmWorkspace(source: string): string[] | null {
  const lines = source.replaceAll("\r\n", "\n").replaceAll("\r", "\n").split("\n");
  if (lines.some((line) => /(^|\s)(?:[&*]|<<|!!|!)[^\s]/u.test(line) || /(^|\s)[|>][^\n]*/u.test(line))) return null;
  let packagesLine = -1;
  let inlineValue = "";
  for (let index = 0; index < lines.length; index += 1) {
    const line = stripYamlComment(lines[index] ?? "");
    const match = /^packages\s*:\s*(.*)$/u.exec(line.trimEnd());
    if (match) {
      if (packagesLine !== -1) return null;
      packagesLine = index;
      inlineValue = match[1] ?? "";
    }
  }
  if (packagesLine === -1) return null;
  if (inlineValue.trim().length > 0) return parseInlineArray(inlineValue.trim());
  const values: string[] = [];
  for (let index = packagesLine + 1; index < lines.length; index += 1) {
    const original = lines[index] ?? "";
    if (original.trim().length === 0 || original.trimStart().startsWith("#")) continue;
    if (!/^\s+/u.test(original)) break;
    const line = stripYamlComment(original).trim();
    const match = /^-\s+(.+)$/u.exec(line);
    if (!match || match[1] === undefined) return null;
    const value = parseYamlScalar(match[1].trim());
    if (value === null || value.length === 0) return null;
    values.push(value);
  }
  return values.length > 0 ? values : null;
}

function parseInlineArray(value: string): string[] | null {
  if (!value.startsWith("[") || !value.endsWith("]")) return null;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string" && item.length > 0) ? [...parsed] as string[] : null;
  } catch {
    return null;
  }
}

function parseYamlScalar(value: string): string | null {
  if (value.startsWith("\"") && value.endsWith("\"")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      return typeof parsed === "string" ? parsed : null;
    } catch {
      return null;
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1).replaceAll("''", "'");
  if (/^[\[\]{},&*!|>]|<<|!!/u.test(value)) return null;
  return value;
}

function stripYamlComment(value: string): string {
  let quote: "'" | '"' | null = null;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" || character === '"') {
      if (quote === null) quote = character;
      else if (quote === character) quote = null;
    } else if (character === "#" && quote === null && (index === 0 || /\s/u.test(value[index - 1] ?? ""))) {
      return value.slice(0, index).trimEnd();
    }
  }
  return value;
}

function parsePattern(source: string): PatternSpec | null {
  if (typeof source !== "string" || source.length === 0 || source.includes("\\")) return null;
  const exclude = source.startsWith("!");
  const value = exclude ? source.slice(1) : source;
  if (value.length === 0 || value.startsWith("/") || /^[A-Za-z]:/u.test(value)) return null;
  const rawSegments = value.split("/");
  const segments: string[] = [];
  for (const segment of rawSegments) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") return null;
    if (segment === "*" || segment === "**") {
      segments.push(segment);
      continue;
    }
    if (/[?\[\]{}()!*]/u.test(segment)) return null;
    segments.push(segment);
  }
  if (segments.length === 0) return null;
  return { exclude, segments, source };
}

function expandPattern(scanner: Scanner, segments: string[]): { paths: string[]; complete: boolean } {
  let states = ["."];
  let complete = true;
  for (const segment of segments) {
    if (segment === "**") {
      const recursive = new Set<string>();
      const queue = [...states];
      while (queue.length > 0) {
        const current = queue.shift() ?? ".";
        if (recursive.has(current)) continue;
        recursive.add(current);
        const depth = current === "." ? 0 : current.split("/").length;
        if (depth >= BUDGETS.directoryDepth) {
          scanner.markDepthLimit(current);
          complete = false;
          continue;
        }
        const listing = scanner.listDirectory(current);
        if (!listing.complete) complete = false;
        for (const entry of listing.entries) {
          const candidate = current === "." ? entry.name : `${current}/${entry.name}`;
          if (scanner.isForbiddenDirectory(candidate)) continue;
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          const probe = scanner.probe(candidate);
          if (probe.kind === "directory") queue.push(candidate);
          else if (probe.kind !== "missing") complete = false;
        }
      }
      states = Array.from(recursive).sort(compareCodePoint);
      continue;
    }
    const next: string[] = [];
    for (const current of states) {
      if (segment === "*") {
        const listing = scanner.listDirectory(current);
        if (!listing.complete) complete = false;
        for (const entry of listing.entries) {
          const candidate = current === "." ? entry.name : `${current}/${entry.name}`;
          if (scanner.isForbiddenDirectory(candidate)) continue;
          if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
          const probe = scanner.probe(candidate);
          if (probe.kind === "directory") next.push(candidate);
          else if (probe.kind !== "missing") complete = false;
        }
      } else {
        const candidate = current === "." ? segment : `${current}/${segment}`;
        if (scanner.isForbiddenDirectory(candidate)) continue;
        const probe = scanner.probe(candidate);
        if (probe.kind === "directory") next.push(candidate);
        else if (probe.kind !== "missing") complete = false;
      }
    }
    states = Array.from(new Set(next)).sort(compareCodePoint);
  }
  return { paths: states.filter((value) => value !== "."), complete };
}

function matchesPattern(relativePath: string, segments: string[]): boolean {
  const pathSegments = relativePath === "." ? [] : relativePath.split("/");
  const memo = new Map<string, boolean>();
  const visit = (pathIndex: number, patternIndex: number): boolean => {
    const key = `${pathIndex}:${patternIndex}`;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result = false;
    if (patternIndex === segments.length) result = pathIndex === pathSegments.length;
    else if (segments[patternIndex] === "**") {
      result = visit(pathIndex, patternIndex + 1) || (pathIndex < pathSegments.length && visit(pathIndex + 1, patternIndex));
    } else {
      result = pathIndex < pathSegments.length && segments[patternIndex] === pathSegments[pathIndex] && visit(pathIndex + 1, patternIndex + 1);
    }
    memo.set(key, result);
    return result;
  };
  return visit(0, 0);
}

function sameStringSet(left: readonly string[], right: readonly string[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}
