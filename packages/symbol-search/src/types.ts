export const SCHEMA_VERSION = "1" as const;

export type Operation =
  | "capabilities"
  | "search"
  | "definition"
  | "references"
  | "implementations"
  | "symbols";

export type MatchMode = "exact" | "prefix" | "substring";
export type ResultStatus = "complete" | "partial" | "error";
export type SymbolKind =
  | "module"
  | "namespace"
  | "class"
  | "interface"
  | "type"
  | "enum"
  | "function"
  | "method"
  | "constructor"
  | "variable"
  | "constant"
  | "property"
  | "field"
  | "component"
  | "parameter"
  | "unknown";
export type Relation =
  | "definition"
  | "declaration"
  | "reference"
  | "import_alias"
  | "implementation"
  | "inheritance";
export type Confidence = "confirmed" | "strong" | "candidate" | "unknown";
export type FailureCode =
  | "SYMBOL_NOT_FOUND"
  | "AMBIGUOUS_SYMBOL"
  | "UNSUPPORTED_LANGUAGE"
  | "UNSUPPORTED_OPERATION"
  | "SEMANTIC_RESOLUTION_UNAVAILABLE"
  | "PARSE_ERROR"
  | "INVALID_ROOT"
  | "PATH_OUTSIDE_ROOT"
  | "MAX_FILES_REACHED"
  | "MAX_BYTES_REACHED"
  | "MAX_RESULTS_REACHED"
  | "TIMEOUT"
  | "INVALID_REQUEST";

export interface Position {
  line: number;
  column: number;
}

export interface SourceRange {
  start: Position;
  end: Position;
}

export interface SourcePosition {
  path: string;
  line: number;
  column: number;
}

export interface RequestOptions {
  root: string;
  limit?: number;
  include?: string[];
  exclude?: string[];
}

export interface CapabilitiesRequest {
  operation: "capabilities";
  root: string;
}

export interface SearchRequest extends RequestOptions {
  operation: "search";
  symbol: string;
  match?: MatchMode;
  project?: string;
}

export interface SemanticRequest extends RequestOptions {
  operation: "definition" | "references" | "implementations";
  symbol: string;
  from?: SourcePosition;
  project?: string;
}

export interface SymbolsRequest extends RequestOptions {
  operation: "symbols";
  path: string;
  project?: string;
}

export type Request =
  | CapabilitiesRequest
  | SearchRequest
  | SemanticRequest
  | SymbolsRequest;

export interface Match {
  symbolId: string;
  name: string;
  qualifiedName: string;
  kind: SymbolKind;
  relation: Relation;
  language: "typescript";
  path: string;
  range: SourceRange;
  nameRange?: SourceRange;
  container?: string;
  resolver: "typescript-semantic";
  confidence: Confidence;
  exported?: boolean;
}

export interface Diagnostic {
  code: FailureCode;
  message: string;
  severity: "error" | "warning" | "info";
  path?: string;
  details?: Record<string, unknown>;
}

export interface Truncation {
  truncated: boolean;
  reasons: FailureCode[];
}

export interface Stats {
  filesScanned?: number;
  bytesParsed?: number;
  compilerFilesRead?: number;
  compilerBytesRead?: number;
  matches?: number;
  compilerVersion?: string;
  project?: string;
  [key: string]: unknown;
}

export interface LanguageCapability {
  operations: Record<string, "full" | "partial" | "candidate" | "unsupported" | "proposed">;
  notes: string[];
}

export interface Capabilities {
  schemaVersion: typeof SCHEMA_VERSION;
  languages: Record<string, LanguageCapability>;
}

export interface ResultData {
  matches: Match[];
  ambiguous?: boolean;
  capabilities?: Capabilities;
}

export interface Result {
  schemaVersion: typeof SCHEMA_VERSION;
  status: ResultStatus;
  data: ResultData;
  diagnostics: Diagnostic[];
  truncation: Truncation;
  stats: Stats;
}

export interface ResourceLimits {
  maxFiles: number;
  maxSingleFileBytes: number;
  maxParsedBytes: number;
  defaultResults: number;
  maxResults: number;
  timeoutMs: number;
}

export const DEFAULT_LIMITS: Readonly<ResourceLimits> = Object.freeze({
  maxFiles: 10_000,
  maxSingleFileBytes: 2 * 1024 * 1024,
  maxParsedBytes: 100 * 1024 * 1024,
  defaultResults: 50,
  maxResults: 500,
  timeoutMs: 5_000
});

export interface EngineOptions {
  limits?: Partial<ResourceLimits>;
}

export interface DiscoveryPatterns {
  include?: string[];
  exclude?: string[];
}
