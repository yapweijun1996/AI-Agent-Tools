import { existsSync, lstatSync } from "node:fs";
import { resolve } from "node:path";
import type { Capabilities, Diagnostic, EngineOptions, ExplainRequest, NormalizedChange, PlanRequest, Request, Result, ResourceLimits, RiskLevel, Stats, Truncation, VersionedExternalEvidence } from "../types.js";
import { DEFAULT_LIMITS, SCHEMA_VERSION } from "../types.js";
import { discoveryData } from "./frameworks.js";
import { discoverFiles, type DiscoveryResult } from "./discovery.js";
import { buildPlan } from "./planner.js";
import { canonicalizeRoot, diagnostic, isSecretLike, normalizeRepositoryPath, sourceLanguage, type RootInfo } from "./paths.js";
import { changedPath, changedStatus, validateRequest, validateResult } from "./validation.js";
import { isSupportedSource } from "./paths.js";

const CAPABILITIES: Capabilities = {
  schemaVersion: SCHEMA_VERSION,
  languages: ["javascript", "jsx", "typescript", "tsx"],
  frameworks: ["vitest", "jest", "node"],
  operations: ["capabilities", "discover", "plan", "explain"],
  confidence: ["confirmed", "strong", "candidate", "unknown"],
  risk: ["low", "medium", "high", "critical", "unknown"],
  limits: { ...DEFAULT_LIMITS },
  readOnly: true,
  network: "disabled",
  execution: "disabled"
};

function emptyTruncation(): Truncation {
  return { truncated: false, reasons: [] };
}

function addReason(truncation: Truncation, reason: Truncation["reasons"][number]): void {
  truncation.truncated = true;
  if (!truncation.reasons.includes(reason)) truncation.reasons.push(reason);
}

function dedupeDiagnostics(items: readonly Diagnostic[]): Diagnostic[] {
  const seen = new Set<string>();
  const result: Diagnostic[] = [];
  for (const item of items) {
    const key = [item.code, item.path ?? "", item.message].join("|");
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

export function errorResult(diagnostics: Diagnostic[], stats: Stats = {}): Result {
  return { schemaVersion: SCHEMA_VERSION, status: "error", data: {}, diagnostics: dedupeDiagnostics(diagnostics), truncation: emptyTruncation(), stats: { ...stats } };
}

function resultStatus(diagnostics: readonly Diagnostic[], truncation: Truncation): Result["status"] {
  if (diagnostics.some(item => item.severity === "error")) return "error";
  if (truncation.truncated || diagnostics.some(item => ["RESOURCE_LIMIT", "TIMEOUT", "IMPORT_RESOLUTION_PARTIAL", "IMPACT_EVIDENCE_UNAVAILABLE", "CHANGE_NOT_SUPPORTED", "TEST_FRAMEWORK_NOT_FOUND", "PROJECT_CONFIG_AMBIGUOUS"].includes(item.code))) return "partial";
  return "complete";
}

function finalize(data: Result["data"], diagnostics: Diagnostic[], truncation: Truncation, stats: Stats): Result {
  const result: Result = { schemaVersion: SCHEMA_VERSION, status: resultStatus(diagnostics, truncation), data, diagnostics: dedupeDiagnostics(diagnostics), truncation, stats };
  const validation = validateResult(result);
  return validation.valid ? result : errorResult([{ code: "INTERNAL_ERROR", message: `Internal result validation failed: ${validation.errors.join("; ")}`, severity: "error" }], stats);
}

function effectiveLimits(options: EngineOptions): ResourceLimits {
  const merged = { ...DEFAULT_LIMITS, ...(options.limits ?? {}) };
  return {
    maxDiscoveredFiles: Math.max(1, Math.floor(merged.maxDiscoveredFiles)),
    maxTestCandidates: Math.max(1, Math.floor(merged.maxTestCandidates)),
    maxReturnedTests: Math.max(1, Math.min(merged.maxReturnedTests, 200)),
    maxSingleFileBytes: Math.max(1, Math.floor(merged.maxSingleFileBytes)),
    maxParsedBytes: Math.max(1, Math.floor(merged.maxParsedBytes)),
    timeoutMs: Math.max(0, Math.floor(merged.timeoutMs))
  };
}

function externalDiagnostics(request: PlanRequest | ExplainRequest): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const check = (field: string, value: VersionedExternalEvidence | undefined): void => {
    if (!value) return;
    if (field === "symbolEvidence" && value.schemaVersion !== "1") {
      diagnostics.push(diagnostic("INVALID_REQUEST", "symbolEvidence must use schemaVersion 1", "error"));
      return;
    }
    if (field === "impactEvidence" && value.schemaVersion !== "0.1-draft") {
      diagnostics.push(diagnostic("INVALID_REQUEST", "impactEvidence must use schemaVersion 0.1-draft", "error"));
      return;
    }
    if (field === "symbolEvidence") {
      const data = value.data;
      const matches = Array.isArray(value.matches) ? value.matches : typeof data === "object" && data !== null && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>).matches) ? (data as Record<string, unknown>).matches : undefined;
      if (!matches) diagnostics.push(diagnostic("INVALID_REQUEST", "symbolEvidence must contain a matches array", "error"));
    }
    if (field === "impactEvidence" && value.ok === false) diagnostics.push(diagnostic("IMPACT_EVIDENCE_UNAVAILABLE", "External impact evidence reports an unavailable analysis", "warning"));
  };
  check("projectProfile", request.projectProfile);
  check("symbolEvidence", request.symbolEvidence);
  check("impactEvidence", request.impactEvidence);
  return diagnostics;
}

function normalizeChanges(root: RootInfo, request: PlanRequest | ExplainRequest): { changes: NormalizedChange[]; diagnostics: Diagnostic[] } {
  const changes: NormalizedChange[] = [];
  const diagnostics: Diagnostic[] = [];
  for (const input of request.changed) {
    const pathInput = changedPath(input);
    const normalized = normalizeRepositoryPath(root, pathInput, "changed.path");
    if ("diagnostic" in normalized) {
      diagnostics.push(normalized.diagnostic);
      continue;
    }
    const path = normalized.value;
    const status = changedStatus(input) ?? (existsSync(resolve(root.absolute, path)) ? "modified" : "added");
    const language = sourceLanguage(path);
    const isConfig = /(?:^|\/)(?:package\.json|[^/]*lock[^/]*|tsconfig[^/]*\.json|vite\.config\.[^/]+|vitest\.config\.[^/]+|jest\.config\.[^/]+)$/.test(path.toLowerCase());
    const supported = status !== "unsupported" && (isSupportedSource(path) || isConfig);
    if (isSecretLike(path)) {
      diagnostics.push(diagnostic("CHANGE_NOT_SUPPORTED", "Secret-like changed files are outside the planning evidence boundary", "warning", path));
    } else if (!supported) {
      diagnostics.push(diagnostic("CHANGE_NOT_SUPPORTED", "Changed file type is outside the V0.1 JS/TS/JSX/TSX contract", "warning", path));
    }
    let oldPath: string | undefined;
    if (typeof input !== "string" && input.oldPath !== undefined) {
      const old = normalizeRepositoryPath(root, input.oldPath, "changed.oldPath");
      if ("diagnostic" in old) diagnostics.push(old.diagnostic);
      else oldPath = old.value;
    }
    let exists = false;
    try {
      const stat = lstatSync(resolve(root.absolute, path));
      exists = stat.isFile() && !stat.isSymbolicLink();
    } catch {
      exists = false;
    }
    changes.push({ path, status, ...(oldPath ? { oldPath } : {}), ...(language ? { language } : {}), exists, supported });
  }
  return { changes, diagnostics };
}

function statsFor(discovery: DiscoveryResult, extra: Stats = {}): Stats {
  return { filesScanned: discovery.filesScanned, bytesParsed: discovery.bytesParsed, ...extra };
}

function capabilitiesResult(root: RootInfo, limits: ResourceLimits): Result {
  return finalize({ capabilities: { ...CAPABILITIES, limits: { ...limits } } }, [], emptyTruncation(), { project: "none" });
}

function findRecommendation(plan: ReturnType<typeof buildPlan>["plan"], target: ExplainRequest["target"]): { matched?: ReturnType<typeof buildPlan>["plan"]["minimum"]["tests"][number] | ReturnType<typeof buildPlan>["plan"]["minimum"]["commands"][number]; alternatives: Array<ReturnType<typeof buildPlan>["plan"]["minimum"]["tests"][number] | ReturnType<typeof buildPlan>["plan"]["minimum"]["commands"][number]> } {
  const all = [
    ...plan.minimum.tests,
    ...plan.recommended.tests,
    ...plan.release.tests,
    ...plan.minimum.commands,
    ...plan.recommended.commands,
    ...plan.release.commands
  ];
  const unique = all.filter((item, index) => all.findIndex(candidate => candidate.id === item.id) === index);
  const matched = unique.find(item => (target.path !== undefined && "path" in item && item.path === target.path) || (target.command !== undefined && "command" in item && item.command === target.command));
  return { matched, alternatives: unique.filter(item => item.id !== matched?.id).slice(0, 20) };
}

export class TestScopeEngine {
  private readonly limits: ResourceLimits;

  public constructor(options: EngineOptions = {}) {
    this.limits = effectiveLimits(options);
  }

  public execute(input: unknown): Result {
    const validation = validateRequest(input);
    if (!validation.valid || !validation.value) return errorResult([diagnostic("INVALID_REQUEST", validation.errors.join("; ") || "Invalid request", "error")]);
    const request = validation.value as Request;
    const external = request.operation === "plan" || request.operation === "explain" ? externalDiagnostics(request) : [];
    if (request.operation === "capabilities") {
      const root = canonicalizeRoot(request.root);
      if ("diagnostic" in root) return errorResult([root.diagnostic]);
      return capabilitiesResult(root.value, this.limits);
    }
    if (request.operation === "plan" || request.operation === "explain") {
      if (external.some(item => item.severity === "error")) return errorResult(external);
    }
    const root = canonicalizeRoot(request.root);
    if ("diagnostic" in root) return errorResult([root.diagnostic]);
    const startedAt = Date.now();
    const deadline = startedAt + this.limits.timeoutMs;
    const discovery = discoverFiles(root.value, { include: request.include, exclude: request.exclude, limits: this.limits, deadline });
    const diagnostics = [...external, ...discovery.diagnostics];
    const truncation: Truncation = { truncated: discovery.truncation.truncated, reasons: discovery.truncation.reasons.slice() };
    if (truncation.reasons.includes("RESOURCE_LIMIT") && !diagnostics.some(item => item.code === "RESOURCE_LIMIT")) {
      diagnostics.push(diagnostic("RESOURCE_LIMIT", "Discovery reached a configured file or byte limit", "warning"));
    }
    if (truncation.reasons.includes("TIMEOUT") && !diagnostics.some(item => item.code === "TIMEOUT")) {
      diagnostics.push(diagnostic("TIMEOUT", "Discovery reached its cooperative deadline", "warning"));
    }
    const discovered = discoveryData(discovery);
    diagnostics.push(...discovered.diagnostics);
    if (request.operation === "discover") {
      return finalize({ discovery: discovered.data }, diagnostics, truncation, statsFor(discovery, { testsDiscovered: discovered.data.tests.length }));
    }
    const normalized = normalizeChanges(root.value, request);
    diagnostics.push(...normalized.diagnostics);
    if (normalized.changes.length === 0) return errorResult(diagnostics.length > 0 ? diagnostics : [diagnostic("INVALID_REQUEST", "No valid changed paths were provided", "error")], statsFor(discovery));
    let explainTarget = request.operation === "explain" ? request.target : undefined;
    if (explainTarget?.path !== undefined) {
      const targetPath = normalizeRepositoryPath(root.value, explainTarget.path, "target.path");
      if ("diagnostic" in targetPath) return errorResult([...diagnostics, targetPath.diagnostic], statsFor(discovery));
      explainTarget = { path: targetPath.value };
    }
    const planLimits: ResourceLimits = { ...this.limits, maxReturnedTests: Math.min(this.limits.maxReturnedTests, request.limit ?? this.limits.maxReturnedTests) };
    const planned = buildPlan({ changes: normalized.changes, discovery, limits: planLimits, deadline, symbolEvidence: request.symbolEvidence, impactEvidence: request.impactEvidence });
    diagnostics.push(...planned.graph.diagnostics);
    if (planned.plan.minimum.tests.length > 1) diagnostics.push(diagnostic("AMBIGUOUS_TEST_MAPPING", "Multiple equally strong test recommendations were retained; review all bounded candidates", "warning", undefined, { tests: planned.plan.minimum.tests.map(item => item.path).sort() }));
    if (discovery.testFiles.length === 0) diagnostics.push(diagnostic("TEST_NOT_FOUND", "No supported test files were discovered", "info"));
    if (planned.timedOut) {
      addReason(truncation, "TIMEOUT");
      diagnostics.push(diagnostic("TIMEOUT", "Planning reached its cooperative deadline", "warning"));
    }
    if (planned.truncated) {
      addReason(truncation, "RESOURCE_LIMIT");
      diagnostics.push(diagnostic("RESOURCE_LIMIT", "Returned test recommendations reached the configured limit", "warning"));
    }
    const stats = statsFor(discovery, { testCandidates: planned.plan.recommended.tests.length, returnedTests: planned.plan.recommended.tests.length });
    if (request.operation === "plan") return finalize({ plan: planned.plan }, diagnostics, truncation, stats);
    const target = explainTarget ?? request.target;
    const found = findRecommendation(planned.plan, target);
    if (!found.matched) diagnostics.push(diagnostic("TEST_NOT_FOUND", "No recommendation matched the requested explanation target", "info", target.path));
    return finalize({ plan: planned.plan, explanation: { target, ...(found.matched ? { matched: found.matched } : {}), reasons: found.matched?.evidence ?? [], alternatives: found.alternatives } }, diagnostics, truncation, stats);
  }

  public getLimits(): ResourceLimits {
    return { ...this.limits };
  }
}

export function getCapabilitiesData(): Capabilities {
  return JSON.parse(JSON.stringify(CAPABILITIES)) as Capabilities;
}
