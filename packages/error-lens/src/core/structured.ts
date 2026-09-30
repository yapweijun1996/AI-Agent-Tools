import type {
  Diagnostic,
  Evidence,
  InputArtifact,
  Producer,
  ToolIssue,
  Warning,
} from "../../contract/agent-error-lens-v1.types.js";
import { phaseForStructured } from "./diagnostics.js";
import { makeDiagnostic } from "./diagnostic-factory.js";
import { evidenceFor } from "./evidence.js";
import { LIMITS, type BudgetState } from "./limits.js";
import type { NormalizedArtifact } from "./normalize.js";
import { isWellFormedUnicode, stringLength } from "./validation.js";

export interface StructuredParseOutcome {
  supported: boolean;
  diagnostics: Diagnostic[];
  producers: Producer[];
  issues: ToolIssue[];
  warnings: Warning[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && isWellFormedUnicode(value) && stringLength(value) <= max;
}

function makeIssue(code: string, message: string, artifactId: string, evidence: Evidence[] = []): ToolIssue {
  return { code, stage: "parse", message, artifactId, evidence };
}

function parseRecord(
  value: unknown,
  evidence: Evidence,
  artifact: InputArtifact,
  root: string | undefined,
  warnings: Warning[],
): ReturnType<typeof makeDiagnostic> {
  if (!isRecord(value)) return null;
  if (!boundedString(value.message, 8192) || stringLength(value.message) === 0) return null;

  const severity = value.severity === "error" || value.severity === "warning" || value.severity === "info" || value.severity === "unknown" ? value.severity : "unknown";
  const phase = phaseForStructured(value.phase);
  const code = value.code === undefined || value.code === null ? null : boundedString(value.code, 128) ? value.code : null;
  if (value.code !== undefined && value.code !== null && code === null) return null;
  const lineValue = value.line;
  const columnValue = value.column;
  const line = lineValue === undefined || lineValue === null ? null : typeof lineValue === "number" && Number.isSafeInteger(lineValue) && lineValue >= 1 ? lineValue : null;
  const column = columnValue === undefined || columnValue === null ? null : typeof columnValue === "number" && Number.isSafeInteger(columnValue) && columnValue >= 1 ? columnValue : null;
  if ((value.line !== undefined && value.line !== null && line === null) || (value.column !== undefined && value.column !== null && column === null)) return null;

  const file = value.file === undefined || value.file === null ? null : boundedString(value.file, 4096) && stringLength(value.file) > 0 ? value.file : null;
  if (value.file !== undefined && value.file !== null && file === null) return null;
  return makeDiagnostic({
    severity,
    phase,
    message: value.message,
    code,
    file,
    line,
    column,
    producerId: "generic-structured",
    confidence: "confirmed",
    evidence: [evidence],
  }, artifact, root, warnings);
}

export function parseStructuredArtifact(
  view: NormalizedArtifact,
  root: string | undefined,
  budget: BudgetState,
): StructuredParseOutcome {
  const empty: StructuredParseOutcome = { supported: false, diagnostics: [], producers: [], issues: [], warnings: [] };
  const firstNonWhitespace = view.text.search(/\S/u);
  if (firstNonWhitespace < 0) return empty;
  const first = view.text[firstNonWhitespace];
  if (first !== "{" && first !== "[") return empty;
  const lastNonWhitespace = view.text.search(/\s*$/u);
  const evidence = evidenceFor(view, firstNonWhitespace, lastNonWhitespace < 0 ? view.text.length : lastNonWhitespace, budget, "structured-field");
  if (!evidence) {
    return {
      supported: true,
      diagnostics: [],
      producers: [],
      issues: [makeIssue("EVIDENCE_SPAN_LIMIT", "structured input exceeds the evidence span budget", view.artifact.id)],
      warnings: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(view.text.slice(firstNonWhitespace, lastNonWhitespace < 0 ? view.text.length : lastNonWhitespace)) as unknown;
  } catch {
    budget.reasons.add("unsupported-format");
    return {
      supported: true,
      diagnostics: [],
      producers: [],
      issues: [makeIssue("STRUCTURED_INPUT_INVALID", "structured diagnostic JSON could not be parsed", view.artifact.id, [evidence])],
      warnings: [],
    };
  }

  const records = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.diagnostics) ? parsed.diagnostics : null;
  if (!records) {
    budget.reasons.add("unsupported-format");
    return {
      supported: false,
      diagnostics: [],
      producers: [],
      issues: [makeIssue("UNSUPPORTED_FORMAT", "structured JSON does not contain a diagnostics array", view.artifact.id, [evidence])],
      warnings: [],
    };
  }

  if (budget.producerCandidates >= LIMITS.maxProducerCandidates) {
    budget.reasons.add("producer-candidates");
    return { supported: true, diagnostics: [], producers: [], issues: [], warnings: [] };
  }
  budget.producerCandidates += 1;
  const producers: Producer[] = [{
    id: "generic-structured",
    name: "generic-structured",
    version: null,
    evidence: [evidence],
  }];
  const diagnostics: Diagnostic[] = [];
  const issues: ToolIssue[] = [];
  const warnings: Warning[] = [];
  for (const record of records) {
    if (budget.parserMatches >= LIMITS.maxParserMatches) {
      budget.reasons.add("parser-matches");
      break;
    }
    if (budget.diagnosticsBeforeLimit >= LIMITS.maxParserMatches) {
      budget.reasons.add("parser-matches");
      break;
    }
    budget.parserMatches += 1;
    const diagnostic = parseRecord(record, evidence, view.artifact, root, warnings);
    if (!diagnostic) {
      budget.reasons.add("unsupported-format");
      issues.push(makeIssue("STRUCTURED_DIAGNOSTIC_INVALID", "structured diagnostic record is missing valid supported fields", view.artifact.id, [evidence]));
      continue;
    }
    budget.diagnosticsBeforeLimit += 1;
    if (diagnostics.length >= LIMITS.maxDiagnostics) {
      budget.reasons.add("diagnostics");
      break;
    }
    diagnostics.push(diagnostic);
  }
  if (records.length > diagnostics.length && diagnostics.length >= LIMITS.maxDiagnostics) budget.reasons.add("diagnostics");
  return { supported: true, diagnostics, producers, issues: issues.slice(0, LIMITS.maxToolIssues), warnings: warnings.slice(0, LIMITS.maxWarnings) };
}
