export const SCHEMA_VERSION = "1" as const;

export type Operation = "capabilities" | "discover" | "plan" | "explain";
export type ResultStatus = "complete" | "partial" | "error";
export type Framework = "vitest" | "jest" | "node";
export type SourceLanguage = "javascript" | "typescript" | "jsx" | "tsx";
export type ChangeStatus = "added" | "modified" | "deleted" | "renamed" | "unsupported";
export type VerificationScope = "targeted" | "package" | "repository";
export type Confidence = "confirmed" | "strong" | "candidate" | "unknown";
export type RiskLevel = "low" | "medium" | "high" | "critical" | "unknown";
export type EvidenceType =
  | "direct-source-test-mapping"
  | "direct-import"
  | "static-module-reachability"
  | "same-feature-convention"
  | "same-package"
  | "package-fallback"
  | "repository-fallback"
  | "external-symbol-evidence"
  | "external-impact-evidence"
  | "project-command-evidence";

export type DiagnosticCode =
  | "INVALID_REQUEST"
  | "PATH_OUTSIDE_ROOT"
  | "TEST_FRAMEWORK_NOT_FOUND"
  | "TEST_NOT_FOUND"
  | "CHANGE_NOT_SUPPORTED"
  | "AMBIGUOUS_TEST_MAPPING"
  | "PROJECT_CONFIG_AMBIGUOUS"
  | "IMPACT_EVIDENCE_UNAVAILABLE"
  | "IMPORT_RESOLUTION_PARTIAL"
  | "RESOURCE_LIMIT"
  | "TIMEOUT"
  | "UNSUPPORTED_OPERATION"
  | "INTERNAL_ERROR";

export interface ResourceLimits {
  maxDiscoveredFiles: number;
  maxTestCandidates: number;
  maxReturnedTests: number;
  maxSingleFileBytes: number;
  maxParsedBytes: number;
  timeoutMs: number;
}

export const DEFAULT_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  maxDiscoveredFiles: 10_000,
  maxTestCandidates: 2_000,
  maxReturnedTests: 200,
  maxSingleFileBytes: 2 * 1024 * 1024,
  maxParsedBytes: 100 * 1024 * 1024,
  timeoutMs: 5_000
});

export interface EngineOptions {
  limits?: Partial<ResourceLimits>;
}

export interface BaseRequest {
  root: string;
  include?: string[];
  exclude?: string[];
  limit?: number;
}

export interface CapabilitiesRequest {
  operation: "capabilities";
  root: string;
}

export interface DiscoverRequest extends BaseRequest {
  operation: "discover";
}

export interface ChangedFileInput {
  path: string;
  status?: ChangeStatus;
  oldPath?: string;
}

export type ChangedInput = string | ChangedFileInput;

export interface VersionedExternalEvidence {
  schemaVersion: string;
  [key: string]: unknown;
}

export interface PlanRequest extends BaseRequest {
  operation: "plan";
  changed: ChangedInput[];
  projectProfile?: VersionedExternalEvidence;
  symbolEvidence?: VersionedExternalEvidence;
  impactEvidence?: VersionedExternalEvidence;
}

export interface ExplainTarget {
  path?: string;
  command?: string;
}

export interface ExplainRequest extends BaseRequest {
  operation: "explain";
  changed: ChangedInput[];
  target: ExplainTarget;
  projectProfile?: VersionedExternalEvidence;
  symbolEvidence?: VersionedExternalEvidence;
  impactEvidence?: VersionedExternalEvidence;
}

export type Request = CapabilitiesRequest | DiscoverRequest | PlanRequest | ExplainRequest;

export interface Position {
  line: number;
  column: number;
}

export interface SourceRange {
  start: Position;
  end: Position;
}

export interface Evidence {
  type: EvidenceType;
  confidence: Confidence;
  source?: string;
  target?: string;
  details?: Record<string, unknown>;
}

export interface DiscoveredTest {
  path: string;
  language: SourceLanguage;
  naming: "test-file" | "test-directory";
  framework?: Framework;
}

export interface FrameworkObservation {
  framework: Framework;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface DiscoveredCommand {
  name: string;
  command: string;
  source: string;
  packagePath?: string;
  purpose: "test" | "typecheck" | "build" | "lint" | "coverage" | "verify" | "release" | "other";
  evidence: Evidence[];
}

export interface DiscoveryData {
  frameworks: FrameworkObservation[];
  tests: DiscoveredTest[];
  commands: DiscoveredCommand[];
  projectFiles: string[];
}

export interface TestRecommendation {
  id: string;
  path: string;
  framework: Framework | "unknown";
  scope: VerificationScope;
  confidence: Confidence;
  evidence: Evidence[];
}

export interface CommandRecommendation {
  id: string;
  command: string;
  purpose: DiscoveredCommand["purpose"];
  scope: VerificationScope;
  confidence: Confidence;
  source: string;
  evidence: Evidence[];
  executed: false;
}

export interface RiskSignal {
  code: string;
  description: string;
  confidence: Confidence;
  paths?: string[];
}

export interface RiskAssessment {
  level: RiskLevel;
  signals: RiskSignal[];
}

export interface NormalizedChange {
  path: string;
  status: ChangeStatus;
  oldPath?: string;
  language?: SourceLanguage;
  exists: boolean;
  supported: boolean;
}

export interface VerificationLevel {
  tests: TestRecommendation[];
  commands: CommandRecommendation[];
}

export interface VerificationPlan {
  changes: NormalizedChange[];
  risk: RiskAssessment;
  minimum: VerificationLevel;
  recommended: VerificationLevel;
  release: VerificationLevel;
  escalation: string[];
}

export interface ExplanationData {
  target: ExplainTarget;
  matched?: TestRecommendation | CommandRecommendation;
  reasons: Evidence[];
  alternatives: Array<TestRecommendation | CommandRecommendation>;
}

export interface Capabilities {
  schemaVersion: typeof SCHEMA_VERSION;
  languages: SourceLanguage[];
  frameworks: Framework[];
  operations: Operation[];
  confidence: Confidence[];
  risk: RiskLevel[];
  limits: ResourceLimits;
  readOnly: true;
  network: "disabled";
  execution: "disabled";
}

export interface Diagnostic {
  code: DiagnosticCode;
  message: string;
  severity: "error" | "warning" | "info";
  path?: string;
  details?: Record<string, unknown>;
}

export interface Truncation {
  truncated: boolean;
  reasons: DiagnosticCode[];
}

export interface Stats {
  filesScanned?: number;
  bytesParsed?: number;
  testsDiscovered?: number;
  testCandidates?: number;
  returnedTests?: number;
  elapsedMs?: number;
  [key: string]: unknown;
}

export interface ResultData {
  capabilities?: Capabilities;
  discovery?: DiscoveryData;
  plan?: VerificationPlan;
  explanation?: ExplanationData;
}

export interface Result {
  schemaVersion: typeof SCHEMA_VERSION;
  status: ResultStatus;
  data: ResultData;
  diagnostics: Diagnostic[];
  truncation: Truncation;
  stats: Stats;
}
