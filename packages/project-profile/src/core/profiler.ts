import { BUDGETS, EMPTY_COMMANDS, PURPOSES, SCHEMA_VERSION, TOOL_VERSION } from "../constants.js";
import { DiagnosticCollector, hasPartialCode } from "./diagnostics.js";
import { EvidenceStore, compareCodePoint } from "./evidence.js";
import { finalizeDraft, type DraftProfile } from "./normalize.js";
import { validateProfileSemantics } from "./semantic.js";
import { RootScannerError, Scanner } from "./scanner.js";
import { collectInventory } from "../detectors/inventory.js";
import { loadPackageManifest } from "../detectors/manifest.js";
import { collectNodeFacts, type NodeScope } from "../detectors/node.js";
import { resolvePackageManager } from "../detectors/package-manager.js";
import { discoverWorkspace, workspaceOutputDeclarations, type WorkspaceCandidate } from "../detectors/workspace.js";
import type {
  Command,
  CommandPurpose,
  Coverage,
  PackageManager,
  Profile,
  ProfileOptions,
  WorkspacePackage,
} from "../types.js";

export function profileRepository(requestedRoot: string, options: ProfileOptions = {}): Profile {
  const evidence = new EvidenceStore();
  const diagnostics = new DiagnosticCollector();
  let scanner: Scanner;
  try {
    scanner = Scanner.open(requestedRoot, diagnostics, evidence, options.accessObserver);
  } catch (error) {
    const code = error instanceof RootScannerError ? "ROOT_UNREADABLE" : "ROOT_UNREADABLE";
    diagnostics.add(code, "error", "The selected inspection root is not readable.");
    return finalizeDraft(makeErrorDraft(diagnostics.all()), evidence);
  }

  try {
    const draft = buildDraft(scanner, evidence, diagnostics);
    const output = fitOutputBudget(draft, evidence, diagnostics, options.pretty === true);
    const semanticErrors = validateProfileSemantics(output);
    if (semanticErrors.length > 0) {
      const failed = new DiagnosticCollector();
      failed.add("PROFILE_VALIDATION_FAILED", "error", "The constructed profile failed internal semantic validation.");
      return finalizeDraft(makeErrorDraft(failed.all()), evidence);
    }
    return output;
  } catch {
    diagnostics.add("PROFILE_VALIDATION_FAILED", "error", "The profiler could not construct a valid profile.");
    return finalizeDraft(makeErrorDraft(diagnostics.all()), evidence);
  }
}

export function createErrorProfile(code: string, message: string): Profile {
  const evidence = new EvidenceStore();
  const diagnostics = new DiagnosticCollector();
  diagnostics.add(code, "error", message);
  return finalizeDraft(makeErrorDraft(diagnostics.all()), evidence);
}

function buildDraft(scanner: Scanner, evidence: EvidenceStore, diagnostics: DiagnosticCollector): DraftProfile {
  const rootManifest = loadPackageManifest(scanner, evidence, diagnostics, ".");
  const rootManager = rootManifest.valid
    ? resolvePackageManager(scanner, evidence, diagnostics, rootManifest).manager
    : unknownManager();
  const workspaceDiscovery = discoverWorkspace(scanner, evidence, diagnostics, rootManifest);
  const candidates = workspaceDiscovery.candidates
    .filter((candidate) => candidate.path !== ".")
    .sort((left, right) => compareCodePoint(left.path, right.path));
  const memberManifests = new Map<string, ReturnType<typeof loadPackageManifest>>();
  for (const candidate of candidates) {
    const manifest = loadPackageManifest(scanner, evidence, diagnostics, candidate.path);
    memberManifests.set(candidate.path, manifest);
    if (!manifest.valid) {
      diagnostics.add(
        "WORKSPACE_UNRESOLVED",
        "warning",
        "A workspace member directory did not contain a readable valid package manifest.",
        `${candidate.path}/package.json`,
        candidate.evidence,
      );
    }
  }

  const returnedCandidates = candidates.slice(0, BUDGETS.workspacePackages);
  const returnedManifests = returnedCandidates
    .map((candidate) => memberManifests.get(candidate.path))
    .filter((manifest): manifest is NonNullable<typeof manifest> => manifest !== undefined);
  const rootScope: NodeScope | null = rootManifest.valid
    ? { manifest: rootManifest, packageManager: rootManager, workspaceEvidence: [] }
    : null;
  const memberScopes: NodeScope[] = [];
  const memberManagers = new Map<string, PackageManager>();
  for (const manifest of returnedManifests) {
    if (!manifest.valid) continue;
    const manager = resolvePackageManager(scanner, evidence, diagnostics, manifest, rootManager).manager;
    memberManagers.set(manifest.cwd, manager);
    memberScopes.push({
      manifest,
      packageManager: manager,
      workspaceEvidence: candidates.find((candidate) => candidate.path === manifest.cwd)?.evidence ?? [],
    });
  }
  const nodeScopes = [rootScope, ...memberScopes].filter((scope): scope is NodeScope => scope !== null);
  const workspacePackages = buildWorkspacePackages(diagnostics, returnedCandidates, memberManifests, memberManagers);
  checkDuplicateWorkspaceNames(diagnostics, returnedCandidates, memberManifests);

  const workspaceManager = chooseWorkspaceManager(workspaceDiscovery, rootManager, diagnostics);
  const workspaceEnabled = workspaceDiscovery.hasValidDeclaration
    ? true
    : workspaceDiscovery.declarations.length > 0
      ? null
      : rootManifest.valid
        ? false
        : null;
  const workspace: DraftProfile["workspace"] = {
    enabled: workspaceEnabled,
    manager: workspaceManager,
    declarations: workspaceOutputDeclarations(workspaceDiscovery.declarations, rootManager.name),
    packages: workspacePackages,
    total: workspaceDiscovery.hasValidDeclaration && workspaceDiscovery.complete ? candidates.length : null,
    returned: workspacePackages.length,
    truncated: candidates.length > BUDGETS.workspacePackages || !workspaceDiscovery.complete,
  };
  if (candidates.length > BUDGETS.workspacePackages) {
    diagnostics.add(
      "WORKSPACE_TRUNCATED",
      "warning",
      "The workspace package output exceeded the fixed return cap.",
      null,
      workspaceDiscovery.declarations.flatMap((declaration) => declaration.evidence),
    );
  }

  const nodeFacts = collectNodeFacts(scanner, evidence, diagnostics, nodeScopes);
  const inventory = collectInventory(
    scanner,
    evidence,
    diagnostics,
    [".", ...returnedCandidates.map((candidate) => candidate.path)],
    nodeScopes.map((scope) => scope.manifest),
  );
  const project = buildProject(scanner, evidence, rootManifest, workspace, workspaceDiscovery.hasValidDeclaration, diagnostics);
  const categories = buildCoverageCategories(scanner, diagnostics, rootManifest.valid, workspaceDiscovery, inventory, nodeScopes.length > 0);
  const coverage: Coverage = {
    status: Object.values(categories).some((value) => value === "partial") ? "partial" : "complete",
    strategies: ["root-sentinels", "workspace-patterns", "workspace-ancestors", "package-roots"],
    budgets: { ...BUDGETS },
    usage: scanner.usage(),
    categories,
    truncated: {
      workspace: workspace.truncated,
      output: false,
      ...scanner.truncated(),
    },
  };
  const status = reduceStatus(diagnostics, inventory.ecosystems.some((ecosystem) => ecosystem.name === "node" && ecosystem.support === "first-class"));
  return {
    schemaVersion: SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    status,
    project,
    ecosystems: inventory.ecosystems,
    packageManager: rootManager,
    runtimes: nodeFacts.runtimes,
    workspace,
    commands: nodeFacts.commands,
    scripts: nodeFacts.scripts,
    entrypoints: nodeFacts.entrypoints,
    configs: inventory.configs,
    instructions: inventory.instructions,
    ci: inventory.ci,
    warnings: diagnostics.all(),
    coverage,
  };
}

function buildProject(
  scanner: Scanner,
  evidence: EvidenceStore,
  rootManifest: ReturnType<typeof loadPackageManifest>,
  workspace: DraftProfile["workspace"],
  hasWorkspaceDeclaration: boolean,
  _diagnostics: DiagnosticCollector,
): DraftProfile["project"] {
  const git = scanner.probe(".git");
  const repositoryEvidence = git.kind === "file" || git.kind === "directory" ? [scanner.fileEvidence(".git")] : [];
  const repository = { kind: repositoryEvidence.length > 0 ? "git-marker" as const : "unknown" as const, evidence: repositoryEvidence };
  const manifestName = rootManifest.valid && rootManifest.data !== null && typeof rootManifest.data.name === "string" && rootManifest.data.name.trim().length > 0
    ? boundedName(rootManifest.data.name.trim(), rootManifest.path, _diagnostics, rootManifest.evidence)
    : null;
  const projectEvidence = Array.from(new Set([
    ...rootManifest.evidence,
    ...repositoryEvidence,
    ...workspace.declarations.flatMap((declaration) => declaration.evidence),
  ]));
  return {
    root: ".",
    name: manifestName,
    kind: hasWorkspaceDeclaration ? "workspace" : rootManifest.valid ? "single-package" : "unknown",
    repository,
    evidence: projectEvidence,
  };
}

function buildWorkspacePackages(
  diagnostics: DiagnosticCollector,
  candidates: readonly WorkspaceCandidate[],
  manifests: ReadonlyMap<string, ReturnType<typeof loadPackageManifest>>,
  managers: ReadonlyMap<string, PackageManager>,
): WorkspacePackage[] {
  return candidates.map((candidate) => {
    const manifest = manifests.get(candidate.path);
    const manager = manifest?.valid && manifest.data !== null ? managers.get(candidate.path) ?? unknownManager() : unknownManager();
    const name = manifest?.valid && manifest.data !== null && typeof manifest.data.name === "string" && manifest.data.name.trim().length > 0
      ? boundedName(manifest.data.name.trim(), manifest.path, diagnostics, manifest.evidence)
      : null;
    const manifestEvidence = manifest?.evidence ?? [];
    return {
      name,
      path: candidate.path,
      packageManager: manager,
      evidence: Array.from(new Set([...candidate.evidence, ...manifestEvidence])),
    };
  });
}

function checkDuplicateWorkspaceNames(
  diagnostics: DiagnosticCollector,
  candidates: readonly WorkspaceCandidate[],
  manifests: ReadonlyMap<string, ReturnType<typeof loadPackageManifest>>,
): void {
  const byName = new Map<string, string[]>();
  for (const candidate of candidates) {
    const manifest = manifests.get(candidate.path);
    const value = manifest?.valid && manifest.data !== null && typeof manifest.data.name === "string" ? manifest.data.name.trim() : "";
    if (value.length === 0) continue;
    byName.set(value, [...(byName.get(value) ?? []), candidate.path]);
  }
  for (const paths of byName.values()) {
    if (paths.length < 2) continue;
    diagnostics.add("WORKSPACE_NAME_CONFLICT", "warning", "Multiple workspace packages declare the same package name.", paths[0] ?? null);
  }
}

function chooseWorkspaceManager(
  discovery: ReturnType<typeof discoverWorkspace>,
  rootManager: PackageManager,
  diagnostics: DiagnosticCollector,
): "npm" | "pnpm" | "yarn" | null {
  if (!discovery.hasValidDeclaration) return null;
  const fixedManagers = discovery.declarations
    .filter((declaration) => declaration.valid && declaration.manager !== null)
    .map((declaration) => declaration.manager as "npm" | "pnpm" | "yarn");
  const fixedManagerSet = new Set(fixedManagers);
  if (fixedManagerSet.size > 1) {
    diagnostics.add(
      "PACKAGE_MANAGER_CONFLICT",
      "warning",
      "Workspace declarations name different package-manager families; workspace invocation is unavailable.",
      null,
      discovery.declarations.flatMap((declaration) => declaration.evidence),
    );
    return null;
  }
  if (rootManager.name !== null && fixedManagers.some((manager) => manager !== rootManager.name)) {
    const conflicting = discovery.declarations.find((declaration) => declaration.valid && declaration.manager !== null && declaration.manager !== rootManager.name);
    diagnostics.add(
      "PACKAGE_MANAGER_CONFLICT",
      "warning",
      "The workspace declaration conflicts with the root package-manager evidence; workspace invocation is unavailable.",
      conflicting?.path ?? null,
      conflicting?.evidence ?? [],
    );
    return null;
  }
  const managers = new Set(discovery.declarations.filter((declaration) => declaration.valid).map((declaration) => declaration.manager ?? rootManager.name).filter((name): name is "npm" | "pnpm" | "yarn" => name !== null));
  if (managers.size === 1) return Array.from(managers)[0] ?? null;
  return null;
}

function buildCoverageCategories(
  scanner: Scanner,
  diagnostics: DiagnosticCollector,
  rootManifestValid: boolean,
  workspace: ReturnType<typeof discoverWorkspace>,
  inventory: ReturnType<typeof collectInventory>,
  nodeApplicable: boolean,
): Record<string, Coverage["categories"][string]> {
  const globalPartial = diagnostics.all().some((diagnostic) => hasPartialCode(diagnostic.code) && diagnostic.code !== "UNSUPPORTED_ECOSYSTEM");
  const scannerPartial = Object.values(scanner.truncated()).some(Boolean);
  const nodeState = nodeApplicable ? (globalPartial ? "partial" : "complete") : "not_applicable";
  return {
    repository: scannerPartial ? "partial" : "complete",
    ecosystems: scannerPartial ? "partial" : "complete",
    packageManager: nodeApplicable ? nodeState : "not_applicable",
    runtimes: nodeApplicable ? nodeState : "not_applicable",
    workspace: workspace.hasValidDeclaration ? (!workspace.complete || globalPartial ? "partial" : "complete") : rootManifestValid ? "not_applicable" : "not_applicable",
    commands: nodeApplicable ? nodeState : "not_applicable",
    scripts: nodeApplicable ? nodeState : "not_applicable",
    entrypoints: nodeApplicable ? nodeState : "not_applicable",
    configs: inventory.configsComplete ? "complete" : "partial",
    instructions: inventory.instructionsComplete ? "complete" : "partial",
    ci: inventory.ciComplete ? "complete" : "partial",
  };
}

function reduceStatus(diagnostics: DiagnosticCollector, hasFirstClassNode: boolean): Profile["status"] {
  if (diagnostics.hasFatal()) return "error";
  const nonUnsupportedPartial = diagnostics.all().some((diagnostic) => hasPartialCode(diagnostic.code) && diagnostic.code !== "UNSUPPORTED_ECOSYSTEM");
  if (nonUnsupportedPartial) return "partial";
  if (diagnostics.hasUnsupportedOnly() && !hasFirstClassNode) return "unsupported";
  return "complete";
}

function fitOutputBudget(draft: DraftProfile, evidence: EvidenceStore, diagnostics: DiagnosticCollector, pretty: boolean): Profile {
  let profile = finalizeDraft(draft, evidence);
  if (serializedBytes(profile, pretty) <= BUDGETS.outputBytes) return profile;
  diagnostics.add("OUTPUT_TRUNCATED", "warning", "The profile exceeded the fixed output budget; lower-priority records were omitted.");
  draft.warnings = diagnostics.all();
  draft.coverage.truncated.output = true;
  draft.coverage.status = "partial";
  draft.coverage.categories = Object.fromEntries(Object.entries(draft.coverage.categories).map(([key, value]) => [key, value === "complete" ? "partial" : value]));
  draft.status = "partial";
  for (const packageRecord of [...draft.workspace.packages].sort((left, right) => compareCodePoint(right.path, left.path))) {
    dropScope(draft, packageRecord.path);
    profile = finalizeDraft(draft, evidence);
    if (serializedBytes(profile, pretty) <= BUDGETS.outputBytes) return profile;
  }
  const inventoryRecords = [
    ...draft.configs.map((record) => ({ category: "configs", path: record.path })),
    ...draft.instructions.map((record) => ({ category: "instructions", path: record.path })),
    ...draft.ci.map((record) => ({ category: "ci", path: record.path })),
  ].sort((left, right) => {
    const categoryOrder = compareCodePoint(right.category, left.category);
    if (categoryOrder !== 0) return categoryOrder;
    return compareCodePoint(right.path, left.path);
  });
  for (const record of inventoryRecords) {
    draft.configs = draft.configs.filter((value) => !(record.category === "configs" && value.path === record.path));
    draft.instructions = draft.instructions.filter((value) => !(record.category === "instructions" && value.path === record.path));
    draft.ci = draft.ci.filter((value) => !(record.category === "ci" && value.path === record.path));
    profile = finalizeDraft(draft, evidence);
    if (serializedBytes(profile, pretty) <= BUDGETS.outputBytes) return profile;
  }
  const minimal = makeErrorDraft([{ code: "OUTPUT_TRUNCATED", severity: "error", message: "The profile could not fit within the fixed output budget.", path: null, evidence: [] }]);
  return finalizeDraft(minimal, evidence);
}

function dropScope(draft: DraftProfile, scope: string): void {
  draft.workspace.packages = draft.workspace.packages.filter((record) => record.path !== scope);
  draft.runtimes = draft.runtimes.filter((record) => record.cwd !== scope);
  draft.scripts = draft.scripts.filter((record) => record.cwd !== scope);
  draft.entrypoints = draft.entrypoints.filter((record) => record.cwd !== scope);
  for (const purpose of PURPOSES) draft.commands[purpose] = draft.commands[purpose].filter((command) => command.cwd !== scope);
  draft.configs = draft.configs.filter((record) => !record.path.startsWith(`${scope}/`));
  draft.instructions = draft.instructions.filter((record) => record.scope !== scope && !record.scope.startsWith(`${scope}/`));
  draft.ci = draft.ci.filter((record) => !record.path.startsWith(`${scope}/`));
  draft.workspace.returned = draft.workspace.packages.length;
  draft.workspace.truncated = true;
  draft.workspace.total = null;
}

function serializedBytes(profile: Profile, pretty: boolean): number {
  return Buffer.byteLength(`${JSON.stringify(profile, null, pretty ? 2 : undefined)}\n`, "utf8");
}

function makeErrorDraft(warnings: ReturnType<DiagnosticCollector["all"]>): DraftProfile {
  const categories: Coverage["categories"] = {
    repository: "partial",
    ecosystems: "partial",
    packageManager: "not_applicable",
    runtimes: "not_applicable",
    workspace: "not_applicable",
    commands: "not_applicable",
    scripts: "not_applicable",
    entrypoints: "not_applicable",
    configs: "partial",
    instructions: "partial",
    ci: "partial",
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    toolVersion: TOOL_VERSION,
    status: "error",
    project: { root: ".", name: null, kind: "unknown", repository: { kind: "unknown", evidence: [] }, evidence: [] },
    ecosystems: [],
    packageManager: unknownManager(),
    runtimes: [],
    workspace: { enabled: null, manager: null, declarations: [], packages: [], total: null, returned: 0, truncated: false },
    commands: EMPTY_COMMANDS() as Record<CommandPurpose, Command[]>,
    scripts: [],
    entrypoints: [],
    configs: [],
    instructions: [],
    ci: [],
    warnings,
    coverage: {
      status: "partial",
      strategies: [],
      budgets: { ...BUDGETS },
      usage: { directoryEntries: 0, metadataFiles: 0, metadataBytes: 0 },
      categories,
      truncated: { workspace: false, output: false, directoryEntries: false, metadataFiles: false, metadataBytes: false, depth: false },
    },
  };
}

function unknownManager(): PackageManager {
  return { name: null, version: null, confidence: "unknown", invocationAvailable: false, evidence: [] };
}

function boundedName(value: string, path: string, diagnostics: DiagnosticCollector, evidence: readonly string[]): string | null {
  if (Buffer.byteLength(value, "utf8") <= BUDGETS.sourceStringBytes) return value;
  diagnostics.add("METADATA_TOO_LARGE", "warning", "A package name exceeded the bounded string limit.", path, evidence);
  return null;
}
