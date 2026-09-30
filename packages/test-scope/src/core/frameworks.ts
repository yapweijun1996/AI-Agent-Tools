import { basename, dirname } from "node:path";
import type { Diagnostic, DiscoveredCommand, DiscoveryData, Evidence, Framework, FrameworkObservation, Confidence } from "../types.js";
import type { DiscoveryResult, DiscoveredFile } from "./discovery.js";

interface PackageJson {
  name?: unknown;
  scripts?: Record<string, unknown>;
  dependencies?: Record<string, unknown>;
  devDependencies?: Record<string, unknown>;
  peerDependencies?: Record<string, unknown>;
}

function evidence(type: Evidence["type"], confidence: Confidence, source: string, target?: string, details?: Record<string, unknown>): Evidence {
  return { type, confidence, source, ...(target ? { target } : {}), ...(details ? { details } : {}) };
}

function parsePackage(discovery: DiscoveryResult, path: string): PackageJson | undefined {
  const text = discovery.readFile(path);
  if (!text) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return undefined;
    return parsed as PackageJson;
  } catch {
    return undefined;
  }
}

function packagePaths(discovery: DiscoveryResult): string[] {
  return discovery.projectFiles.filter(path => basename(path).toLowerCase() === "package.json").sort();
}

function packageValues(packageJson: PackageJson): Set<string> {
  const values = new Set<string>();
  for (const section of [packageJson.dependencies, packageJson.devDependencies, packageJson.peerDependencies]) {
    if (!section) continue;
    for (const key of Object.keys(section)) values.add(key.toLowerCase());
  }
  return values;
}

function packageScriptEntries(packageJson: PackageJson): Array<[string, string]> {
  return Object.entries(packageJson.scripts ?? {})
    .filter((entry): entry is [string, string] => typeof entry[1] === "string")
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
}

export function scriptPurpose(name: string, command: string): DiscoveredCommand["purpose"] {
  const scriptName = name.toLowerCase();
  if (/(^|[-:])(coverage|cov)([-:]|$)/.test(scriptName)) return "coverage";
  if (/(^|[-:])(typecheck|type-check|check-types)([-:]|$)/.test(scriptName)) return "typecheck";
  if (/(^|[-:])(build|compile)([-:]|$)/.test(scriptName) || scriptName === "prepack") return "build";
  if (/(^|[-:])lint([-:]|$)/.test(scriptName)) return "lint";
  if (/(^|[-:])release([-:]|$)/.test(scriptName) || scriptName === "prepublishonly") return "release";
  if (/(^|[-:])(verify|validate)([-:]|$)/.test(scriptName)) return "verify";
  if (/(^|[-:])(test|spec|unit|integration|e2e)([-:]|$)/.test(scriptName)) return "test";
  const value = command.trim().toLowerCase();
  if (/\bvitest\b|\bjest\b|node\s+--test/.test(value)) return "test";
  if (/(^|\s)(?:npx\s+)?tsc(?:\s|$)/.test(value)) return "typecheck";
  if (/(^|\s)(?:npx\s+)?(?:vite|webpack|rollup)(?:\s+[^&;]*)?\s+build(?:\s|$)/.test(value)) return "build";
  if (/(^|\s)(?:eslint|biome|prettier)(?:\s|$)/.test(value)) return "lint";
  return "other";
}

function addObservation(observations: Map<Framework, FrameworkObservation>, framework: Framework, source: string, target: string, detail: string): void {
  const item = observations.get(framework) ?? { framework, confidence: "confirmed", evidence: [] };
  item.evidence.push(evidence("project-command-evidence", "confirmed", source, target, { detail }));
  observations.set(framework, item);
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/.*$/gm, "$1");
}

function scanImports(discovery: DiscoveryResult, observations: Map<Framework, FrameworkObservation>): void {
  for (const file of discovery.testFiles) {
    const text = stripComments(discovery.readFile(file.relativePath) ?? "");
    if (/from\s*["']vitest["']|from\s*["']@vitest\//.test(text) || /\bvitest\.(?:run|expect|describe|it|test)\b/.test(text)) {
      addObservation(observations, "vitest", file.relativePath, file.relativePath, "test file imports or uses Vitest");
    }
    if (/from\s*["']@jest\/globals["']|from\s*["']jest["']|\bjest\.(?:fn|mock|spyOn|expect)\b/.test(text)) {
      addObservation(observations, "jest", file.relativePath, file.relativePath, "test file imports or uses Jest");
    }
    if (/from\s*["']node:test["']|require\(\s*["']node:test["']\s*\)/.test(text)) {
      addObservation(observations, "node", file.relativePath, file.relativePath, "test file imports node:test");
    }
  }
}

export function packageRootFor(discovery: DiscoveryResult, relativePath: string): string {
  const roots = packagePaths(discovery).map(path => dirname(path)).sort((left, right) => right.length - left.length);
  return roots.find(root => relativePath === root || relativePath.startsWith(`${root}/`)) ?? ".";
}

export function detectFrameworks(discovery: DiscoveryResult): { observations: FrameworkObservation[]; diagnostics: Diagnostic[] } {
  const observations = new Map<Framework, FrameworkObservation>();
  const diagnostics: Diagnostic[] = [];
  for (const path of packagePaths(discovery)) {
    const packageJson = parsePackage(discovery, path);
    if (!packageJson) {
      diagnostics.push({ code: "INTERNAL_ERROR", message: "package.json could not be parsed as bounded JSON", severity: "warning", path });
      continue;
    }
    const values = packageValues(packageJson);
    if (values.has("vitest")) addObservation(observations, "vitest", path, path, "package metadata declares Vitest");
    if (values.has("jest") || values.has("@jest/globals")) addObservation(observations, "jest", path, path, "package metadata declares Jest");
    for (const [name, command] of packageScriptEntries(packageJson)) {
      const purpose = scriptPurpose(name, command);
      if (purpose === "test") {
        if (/vitest/.test(command)) addObservation(observations, "vitest", `${path}#scripts.${name}`, path, "package script invokes Vitest");
        if (/\bjest\b/.test(command)) addObservation(observations, "jest", `${path}#scripts.${name}`, path, "package script invokes Jest");
        if (/node\s+--test/.test(command)) addObservation(observations, "node", `${path}#scripts.${name}`, path, "package script invokes node --test");
      }
    }
  }
  for (const path of discovery.projectFiles) {
    const name = basename(path).toLowerCase();
    if (name.startsWith("vite.config") || name.startsWith("vitest.config")) addObservation(observations, "vitest", path, path, "Vitest-compatible configuration exists");
    if (name.startsWith("jest.config")) addObservation(observations, "jest", path, path, "Jest configuration exists");
  }
  scanImports(discovery, observations);
  const result = [...observations.values()].sort((left, right) => left.framework < right.framework ? -1 : left.framework > right.framework ? 1 : 0);
  return { observations: result, diagnostics };
}

export function discoverCommands(discovery: DiscoveryResult): { commands: DiscoveredCommand[]; diagnostics: Diagnostic[] } {
  const commands: DiscoveredCommand[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const path of packagePaths(discovery)) {
    const packageJson = parsePackage(discovery, path);
    if (!packageJson) {
      if (!diagnostics.some(item => item.path === path)) diagnostics.push({ code: "INTERNAL_ERROR", message: "package.json could not be parsed as bounded JSON", severity: "warning", path });
      continue;
    }
    for (const [name, command] of packageScriptEntries(packageJson)) {
      const purpose = scriptPurpose(name, command);
      commands.push({ name, command: `npm run ${name}`, source: `${path}#scripts.${name}`, packagePath: path, purpose, evidence: [evidence("project-command-evidence", "confirmed", `${path}#scripts.${name}`, path, { declaredCommand: command, purpose })] });
    }
  }
  commands.sort((left, right) => left.source < right.source ? -1 : left.source > right.source ? 1 : left.name < right.name ? -1 : 1);
  return { commands, diagnostics };
}

export function discoveryData(discovery: DiscoveryResult): { data: DiscoveryData; diagnostics: Diagnostic[] } {
  const frameworks = detectFrameworks(discovery);
  const commands = discoverCommands(discovery);
  const frameworkByFile = new Map<string, Framework>();
  for (const observation of frameworks.observations) {
    for (const item of observation.evidence) {
      if (item.source && discovery.testFiles.some(file => file.relativePath === item.source)) frameworkByFile.set(item.source, observation.framework);
    }
  }
  const tests = discovery.testFiles.slice().sort((left, right) => left.relativePath < right.relativePath ? -1 : 1).map((file: DiscoveredFile) => ({
    path: file.relativePath,
    language: file.language!,
    naming: /(?:\.test|\.spec)\./i.test(basename(file.relativePath)) ? "test-file" as const : "test-directory" as const,
    ...(frameworkByFile.has(file.relativePath) ? { framework: frameworkByFile.get(file.relativePath) } : {})
  }));
  const diagnostics = [...frameworks.diagnostics, ...commands.diagnostics];
  const configs = discovery.projectFiles.filter(path => /^tsconfig[^/]*\.json$/i.test(basename(path))).sort();
  if (configs.length > 1) diagnostics.push({ code: "PROJECT_CONFIG_AMBIGUOUS", message: "Multiple TypeScript project configurations were discovered; planning remains bounded but project-specific interpretation is ambiguous", severity: "warning", details: { projects: configs } });
  if (tests.length > 0 && frameworks.observations.length === 0) diagnostics.push({ code: "TEST_FRAMEWORK_NOT_FOUND", message: "Test files were discovered but no supported test framework was confirmed", severity: "warning" });
  return { data: { frameworks: frameworks.observations, tests, commands: commands.commands, projectFiles: discovery.projectFiles.slice().sort() }, diagnostics };
}
