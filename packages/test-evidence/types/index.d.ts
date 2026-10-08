export interface SourceIdentity { commit: string; dirty: boolean; worktreeSha256?: string }
export interface Environment { os: 'windows' | 'linux' | 'macos'; runtime: string; version: string }
export interface Producer { id: string; version: string }
export interface Counts { tests: number; suites: number; passed: number; failed: number; skipped: number; todo: number; cancelled: number }
export type CaseStatus = 'passed' | 'failed' | 'skipped' | 'todo' | 'cancelled';
export interface Request {
  schemaVersion: '1.0.0'; expectedSource: SourceIdentity;
  requiredChecks: { id: string; environment: Environment }[];
  runs: { id: string; checkId: string; source: SourceIdentity; environment: Environment;
    producer: Producer; exitCode: number | null; signal: string | null; completed: boolean;
    artifact: { id: string; path: string; format: 'unified-json' | 'node-jsonl' } }[];
}
export interface UnifiedEvidence {
  schemaVersion: '1.0.0'; producer: Producer; summary: { success: boolean; counts: Counts };
  cases?: { id: string; status: CaseStatus; location?: { path: string; line: number; column?: number } }[];
}
export interface Bundle { request: Request; artifacts: { id: string; path: string; bytes: Uint8Array }[] }
export interface Locator { artifactId: string; path: string; sha256: string; pointer?: string; line?: number }
export interface CheckResult {
  checkId: string; runId: string | null; state: 'passed' | 'failed' | 'unknown' | 'not_run'; applicable: boolean;
  reasons: string[]; counts: Counts | null; evidence: Locator | null;
  anomalies: { caseId: string; status: CaseStatus; evidence: Locator }[];
}
export interface Analysis { operation: 'summarize' | 'verify'; verdict: 'pass' | 'fail' | 'unknown'; counts: Counts; countUnit: 'test-executions'; checks: CheckResult[] }
export interface Capabilities { operations: ['summarize', 'verify']; formats: ['unified-json', 'node-jsonl']; requestVersion: '1.0.0'; processExecution: false; sourceIdentity: 'caller-declared' }
export type Result<T = Analysis> = {
  schema_version: '1.0.0'; tool: { id: 'agent-test-evidence'; version: string };
  errors: { code: string; message: string }[]; warnings: { code: string; message: string }[];
  meta: { scope: string; limits: Record<string, number> };
} & ({ status: 'ok'; complete: true; data: T } | { status: 'incomplete' | 'error'; complete: false; data: null });
export interface NormalizedNodeCapture { producer: Producer; runtime: { id: 'node'; version: string }; summary: { success: boolean; counts: Counts }; cases: { id: string; status: CaseStatus; line: number }[]; line: number }
export function capabilities(): Result<Capabilities>;
export function summarizeEvidence(bundle: Bundle): Result;
export function verifyEvidence(bundle: Bundle): Result;
/** Throws a safe coded error for invalid, unsupported or incomplete capture. */
export function normalizeNodeCapture(capture: Uint8Array): NormalizedNodeCapture;
export function encodeResult(result: Result<Analysis | Capabilities>): string;
export function exitCode(result: Result<Analysis | Capabilities>): 0 | 1 | 2 | 3 | 4;
