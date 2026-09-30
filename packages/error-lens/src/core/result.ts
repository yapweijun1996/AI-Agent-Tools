import type {
  ParseResult,
  ProducerOutcome,
  ToolIssue,
  Warning,
} from "../../contract/agent-error-lens-v1.types.js";
import { LIMITS } from "./limits.js";
import { redactText } from "./redact.js";
import { stringLength } from "./validation.js";

export function emptyData() {
  return {
    producers: [],
    diagnostics: [],
    summary: {
      diagnosticCount: 0,
      errorCount: 0,
      warningCount: 0,
      infoCount: 0,
      unknownCount: 0,
      producerCount: 0,
    },
  };
}

export function emptyStats(artifactsReceived = 0, bytesReceived = 0) {
  return {
    artifactsReceived,
    artifactsProcessed: 0,
    bytesReceived,
    bytesProcessed: 0,
    linesProcessed: 0,
    parserMatches: 0,
    terminalSequences: 0,
    producerCandidates: 0,
    evidenceBytes: 0,
    diagnosticsBeforeLimit: 0,
  };
}

export function sanitizeProducerOutcome(outcome: ProducerOutcome | undefined): ProducerOutcome | undefined {
  if (!outcome) return undefined;
  const sanitized: ProducerOutcome = {};
  if (outcome.command !== undefined) {
    const command = redactText(outcome.command);
    if (stringLength(command) <= 8192) sanitized.command = command;
  }
  if (outcome.exitCode !== undefined) sanitized.exitCode = outcome.exitCode;
  if (outcome.signal !== undefined) {
    if (outcome.signal === null) sanitized.signal = null;
    else {
      const signal = redactText(outcome.signal);
      if (stringLength(signal) <= 128) sanitized.signal = signal;
    }
  }
  return sanitized;
}

export function addIssue(issues: ToolIssue[], issue: ToolIssue): void {
  if (issues.length < LIMITS.maxToolIssues) issues.push(issue);
}

export function addWarning(warnings: Warning[], warning: Warning): void {
  if (warnings.length < LIMITS.maxWarnings) warnings.push(warning);
}

export function errorResult(issue: ToolIssue, artifactsReceived = 0, bytesReceived = 0): ParseResult {
  return {
    schemaVersion: "1",
    status: "error",
    data: emptyData(),
    toolIssues: [issue],
    warnings: [],
    truncation: { truncated: false, reasons: [] },
    stats: emptyStats(Math.min(artifactsReceived, 64), Math.min(bytesReceived, LIMITS.maxRequestBytes)),
  };
}
