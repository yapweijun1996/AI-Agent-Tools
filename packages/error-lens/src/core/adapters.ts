import type {
  Diagnostic,
  Evidence,
  Producer,
  ToolIssue,
  Warning,
} from "../../contract/agent-error-lens-v1.types.js";
import { makeDiagnostic } from "./diagnostic-factory.js";
import { evidenceFor } from "./evidence.js";
import { LIMITS, type BudgetState } from "./limits.js";
import type { NormalizedArtifact } from "./normalize.js";
import { splitLines } from "./text.js";

export interface AdapterOutcome {
  supported: boolean;
  diagnostics: Diagnostic[];
  producers: Producer[];
  issues: ToolIssue[];
  warnings: Warning[];
}

interface LocationMatch {
  file: string;
  line: number;
  column: number;
  start: number;
  end: number;
  evidence: Evidence;
}

function outcome(): AdapterOutcome {
  return { supported: false, diagnostics: [], producers: [], issues: [], warnings: [] };
}

function issue(code: string, message: string, artifactId: string, evidence: Evidence[] = []): ToolIssue {
  return { code, stage: "parse", message, artifactId, evidence };
}

function reserveMatch(budget: BudgetState): boolean {
  if (budget.parserMatches >= LIMITS.maxParserMatches) {
    budget.reasons.add("parser-matches");
    return false;
  }
  budget.parserMatches += 1;
  return true;
}

function addDiagnostic(adapterOutcome: AdapterOutcome, diagnostic: Diagnostic, budget: BudgetState): boolean {
  if (budget.diagnosticsBeforeLimit >= LIMITS.maxParserMatches) {
    budget.reasons.add("parser-matches");
    return false;
  }
  budget.diagnosticsBeforeLimit += 1;
  if (adapterOutcome.diagnostics.length >= LIMITS.maxDiagnostics) {
    budget.reasons.add("diagnostics");
    return false;
  }
  adapterOutcome.diagnostics.push(diagnostic);
  return true;
}

function addProducer(adapterOutcome: AdapterOutcome, name: Producer["name"], evidence: Evidence, budget: BudgetState): void {
  const existing = adapterOutcome.producers.find((producer) => producer.name === name);
  if (existing) {
    if (existing.evidence.length < LIMITS.maxEvidencePerRecord && !existing.evidence.some((item) => item.start === evidence.start && item.end === evidence.end && item.artifactId === evidence.artifactId)) {
      existing.evidence.push(evidence);
    }
    return;
  }
  if (budget.producerCandidates >= LIMITS.maxProducerCandidates) {
    budget.reasons.add("producer-candidates");
    return;
  }
  budget.producerCandidates += 1;
  adapterOutcome.producers.push({ id: name, name, version: null, evidence: [evidence] });
}

function addMappedDiagnostic(
  adapterOutcome: AdapterOutcome,
  fields: Parameters<typeof makeDiagnostic>[0],
  view: NormalizedArtifact,
  root: string | undefined,
  budget: BudgetState,
): void {
  const diagnostic = makeDiagnostic(fields, view.artifact, root, adapterOutcome.warnings);
  if (!diagnostic) {
    adapterOutcome.issues.push(issue("ADAPTER_DIAGNOSTIC_INVALID", "adapter match did not contain valid diagnostic fields", view.artifact.id, fields.evidence));
    return;
  }
  addDiagnostic(adapterOutcome, diagnostic, budget);
}

function parseTypeScript(view: NormalizedArtifact, root: string | undefined, budget: BudgetState): AdapterOutcome {
  const result = outcome();
  const pattern = /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)$/gmu;
  const barePattern = /^\s*(error|warning)\s+(TS\d+):\s*(.+)$/gmu;
  let match: RegExpExecArray | null;
  let producerEvidence: Evidence | null = null;
  while ((match = pattern.exec(view.text)) !== null) {
    result.supported = true;
    if (!reserveMatch(budget)) break;
    const file = match[1];
    const line = match[2];
    const column = match[3];
    const level = match[4];
    const code = match[5];
    const message = match[6];
    if (!file || !line || !column || !level || !code || !message) continue;
    const evidence = evidenceFor(view, match.index, match.index + match[0].length, budget, "log-span");
    if (!evidence) continue;
    producerEvidence ??= evidence;
    addProducer(result, "typescript", evidence, budget);
    addMappedDiagnostic(result, {
      severity: level === "error" ? "error" : "warning",
      phase: "compile",
      message,
      code,
      file,
      line: Number(line),
      column: Number(column),
      producerId: "typescript",
      confidence: "confirmed",
      evidence: [evidence],
    }, view, root, budget);
  }
  while ((match = barePattern.exec(view.text)) !== null) {
    result.supported = true;
    if (!reserveMatch(budget)) break;
    const level = match[1];
    const code = match[2];
    const message = match[3];
    if (!level || !code || !message) continue;
    const evidence = evidenceFor(view, match.index, match.index + match[0].length, budget, "log-span");
    if (!evidence) continue;
    producerEvidence ??= evidence;
    addProducer(result, "typescript", evidence, budget);
    addMappedDiagnostic(result, {
      severity: level === "error" ? "error" : "warning",
      phase: "compile",
      message,
      code,
      file: null,
      line: null,
      column: null,
      producerId: "typescript",
      confidence: "confirmed",
      evidence: [evidence],
    }, view, root, budget);
  }
  if (result.supported && !producerEvidence) result.issues.push(issue("MAPPING_FAILURE", "TypeScript match could not be mapped to raw evidence", view.artifact.id));
  return result;
}

function parseVitest(view: NormalizedArtifact, root: string | undefined, budget: BudgetState): AdapterOutcome {
  const result = outcome();
  const lines = splitLines(view.text);
  const failures: Array<{ file: string; start: number; end: number; evidence: Evidence }> = [];
  const messages: Array<{ message: string; start: number; end: number; evidence: Evidence }> = [];
  const locations: LocationMatch[] = [];
  const failPattern = /^\s*FAIL\s+(.+?)\s*$/u;
  const messagePattern = /^\s*(?:AssertionError|Error):\s*(.+)$/u;
  const locationPattern = /^\s*(?:❯|at)\s+(.+):(\d+):(\d+)\s*$/u;
  for (const line of lines) {
    const fail = failPattern.exec(line.text);
    if (fail?.[1]) {
      const file = fail[1].split(/\s+>\s+/u, 1)[0]?.trim();
      const evidence = evidenceFor(view, line.start, line.end, budget, "log-span");
      if (file && evidence) failures.push({ file, start: line.start, end: line.end, evidence });
      continue;
    }
    const message = messagePattern.exec(line.text);
    if (message?.[1]) {
      const evidence = evidenceFor(view, line.start, line.end, budget, "log-span");
      if (evidence) messages.push({ message: message[1], start: line.start, end: line.end, evidence });
      continue;
    }
    const location = locationPattern.exec(line.text);
    if (location?.[1] && location[2] && location[3] && !location[1].includes("node:internal") && !location[1].includes("(node")) {
      const evidence = evidenceFor(view, line.start, line.end, budget, "log-span");
      if (evidence) locations.push({ file: location[1].trim(), line: Number(location[2]), column: Number(location[3]), start: line.start, end: line.end, evidence });
    }
  }
  if (failures.length === 0 || messages.length === 0) return result;
  result.supported = true;
  addProducer(result, "vitest", failures[0]?.evidence ?? messages[0]!.evidence, budget);
  let failureIndex = -1;
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (!message || !reserveMatch(budget)) break;
    const nextMessageStart = messages[index + 1]?.start ?? Number.MAX_SAFE_INTEGER;
    const location = locations.find((candidate) => candidate.start >= message.end && candidate.start < nextMessageStart);
    while (failureIndex + 1 < failures.length && failures[failureIndex + 1]!.start <= message.start) failureIndex += 1;
    const fallback = failures[failureIndex];
    const evidence = location ? [message.evidence, location.evidence] : [message.evidence];
    addMappedDiagnostic(result, {
      severity: "error",
      phase: "test",
      message: message.message,
      code: null,
      file: location?.file ?? fallback?.file ?? null,
      line: location?.line ?? null,
      column: location?.column ?? null,
      producerId: "vitest",
      confidence: location ? "confirmed" : "strong",
      evidence,
    }, view, root, budget);
  }
  return result;
}

function likelyFileLine(line: string): boolean {
  const value = line.trim();
  const isDiagnosticLine = /^\d+:\d+\s+(?:error|warning)\b/u.test(value);
  return value.length > 0 && !isDiagnosticLine && !value.startsWith("✖") && !value.startsWith("✔") && (value.includes("/") || value.includes("\\") || /\.[cm]?[jt]sx?$/u.test(value));
}

function parseEslint(view: NormalizedArtifact, root: string | undefined, budget: BudgetState): AdapterOutcome {
  const result = outcome();
  const lines = splitLines(view.text);
  const pattern = /^\s*(\d+):(\d+)\s+(error|warning)\s+(.+?)\s{2,}([^\s]+)\s*$/u;
  let currentFile: string | null = null;
  for (const line of lines) {
    if (likelyFileLine(line.text)) currentFile = line.text.trim();
    const match = pattern.exec(line.text);
    if (!match) continue;
    result.supported = true;
    if (!reserveMatch(budget)) break;
    const lineNumber = match[1];
    const column = match[2];
    const level = match[3];
    const message = match[4];
    const code = match[5];
    if (!lineNumber || !column || !level || !message || !code) continue;
    const evidence = evidenceFor(view, line.start, line.end, budget, "log-span");
    if (!evidence) continue;
    addProducer(result, "eslint", evidence, budget);
    addMappedDiagnostic(result, {
      severity: level === "error" ? "error" : "warning",
      phase: "lint",
      message,
      code,
      file: currentFile,
      line: Number(lineNumber),
      column: Number(column),
      producerId: "eslint",
      confidence: "confirmed",
      evidence: [evidence],
    }, view, root, budget);
  }
  return result;
}

function parseGenericText(view: NormalizedArtifact, root: string | undefined, budget: BudgetState): AdapterOutcome {
  const result = outcome();
  const lines = splitLines(view.text);
  const locationPattern = /^\s*ERROR\s+at\s+(.+):(\d+):(\d+)\s+(.+)$/iu;
  const errorPattern = /^\s*Error:\s*(.+)$/u;
  const truncatedPattern = /output\s+truncated|truncated\s+by/iu;
  const metadataPattern = /\b(?:authorization|api[-_]?key|access[-_]?token|password|passwd|secret|database[-_]?url|db[-_]?url|signed[-_]?url|inputTokens|outputTokens|totalTokens)\b\s*[:=]/iu;
  const wrapperPattern = /^>\s+(?:npm|pnpm|yarn)\b/iu;
  let producerEvidence: Evidence | null = null;
  for (const line of lines) {
    const truncated = truncatedPattern.test(line.text);
    const located = locationPattern.exec(line.text);
    const error = errorPattern.exec(line.text);
    const wrapper = wrapperPattern.test(line.text);
    if (!truncated && !located && !error && !metadataPattern.test(line.text) && !wrapper) continue;
    result.supported = true;
    if ((metadataPattern.test(line.text) || wrapper) && !truncated && !located && !error) continue;
    if (!reserveMatch(budget)) break;
    const evidence = evidenceFor(view, line.start, line.end, budget, "log-span");
    if (!evidence) continue;
    producerEvidence ??= evidence;
    addProducer(result, "generic-text", evidence, budget);
    if (truncated) {
      budget.reasons.add("diagnostics");
      addMappedDiagnostic(result, {
        severity: "unknown",
        phase: "unknown",
        message: "verification output was truncated",
        code: null,
        file: null,
        line: null,
        column: null,
        producerId: "generic-text",
        confidence: "unknown",
        evidence: [evidence],
      }, view, root, budget);
      continue;
    }
    if (located?.[1] && located[2] && located[3] && located[4]) {
      addMappedDiagnostic(result, {
        severity: "error",
        phase: "unknown",
        message: located[4],
        code: null,
        file: located[1].trim(),
        line: Number(located[2]),
        column: Number(located[3]),
        producerId: "generic-text",
        confidence: "candidate",
        evidence: [evidence],
      }, view, root, budget);
      continue;
    }
    if (error?.[1]) {
      addMappedDiagnostic(result, {
        severity: "error",
        phase: "unknown",
        message: error[1],
        code: null,
        file: null,
        line: null,
        column: null,
        producerId: "generic-text",
        confidence: "candidate",
        evidence: [evidence],
      }, view, root, budget);
    }
  }
  if (result.supported && !producerEvidence && result.diagnostics.length === 0) result.producers = [];
  return result;
}

export function parseTextArtifact(view: NormalizedArtifact, root: string | undefined, budget: BudgetState): AdapterOutcome {
  const parsers = [parseTypeScript, parseVitest, parseEslint];
  const results: AdapterOutcome[] = [];
  for (const parser of parsers) {
    const result = parser(view, root, budget);
    results.push(result);
  }
  if (results.some((result) => result.supported)) {
    return {
      supported: true,
      diagnostics: results.flatMap((result) => result.diagnostics),
      producers: results.flatMap((result) => result.producers),
      issues: results.flatMap((result) => result.issues),
      warnings: results.flatMap((result) => result.warnings),
    };
  }
  return parseGenericText(view, root, budget);
}
