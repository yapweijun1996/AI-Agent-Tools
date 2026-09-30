export interface Result {
  schemaVersion: "1.0";
  tool: "agent-release-guard";
  operation: "capabilities" | "deploy-verify";
  status: "pass" | "fail" | "unknown" | "error";
  complete: boolean;
  data: Record<string, unknown> | null;
  diagnostics: Array<Record<string, unknown>>;
}
export function verifyDeployment(input: unknown): Result;
export function capabilities(): Result;
export function encodeResult(result: Result): string;
export function exitCode(result: Result): number;
