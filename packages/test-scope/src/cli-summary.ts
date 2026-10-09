import type { CommandRecommendation, Evidence, EvidenceType, Result, TestRecommendation, VerificationLevel, VerificationPlan } from "./types.js";

type RecommendationSummary<T extends { evidence: Evidence[] }> = Omit<T, "evidence"> & {
  evidenceCount: number;
  evidenceTypes: EvidenceType[];
};

interface LevelSummary {
  tests: Array<RecommendationSummary<TestRecommendation>>;
  commands: Array<RecommendationSummary<CommandRecommendation>>;
}

interface PlanSummary extends Omit<VerificationPlan, "minimum" | "recommended" | "release"> {
  minimum: LevelSummary;
  recommended: LevelSummary;
  release: LevelSummary;
}

export interface PlanSummaryResult extends Omit<Result, "data"> {
  view: "summary";
  omitted: Array<"recommendation-evidence">;
  data: { plan?: PlanSummary };
}

function recommendation<T extends { evidence: Evidence[] }>(value: T): RecommendationSummary<T> {
  const { evidence, ...fields } = value;
  return { ...fields, evidenceCount: evidence.length, evidenceTypes: [...new Set(evidence.map(item => item.type))].sort() };
}

function level(value: VerificationLevel): LevelSummary {
  return { tests: value.tests.map(recommendation), commands: value.commands.map(recommendation) };
}

// A CLI view only: the core result and every planning decision remain unchanged.
export function toPlanSummary(result: Result): PlanSummaryResult {
  const plan = result.data.plan;
  return {
    ...result,
    view: "summary",
    omitted: plan ? ["recommendation-evidence"] : [],
    data: plan ? { plan: { ...plan, minimum: level(plan.minimum), recommended: level(plan.recommended), release: level(plan.release) } } : {}
  };
}
