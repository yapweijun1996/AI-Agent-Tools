import {
  capabilities, checkPatch, encodeResult, exitCode,
  type CheckData, type Origin, type Policy,
} from "agent-patch-guard";

const policy: Policy = {
  schema_version: "1.0.0",
  allowed_paths: ["src/"],
  content_rules: [{ id: "DEBUG_OUTPUT", needle: "console.log(", severity: "warning" }],
  exceptions: [{ rule_id: "DEBUG_OUTPUT", paths: ["src/logger.js"] }],
};
const origin: Origin = "snapshot";
const result = checkPatch("", policy, { origin, limits: { max_files: 8 } });
const data: CheckData | null = result.data;
if (data) {
  const count: number = data.summary.files;
  const verdict: "pass" | "violations" = data.verdict;
  void count;
  void verdict;
}
encodeResult(result);
exitCode(result);
encodeResult(capabilities());

// @ts-expect-error Origins describe supplied evidence and exclude an inferred Git state.
checkPatch("", policy, { origin: "auto" });
// @ts-expect-error The supported policy format is versioned explicitly.
const badVersion: Policy = { schema_version: "2.0.0", allowed_paths: ["*"] };
void badVersion;
