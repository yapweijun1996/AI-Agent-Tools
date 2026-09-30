import { lstatSync, readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { basename, join } from "node:path";
import type { Diagnostic, ResourceLimits, Truncation } from "../types.js";
import { readBoundedText } from "./bounded-reader.js";
import { isSecretLike, repositoryRelative, sourceLanguage, type RootInfo } from "./paths.js";

export interface DiscoveredFile {
  absolutePath: string;
  relativePath: string;
  size: number;
  isTest: boolean;
  language?: ReturnType<typeof sourceLanguage>;
}

export interface IgnorePattern {
  pattern: string;
  negated: boolean;
  directoryOnly: boolean;
}

interface IgnoreScope {
  base: string;
  patterns: IgnorePattern[];
}

export interface DiscoveryResult {
  files: DiscoveredFile[];
  sourceFiles: DiscoveredFile[];
  testFiles: DiscoveredFile[];
  projectFiles: string[];
  diagnostics: Diagnostic[];
  truncation: Truncation;
  filesScanned: number;
  bytesParsed: number;
  readFile(relativePath: string): string | undefined;
}

export interface DiscoveryOptions {
  include?: string[];
  exclude?: string[];
  limits: ResourceLimits;
  deadline?: number;
}

const DEFAULT_IGNORED_DIRECTORIES = new Set([".git", "node_modules", "dist", "build", "coverage", ".cache", "vendor", "generated"]);
const SOURCE_OR_CONFIG_EXTENSIONS = [".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs", ".mts", ".cts", ".json"];

function diagnostic(code: Diagnostic["code"], message: string, severity: Diagnostic["severity"], path?: string, details?: Record<string, unknown>): Diagnostic {
  return { code, message, severity, ...(path ? { path } : {}), ...(details ? { details } : {}) };
}

function normalizePattern(pattern: string): string {
  return pattern.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

function globToRegExp(pattern: string): RegExp {
  let result = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? "";
    if (character === "*" && pattern[index + 1] === "*") {
      index += 1;
      if (pattern[index + 1] === "/") {
        index += 1;
        result += "(?:.*/)?";
      } else {
        result += ".*";
      }
    } else if (character === "*") {
      result += "[^/]*";
    } else if (character === "?") {
      result += "[^/]";
    } else {
      result += /[\\^$+?.()|{}[\]]/.test(character) ? `\\${character}` : character;
    }
  }
  return new RegExp(`${result}$`);
}

function patternMatches(pattern: string, relativePath: string, directory: boolean): boolean {
  const normalizedPattern = normalizePattern(pattern);
  const normalizedPath = relativePath.replaceAll("\\", "/").replace(/^\/+/, "");
  const candidates = [normalizedPath, directory ? `${normalizedPath}/placeholder` : normalizedPath];
  if (!normalizedPattern.includes("/")) candidates.push(basename(normalizedPath));
  return candidates.some(candidate => globToRegExp(normalizedPattern).test(candidate));
}

function anyPatternMatches(patterns: readonly string[] | undefined, relativePath: string, directory: boolean): boolean {
  return (patterns ?? []).some(pattern => patternMatches(pattern, relativePath, directory));
}

function includeMayReachDirectory(patterns: readonly string[] | undefined, relativePath: string): boolean {
  if (!patterns || patterns.length === 0) return false;
  const directory = normalizePattern(relativePath).split("/").filter(Boolean);
  return patterns.some(rawPattern => {
    const pattern = normalizePattern(rawPattern).split("/").filter(Boolean);
    if (pattern.length === 0 || pattern[0] === "**") return true;
    if (directory.length > pattern.length) return false;
    return directory.every((segment, index) => {
      const patternSegment = pattern[index] ?? "";
      return patternSegment === "**" || globToRegExp(patternSegment).test(segment);
    });
  });
}

function parseIgnore(content: string): IgnorePattern[] {
  const patterns: IgnorePattern[] = [];
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const negated = line.startsWith("!") && !line.startsWith("\\!");
    const withoutNegation = negated ? line.slice(1) : line;
    const directoryOnly = withoutNegation.endsWith("/");
    const pattern = normalizePattern(directoryOnly ? withoutNegation.slice(0, -1) : withoutNegation);
    if (pattern) patterns.push({ pattern, negated, directoryOnly });
  }
  return patterns;
}

function loadGitignore(root: RootInfo, directory: string, limits: ResourceLimits, diagnostics: Diagnostic[]): IgnoreScope {
  const path = join(directory, ".gitignore");
  try {
    if (!lstatSync(path).isFile()) return { base: repositoryRelative(root.absolute, directory), patterns: [] };
    const read = readBoundedText(path, limits.maxSingleFileBytes);
    if ("text" in read) return { base: repositoryRelative(root.absolute, directory), patterns: parseIgnore(read.text) };
    diagnostics.push(diagnostic(read.reason === "size" ? "RESOURCE_LIMIT" : "INTERNAL_ERROR", "Unable to read bounded .gitignore rules", "warning", repositoryRelative(root.absolute, path)));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      diagnostics.push(diagnostic("INTERNAL_ERROR", `Unable to read .gitignore: ${error instanceof Error ? error.message : String(error)}`, "warning", repositoryRelative(root.absolute, path)));
    }
  }
  return { base: repositoryRelative(root.absolute, directory), patterns: [] };
}

function isGitignored(scopes: readonly IgnoreScope[], relativePath: string, directory: boolean): boolean {
  let ignored = false;
  for (const scope of scopes) {
    const local = scope.base ? relativePath.slice(scope.base.length + 1) : relativePath;
    for (const rule of scope.patterns) {
      if (rule.directoryOnly && !directory) continue;
      if (patternMatches(rule.pattern, local, directory)) ignored = !rule.negated;
    }
  }
  return ignored;
}

function hasAllowedExtension(path: string): boolean {
  const lower = path.toLowerCase();
  return SOURCE_OR_CONFIG_EXTENSIONS.some(extension => lower.endsWith(extension));
}

function isTestPath(relativePath: string): boolean {
  const parts = relativePath.toLowerCase().split("/");
  const file = parts.at(-1) ?? "";
  return /(?:\.test|\.spec)\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts)$/.test(file) || parts.slice(0, -1).some(part => part === "test" || part === "tests" || part === "__tests__");
}

function shouldSkipDirectory(relativePath: string, name: string, options: DiscoveryOptions, scopes: readonly IgnoreScope[]): boolean {
  if (name === ".git" || name === "node_modules") return true;
  if (anyPatternMatches(options.exclude, relativePath, true)) return true;
  if (options.include && options.include.length > 0) return !includeMayReachDirectory(options.include, relativePath);
  return DEFAULT_IGNORED_DIRECTORIES.has(name) || isGitignored(scopes, relativePath, true);
}

function shouldSkipFile(relativePath: string, options: DiscoveryOptions, scopes: readonly IgnoreScope[]): boolean {
  if (isSecretLike(relativePath)) return true;
  if (anyPatternMatches(options.exclude, relativePath, false)) return true;
  if (options.include && options.include.length > 0) return !anyPatternMatches(options.include, relativePath, false);
  return isGitignored(scopes, relativePath, false);
}

function addReason(truncation: Truncation, reason: Diagnostic["code"]): void {
  truncation.truncated = true;
  if (!truncation.reasons.includes(reason)) truncation.reasons.push(reason);
}

export function discoverFiles(root: RootInfo, options: DiscoveryOptions): DiscoveryResult {
  const diagnostics: Diagnostic[] = [];
  const truncation: Truncation = { truncated: false, reasons: [] };
  const files: DiscoveredFile[] = [];
  const contents = new Map<string, string | undefined>();
  let bytesParsed = 0;
  let timedOut = false;

  const visit = (directory: string, inherited: readonly IgnoreScope[]): void => {
    if (timedOut || files.length >= options.limits.maxDiscoveredFiles) {
      addReason(truncation, "RESOURCE_LIMIT");
      return;
    }
    if (options.deadline !== undefined && Date.now() >= options.deadline) {
      timedOut = true;
      addReason(truncation, "TIMEOUT");
      return;
    }
    const scopes = [...inherited, loadGitignore(root, directory, options.limits, diagnostics)];
    let entries: Dirent<string>[];
    try {
      entries = readdirSync(directory, { encoding: "utf8", withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0);
    } catch (error) {
      diagnostics.push(diagnostic("INTERNAL_ERROR", `Unable to read directory: ${error instanceof Error ? error.message : String(error)}`, "warning", repositoryRelative(root.absolute, directory)));
      return;
    }
    for (const entry of entries) {
      if (timedOut || files.length >= options.limits.maxDiscoveredFiles) {
        addReason(truncation, "RESOURCE_LIMIT");
        return;
      }
      if (options.deadline !== undefined && Date.now() >= options.deadline) {
        timedOut = true;
        addReason(truncation, "TIMEOUT");
        return;
      }
      const absolutePath = join(directory, entry.name);
      const relativePath = repositoryRelative(root.absolute, absolutePath);
      if (!relativePath || relativePath.startsWith("../") || entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(relativePath, entry.name, options, scopes)) visit(absolutePath, scopes);
        continue;
      }
      if (!entry.isFile() || !hasAllowedExtension(relativePath) || shouldSkipFile(relativePath, options, scopes)) continue;
      let size: number;
      try {
        size = statSync(absolutePath).size;
      } catch (error) {
        diagnostics.push(diagnostic("INTERNAL_ERROR", `Unable to stat file: ${error instanceof Error ? error.message : String(error)}`, "warning", relativePath));
        continue;
      }
      if (size > options.limits.maxSingleFileBytes || bytesParsed + size > options.limits.maxParsedBytes) {
        diagnostics.push(diagnostic("RESOURCE_LIMIT", "File exceeds the configured discovery byte budget", "warning", relativePath, { size }));
        addReason(truncation, "RESOURCE_LIMIT");
        continue;
      }
      const file: DiscoveredFile = { absolutePath, relativePath, size, isTest: isTestPath(relativePath), ...(sourceLanguage(relativePath) ? { language: sourceLanguage(relativePath) } : {}) };
      files.push(file);
      bytesParsed += size;
    }
  };

  visit(root.absolute, []);
  files.sort((left, right) => left.relativePath < right.relativePath ? -1 : left.relativePath > right.relativePath ? 1 : 0);
  const sourceFiles = files.filter(file => file.language !== undefined);
  const testFiles = sourceFiles.filter(file => file.isTest);
  const projectFiles = files.filter(file => {
    const name = basename(file.relativePath).toLowerCase();
    return name === "package.json" || name.startsWith("tsconfig") || name.startsWith("vite.config") || name.startsWith("vitest.config") || name.startsWith("jest.config");
  }).map(file => file.relativePath);

  const readFile = (relativePath: string): string | undefined => {
    if (contents.has(relativePath)) return contents.get(relativePath);
    const file = files.find(candidate => candidate.relativePath === relativePath);
    if (!file) return undefined;
    const read = readBoundedText(file.absolutePath, options.limits.maxSingleFileBytes);
    const value = "text" in read ? read.text : undefined;
    contents.set(relativePath, value);
    return value;
  };

  return { files, sourceFiles, testFiles, projectFiles, diagnostics, truncation, filesScanned: files.length, bytesParsed, readFile };
}
