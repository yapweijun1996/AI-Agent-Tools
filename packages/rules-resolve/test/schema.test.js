import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { capabilities, encodeResult, failure, resolveRules } from "../src/index.js";

const schema = JSON.parse(fs.readFileSync(new URL("../schema/result.schema.json", import.meta.url), "utf8"));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
const valid = (result) => assert.equal(validate(result), true, JSON.stringify(validate.errors));
function fixture(callback) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rules-resolve-schema-")));
  try { return callback(root); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const options = (root, extra = {}) => ({ root, target: ".", targetKind: "directory", profile: "agents-chain-v1", ...extra });

test("capabilities, empty chains, ignored sources and content opt-in conform to the result schema", () => fixture((root) => {
  valid(capabilities());
  valid(resolveRules(options(root)));
  fs.writeFileSync(path.join(root, "AGENTS.override.md"), " \n");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "Root rules\n");
  valid(resolveRules(options(root)));
  valid(resolveRules(options(root, { includeContent: true })));
  fs.writeFileSync(path.join(root, "AGENTS.override.md"), "Override\n");
  valid(resolveRules(options(root)));
}));

test("every documented failure category and serialization overflow conforms to the schema", () => fixture((root) => {
  for (const [code, status] of [
    ["INVALID_INPUT", "error"], ["INVALID_ENCODING", "error"], ["INPUT_IO", "error"],
    ["UNSAFE_PATH", "error"], ["INTERNAL_ERROR", "error"],
    ["UNSUPPORTED_PROFILE", "incomplete"], ["RESOURCE_LIMIT", "incomplete"], ["INPUT_CHANGED", "incomplete"],
  ]) valid(failure(code, status));
  valid(resolveRules(options(root, { profile: "unsupported" })));
  valid(resolveRules(options(root, { target: "../outside" })));
  fs.writeFileSync(path.join(root, "AGENTS.md"), "x".repeat(3000));
  valid(JSON.parse(encodeResult(resolveRules(options(root, { includeContent: true, limits: { max_output_bytes: 1024 } })))));
}));

test("result schema rejects inconsistent status, completeness, data and errors", () => fixture((root) => {
  const result = resolveRules(options(root));
  for (const inconsistent of [
    { ...result, schema_version: "2.0.0" }, { ...result, complete: false }, { ...result, data: null },
    { ...result, errors: [{ code: "INPUT_IO", message: "missing" }] }, { ...result, status: "incomplete" },
    { ...result, status: "partial" }, { ...result, raw_source: "private text" },
    { ...failure("RESOURCE_LIMIT", "incomplete"), data: result.data },
    { ...failure("INVALID_INPUT"), errors: [] },
  ]) assert.equal(validate(inconsistent), false, JSON.stringify(inconsistent));
}));

test("result schema makes content presence agree with explicit include_content", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "AGENTS.md"), "rules\n");
  const hidden = resolveRules(options(root));
  const visible = resolveRules(options(root, { includeContent: true }));
  const leaked = structuredClone(hidden);
  leaked.data.sources[0].content = "rules\n";
  assert.equal(validate(leaked), false);
  const omitted = structuredClone(visible);
  delete omitted.data.sources[0].content;
  assert.equal(validate(omitted), false);
  for (const patch of [{ sha256: "wrong" }, { order: 0 }, { bytes: -1 }, { lines: 0 }, { accidental: true }]) {
    const malformed = structuredClone(hidden);
    Object.assign(malformed.data.sources[0], patch);
    assert.equal(validate(malformed), false);
  }
}));

test("result schema rejects invalid effective limit values and unknown limit keys", () => {
  for (const patch of [{ max_depth: 65 }, { max_files: 0 }, { max_output_bytes: 1023 }, { max_duration_ms: "5000" }, { extra: 1 }]) {
    const malformed = capabilities();
    Object.assign(malformed.meta.limits, patch);
    assert.equal(validate(malformed), false);
  }
});
