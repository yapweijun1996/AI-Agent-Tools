import type { CheckLimits } from "../schema/types.js";
import { ToolFailure } from "../schema/errors.js";

export const DEFAULT_LIMITS: CheckLimits = {
  max_source_bytes: 2 * 1024 * 1024,
  max_nesting: 256,
  max_findings: 100,
  max_output_bytes: 64 * 1024,
  time_limit_ms: 5_000,
};

export const HARD_LIMITS: CheckLimits = {
  max_source_bytes: 16 * 1024 * 1024,
  max_nesting: 1_024,
  max_findings: 1_000,
  max_output_bytes: 1024 * 1024,
  time_limit_ms: 30_000,
};

function positiveInteger(value: unknown, name: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new ToolFailure("INVALID_LIMIT", `${name} must be a positive integer`, 2);
  }
  return value;
}

export function normalizeLimits(requested: Partial<CheckLimits> | undefined): CheckLimits {
  const values = { ...DEFAULT_LIMITS, ...(requested ?? {}) };
  for (const key of Object.keys(DEFAULT_LIMITS) as Array<keyof CheckLimits>) {
    const value = positiveInteger(values[key], key);
    if (value > HARD_LIMITS[key]) {
      throw new ToolFailure("INVALID_LIMIT", `${key} exceeds the hard cap of ${HARD_LIMITS[key]}`, 2);
    }
    values[key] = value;
  }
  return values;
}
