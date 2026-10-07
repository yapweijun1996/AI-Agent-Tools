import test from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import { compareContracts, exitCode } from "../src/index.js";

const ajv = new Ajv({ allowUnionTypes: true });
for (const [name, property, additional, expected, input] of [
  ["type narrowing", { type: "string" }, { type: "number" }, "potential-breaking", "accepted-before"],
  ["nested narrowing", { type: "object", properties: { x: { type: "string" } } }, { type: "object", properties: { x: { type: "number" } } }, "potential-breaking", { x: "accepted-before" }],
  ["same schema", { type: "string" }, { type: "string" }, "compatible", "accepted-before"],
  ["type broadening", { type: "string" }, { type: ["string", "number"] }, "compatible", "accepted-before"],
  ["unconstrained schema", { type: "string" }, {}, "compatible", "accepted-before"],
  ["open boolean", { type: "string" }, true, "compatible", "accepted-before"],
  ["closed boolean", { type: "string" }, false, "potential-breaking", "accepted-before"],
]) {
  test(`removed property applies additionalProperties: ${name}`, () => {
    const before = { type: "object", properties: { item: property }, additionalProperties: additional };
    const after = { type: "object", additionalProperties: additional };
    const sample = { item: input };
    assert.equal(ajv.compile(before)(sample), true);
    assert.equal(ajv.compile(after)(sample), expected === "compatible");
    const result = compareContracts(before, after);
    assert.equal(result.status, expected);
    assert.equal(result.complete, true);
    assert.equal(exitCode(result), expected === "compatible" ? 0 : 1);
  });
}

test("removed property with unproved pattern acceptance remains unknown", () => {
  const result = compareContracts(
    { type: "object", properties: { item: { type: "string", pattern: "^a+$" } }, additionalProperties: { type: "string", pattern: "a+" } },
    { type: "object", additionalProperties: { type: "string", pattern: "a+" } },
  );
  assert.equal(result.status, "unknown");
  assert.equal(result.complete, false);
  assert.equal(exitCode(result), 3);
  assert.equal(result.data.changes[0].pointer, "/properties/item/pattern");
});

test("removed false property schema can broaden to schema-valued additionalProperties", () => {
  const result = compareContracts(
    { type: "object", properties: { item: false }, additionalProperties: { type: "string" } },
    { type: "object", additionalProperties: { type: "string" } },
  );
  assert.equal(result.status, "compatible");
  assert.equal(result.complete, true);
});
