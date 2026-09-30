import type { DiagnosticSeverity, EvidenceToken } from "../types.js";

export interface DiagnosticDraft {
  code: string;
  severity: DiagnosticSeverity;
  message: string;
  path: string | null;
  evidence: EvidenceToken[];
}

const PARTIAL_CODES = new Set([
  "PACKAGE_MANAGER_CONFLICT",
  "PACKAGE_MANAGER_INVALID",
  "PACKAGE_MANAGER_UNSUPPORTED",
  "NO_PACKAGE_MANAGER",
  "WORKSPACE_TRUNCATED",
  "WORKSPACE_UNRESOLVED",
  "WORKSPACE_NAME_CONFLICT",
  "UNSUPPORTED_ECOSYSTEM",
  "MANIFEST_INVALID",
  "METADATA_UNREADABLE",
  "METADATA_TOO_LARGE",
  "RUNTIME_DECLARATION_INVALID",
  "SCAN_LIMIT_REACHED",
  "OUTPUT_TRUNCATED",
  "SYMLINK_SKIPPED",
  "PATH_OUTSIDE_ROOT",
  "REPOSITORY_CHANGED",
]);

const FATAL_CODES = new Set(["ROOT_UNREADABLE", "INVALID_ARGUMENT", "PROFILE_VALIDATION_FAILED"]);

export class DiagnosticCollector {
  private readonly values = new Map<string, DiagnosticDraft>();

  add(
    code: string,
    severity: DiagnosticSeverity,
    message: string,
    path: string | null = null,
    evidence: readonly EvidenceToken[] = [],
  ): void {
    const key = JSON.stringify([code, severity, path, message]);
    const existing = this.values.get(key);
    if (existing) {
      existing.evidence = Array.from(new Set([...existing.evidence, ...evidence]));
      return;
    }
    this.values.set(key, { code, severity, message, path, evidence: Array.from(new Set(evidence)) });
  }

  hasCode(code: string): boolean {
    return Array.from(this.values.values()).some((value) => value.code === code);
  }

  hasFatal(): boolean {
    return Array.from(this.values.values()).some((value) => FATAL_CODES.has(value.code));
  }

  hasPartialImpact(): boolean {
    return Array.from(this.values.values()).some((value) => PARTIAL_CODES.has(value.code));
  }

  hasUnsupportedOnly(): boolean {
    return Array.from(this.values.values()).some((value) => value.code === "UNSUPPORTED_ECOSYSTEM");
  }

  all(): DiagnosticDraft[] {
    return Array.from(this.values.values());
  }
}

export function isFatalCode(code: string): boolean {
  return FATAL_CODES.has(code);
}

export function hasPartialCode(code: string): boolean {
  return PARTIAL_CODES.has(code);
}
