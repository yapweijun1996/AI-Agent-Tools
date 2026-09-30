import { createHash } from "node:crypto";
import type {
  Diagnostic,
  Evidence,
  Phase,
  Severity,
  Summary,
  Producer,
  ToolIssue,
  Warning,
} from "../../contract/agent-error-lens-v1.types.js";

const severityRank: Record<Severity, number> = { error: 0, warning: 1, info: 2, unknown: 3 };

export function createDiagnosticId(diagnostic: Omit<Diagnostic, "id">): `diag_${string}` {
  const location = diagnostic.location;
  const identity = [
    "1",
    diagnostic.producerId,
    diagnostic.severity,
    diagnostic.phase,
    diagnostic.code,
    location?.file ?? null,
    location?.line ?? null,
    location?.column ?? null,
    diagnostic.message,
  ];
  return `diag_${createHash("sha256").update(JSON.stringify(identity), "utf8").digest("hex")}`;
}

function compareNullable(left: string | number | null, right: string | number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left < right ? -1 : 1;
}

function compareText(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function evidenceKey(evidence: Evidence): string {
  return JSON.stringify([evidence.artifactId, evidence.kind, evidence.start, evidence.end, evidence.offsetUnit]);
}

function compareEvidence(left: Evidence, right: Evidence, artifactOrder: Map<string, number>): number {
  const artifactComparison = (artifactOrder.get(left.artifactId) ?? Number.MAX_SAFE_INTEGER) - (artifactOrder.get(right.artifactId) ?? Number.MAX_SAFE_INTEGER);
  return artifactComparison || left.start - right.start || left.end - right.end || compareText(left.kind, right.kind) || compareText(left.artifactId, right.artifactId);
}

function firstEvidence(diagnostic: Diagnostic, artifactOrder: Map<string, number>): Evidence {
  return [...diagnostic.evidence].sort((left, right) => {
    return compareEvidence(left, right, artifactOrder);
  })[0] ?? diagnostic.evidence[0]!;
}

export function deduplicateDiagnostics(diagnostics: Diagnostic[], artifactOrder: Map<string, number>): Diagnostic[] {
  const byIdentity = new Map<string, Diagnostic>();
  for (const diagnostic of diagnostics) {
    const identity = JSON.stringify([
      diagnostic.producerId,
      diagnostic.severity,
      diagnostic.phase,
      diagnostic.code,
      diagnostic.location?.file ?? null,
      diagnostic.location?.line ?? null,
      diagnostic.location?.column ?? null,
      diagnostic.message,
    ]);
    const existing = byIdentity.get(identity);
    if (!existing) {
      byIdentity.set(identity, diagnostic);
      continue;
    }
    const evidence = new Map(existing.evidence.map((item) => [evidenceKey(item), item]));
    for (const item of diagnostic.evidence) evidence.set(evidenceKey(item), item);
    existing.evidence = [...evidence.values()].sort((left, right) => compareEvidence(left, right, artifactOrder)).slice(0, 32);
  }
  return [...byIdentity.values()].sort((left, right) => {
    const leftEvidence = firstEvidence(left, artifactOrder);
    const rightEvidence = firstEvidence(right, artifactOrder);
    const artifactComparison = (artifactOrder.get(leftEvidence.artifactId) ?? Number.MAX_SAFE_INTEGER) - (artifactOrder.get(rightEvidence.artifactId) ?? Number.MAX_SAFE_INTEGER);
    return artifactComparison
      || leftEvidence.start - rightEvidence.start
      || severityRank[left.severity] - severityRank[right.severity]
      || compareNullable(left.location?.file ?? null, right.location?.file ?? null)
      || compareNullable(left.location?.line ?? null, right.location?.line ?? null)
      || compareNullable(left.location?.column ?? null, right.location?.column ?? null)
      || compareNullable(left.code, right.code)
      || compareText(left.id, right.id);
  });
}

function firstProducerEvidence(producer: Producer, artifactOrder: Map<string, number>): Evidence | null {
  return [...producer.evidence].sort((left, right) => compareEvidence(left, right, artifactOrder))[0] ?? null;
}

export function sortProducers(producers: Producer[], artifactOrder: Map<string, number>): Producer[] {
  return producers.map((producer) => ({
    ...producer,
    evidence: [...producer.evidence].sort((left, right) => compareEvidence(left, right, artifactOrder)),
  })).sort((left, right) => {
    const leftEvidence = firstProducerEvidence(left, artifactOrder);
    const rightEvidence = firstProducerEvidence(right, artifactOrder);
    if (leftEvidence && rightEvidence) {
      const evidenceComparison = compareEvidence(leftEvidence, rightEvidence, artifactOrder);
      if (evidenceComparison !== 0) return evidenceComparison;
    } else if (leftEvidence) {
      return -1;
    } else if (rightEvidence) {
      return 1;
    }
    return compareText(left.name, right.name) || compareNullable(left.version, right.version) || compareText(left.id, right.id);
  });
}

function firstRecordEvidence(record: ToolIssue | Warning, artifactOrder: Map<string, number>): Evidence | null {
  return [...record.evidence].sort((left, right) => compareEvidence(left, right, artifactOrder))[0] ?? null;
}

function compareRecordEvidence(left: ToolIssue | Warning, right: ToolIssue | Warning, artifactOrder: Map<string, number>): number {
  const leftEvidence = firstRecordEvidence(left, artifactOrder);
  const rightEvidence = firstRecordEvidence(right, artifactOrder);
  if (leftEvidence && rightEvidence) {
    const evidenceComparison = compareEvidence(leftEvidence, rightEvidence, artifactOrder);
    if (evidenceComparison !== 0) return evidenceComparison;
  } else if (leftEvidence) {
    return -1;
  } else if (rightEvidence) {
    return 1;
  }
  return compareText(left.code, right.code)
    || compareText(left.stage, right.stage)
    || compareText(left.message, right.message)
    || compareNullable(left.artifactId, right.artifactId);
}

export function sortToolIssues(issues: ToolIssue[], artifactOrder: Map<string, number>): ToolIssue[] {
  return issues.map((issue) => ({
    ...issue,
    evidence: [...issue.evidence].sort((left, right) => compareEvidence(left, right, artifactOrder)),
  })).sort((left, right) => compareRecordEvidence(left, right, artifactOrder));
}

export function sortWarnings(warnings: Warning[], artifactOrder: Map<string, number>): Warning[] {
  return warnings.map((warning) => ({
    ...warning,
    evidence: [...warning.evidence].sort((left, right) => compareEvidence(left, right, artifactOrder)),
  })).sort((left, right) => compareRecordEvidence(left, right, artifactOrder)
    || compareNullable(left.diagnosticId, right.diagnosticId));
}

export function summarize(diagnostics: Diagnostic[], producerCount: number): Summary {
  return {
    diagnosticCount: diagnostics.length,
    errorCount: diagnostics.filter((item) => item.severity === "error").length,
    warningCount: diagnostics.filter((item) => item.severity === "warning").length,
    infoCount: diagnostics.filter((item) => item.severity === "info").length,
    unknownCount: diagnostics.filter((item) => item.severity === "unknown").length,
    producerCount,
  };
}

export function phaseForStructured(value: unknown): Phase {
  return value === "compile" || value === "test" || value === "lint" || value === "build" || value === "cli" ? value : "unknown";
}
