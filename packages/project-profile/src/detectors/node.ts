import { BUDGETS, PURPOSES } from "../constants.js";
import { DiagnosticCollector } from "../core/diagnostics.js";
import { compareCodePoint, EvidenceStore, sortStrings } from "../core/evidence.js";
import { Scanner } from "../core/scanner.js";
import type {
  Command,
  Entrypoint,
  PackageManager,
  RuntimeDeclaration,
  ScriptGroup,
  CommandPurpose,
} from "../types.js";
import type { PackageManifest } from "./manifest.js";
import { hasOwn, isRecord, manifestEvidence, pointerFor } from "./manifest.js";

export interface NodeScope {
  manifest: PackageManifest;
  packageManager: PackageManager;
  workspaceEvidence: string[];
}

export interface NodeFacts {
  runtimes: RuntimeDeclaration[];
  scripts: ScriptGroup[];
  commands: Record<CommandPurpose, Command[]>;
  entrypoints: Entrypoint[];
}

export function collectNodeFacts(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  scopes: readonly NodeScope[],
): NodeFacts {
  const runtimes: RuntimeDeclaration[] = [];
  const scripts: ScriptGroup[] = [];
  const commands = emptyCommands();
  const entrypoints: Entrypoint[] = [];

  for (const scope of scopes) {
    if (!scope.manifest.valid || scope.manifest.data === null) continue;
    runtimes.push(...collectRuntimeDeclarations(scanner, evidence, diagnostics, scope.manifest));
    const scriptResult = collectScripts(evidence, diagnostics, scope.manifest);
    if (scriptResult.group !== null) scripts.push(scriptResult.group);
    for (const command of makeCommands(scope.manifest, scope.packageManager, scriptResult.names, evidence)) {
      commands[commandPurpose(command.script)]?.push(command);
    }
    for (const purpose of ["build", "test", "lint"] as const) {
      if (!scriptResult.names.has(purpose)) {
        diagnostics.add(
          `NO_${purpose.toUpperCase()}_COMMAND`,
          "info",
          `No exact ${purpose} script was declared in this Node package.`,
          scope.manifest.path,
          scope.manifest.evidence,
        );
      }
    }
    entrypoints.push(...collectEntrypoints(scanner, evidence, diagnostics, scope.manifest));
  }

  scripts.sort((left, right) => compareCodePoint(left.cwd, right.cwd));
  runtimes.sort((left, right) => {
    const cwdOrder = compareCodePoint(left.cwd, right.cwd);
    if (cwdOrder !== 0) return cwdOrder;
    const roleOrder = compareCodePoint(left.role, right.role);
    if (roleOrder !== 0) return roleOrder;
    return compareCodePoint(left.value ?? "", right.value ?? "");
  });
  for (const purpose of PURPOSES) {
    commands[purpose]?.sort((left, right) => {
      const cwdOrder = compareCodePoint(left.cwd, right.cwd);
      if (cwdOrder !== 0) return cwdOrder;
      return compareCodePoint(left.script, right.script);
    });
  }
  entrypoints.sort((left, right) => {
    const cwdOrder = compareCodePoint(left.cwd, right.cwd);
    if (cwdOrder !== 0) return cwdOrder;
    const pointerOrder = compareCodePoint(left.pointer, right.pointer);
    if (pointerOrder !== 0) return pointerOrder;
    return compareCodePoint(left.path ?? "", right.path ?? "");
  });
  return { runtimes, scripts, commands, entrypoints };
}

function collectRuntimeDeclarations(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
): RuntimeDeclaration[] {
  const result: RuntimeDeclaration[] = [];
  const data = manifest.data;
  if (data !== null && hasOwn(data, "engines")) {
    const engines = data.engines;
    if (isRecord(engines) && hasOwn(engines, "node")) {
      const pointerEvidence = manifestEvidence(evidence, manifest, "/engines/node");
      if (typeof engines.node === "string" && boundedString(engines.node, manifest.path, diagnostics) !== null) {
        result.push({
          name: "node",
          cwd: manifest.cwd,
          value: engines.node,
          role: "supported-constraint",
          confidence: "confirmed",
          evidence: [pointerEvidence],
        });
      } else {
        diagnostics.add("RUNTIME_DECLARATION_INVALID", "warning", "The Node runtime constraint is malformed or too large.", manifest.path, [pointerEvidence]);
      }
    }
  }
  for (const pinName of [".nvmrc", ".node-version"] as const) {
    const relativePath = manifest.cwd === "." ? pinName : `${manifest.cwd}/${pinName}`;
    const probe = scanner.probe(relativePath);
    if (probe.kind !== "file") continue;
    const pinEvidence = scanner.fileEvidence(relativePath);
    const body = scanner.readMetadata(relativePath);
    if (body === null) continue;
    const value = body.text.trim();
    if (value.length === 0 || boundedString(value, relativePath, diagnostics) === null) {
      diagnostics.add("RUNTIME_DECLARATION_INVALID", "warning", "A Node development pin is empty or too large.", relativePath, [pinEvidence]);
      continue;
    }
    result.push({ name: "node", cwd: manifest.cwd, value, role: "development-pin", confidence: "confirmed", evidence: [pinEvidence] });
  }
  return result;
}

function collectScripts(
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
): { names: Set<string>; group: ScriptGroup | null } {
  const names = new Set<string>();
  const scriptEvidence: string[] = [];
  const scripts = manifest.data?.scripts;
  if (isRecord(scripts)) {
    for (const name of Object.keys(scripts)) {
      const value = scripts[name];
      if (typeof value !== "string") continue;
      if (boundedString(name, manifest.path, diagnostics) === null) continue;
      names.add(name);
      scriptEvidence.push(manifestEvidence(evidence, manifest, pointerFor("scripts", name)));
    }
  }
  const sortedNames = sortStrings(Array.from(names));
  const group = sortedNames.length > 0 ? { cwd: manifest.cwd, names: sortedNames, evidence: scriptEvidence } : null;
  return { names, group };
}

function makeCommands(
  manifest: PackageManifest,
  packageManager: PackageManager,
  scriptNames: ReadonlySet<string>,
  evidence: EvidenceStore,
): Command[] {
  const commands: Command[] = [];
  for (const purpose of PURPOSES) {
    if (!scriptNames.has(purpose)) continue;
    const pointer = pointerFor("scripts", purpose);
    const invocation = packageManager.invocationAvailable && packageManager.name !== null
      ? [packageManager.name, "run", purpose]
      : null;
    commands.push({
      cwd: manifest.cwd,
      script: purpose,
      argv: invocation,
      source: `package.json#${pointer}`,
      confidence: "confirmed",
      declaredByProject: true,
      execution: "not_run",
      evidence: [manifestEvidence(evidence, manifest, pointer)],
    });
  }
  return commands;
}

function collectEntrypoints(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
): Entrypoint[] {
  const data = manifest.data;
  if (data === null) return [];
  const result: Entrypoint[] = [];
  for (const [key, kind] of [["main", "main"], ["module", "module"]] as const) {
    if (typeof data[key] === "string") {
      const pointer = pointerFor(key);
      const entrypoint = makeEntrypoint(scanner, evidence, diagnostics, manifest, kind, data[key], pointer);
      if (entrypoint !== null) result.push(entrypoint);
    }
  }
  if (typeof data.bin === "string") {
    const pointer = pointerFor("bin");
    const entrypoint = makeEntrypoint(scanner, evidence, diagnostics, manifest, "bin", data.bin, pointer);
    if (entrypoint !== null) result.push(entrypoint);
  } else if (isRecord(data.bin)) {
    for (const name of sortStrings(Object.keys(data.bin))) {
      const value = data.bin[name];
      if (typeof value !== "string") continue;
      const pointer = pointerFor("bin", name);
      const entrypoint = makeEntrypoint(scanner, evidence, diagnostics, manifest, "bin", value, pointer);
      if (entrypoint !== null) result.push(entrypoint);
    }
  }
  if (hasOwn(data, "exports")) collectExportTargets(scanner, evidence, diagnostics, manifest, data.exports, ["exports"], result);
  return result;
}

function collectExportTargets(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
  value: unknown,
  segments: (string | number)[],
  result: Entrypoint[],
): void {
  if (typeof value === "string") {
    const pointer = pointerFor(...segments);
    const entrypoint = makeEntrypoint(scanner, evidence, diagnostics, manifest, "export", value, pointer);
    if (entrypoint !== null) result.push(entrypoint);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExportTargets(scanner, evidence, diagnostics, manifest, item, [...segments, index], result));
    return;
  }
  if (!isRecord(value)) return;
  for (const key of sortStrings(Object.keys(value))) {
    collectExportTargets(scanner, evidence, diagnostics, manifest, value[key], [...segments, key], result);
  }
}

function makeEntrypoint(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  manifest: PackageManifest,
  kind: Entrypoint["kind"],
  rawPath: string,
  pointer: string,
): Entrypoint | null {
  if (boundedString(rawPath, manifest.path, diagnostics) === null) return null;
  const sourceEvidence = manifestEvidence(evidence, manifest, pointer);
  const hasPattern = /[*?\[]/u.test(rawPath);
  if (hasPattern) {
    const normalized = scanner.normalizeRelative(rawPath);
    if (normalized === null) {
      diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A declared entrypoint target was outside the selected root.", manifest.path, [sourceEvidence]);
      return { cwd: manifest.cwd, kind, path: null, pointer, evidence: [sourceEvidence], existence: "not_checked" };
    }
    return { cwd: manifest.cwd, kind, path: normalized, pointer, evidence: [sourceEvidence], existence: "not_checked" };
  }
  const normalized = scanner.normalizeRelative(rawPath);
  if (normalized === null) {
    diagnostics.add("PATH_OUTSIDE_ROOT", "warning", "A declared entrypoint target was outside the selected root.", manifest.path, [sourceEvidence]);
    return { cwd: manifest.cwd, kind, path: null, pointer, evidence: [sourceEvidence], existence: "not_checked" };
  }
  const target = manifest.cwd === "." ? normalized : normalized === "." ? manifest.cwd : `${manifest.cwd}/${normalized}`;
  const probe = scanner.probe(target);
  if (probe.kind === "file") {
    return { cwd: manifest.cwd, kind, path: normalized, pointer, evidence: [sourceEvidence], existence: "present" };
  }
  if (probe.kind === "missing") {
    diagnostics.add("ENTRYPOINT_MISSING", "info", "A declared entrypoint target does not currently exist.", target, [sourceEvidence]);
    return { cwd: manifest.cwd, kind, path: normalized, pointer, evidence: [sourceEvidence], existence: "missing" };
  }
  return { cwd: manifest.cwd, kind, path: probe.kind === "outside" ? null : normalized, pointer, evidence: [sourceEvidence], existence: "not_checked" };
}

function boundedString(value: string, path: string, diagnostics: DiagnosticCollector): string | null {
  if (Buffer.byteLength(value, "utf8") <= BUDGETS.sourceStringBytes) return value;
  diagnostics.add("METADATA_TOO_LARGE", "warning", "A source-derived metadata value exceeded the bounded string limit.", path);
  return null;
}

function commandPurpose(script: string): CommandPurpose {
  return script as CommandPurpose;
}

function emptyCommands(): Record<CommandPurpose, Command[]> {
  return { build: [], test: [], lint: [], typecheck: [], dev: [], start: [], format: [] };
}
