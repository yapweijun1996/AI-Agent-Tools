// Checked TypeScript projection of contract/agent-error-lens-v1.schema.json.
// The JSON Schema is authoritative; do not add public fields here without a schema change.

export type SchemaVersion = "1";

export type ArtifactStream = "stdout" | "stderr" | "combined" | "unknown";
export type Severity = "error" | "warning" | "info" | "unknown";
export type Phase = "compile" | "test" | "lint" | "build" | "cli" | "unknown";
export type Confidence = "confirmed" | "strong" | "candidate" | "unknown";
export type EvidenceKind = "log-span" | "structured-field";
export type OffsetUnit = "utf16-code-unit";
export type ProducerName =
  | "typescript"
  | "vitest"
  | "eslint"
  | "generic-structured"
  | "generic-text"
  | "unknown";
export type IssueStage =
  | "request"
  | "bounds"
  | "encoding"
  | "normalize"
  | "detect"
  | "parse"
  | "mapping"
  | "path"
  | "redact"
  | "canonicalize"
  | "serialize"
  | "cli"
  | "unknown";
export type TruncationReason =
  | "artifact-bytes"
  | "request-bytes"
  | "line-length"
  | "processed-lines"
  | "parser-matches"
  | "terminal-sequences"
  | "producer-candidates"
  | "evidence-bytes"
  | "diagnostics"
  | "unsupported-format"
  | "mapping-failure";

export interface ParseRequest {
  schemaVersion: SchemaVersion;
  artifacts: InputArtifact[];
  producerOutcome?: ProducerOutcome;
  options?: ParseOptions;
}

export interface InputArtifact {
  id: string;
  stream: ArtifactStream;
  content: string;
  encoding?: "utf-8";
}

export interface ProducerOutcome {
  command?: string;
  exitCode?: number | null;
  signal?: string | null;
}

export interface ParseOptions {
  root?: string;
}

export interface ParseResult {
  schemaVersion: SchemaVersion;
  status: "complete" | "partial" | "error";
  producerOutcome?: ProducerOutcome;
  data: ResultData;
  toolIssues: ToolIssue[];
  warnings: Warning[];
  truncation: Truncation;
  stats: ParseStats;
}

export interface CapabilitiesResult {
  schemaVersion: SchemaVersion;
  operations: ["parse", "capabilities"];
  producers: ProducerName[];
}

export interface ResultData {
  producers: Producer[];
  diagnostics: Diagnostic[];
  summary: Summary;
}

export interface Diagnostic {
  id: `diag_${string}`;
  severity: Severity;
  phase: Phase;
  message: string;
  code: string | null;
  location: Location | null;
  producerId: string | null;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface Location {
  file: string;
  line: number | null;
  column: number | null;
}

export interface Evidence {
  artifactId: string;
  kind: EvidenceKind;
  start: number;
  end: number;
  offsetUnit: OffsetUnit;
}

export interface Producer {
  id: string;
  name: ProducerName;
  version: string | null;
  evidence: Evidence[];
}

export interface ToolIssue {
  code: string;
  stage: IssueStage;
  message: string;
  artifactId: string | null;
  evidence: Evidence[];
}

export interface Warning {
  code: string;
  stage: IssueStage;
  message: string;
  diagnosticId: string | null;
  artifactId: string | null;
  evidence: Evidence[];
}

export interface Truncation {
  truncated: boolean;
  reasons: TruncationReason[];
}

export interface Summary {
  diagnosticCount: number;
  errorCount: number;
  warningCount: number;
  infoCount: number;
  unknownCount: number;
  producerCount: number;
}

export interface ParseStats {
  artifactsReceived: number;
  artifactsProcessed: number;
  bytesReceived: number;
  bytesProcessed: number;
  linesProcessed: number;
  parserMatches: number;
  terminalSequences: number;
  producerCandidates: number;
  evidenceBytes: number;
  diagnosticsBeforeLimit: number;
}

export const schemaVersion: SchemaVersion = "1";
