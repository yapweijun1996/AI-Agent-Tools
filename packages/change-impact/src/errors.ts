import type { ErrorCode } from "./types";

export class ImpactError extends Error {
  public readonly code: ErrorCode;
  public readonly details?: Record<string, unknown>;

  public constructor(code: ErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "ImpactError";
    this.code = code;
    this.details = details;
  }
}

export function isImpactError(error: unknown): error is ImpactError {
  return error instanceof ImpactError;
}

export function asImpactError(error: unknown): ImpactError {
  if (isImpactError(error)) {
    return error;
  }
  const message = error instanceof Error ? error.message : String(error);
  return new ImpactError("INTERNAL_ERROR", message);
}
