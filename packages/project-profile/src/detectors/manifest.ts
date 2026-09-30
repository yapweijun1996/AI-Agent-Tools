import { DiagnosticCollector } from "../core/diagnostics.js";
import { EvidenceStore } from "../core/evidence.js";
import { Scanner } from "../core/scanner.js";
import type { EvidenceToken } from "../types.js";

export interface PackageManifest {
  cwd: string;
  path: string;
  data: Record<string, unknown> | null;
  valid: boolean;
  present: boolean;
  evidence: EvidenceToken[];
}

export function loadPackageManifest(
  scanner: Scanner,
  evidence: EvidenceStore,
  diagnostics: DiagnosticCollector,
  cwd: string,
): PackageManifest {
  const path = cwd === "." ? "package.json" : `${cwd}/package.json`;
  const probe = scanner.probe(path);
  if (probe.kind === "missing") return { cwd, path, data: null, valid: false, present: false, evidence: [] };
  const fileEvidence = scanner.fileEvidence(path);
  if (probe.kind !== "file") {
    diagnostics.add("MANIFEST_INVALID", "warning", "A package manifest was present but could not be inspected.", path, [fileEvidence]);
    return { cwd, path, data: null, valid: false, present: true, evidence: [fileEvidence] };
  }
  const body = scanner.readMetadata(path);
  if (body === null) {
    return { cwd, path, data: null, valid: false, present: true, evidence: [fileEvidence] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(body.text) as unknown;
  } catch {
    diagnostics.add("MANIFEST_INVALID", "warning", "A package manifest was not valid JSON.", path, [fileEvidence]);
    return { cwd, path, data: null, valid: false, present: true, evidence: [fileEvidence] };
  }
  if (!isRecord(parsed)) {
    diagnostics.add("MANIFEST_INVALID", "warning", "A package manifest must contain a JSON object.", path, [fileEvidence]);
    return { cwd, path, data: null, valid: false, present: true, evidence: [fileEvidence] };
  }
  const rootEvidence = evidence.manifest(path, "");
  return { cwd, path, data: parsed, valid: true, present: true, evidence: [rootEvidence] };
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

export function pointerFor(...segments: (string | number)[]): string {
  return `/${segments.map((segment) => String(segment).replaceAll("~", "~0").replaceAll("/", "~1")).join("/")}`;
}

export function manifestEvidence(
  evidence: EvidenceStore,
  manifest: PackageManifest,
  pointer: string,
): EvidenceToken {
  return evidence.manifest(manifest.path, pointer);
}
