import type {
  CapabilitiesResult,
  Diagnostic,
  ParseResult,
  Producer,
} from "../contract/agent-error-lens-v1.types.js";
import { deduplicateDiagnostics, sortProducers, sortToolIssues, sortWarnings, summarize } from "./core/diagnostics.js";
import { parseTextArtifact } from "./core/adapters.js";
import { LIMITS, createBudget, orderedReasons } from "./core/limits.js";
import { normalizeArtifact } from "./core/normalize.js";
import { parseStructuredArtifact } from "./core/structured.js";
import { addIssue, addWarning, emptyStats, errorResult, sanitizeProducerOutcome } from "./core/result.js";
import { validateRequest } from "./core/validation.js";

export function capabilities(): CapabilitiesResult {
  return {
    schemaVersion: "1",
    operations: ["parse", "capabilities"],
    producers: ["typescript", "vitest", "eslint", "generic-structured", "generic-text"],
  };
}

export function parse(request: unknown): ParseResult {
  const validation = validateRequest(request);
  if (!validation.ok) {
    const stage = validation.issue.code.includes("BYTES") ? "bounds" : validation.issue.code === "UNICODE_INVALID" ? "encoding" : "request";
    return errorResult({
      code: validation.issue.code,
      stage,
      message: validation.issue.message,
      artifactId: validation.issue.artifactId,
      evidence: [],
    }, validation.artifactsReceived, validation.bytesReceived);
  }

  const budget = createBudget();
  const diagnostics: Diagnostic[] = [];
  const producers = new Map<string, Producer>();
  const toolIssues = [] as ReturnType<typeof errorResult>["toolIssues"];
  const warnings = [] as ReturnType<typeof errorResult>["warnings"];
  const artifactOrder = new Map(validation.request.artifacts.map((artifact, index) => [artifact.id, index]));
  let artifactsProcessed = 0;
  let bytesProcessed = 0;

  for (const artifact of validation.request.artifacts) {
    if (budget.reasons.has("processed-lines") || budget.reasons.has("terminal-sequences")) break;
    const view = normalizeArtifact(artifact, budget);
    artifactsProcessed += 1;
    bytesProcessed += view.rawBytesProcessed;
    const looksStructured = /^[\[{]/u.test(view.text.trimStart());
    const outcome = looksStructured
      ? parseStructuredArtifact(view, validation.request.options?.root, budget)
      : parseTextArtifact(view, validation.request.options?.root, budget);
    if (!outcome.supported && outcome.issues.length === 0 && !view.stopped && view.text.trim().length > 0) {
      budget.reasons.add("unsupported-format");
      addIssue(toolIssues, {
        code: "UNSUPPORTED_FORMAT",
        stage: "parse",
        message: "no supported structured diagnostic format was recognized",
        artifactId: artifact.id,
        evidence: [],
      });
    }
    for (const issue of outcome.issues) addIssue(toolIssues, issue);
    for (const warning of outcome.warnings) addWarning(warnings, warning);
    diagnostics.push(...outcome.diagnostics);
    for (const producer of outcome.producers) {
      const existing = producers.get(producer.id);
      if (!existing) {
        producers.set(producer.id, producer);
        continue;
      }
      const evidence = new Map(existing.evidence.map((item) => [JSON.stringify(item), item]));
      for (const item of producer.evidence) evidence.set(JSON.stringify(item), item);
      existing.evidence = [...evidence.values()].slice(0, LIMITS.maxEvidencePerRecord);
    }
    if (view.stopped && budget.reasons.has("processed-lines")) break;
  }

  const canonicalDiagnostics = deduplicateDiagnostics(diagnostics, artifactOrder).slice(0, LIMITS.maxDiagnostics);
  const reasonList = orderedReasons(budget);
  const producerOutcome = sanitizeProducerOutcome(validation.request.producerOutcome);
  const result: ParseResult = {
    schemaVersion: "1",
    status: reasonList.length > 0 || toolIssues.length > 0 ? "partial" : "complete",
    ...(producerOutcome ? { producerOutcome } : {}),
    data: {
      producers: sortProducers([...producers.values()], artifactOrder),
      diagnostics: canonicalDiagnostics,
      summary: summarize(canonicalDiagnostics, producers.size),
    },
    toolIssues: sortToolIssues(toolIssues, artifactOrder),
    warnings: sortWarnings(warnings, artifactOrder),
    truncation: {
      truncated: reasonList.length > 0,
      reasons: reasonList,
    },
    stats: {
      ...emptyStats(validation.artifactsReceived, validation.bytesReceived),
      artifactsProcessed,
      bytesProcessed: Math.min(bytesProcessed, LIMITS.maxRequestBytes),
      linesProcessed: budget.linesProcessed,
      parserMatches: budget.parserMatches,
      terminalSequences: budget.terminalSequences,
      producerCandidates: budget.producerCandidates,
      evidenceBytes: budget.evidenceBytes,
      diagnosticsBeforeLimit: budget.diagnosticsBeforeLimit,
    },
  };
  return result;
}
