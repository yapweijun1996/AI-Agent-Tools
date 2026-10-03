import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import Ajv2020 from "ajv/dist/2020.js";
import { capabilities, encodeResult, failure, packContext } from "../src/index.js";
import { entry, envelopeOf, EXAMPLES, manifestOf, options, PACKAGE_ROOT, setup, withRoot, writeJson } from "./fixture.js";

const load = (name) => JSON.parse(fs.readFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url), "utf8"));
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validateResult = ajv.compile(load("result"));
const validateRequest = ajv.compile(load("request"));
const validResult = (result) => assert.equal(validateResult(result), true, JSON.stringify(validateResult.errors));
const CODES = [
  ["INVALID_INPUT", "error"], ["INVALID_ENCODING", "error"], ["INPUT_IO", "error"], ["UNSAFE_PATH", "error"], ["INTERNAL_ERROR", "error"],
  ["UNSUPPORTED_INPUT", "incomplete"], ["UNSUPPORTED_CONTRACT", "incomplete"], ["INCOMPLETE_EVIDENCE", "incomplete"],
  ["SNAPSHOT_MISMATCH", "incomplete"], ["ARTIFACT_MISMATCH", "incomplete"], ["MANDATORY_OVERFLOW", "incomplete"],
  ["BUDGET_TOO_SMALL", "incomplete"], ["RESOURCE_LIMIT", "incomplete"], ["INPUT_CHANGED", "incomplete"],
];

test("the shipped example manifest and every manifest used by the package validate against the request schema", () => withRoot((root) => {
  const example = JSON.parse(fs.readFileSync(path.join(EXAMPLES, "manifest.json"), "utf8"));
  assert.equal(validateRequest(example), true, JSON.stringify(validateRequest.errors));
  const manifest = setup(root, [{ n: 1 }], [{ mandatory: true, priority: 7, sha256: "a".repeat(64), locators: [{ path: "src/a.js", start_line: 1, end_line: 2 }] }]);
  assert.equal(validateRequest(manifest), true, JSON.stringify(validateRequest.errors));
  for (const bad of [{ ...manifest, extra: 1 }, { ...manifest, budget: { unit: "tokens", max: 4096 } }, { ...manifest, budget: { unit: "utf8-bytes", max: 10 } },
    { ...manifest, items: [] }, { ...manifest, profile: "other" }, { ...manifest, items: [{ ...manifest.items[0], priority: -1 }] }]) {
    assert.equal(validateRequest(bad), false, JSON.stringify(bad));
  }
}));

test("capabilities, successful packs and omissions conform to the result schema", () => withRoot((root) => {
  validResult(capabilities());
  validResult(packContext({ root: PACKAGE_ROOT, manifest: "examples/manifest.json" }));
  setup(root, [{ n: 1 }, { n: 2 }, { n: 2 }], [{ mandatory: true }, { priority: 4 }, { priority: 3 }], { budget: { unit: "utf8-bytes", max: 1500 } });
  const result = packContext(options(root));
  assert.equal(result.status, "ok");
  validResult(result);
  validResult(JSON.parse(encodeResult(result)));
}));

test("every documented failure category conforms to the result schema", () => withRoot((root) => {
  for (const [code, status] of CODES) {
    const result = failure(code);
    assert.equal(result.status, status, code);
    validResult(result);
  }
  validResult(packContext(options(root)));
  validResult(JSON.parse(encodeResult(failure("RESOURCE_LIMIT", { max_output_bytes: 1024 }))));
  writeJson(root, "art/a.json", envelopeOf({ n: 1 }));
  writeJson(root, "manifest.json", manifestOf([entry("a", "art/a.json", { snapshot: "other" })]));
  validResult(packContext(options(root)));
}));

test("result schema rejects inconsistent status, completeness, data, errors and extra fields", () => withRoot((root) => {
  setup(root, [{ n: 1 }]);
  const result = packContext(options(root));
  for (const inconsistent of [
    { ...result, schema_version: "2.0.0" }, { ...result, complete: false }, { ...result, data: null },
    { ...result, errors: [{ code: "INPUT_IO", message: "missing" }] }, { ...result, status: "incomplete" },
    { ...result, status: "partial" }, { ...result, raw_artifact: "private text" }, { ...result, warnings: [{ code: "X_Y", message: "m" }] },
    { ...failure("RESOURCE_LIMIT"), data: result.data }, { ...failure("INVALID_INPUT"), errors: [] },
    { ...failure("INVALID_INPUT"), status: "incomplete" }, { ...failure("RESOURCE_LIMIT"), status: "error" },
    { ...result, data: { ...result.data, budget: { ...result.data.budget, unit: "tokens" } } },
    { ...result, data: { ...result.data, content_trust: "trusted" } },
    { ...result, data: { ...result.data, omitted: [{ id: "a", reason: "relevance", duplicate_of: null }] } },
    { ...result, tool: { id: "agent-context-pack", version: "9.9.9" } },
  ]) assert.equal(validateResult(inconsistent), false, JSON.stringify(inconsistent).slice(0, 200));
}));
