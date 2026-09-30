export interface Result {
  schemaVersion: "1.0";
  tool: string;
  operation: string;
  status: string;
  complete: boolean;
  data: Record<string, unknown> | null;
  diagnostics: Array<Record<string, unknown>>;
}
export function compareContracts(
  before: unknown,
  after: unknown,
  options?: Record<string, unknown>,
): Result;
export function selectPointer(value: unknown, pointer?: string): unknown;
export function capabilities(): Result;
export function encodeResult(result: Result): string;
export function exitCode(result: Result): number;
