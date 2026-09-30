export const TOOL_ID = "agent-cfml-check" as const;
export const TOOL_VERSION = "0.1.1" as const;
export const PROFILE_ID = "cfml-structure-v1" as const;

export interface Position {
  line: number;
  column: number;
}

export interface SourceLocation {
  start: Position;
  end: Position;
  start_byte: number;
  end_byte: number;
}

export interface Finding {
  code:
    | "UNEXPECTED_CLOSE"
    | "MISMATCHED_CLOSE"
    | "UNCLOSED_TAG"
    | "INVALID_BRANCH"
    | "UNTERMINATED_STRING"
    | "UNTERMINATED_COMMENT"
    | "UNBALANCED_DELIMITER";
  message: string;
  location: SourceLocation;
  related_open: SourceLocation | null;
}

export interface SourceInfo {
  path: string;
  sha256: string;
  byte_size: number;
  encoding: "utf-8";
  bom: boolean;
}

export interface CheckData {
  profile: typeof PROFILE_ID;
  source: SourceInfo;
  verdict: "pass" | "violations";
  checks: string[];
  exclusions: string[];
  findings: Finding[];
}

export interface EnvelopeError {
  code: string;
  message: string;
}

export interface EnvelopeMeta {
  scope: string;
  limits: {
    max_source_bytes: number;
    max_nesting: number;
    max_findings: number;
    max_output_bytes: number;
    time_limit_ms: number;
  };
}

export interface Envelope<T> {
  schema_version: "1.0.0";
  tool: { id: typeof TOOL_ID; version: typeof TOOL_VERSION };
  status: "ok" | "incomplete" | "error";
  complete: boolean;
  data: T | null;
  errors: EnvelopeError[];
  warnings: EnvelopeError[];
  meta: EnvelopeMeta;
}

export interface CheckLimits {
  max_source_bytes: number;
  max_nesting: number;
  max_findings: number;
  max_output_bytes: number;
  time_limit_ms: number;
}

export interface CheckOptions {
  root: string;
  file: string;
  limits?: Partial<CheckLimits>;
}

export interface LoadedSource {
  requested_path: string;
  resolved_path: string;
  relative_path: string;
  source: string;
  bytes: Buffer;
  bom: boolean;
}

export interface CapabilitiesData {
  profile: typeof PROFILE_ID;
  operations: string[];
  extensions: string[];
  supported_tags: {
    paired_bodies: string[];
    branches: string[];
    bodyless: string[];
  };
  limits: CheckLimits;
  exclusions: string[];
}
