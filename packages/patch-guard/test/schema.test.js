import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { capabilities, checkPatch, encodeResult } from "../src/index.js";

const ajv = new Ajv2020({ allErrors: true, strict: true });
const readSchema = (name) => JSON.parse(fs.readFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url), "utf8"));
const validatePolicy = ajv.compile(readSchema("policy"));
const validateResult = ajv.compile(readSchema("result"));
const policy = { schema_version: "1.0.0", allowed_paths: ["*"] };
const diff = "diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-old\n+TODO\n";
const valid = (validate, value) => assert.equal(validate(value), true, JSON.stringify(validate.errors));

test("actual capability, empty, finding, exception and all failure classes conform to result schema", () => {
  const cases = [
    capabilities(),
    checkPatch("", policy),
    checkPatch(diff, { ...policy, allowed_paths: ["docs/"] }),
    checkPatch(diff, { ...policy, content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "warning" }], exceptions: [{ rule_id: "NO_TODO", paths: ["src/"] }] }),
    checkPatch(diff, { schema_version: "1.0.0", allowed_paths: [] }),
    checkPatch("diff --cc a.js\n", policy),
    checkPatch(diff.replaceAll("src/a.js", "../a.js"), policy),
    checkPatch(diff, policy, { limits: { max_changed_lines: 1 } }),
    JSON.parse(encodeResult(checkPatch(Array.from({ length: 10 }, (_, index) => diff.replaceAll("src/a.js", `src/file${index}.js`)).join(""), policy, { limits: { max_output_bytes: 1024 } }))),
  ];
  for (const result of cases) valid(validateResult, result);
});

test("schema enforces complete/status/data/errors consistency rather than only object shape", () => {
  const complete = checkPatch("", policy);
  for (const inconsistent of [
    { ...complete, complete: false },
    { ...complete, data: null },
    { ...complete, errors: [{ code: "UNSUPPORTED_INPUT", message: "unsupported" }] },
    { ...complete, status: "incomplete" },
    { ...complete, status: "partial" },
    { ...complete, accidental_source: "private source" },
  ]) assert.equal(validateResult(inconsistent), false);
});

test("published policy schema accepts explicit directory, exact and whole-root scope", () => {
  for (const value of [
    policy,
    { ...policy, allowed_paths: ["src/", "README.md"] },
    { ...policy, protected_paths: [], generated_paths: ["generated/"], lockfile_paths: ["package-lock.json"] },
    { ...policy, allow_deletions: true, allow_renames: true, allow_binary: true, allow_symlinks: true, allow_generated: true, allow_lockfiles: true },
    { ...policy, max_files: 256, max_added_lines: 20000, max_deleted_lines: 0 },
    { ...policy, content_rules: [{ id: "NO_DEBUG", needle: "console.log(", severity: "error" }], exceptions: [{ rule_id: "NO_DEBUG", paths: ["src/diagnostics.js"] }] },
  ]) {
    valid(validatePolicy, value);
    assert.equal(checkPatch("", value).status, "ok");
  }
});

test("published policy schema rejects unknown keys, unsafe selectors and out-of-contract caps", () => {
  for (const value of [
    {}, { ...policy, schema_version: "2.0.0" }, { ...policy, allowed_paths: [] },
    { ...policy, allowed_paths: ["*"] , random: true }, { ...policy, allowed_paths: ["src/*.js"] },
    { ...policy, allowed_paths: ["/absolute"] }, { ...policy, allowed_paths: ["src/../outside"] },
    { ...policy, allowed_paths: ["src//a.js"] }, { ...policy, allowed_paths: ["src\\a.js"] },
    { ...policy, allowed_paths: ["src/", "src/"] }, { ...policy, allow_binary: 1 },
    { ...policy, max_files: 257 }, { ...policy, max_added_lines: 20001 },
    { ...policy, content_rules: [{ id: "BAD", needle: "", severity: "error" }] },
    { ...policy, content_rules: [{ id: "BAD", needle: "\n", severity: "error" }] },
    { ...policy, content_rules: [{ id: "BAD", needle: "x", severity: "fatal" }] },
    { ...policy, exceptions: [{ rule_id: "NO_DEBUG", paths: [] }] },
    { ...policy, exceptions: [{ rule_id: "MAX_FILES", paths: ["*"] }] },
  ]) {
    assert.equal(validatePolicy(value), false, JSON.stringify(value));
    assert.equal(checkPatch("", value).status, "error");
  }
});

test("cross-field exception references and built-in conflicts remain runtime constraints", () => {
  for (const value of [
    { ...policy, exceptions: [{ rule_id: "NO_SUCH_RULE", paths: ["*"] }] },
    { ...policy, content_rules: [{ id: "DELETION", needle: "x", severity: "error" }] },
    { ...policy, content_rules: [{ id: "DUPLICATE", needle: "x", severity: "error" }, { id: "DUPLICATE", needle: "y", severity: "error" }] },
  ]) {
    valid(validatePolicy, value);
    const result = checkPatch("", value);
    assert.equal(result.status, "error");
    assert.equal(result.errors[0].code, "INVALID_INPUT");
    valid(validateResult, result);
  }
});
