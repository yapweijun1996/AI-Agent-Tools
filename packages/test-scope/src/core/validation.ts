import type { BaseRequest, ChangedFileInput, ChangedInput, ExplainRequest, PlanRequest, Request, Result, VersionedExternalEvidence } from "../types.js";

export interface ValidationOutcome<T> {
  valid: boolean;
  value?: T;
  errors: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function unknownKeys(value: Record<string, unknown>, allowed: readonly string[]): string[] {
  const known = new Set(allowed);
  return Object.keys(value).filter(key => !known.has(key)).sort();
}

function validateStringArray(value: unknown, field: string, errors: string[]): value is string[] {
  if (value === undefined) return true;
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || item.length === 0)) {
    errors.push(`${field} must be an array of non-empty strings`);
    return false;
  }
  return true;
}

function validateBase(value: Record<string, unknown>, errors: string[]): value is Record<string, unknown> & BaseRequest {
  if (typeof value.root !== "string" || value.root.length === 0) errors.push("root must be a non-empty string");
  validateStringArray(value.include, "include", errors);
  validateStringArray(value.exclude, "exclude", errors);
  if (value.limit !== undefined && (!Number.isInteger(value.limit) || Number(value.limit) < 1 || Number(value.limit) > 200)) errors.push("limit must be an integer from 1 to 200");
  return errors.length === 0;
}

function validateExternal(value: unknown, field: string, errors: string[]): value is VersionedExternalEvidence | undefined {
  if (value === undefined) return true;
  if (!isRecord(value) || typeof value.schemaVersion !== "string" || value.schemaVersion.length === 0) {
    errors.push(`${field} must be a versioned object with a non-empty schemaVersion`);
    return false;
  }
  return true;
}

function validateChanged(value: unknown, errors: string[]): value is ChangedInput[] {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("changed must be a non-empty array");
    return false;
  }
  for (const item of value) {
    if (typeof item === "string") {
      if (item.length === 0) errors.push("changed paths must be non-empty strings");
      continue;
    }
    if (!isRecord(item) || typeof item.path !== "string" || item.path.length === 0) {
      errors.push("changed entries must be paths or objects with a non-empty path");
      continue;
    }
    const allowed: readonly string[] = ["path", "status", "oldPath"];
    for (const key of unknownKeys(item, allowed)) errors.push(`changed entry contains unsupported property ${key}`);
    if (item.status !== undefined && !["added", "modified", "deleted", "renamed", "unsupported"].includes(String(item.status))) errors.push("changed.status is unsupported");
    if (item.oldPath !== undefined && (typeof item.oldPath !== "string" || item.oldPath.length === 0)) errors.push("changed.oldPath must be a non-empty string");
  }
  return errors.length === 0;
}

function validateCommonKeys(value: Record<string, unknown>, errors: string[], extra: readonly string[]): void {
  for (const key of unknownKeys(value, ["operation", "root", "include", "exclude", "limit", ...extra])) errors.push(`request contains unsupported property ${key}`);
}

export function validateRequest(input: unknown): ValidationOutcome<Request> {
  const errors: string[] = [];
  if (!isRecord(input)) return { valid: false, errors: ["request must be an object"] };
  const operation = input.operation;
  if (typeof operation !== "string" || !["capabilities", "discover", "plan", "explain"].includes(operation)) errors.push("operation must be capabilities, discover, plan, or explain");
  if (operation === "capabilities") {
    for (const key of unknownKeys(input, ["operation", "root"])) errors.push(`request contains unsupported property ${key}`);
    if (typeof input.root !== "string" || input.root.length === 0) errors.push("root must be a non-empty string");
  } else if (operation === "discover") {
    validateCommonKeys(input, errors, []);
    validateBase(input, errors);
  } else if (operation === "plan") {
    validateCommonKeys(input, errors, ["changed", "projectProfile", "symbolEvidence", "impactEvidence"]);
    validateBase(input, errors);
    validateChanged(input.changed, errors);
    validateExternal(input.projectProfile, "projectProfile", errors);
    validateExternal(input.symbolEvidence, "symbolEvidence", errors);
    validateExternal(input.impactEvidence, "impactEvidence", errors);
  } else if (operation === "explain") {
    validateCommonKeys(input, errors, ["changed", "target", "projectProfile", "symbolEvidence", "impactEvidence"]);
    validateBase(input, errors);
    validateChanged(input.changed, errors);
    validateExternal(input.projectProfile, "projectProfile", errors);
    validateExternal(input.symbolEvidence, "symbolEvidence", errors);
    validateExternal(input.impactEvidence, "impactEvidence", errors);
    if (!isRecord(input.target)) {
      errors.push("target must be an object");
    } else {
      for (const key of unknownKeys(input.target, ["path", "command"])) errors.push(`target contains unsupported property ${key}`);
      if (input.target.path !== undefined && (typeof input.target.path !== "string" || input.target.path.length === 0)) errors.push("target.path must be a non-empty string");
      if (input.target.command !== undefined && (typeof input.target.command !== "string" || input.target.command.length === 0)) errors.push("target.command must be a non-empty string");
      if (input.target.path === undefined && input.target.command === undefined) errors.push("target must include path or command");
      if (input.target.path !== undefined && input.target.command !== undefined) errors.push("target must identify either a path or a command, not both");
    }
  }
  if (errors.length > 0) return { valid: false, errors: [...new Set(errors)] };
  return { valid: true, value: input as unknown as Request, errors: [] };
}

export function changedPath(item: ChangedInput): string {
  return typeof item === "string" ? item : item.path;
}

export function changedStatus(item: ChangedInput): ChangedFileInput["status"] {
  return typeof item === "string" ? undefined : item.status;
}

export function validateResult(result: Result): ValidationOutcome<Result> {
  const errors: string[] = [];
  if (result.schemaVersion !== "1") errors.push("schemaVersion must be 1");
  if (!["complete", "partial", "error"].includes(result.status)) errors.push("status is invalid");
  if (!result.data || typeof result.data !== "object") errors.push("data must be an object");
  if (!Array.isArray(result.diagnostics)) errors.push("diagnostics must be an array");
  if (!result.truncation || typeof result.truncation.truncated !== "boolean" || !Array.isArray(result.truncation.reasons)) errors.push("truncation is invalid");
  if (!result.stats || typeof result.stats !== "object") errors.push("stats must be an object");
  return errors.length === 0 ? { valid: true, value: result, errors: [] } : { valid: false, errors };
}
