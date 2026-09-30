import { basename } from "node:path";
import type { ChangedFileInput, NormalizedChange, RiskAssessment, RiskLevel, RiskSignal, VersionedExternalEvidence } from "../types.js";
import type { ImportGraph } from "./imports.js";
import type { DiscoveryResult } from "./discovery.js";

function signal(code: string, description: string, confidence: RiskSignal["confidence"], paths?: string[]): RiskSignal {
  return { code, description, confidence, ...(paths && paths.length > 0 ? { paths: paths.slice().sort() } : {}) };
}

function maxRisk(left: RiskLevel, right: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { unknown: 0, low: 1, medium: 2, high: 3, critical: 4 };
  return rank[left] >= rank[right] ? left : right;
}

function hasMeaningfulField(value: VersionedExternalEvidence | undefined, field: string): boolean {
  if (!value) return false;
  const item = value[field];
  return Array.isArray(item) ? item.length > 0 : typeof item === "object" && item !== null;
}

function hasSymbolMatches(value: VersionedExternalEvidence | undefined): boolean {
  if (!value) return false;
  if (Array.isArray(value.matches)) return value.matches.length > 0;
  const data = value.data;
  return typeof data === "object" && data !== null && !Array.isArray(data) && Array.isArray((data as Record<string, unknown>).matches) && ((data as Record<string, unknown>).matches as unknown[]).length > 0;
}

function fileRisk(path: string, change: NormalizedChange, incomingConsumers: number, directTests: number, signals: RiskSignal[]): RiskLevel {
  const lower = path.toLowerCase();
  const base = basename(lower);
  if (base === "package.json" || base.includes("lock") || lower.startsWith(".github/") || lower.includes("/release") || lower.includes("/security")) {
    signals.push(signal("explicit-boundary-file", "Package, lockfile, CI, release, or security files require release-level verification", "confirmed", [path]));
    return "critical";
  }
  if (base.startsWith("tsconfig") || base.startsWith("vite.config") || base.startsWith("vitest.config") || base.startsWith("jest.config") || base.includes("babel.config") || base.includes("webpack.config")) {
    signals.push(signal("configuration-change", "Compiler or test configuration changes can affect broad repository behavior", "confirmed", [path]));
    return "high";
  }
  if (!change.supported) {
    signals.push(signal("unsupported-change", "The changed file type is outside the V0.1 static source contract", "confirmed", [path]));
    return "unknown";
  }
  if (incomingConsumers >= 3) {
    signals.push(signal("shared-static-consumers", `The changed module has ${incomingConsumers} discovered static consumers`, "strong", [path]));
    return "high";
  }
  if (incomingConsumers > 1) {
    signals.push(signal("static-consumer", `The changed module has ${incomingConsumers} discovered static consumer(s)`, "strong", [path]));
    return directTests > 0 ? "medium" : "high";
  }
  if (incomingConsumers === 1 && directTests === 0) {
    signals.push(signal("single-static-consumer", "The changed module has one discovered static consumer but no directly mapped test", "strong", [path]));
    return "medium";
  }
  if (directTests > 0 || change.status === "added" || lower.includes("/test/") || lower.includes("/tests/") || lower.includes("/__tests__/")) {
    signals.push(signal("bounded-local-change", "The change is isolated or directly paired with a discovered test", "candidate", [path]));
    return "low";
  }
  signals.push(signal("insufficient-scope-evidence", "No bounded relationship was found to justify a stronger risk level", "unknown", [path]));
  return "unknown";
}

export function classifyRisk(
  changes: readonly NormalizedChange[],
  discovery: DiscoveryResult,
  graph: ImportGraph,
  directTestCounts: ReadonlyMap<string, number>,
  external: { symbolEvidence?: VersionedExternalEvidence; impactEvidence?: VersionedExternalEvidence }
): RiskAssessment {
  const signals: RiskSignal[] = [];
  let level: RiskLevel = "unknown";
  for (const change of changes) {
    const incoming = new Set(graph.edges.filter(edge => edge.target === change.path).map(edge => edge.source));
    const directTests = directTestCounts.get(change.path) ?? 0;
    level = maxRisk(level, fileRisk(change.path, change, incoming.size, directTests, signals));
  }
  if (hasMeaningfulField(external.impactEvidence, "impact") || hasMeaningfulField(external.impactEvidence, "graph")) {
    signals.push(signal("external-impact-evidence", "Versioned external impact evidence reports downstream relationships", "strong"));
    level = maxRisk(level, "high");
  }
  if (hasSymbolMatches(external.symbolEvidence)) {
    signals.push(signal("external-symbol-evidence", "Versioned external symbol evidence was accepted as a planning input", "strong"));
    level = maxRisk(level, "medium");
  }
  if (discovery.testFiles.length === 0 && level === "low") {
    signals.push(signal("no-test-infrastructure", "No test files were discovered, so the recommendation must escalate to available static checks", "confirmed"));
    level = "medium";
  }
  return { level, signals };
}
