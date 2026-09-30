import type { Evidence } from "../../contract/agent-error-lens-v1.types.js";
import { LIMITS, type BudgetState } from "./limits.js";
import { rawBoundary, type NormalizedArtifact } from "./normalize.js";

export function evidenceFor(
  view: NormalizedArtifact,
  start: number,
  end: number,
  budget: BudgetState,
  kind: Evidence["kind"],
): Evidence | null {
  const rawStart = rawBoundary(view, start);
  const rawEnd = rawBoundary(view, end);
  if (rawEnd <= rawStart) return null;
  const rawContent = view.artifact.content.slice(rawStart, rawEnd);
  const bytes = Buffer.byteLength(rawContent, "utf8");
  if (bytes > LIMITS.maxEvidenceSpanBytes) {
    budget.reasons.add("evidence-bytes");
    return null;
  }
  const key = `${view.artifact.id}:${kind}:${rawStart}:${rawEnd}`;
  if (!budget.evidenceKeys.has(key)) {
    if (budget.evidenceBytes + bytes > LIMITS.maxAggregateEvidenceBytes) {
      budget.reasons.add("evidence-bytes");
      return null;
    }
    budget.evidenceKeys.add(key);
    budget.evidenceBytes += bytes;
  }
  return {
    artifactId: view.artifact.id,
    kind,
    start: rawStart,
    end: rawEnd,
    offsetUnit: "utf16-code-unit",
  };
}
