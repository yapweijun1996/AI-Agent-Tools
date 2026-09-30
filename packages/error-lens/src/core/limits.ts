import type { TruncationReason } from "../../contract/agent-error-lens-v1.types.js";

export const LIMITS = {
  maxArtifactBytes: 2 * 1024 * 1024,
  maxRequestBytes: 20 * 1024 * 1024,
  maxDiagnostics: 200,
  maxEvidenceSpanBytes: 64 * 1024,
  maxLineBytes: 16 * 1024,
  maxProcessedLines: 200_000,
  maxParserMatches: 10_000,
  maxTerminalSequences: 10_000,
  maxProducerCandidates: 256,
  maxAggregateEvidenceBytes: 1024 * 1024,
  maxProducers: 64,
  maxToolIssues: 200,
  maxWarnings: 200,
  maxEvidencePerRecord: 32,
} as const;

export const TRUNCATION_ORDER: TruncationReason[] = [
  "artifact-bytes",
  "request-bytes",
  "line-length",
  "processed-lines",
  "parser-matches",
  "terminal-sequences",
  "producer-candidates",
  "evidence-bytes",
  "diagnostics",
  "unsupported-format",
  "mapping-failure",
];

export interface BudgetState {
  linesProcessed: number;
  parserMatches: number;
  terminalSequences: number;
  producerCandidates: number;
  evidenceBytes: number;
  diagnosticsBeforeLimit: number;
  evidenceKeys: Set<string>;
  reasons: Set<TruncationReason>;
}

export function createBudget(): BudgetState {
  return {
    linesProcessed: 0,
    parserMatches: 0,
    terminalSequences: 0,
    producerCandidates: 0,
    evidenceBytes: 0,
    diagnosticsBeforeLimit: 0,
    evidenceKeys: new Set<string>(),
    reasons: new Set<TruncationReason>(),
  };
}

export function orderedReasons(budget: BudgetState): TruncationReason[] {
  return TRUNCATION_ORDER.filter((reason) => budget.reasons.has(reason));
}
