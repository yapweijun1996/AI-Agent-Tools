export type Origin = "staged" | "unstaged" | "untracked" | "snapshot";
export type Severity = "error" | "warning";
export type BuiltinRuleId =
  | "OUT_OF_SCOPE" | "PROTECTED_PATH" | "DELETION" | "RENAME" | "BINARY"
  | "SYMLINK" | "GENERATED_PATH" | "LOCKFILE" | "MAX_FILES"
  | "MAX_ADDED_LINES" | "MAX_DELETED_LINES";

export interface Limits {
  max_input_bytes: number;
  max_files: number;
  max_changed_lines: number;
  max_findings: number;
  max_output_bytes: number;
}
export interface ContentRule {
  id: string;
  needle: string;
  severity: Severity;
}
export interface PolicyException {
  rule_id: string;
  paths: string[];
}
export interface Policy {
  schema_version: "1.0.0";
  allowed_paths: string[];
  protected_paths?: string[];
  generated_paths?: string[];
  lockfile_paths?: string[];
  max_files?: number;
  max_added_lines?: number;
  max_deleted_lines?: number;
  allow_deletions?: boolean;
  allow_renames?: boolean;
  allow_binary?: boolean;
  allow_symlinks?: boolean;
  allow_generated?: boolean;
  allow_lockfiles?: boolean;
  content_rules?: ContentRule[];
  exceptions?: PolicyException[];
}
export interface Options {
  origin?: Origin;
  limits?: Partial<Limits>;
}
export interface FileChange {
  path: string;
  previous_path: string | null;
  kind: "added" | "modified" | "deleted" | "renamed";
  binary: boolean;
  symlink: boolean;
  added_lines: number;
  deleted_lines: number;
}
export interface Finding {
  rule_id: string;
  severity: Severity;
  path: string | null;
  line: number | null;
  diff_line: number | null;
}
export interface CheckData {
  verdict: "pass" | "violations";
  origin: Origin;
  summary: { files: number; added_lines: number; deleted_lines: number };
  files: FileChange[];
  findings: Finding[];
  exceptions_applied: Finding[];
}
export interface Diagnostic {
  code: string;
  message: string;
}
export interface Meta {
  scope: string;
  limits: Limits;
}
export interface Envelope<T = CheckData | Record<string, unknown>> {
  schema_version: "1.0.0";
  tool: { id: "agent-patch-guard"; version: "0.1.0" };
  status: "ok" | "incomplete" | "error";
  complete: boolean;
  data: T | null;
  errors: Diagnostic[];
  warnings: Diagnostic[];
  meta: Meta;
}
export type CheckResult = Envelope<CheckData>;
export interface CapabilitiesData {
  operations: Array<"check" | "capabilities">;
  origins: Origin[];
  policy_schema_version: "1.0.0";
  rule_ids: BuiltinRuleId[];
  limits: Limits;
  supports: {
    git_unified_diff: boolean;
    renames: boolean;
    mode_changes: boolean;
    binary_markers: boolean;
    symlink_metadata: boolean;
  };
  limitations: string[];
}
export type CapabilitiesResult = Envelope<CapabilitiesData>;
export const LIMITS: Readonly<Limits>;
export const BUILTIN_RULES: readonly BuiltinRuleId[];
export function checkPatch(diffText: string, policy: Policy, options?: Options): CheckResult;
export function capabilities(): CapabilitiesResult;
export function encodeResult<T>(result: Envelope<T>): string;
export function exitCode<T>(result: Envelope<T>): 0 | 1 | 2 | 3 | 4;
export function failure(code: string, status?: "error" | "incomplete", limits?: Limits): Envelope<never>;
export function validatePolicy(policy: unknown): Policy;
