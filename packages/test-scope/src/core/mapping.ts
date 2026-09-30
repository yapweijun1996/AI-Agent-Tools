import { basename, dirname, extname } from "node:path";
import { createHash } from "node:crypto";
import type { Confidence, Evidence, Framework, NormalizedChange, TestRecommendation, VerificationScope } from "../types.js";
import type { DiscoveryResult, DiscoveredFile } from "./discovery.js";
import { packageRootFor } from "./frameworks.js";
import { buildImportGraph, importEvidence, reachableTestPaths, type ImportGraph } from "./imports.js";

interface CandidateState {
  path: string;
  evidence: Evidence[];
  changePaths: Set<string>;
}

function evidence(type: Evidence["type"], confidence: Confidence, source: string, target: string, details?: Record<string, unknown>): Evidence {
  return { type, confidence, source, target, ...(details ? { details } : {}) };
}

function removeSourceExtension(path: string): string {
  return path.replace(/\.(?:jsx?|tsx?|mjs|cjs|mts|cts)$/i, "");
}

function testStem(path: string): string {
  return removeSourceExtension(path).replace(/\.(?:test|spec)$/i, "");
}

function equivalentPath(sourcePath: string, testPath: string): boolean {
  const sourceStem = removeSourceExtension(sourcePath);
  const candidateStem = testStem(testPath);
  if (candidateStem === sourceStem) return true;
  const sourceParts = sourceStem.split("/");
  const candidateParts = candidateStem.split("/");
  const sourceName = sourceParts.at(-1);
  const candidateName = candidateParts.at(-1);
  if (!sourceName || sourceName !== candidateName) return false;
  const sourceTail = sourceParts.slice(1).join("/");
  const candidateTail = candidateParts.slice(-sourceParts.length + 1).join("/");
  return sourceTail.length > 0 && sourceTail === candidateTail;
}

function commonDirectory(left: string, right: string): boolean {
  const leftParts = dirname(left).split("/");
  const rightParts = dirname(right).split("/");
  const length = Math.min(leftParts.length, rightParts.length);
  let same = 0;
  while (same < length && leftParts[same] === rightParts[same]) same += 1;
  return same >= Math.max(1, length - 1);
}

function frameworkForTest(discovery: DiscoveryResult, file: DiscoveredFile, frameworks: readonly Framework[]): Framework | "unknown" {
  const text = (discovery.readFile(file.relativePath) ?? "").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/.*$/gm, "$1");
  const explicit = new Set<Framework>();
  if (/from\s*["']vitest["']|from\s*["']@vitest\//.test(text) || /\bvitest\./.test(text)) explicit.add("vitest");
  if (/from\s*["']@jest\/globals["']|\bjest\.(?:fn|mock|spyOn|expect)\b/.test(text)) explicit.add("jest");
  if (/from\s*["']node:test["']|require\(\s*["']node:test["']\s*\)/.test(text)) explicit.add("node");
  if (explicit.size === 1) return [...explicit][0]!;
  if (frameworks.length === 1) return frameworks[0]!;
  return "unknown";
}

function candidateScope(type: Evidence["type"]): VerificationScope {
  if (type === "repository-fallback") return "repository";
  if (type === "same-package" || type === "package-fallback") return "package";
  return "targeted";
}

function addCandidate(map: Map<string, CandidateState>, testPath: string, changePath: string, item: Evidence): void {
  const current = map.get(testPath) ?? { path: testPath, evidence: [], changePaths: new Set<string>() };
  const key = [item.type, item.source ?? "", item.target ?? "", JSON.stringify(item.details ?? {})].join("|");
  if (!current.evidence.some(existing => [existing.type, existing.source ?? "", existing.target ?? "", JSON.stringify(existing.details ?? {})].join("|") === key)) current.evidence.push(item);
  current.changePaths.add(changePath);
  map.set(testPath, current);
}

function evidenceRank(item: Evidence): number {
  const typeRank: Record<Evidence["type"], number> = {
    "direct-source-test-mapping": 7,
    "direct-import": 6,
    "static-module-reachability": 5,
    "same-feature-convention": 4,
    "same-package": 3,
    "package-fallback": 2,
    "repository-fallback": 1,
    "external-symbol-evidence": 4,
    "external-impact-evidence": 5,
    "project-command-evidence": 1
  };
  return typeRank[item.type];
}

export function highestConfidence(evidenceItems: readonly Evidence[]): Confidence {
  const rank: Record<Confidence, number> = { unknown: 0, candidate: 1, strong: 2, confirmed: 3 };
  return [...evidenceItems].sort((left, right) => rank[right.confidence] - rank[left.confidence])[0]?.confidence ?? "unknown";
}

export function mapTests(
  changes: readonly NormalizedChange[],
  discovery: DiscoveryResult,
  graph: ImportGraph,
  frameworks: readonly Framework[],
  maxCandidates: number,
  deadline = Number.POSITIVE_INFINITY
): { recommendations: TestRecommendation[]; directCounts: Map<string, number>; timedOut: boolean; truncated: boolean } {
  const candidates = new Map<string, CandidateState>();
  const directCounts = new Map<string, number>();
  const tests = discovery.testFiles.slice().sort((left, right) => left.relativePath < right.relativePath ? -1 : 1);
  for (const change of changes) {
    if (Date.now() >= deadline) break;
    for (const test of tests) {
      if (equivalentPath(change.path, test.relativePath)) {
        addCandidate(candidates, test.relativePath, change.path, evidence("direct-source-test-mapping", "confirmed", change.path, test.relativePath, { changedStatus: change.status }));
        directCounts.set(change.path, (directCounts.get(change.path) ?? 0) + 1);
      }
      if (commonDirectory(change.path, test.relativePath) && testStem(test.relativePath).split("/").at(-1) === basename(removeSourceExtension(change.path))) {
        addCandidate(candidates, test.relativePath, change.path, evidence("same-feature-convention", "candidate", test.relativePath, change.path));
      }
      if (packageRootFor(discovery, change.path) === packageRootFor(discovery, test.relativePath)) {
        addCandidate(candidates, test.relativePath, change.path, evidence("same-package", "candidate", test.relativePath, change.path, { packageRoot: packageRootFor(discovery, change.path) }));
      }
    }
    for (const test of tests) {
      const paths = reachableTestPaths(graph, test.relativePath, change.path, deadline);
      if (paths.length > 0) {
        const selected = paths[0]!;
        for (const edge of selected.edges) {
          addCandidate(candidates, test.relativePath, change.path, importEvidence(edge, true));
        }
        if (selected.edges.length === 1) directCounts.set(change.path, (directCounts.get(change.path) ?? 0) + 1);
      }
    }
  }
  if (candidates.size === 0 && tests.length > 0) {
    for (const test of tests) {
      for (const change of changes) addCandidate(candidates, test.relativePath, change.path, evidence("repository-fallback", "candidate", test.relativePath, change.path, { reason: "no-bounded-test-relationship" }));
    }
  }
  const recommendations: TestRecommendation[] = [...candidates.values()]
    .map(candidate => {
      const strongest = [...candidate.evidence].sort((left, right) => evidenceRank(right) - evidenceRank(left))[0];
      const scope = candidateScope(strongest?.type ?? "repository-fallback");
      const id = `sha256-v1:${createHash("sha256").update(["test-recommendation-v1", candidate.path, ...candidate.evidence.map(item => `${item.type}:${item.source ?? ""}:${item.target ?? ""}`).sort()].join("\n"), "utf8").digest("hex")}`;
      const testFile = discovery.testFiles.find(file => file.relativePath === candidate.path)!;
      return { id, path: candidate.path, framework: frameworkForTest(discovery, testFile, frameworks), scope, confidence: highestConfidence(candidate.evidence), evidence: candidate.evidence.slice().sort((left, right) => evidenceRank(right) - evidenceRank(left) || (left.type < right.type ? -1 : 1)) };
    })
    .sort((left, right) => {
      const confidenceRank: Record<Confidence, number> = { unknown: 0, candidate: 1, strong: 2, confirmed: 3 };
      const evidenceLeft = left.evidence[0] ? confidenceRank[left.evidence[0].confidence] : 0;
      const evidenceRight = right.evidence[0] ? confidenceRank[right.evidence[0].confidence] : 0;
      const scope = left.scope < right.scope ? -1 : left.scope > right.scope ? 1 : 0;
      return confidenceRank[right.confidence] - confidenceRank[left.confidence] || evidenceRight - evidenceLeft || scope || (left.path < right.path ? -1 : left.path > right.path ? 1 : 0) || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    });
  return { recommendations: recommendations.slice(0, maxCandidates), directCounts, timedOut: Date.now() >= deadline, truncated: recommendations.length > maxCandidates };
}
