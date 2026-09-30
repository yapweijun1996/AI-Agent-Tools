import { compareCodePoint, EvidenceStore } from "./evidence.js";
import type { DiagnosticDraft } from "./diagnostics.js";
import type { EvidenceToken, Profile } from "../types.js";

export type DraftProfile = Omit<Profile, "evidence" | "warnings"> & {
  warnings: DiagnosticDraft[];
};

export function finalizeDraft(draft: DraftProfile, evidence: EvidenceStore): Profile {
  const used = new Set<EvidenceToken>();
  collectEvidenceTokens(draft, used);
  const materialized = evidence.materialize(used);
  const mapped = mapEvidenceFields(draft, materialized.ids) as Omit<Profile, "evidence">;
  const profile = {
    ...mapped,
    evidence: materialized.records,
  } as Profile;
  profile.warnings.sort((left, right) => {
    const codeOrder = compareCodePoint(left.code, right.code);
    if (codeOrder !== 0) return codeOrder;
    const pathOrder = compareCodePoint(left.path ?? "", right.path ?? "");
    if (pathOrder !== 0) return pathOrder;
    const evidenceOrder = compareCodePoint(left.evidence.join("\u0000"), right.evidence.join("\u0000"));
    if (evidenceOrder !== 0) return evidenceOrder;
    return compareCodePoint(left.message, right.message);
  });
  return profile;
}

function collectEvidenceTokens(value: unknown, target: Set<EvidenceToken>): void {
  if (Array.isArray(value)) {
    for (const item of value) collectEvidenceTokens(item, target);
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence" && Array.isArray(child)) {
      for (const token of child) if (typeof token === "string") target.add(token);
    } else {
      collectEvidenceTokens(child, target);
    }
  }
}

function mapEvidenceFields(value: unknown, ids: ReadonlyMap<EvidenceToken, string>): unknown {
  if (Array.isArray(value)) return value.map((item) => mapEvidenceFields(item, ids));
  if (typeof value !== "object" || value === null) return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === "evidence" && Array.isArray(child)) {
      output[key] = Array.from(new Set(child.filter((token): token is string => typeof token === "string").map((token) => ids.get(token)).filter((id): id is string => id !== undefined))).sort(compareCodePoint);
    } else {
      output[key] = mapEvidenceFields(child, ids);
    }
  }
  return output;
}
