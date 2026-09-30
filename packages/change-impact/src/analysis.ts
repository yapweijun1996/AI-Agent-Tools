import { existsSync } from "node:fs";
import { resolve } from "node:path";
import * as ts from "typescript";
import { ImpactError, asImpactError } from "./errors";
import { traverseReverse } from "./graph";
import { changedSeedFromChange, collectGitChanges } from "./git";
import { createProjectContext, type ProjectContext } from "./project";
import { TypeScriptProvider, type ResolvedTarget } from "./provider";
import { loadRevision, loadWorkingTree, loadWorkingTreeStable, repositoryRoot } from "./snapshot";
import type {
  AnalysisContext,
  AnalysisScope,
  CandidateTest,
  CapabilitiesResult,
  ChangedImpactRequest,
  ChangedSeed,
  Diagnostic,
  ErrorEnvelope,
  FileImpactRequest,
  GraphEdge,
  GraphNode,
  ImpactItem,
  Limits,
  ResultEnvelope,
  Seed,
  SymbolImpactRequest,
  UnresolvedObservation,
} from "./types";
import { compareText, createDiagnosticCollector, diagnostic, mergeLimits } from "./util";

export type ImpactResult = ResultEnvelope | ErrorEnvelope | CapabilitiesResult;

function assertRequestObject(value: unknown, operation: string): asserts value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ImpactError("INVALID_ARGUMENT", `${operation} request must be an object`);
  }
}

function assertOptionalNonEmptyString(value: unknown, name: string): void {
  if (value !== undefined && (typeof value !== "string" || value.trim().length === 0)) {
    throw new ImpactError("INVALID_ARGUMENT", `${name} must be a non-empty string when supplied`);
  }
}

function assertRequiredNonEmptyString(value: unknown, name: string): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ImpactError("INVALID_ARGUMENT", `${name} must be a non-empty string`);
  }
}

function assertLimitsInput(value: unknown): void {
  if (value !== undefined && (value === null || typeof value !== "object" || Array.isArray(value))) {
    throw new ImpactError("INVALID_ARGUMENT", "limits must be an object when supplied");
  }
}

function validateCommonRequest(value: unknown, operation: string): asserts value is Record<string, unknown> {
  assertRequestObject(value, operation);
  assertOptionalNonEmptyString(value.root, "root");
  assertOptionalNonEmptyString(value.project, "project");
  assertLimitsInput(value.limits);
}

function validateFileRequest(value: unknown): asserts value is FileImpactRequest {
  validateCommonRequest(value, "analyzeFile");
  assertRequiredNonEmptyString(value.file, "file");
}

function validateSymbolRequest(value: unknown): asserts value is SymbolImpactRequest {
  validateCommonRequest(value, "analyzeSymbol");
  assertRequiredNonEmptyString(value.file, "file");
  assertRequiredNonEmptyString(value.name, "name");
  const hasLine = value.line !== undefined;
  const hasColumn = value.column !== undefined;
  if (hasLine !== hasColumn) {
    throw new ImpactError("INVALID_ARGUMENT", "line and column must be supplied together");
  }
  if (hasLine && (!Number.isSafeInteger(value.line) || (value.line as number) < 1 || !Number.isSafeInteger(value.column) || (value.column as number) < 1)) {
    throw new ImpactError("INVALID_ARGUMENT", "line and column must be positive safe integers");
  }
}

function validateChangedRequest(value: unknown): asserts value is ChangedImpactRequest {
  validateCommonRequest(value, "analyzeChanged");
  assertRequiredNonEmptyString(value.base, "base");
  assertOptionalNonEmptyString(value.head, "head");
  if (value.worktree !== undefined && typeof value.worktree !== "boolean") {
    throw new ImpactError("INVALID_ARGUMENT", "worktree must be boolean when supplied");
  }
}

export function capabilities(): CapabilitiesResult {
  return {
    schemaVersion: "0.1-draft",
    ok: true,
    operation: "capabilities",
    capabilities: {
      languages: ["javascript", "typescript", "tsx"],
      operations: ["capabilities", "file", "symbol", "changed"],
      relations: ["imports", "reexports", "references", "calls", "extends", "implements"],
      evidenceLevels: ["resolved", "syntactic"],
      projectModes: ["explicit-tsconfig", "unambiguous-tsconfig-discovery"],
      snapshotModes: ["working-tree", "git-revision"],
      readOnly: true,
      network: "disabled",
      heuristics: false,
    },
    unresolved: [],
    warnings: [],
  };
}

export function analyzeFile(request: FileImpactRequest): ImpactResult {
  try {
    validateFileRequest(request);
    const limits = mergeLimits(request.limits);
    const { context, provider, diagnostics } = loadCurrentProvider(request.root, request.project, limits);
    const file = context.snapshot.toRepoPath(request.file);
    assertSupportedSource(file);
    if (!context.isProjectFile(file)) {
      throw new ImpactError("FILE_NOT_FOUND", `File is not part of the selected project: ${file}`);
    }
    const seed = provider.nodeForFile(file);
    const fileResult = provider.fileEdges();
    const traversal = buildTraversal(provider, [seed], fileResult.edges, limits);
    return boundedResult(makeEnvelope("file-impact", context, limits, diagnostics, traversal, [
      { node: seed.id, reason: "requested-target" },
    ], {
      type: "file",
      file,
      snapshot: context.snapshot.ref,
    }, fileResult.unresolved), limits);
  } catch (error) {
    return errorEnvelope(error);
  }
}

export function analyzeSymbol(request: SymbolImpactRequest): ImpactResult {
  try {
    validateSymbolRequest(request);
    if (!request.name || !request.name.trim()) {
      throw new ImpactError("INVALID_ARGUMENT", "A non-empty symbol name is required");
    }
    const limits = mergeLimits(request.limits);
    const { context, provider, diagnostics } = loadCurrentProvider(request.root, request.project, limits);
    const file = context.snapshot.toRepoPath(request.file);
    assertSupportedSource(file);
    const target = provider.resolveTarget(file, request.name, request.line, request.column);
    const references = provider.references(target);
    const traversal = buildTraversal(provider, [nodeFromTarget(target)], references.edges, limits);
    return boundedResult(makeEnvelope("symbol-impact", context, limits, diagnostics, traversal, [
      { node: target.nodeId, reason: "requested-target" },
    ], {
      type: "symbol",
      file: target.file,
      name: target.name,
      kind: target.kind,
      range: target.range,
      snapshot: context.snapshot.ref,
    }, references.unresolved), limits);
  } catch (error) {
    return errorEnvelope(error);
  }
}

export function analyzeChanged(request: ChangedImpactRequest): ImpactResult {
  try {
    validateChangedRequest(request);
    const limits = mergeLimits(request.limits);
    const root = repositoryRoot(request.root);
    const gitChanges = collectGitChanges(root, request.base, request.head, request.worktree === true, limits);
    const baseLoaded = loadRevision(root, request.base, limits);
    const headLoaded = request.worktree === true
      ? loadWorkingTreeStable(root, limits)
      : loadRevision(root, request.head ?? "", limits);
    const baseContext = createProjectContext(baseLoaded.snapshot, request.project, limits);
    const headContext = createProjectContext(headLoaded.snapshot, request.project, limits);
    const baseProvider = new TypeScriptProvider(baseContext, limits);
    const headProvider = new TypeScriptProvider(headContext, limits);
    const baseSeeds: GraphNode[] = [];
    const headSeeds: GraphNode[] = [];
    const changed: ChangedSeed[] = [];
    const diagnostics = createDiagnosticCollector(limits.maxDiagnostics);
    for (const entry of [
      ...gitChanges.diagnostics,
      ...baseLoaded.diagnostics,
      ...headLoaded.diagnostics,
      ...baseContext.diagnostics,
      ...headContext.diagnostics,
    ]) {
      diagnostics.add(entry);
    }
    for (const change of gitChanges.changes) {
      const oldFile = change.oldPath ?? (change.status === "deleted" ? change.path : change.path);
      const oldDeclarations = change.status === "added" ? [] : baseProvider.declarationsInRanges(oldFile, change.oldRanges);
      const newDeclarations = change.status === "deleted" ? [] : headProvider.declarationsInRanges(change.path, change.newRanges);
      const oldSymbols = oldDeclarations.map((declaration) => declaration.name);
      const newSymbols = newDeclarations.map((declaration) => declaration.name);
      const snapshots = [
        ...(change.status !== "added" ? [baseLoaded.snapshot.ref] : []),
        ...(change.status !== "deleted" ? [headLoaded.snapshot.ref] : []),
      ];
      const seed = changedSeedFromChange(change, oldSymbols, newSymbols, snapshots);
      changed.push(seed);
      if (seed.status === "configuration") {
        diagnostics.add(diagnostic("CONFIGURATION_CHANGE", `Configuration change requires project-context reassessment: ${change.path}`, { file: change.path }));
        continue;
      }
      if (oldDeclarations.length > 0) {
        for (const declaration of oldDeclarations) {
          const target = baseProvider.targetFromDeclaration(declaration);
          if (target) {
            baseSeeds.push(nodeFromTarget(target));
          }
        }
      } else if (change.status !== "added" && baseContext.isProjectFile(oldFile)) {
        baseSeeds.push(baseProvider.nodeForFile(oldFile));
      }
      if (newDeclarations.length > 0) {
        for (const declaration of newDeclarations) {
          const target = headProvider.targetFromDeclaration(declaration);
          if (target) {
            headSeeds.push(nodeFromTarget(target));
          }
        }
      } else if (change.status !== "deleted" && headContext.isProjectFile(change.path)) {
        headSeeds.push(headProvider.nodeForFile(change.path));
      }
      if (oldDeclarations.length === 0 && newDeclarations.length === 0 && change.status !== "deleted" && !headContext.isProjectFile(change.path)) {
        changed[changed.length - 1] = { ...seed, status: "unsupported" };
        diagnostics.add(diagnostic("UNSUPPORTED_CHANGED_FILE", `Changed file is outside the selected TypeScript project: ${change.path}`,
          { file: change.path }));
      }
    }
    const baseFileEdges = baseProvider.fileEdges();
    const headFileEdges = headProvider.fileEdges();
    const baseTraversal = baseSeeds.length > 0 ? buildTraversal(baseProvider, dedupeNodes(baseSeeds), baseFileEdges.edges, limits) : emptyTraversal();
    const headTraversal = headSeeds.length > 0 ? buildTraversal(headProvider, dedupeNodes(headSeeds), headFileEdges.edges, limits) : emptyTraversal();
    const merged = mergeTraversals(baseTraversal, headTraversal);
    const unresolved = dedupeUnresolved([
      ...baseFileEdges.unresolved,
      ...headFileEdges.unresolved,
      ...baseTraversal.unresolved,
      ...headTraversal.unresolved,
    ]);
    const allDiagnostics = boundedDiagnostics([
      ...diagnostics.toArray(),
      ...unresolved.map((entry) => diagnostic(entry.code, entry.detail, { snapshot: entry.snapshot, file: entry.file, range: entry.range })),
    ], limits.maxDiagnostics);
    const context: AnalysisContext = {
      provider: `${baseProvider.name}+${headProvider.name}`,
      providerVersion: `${baseProvider.version},${headProvider.version}`,
      root: ".",
      project: headContext.project,
      snapshots: [baseLoaded.snapshot.ref, headLoaded.snapshot.ref],
      resolution: "local-project-with-external-fallback",
    };
    const analysis = makeAnalysisScope(headContext, limits, merged.status, [...merged.stopReasons, ...allDiagnostics.filter((entry) => entry.severity === "warning").map((entry) => entry.code), ...(unresolved.length > 0 ? ["UNRESOLVED_OBSERVATIONS"] : [])], merged, allDiagnostics, unresolved);
    const envelope: ResultEnvelope = {
      schemaVersion: "0.1-draft",
      ok: true,
      operation: "changed-impact",
      context,
      changed,
      seeds: [
        ...baseSeeds.map((node) => ({ node: node.id, reason: node.kind === "file" ? "changed-file" as const : "changed-symbol" as const })),
        ...headSeeds.map((node) => ({ node: node.id, reason: node.kind === "file" ? "changed-file" as const : "changed-symbol" as const })),
      ],
      graph: { nodes: merged.nodes, edges: merged.edges },
      impact: { direct: merged.direct, transitive: merged.transitive },
      tests: candidateTests(merged, merged.edges),
      unresolved,
      analysis,
      warnings: allDiagnostics,
    };
    return boundedResult(envelope, limits);
  } catch (error) {
    return errorEnvelope(error);
  }
}

function loadCurrentProvider(rootInput: string | undefined, project: string | undefined, limits: Limits): { context: ProjectContext; provider: TypeScriptProvider; diagnostics: Diagnostic[] } {
  if (rootInput && !existsSync(resolve(rootInput))) {
    throw new ImpactError("ROOT_NOT_FOUND", `Repository root does not exist: ${rootInput}`);
  }
  const loaded = loadWorkingTree(rootInput, limits);
  const context = createProjectContext(loaded.snapshot, project, limits);
  const provider = new TypeScriptProvider(context, limits);
  return { context, provider, diagnostics: [...loaded.diagnostics, ...context.diagnostics] };
}

function assertSupportedSource(file: string): void {
  if (!/\.(?:[cm]?js|jsx|[cm]?ts|tsx)$/i.test(file)) {
    throw new ImpactError("LANGUAGE_UNSUPPORTED", `Only JavaScript, TypeScript, and TSX source files are supported: ${file}`);
  }
}

function nodeFromTarget(target: ResolvedTarget): GraphNode {
  return {
    id: target.nodeId,
    kind: "symbol",
    snapshot: target.snapshot ?? ({} as never),
    file: target.file,
    symbol: target.name,
    declaration: target.range,
  };
}

function buildTraversal(provider: TypeScriptProvider, seeds: readonly GraphNode[], fileEdges: readonly GraphEdge[], limits: Limits) {
  const symbolCache = new Map<string, GraphEdge[]>();
  const unresolved = new Map<string, UnresolvedObservation[]>();
  const traversal = traverseReverse(seeds, {
    edgesForNode: (node) => {
      if (node.kind === "file") {
        return [...fileEdges];
      }
      const cached = symbolCache.get(node.id);
      if (cached) {
        return cached;
      }
      const result = provider.referencesForNode(node);
      symbolCache.set(node.id, result.edges);
      unresolved.set(node.id, result.unresolved);
      return result.edges;
    },
  }, (id) => provider.nodeForId(id), limits);
  return { ...traversal, unresolved: dedupeUnresolved([...unresolved.values()].flat()) };
}

function makeEnvelope(
  operation: ResultEnvelope["operation"],
  context: ProjectContext,
  limits: Limits,
  diagnostics: readonly Diagnostic[],
  traversal: ReturnType<typeof buildTraversal>,
  seeds: readonly Seed[],
  target: Record<string, unknown>,
  unresolved: readonly UnresolvedObservation[],
): ResultEnvelope {
  const allUnresolved = dedupeUnresolved([...unresolved, ...traversal.unresolved]);
  const allDiagnostics = boundedDiagnostics([
    ...diagnostics,
    ...allUnresolved.map((entry) => diagnostic(entry.code, entry.detail, { snapshot: entry.snapshot, file: entry.file, range: entry.range })),
  ], limits.maxDiagnostics);
  const analysis = makeAnalysisScope(context, limits, traversal.status, [...traversal.stopReasons, ...(allUnresolved.length > 0 ? ["UNRESOLVED_OBSERVATIONS"] : [])], traversal, allDiagnostics, allUnresolved);
  const contextOutput: AnalysisContext = {
    provider: "typescript-language-service",
    providerVersion: tsVersion(),
    root: ".",
    project: context.project,
    snapshots: [context.snapshot.ref],
    resolution: context.externalFallback ? "local-project-with-external-fallback" : "local-project",
  };
  return {
    schemaVersion: "0.1-draft",
    ok: true,
    operation,
    context: contextOutput,
    target,
    seeds: [...seeds],
    graph: { nodes: traversal.nodes, edges: traversal.edges },
    impact: { direct: traversal.direct, transitive: traversal.transitive },
    tests: candidateTests(traversal, traversal.edges),
    unresolved: allUnresolved,
    analysis,
    warnings: allDiagnostics,
  };
}

function tsVersion(): string {
  return ts.version;
}

function boundedResult(result: ImpactResult, limits: Limits): ImpactResult {
  const bytes = Buffer.byteLength(JSON.stringify(result));
  if (bytes <= limits.maxOutputBytes) {
    return result;
  }
  return errorEnvelope(new ImpactError("OUTPUT_LIMIT_EXCEEDED", `JSON output exceeds ${limits.maxOutputBytes} bytes`, {
    maxOutputBytes: limits.maxOutputBytes,
    actualBytes: bytes,
  }));
}

function makeAnalysisScope(context: ProjectContext, limits: Limits, traversalStatus: "complete" | "partial", stopReasons: readonly string[], traversal: { nodes: GraphNode[]; edges: GraphEdge[] }, diagnostics: readonly Diagnostic[], unresolved: readonly UnresolvedObservation[]): AnalysisScope {
  const includedFiles = context.project.files.length;
  const excludedFiles = Math.max(0, context.snapshot.files.size - includedFiles);
  const limitations = new Set<string>();
  if (context.externalFallback) {
    limitations.add("External declarations are resolved from the current local environment when available; historical dependency fidelity is not guaranteed");
  }
  if (diagnostics.some((entry) => entry.code === "PROJECT_CONFIG_DIAGNOSTIC")) {
    limitations.add("Project configuration reported diagnostics");
  }
  if (unresolved.length > 0) {
    limitations.add("Some dynamic or unresolved dependencies could not be bound statically");
  }
  if (traversalStatus === "partial") {
    limitations.add("Graph traversal stopped at a configured limit");
  }
  return {
    status: traversalStatus === "complete" && !diagnostics.some((entry) => entry.severity === "warning") && unresolved.length === 0 ? "complete" : "partial",
    project: context.project,
    limits: { ...limits },
    includedFiles,
    excludedFiles,
    limitations: [...limitations].sort(),
    stopReasons: [...new Set(stopReasons)].sort(),
    ...(traversalStatus === "complete" ? { observedNodes: traversal.nodes.length } : {}),
    returnedNodes: traversal.nodes.length,
    ...(traversalStatus === "complete" ? { observedEdges: traversal.edges.length } : {}),
    returnedEdges: traversal.edges.length,
  };
}

function candidateTests(traversal: { nodes: GraphNode[]; direct: ImpactItem[]; transitive: ImpactItem[] }, edges: readonly GraphEdge[]): CandidateTest[] {
  const items = [...traversal.direct, ...traversal.transitive];
  const result = new Map<string, CandidateTest>();
  for (const item of items) {
    const node = traversal.nodes.find((candidate) => candidate.id === item.node);
    if (!node || !/(?:^|\/)(?:__tests__\/.*|.*\.(?:test|spec)\.[cm]?[jt]sx?)$/i.test(node.file)) {
      continue;
    }
    const pathEdges = edgePath(item.path, edges);
    const current = result.get(node.id);
    const evidenceLevels = [...new Set(pathEdges.map((edge) => edge.evidence.level))].sort();
    const entry: CandidateTest = {
      node: node.id,
      file: node.file,
      role: "name-pattern-candidate",
      dependencyEdges: pathEdges.map((edge) => edge.id).sort(),
      evidenceLevels,
    };
    if (!current || entry.dependencyEdges.length < current.dependencyEdges.length) {
      result.set(node.id, entry);
    }
  }
  return [...result.values()].sort((a, b) => compareText(a.file, b.file));
}

function edgePath(path: readonly string[], edges: readonly GraphEdge[]): GraphEdge[] {
  const result: GraphEdge[] = [];
  for (let index = 0; index + 1 < path.length; index += 1) {
    const current = path[index];
    const next = path[index + 1];
    const edge = edges.find((candidate) => candidate.to === current && candidate.from === next);
    if (edge) {
      result.push(edge);
    }
  }
  return result;
}

function mergeTraversals(a: ReturnType<typeof buildTraversal>, b: ReturnType<typeof buildTraversal>): ReturnType<typeof buildTraversal> {
  const nodes = dedupeNodes([...a.nodes, ...b.nodes]);
  const edges = dedupeEdges([...a.edges, ...b.edges]);
  const direct = dedupeImpact([...a.direct, ...b.direct]);
  const transitive = dedupeImpact([...a.transitive, ...b.transitive]);
  return {
    nodes,
    edges,
    direct,
    transitive,
    status: a.status === "complete" && b.status === "complete" ? "complete" : "partial",
    stopReasons: [...new Set([...a.stopReasons, ...b.stopReasons])].sort(),
    unresolved: dedupeUnresolved([...a.unresolved, ...b.unresolved]),
  };
}

function emptyTraversal(): ReturnType<typeof buildTraversal> {
  return { nodes: [], edges: [], direct: [], transitive: [], status: "complete", stopReasons: [], unresolved: [] };
}

function dedupeNodes(nodes: readonly GraphNode[]): GraphNode[] {
  const map = new Map(nodes.map((node) => [node.id, node]));
  return [...map.values()].sort((a, b) => compareText(a.id, b.id));
}

function dedupeEdges(edges: readonly GraphEdge[]): GraphEdge[] {
  const map = new Map(edges.map((edge) => [edge.id, edge]));
  return [...map.values()].sort((a, b) => compareText(a.id, b.id));
}

function dedupeImpact(items: readonly ImpactItem[]): ImpactItem[] {
  const map = new Map<string, ImpactItem>();
  for (const item of items) {
    const key = `${item.seed}:${item.node}`;
    const current = map.get(key);
    if (!current || item.distance < current.distance || (item.distance === current.distance && item.path.join("/") < current.path.join("/"))) {
      map.set(key, item);
    }
  }
  return [...map.values()].sort((a, b) => a.distance - b.distance || compareText(`${a.seed}:${a.node}`, `${b.seed}:${b.node}`));
}

function dedupeUnresolved(values: readonly UnresolvedObservation[]): UnresolvedObservation[] {
  const map = new Map<string, UnresolvedObservation>();
  for (const value of values) {
    const key = `${value.code}:${value.snapshot.id}:${value.file}:${value.range?.start.line ?? 0}:${value.range?.start.column ?? 0}`;
    map.set(key, value);
  }
  return [...map.values()].sort((a, b) => compareText(`${a.file}:${a.code}`, `${b.file}:${b.code}`));
}

function dedupeDiagnostics(values: readonly Diagnostic[]): Diagnostic[] {
  const map = new Map<string, Diagnostic>();
  for (const value of values) {
    const snapshot = value.snapshot?.id ?? "";
    const range = value.range ? `${value.range.start.line}:${value.range.start.column}` : "";
    map.set(`${value.code}:${snapshot}:${value.file ?? ""}:${range}:${value.message}`, value);
  }
  return [...map.values()].sort((a, b) => compareText(
    `${a.snapshot?.id ?? ""}:${a.file ?? ""}:${a.range?.start.line ?? 0}:${a.range?.start.column ?? 0}:${a.code}:${a.message}`,
    `${b.snapshot?.id ?? ""}:${b.file ?? ""}:${b.range?.start.line ?? 0}:${b.range?.start.column ?? 0}:${b.code}:${b.message}`,
  ));
}

function boundedDiagnostics(values: readonly Diagnostic[], limit: number): Diagnostic[] {
  const collector = createDiagnosticCollector(limit);
  for (const entry of dedupeDiagnostics(values)) {
    collector.add(entry);
  }
  return collector.toArray();
}

function errorEnvelope(error: unknown): ErrorEnvelope {
  const value = asImpactError(error);
  return {
    schemaVersion: "0.1-draft",
    ok: false,
    error: {
      code: value.code,
      message: value.message,
      ...(value.details ? { details: value.details } : {}),
    },
    warnings: [],
  };
}
