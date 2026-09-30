import test from "node:test";
import assert from "node:assert/strict";
import {
  compareContracts,
  selectPointer,
  encodeResult,
  readJson,
} from "../src/index.js";
const status = (a, b) => compareContracts(a, b).status;
for (const [name, a, b, want] of [
  ["unchanged", { type: "string" }, { type: "string" }, "compatible"],
  ["narrow type", {}, { type: "string" }, "potential-breaking"],
  [
    "null removed",
    { type: ["string", "null"] },
    { type: "string" },
    "potential-breaking",
  ],
  ["integer to number", { type: "integer" }, { type: "number" }, "compatible"],
  [
    "number to integer",
    { type: "number" },
    { type: "integer" },
    "potential-breaking",
  ],
  [
    "required added",
    { type: "object" },
    { type: "object", required: ["id"] },
    "potential-breaking",
  ],
  ["required removed", { required: ["id"] }, {}, "compatible"],
  ["enum removed", { enum: ["a", "b"] }, { enum: ["a"] }, "potential-breaking"],
  ["enum expanded", { enum: ["a"] }, { enum: ["a", "b"] }, "compatible"],
  ["minimum tightened", { minimum: 1 }, { minimum: 2 }, "potential-breaking"],
  ["max loosened", { maxLength: 2 }, { maxLength: 3 }, "compatible"],
  ["pattern changed", { pattern: "\\S" }, { pattern: "^.*\\S.*$" }, "unknown"],
  ["unsupported refs", { $ref: "#/x" }, { $ref: "#/x" }, "unknown"],
  [
    "closed optional added",
    { additionalProperties: false },
    { additionalProperties: false, properties: { x: { type: "string" } } },
    "compatible",
  ],
  [
    "open optional constrained",
    {},
    { properties: { x: { type: "string" } } },
    "potential-breaking",
  ],
  [
    "closed property removed",
    { properties: { x: {} }, additionalProperties: false },
    { additionalProperties: false },
    "potential-breaking",
  ],
  ["boolean schema", true, false, "potential-breaking"],
])
  test(name, () => assert.equal(status(a, b), want));
test("enum payload evidence fingerprint only", () =>
  assert.ok(
    !JSON.stringify(
      compareContracts({ enum: ["sk-proj-secret123456"] }, { enum: ["other"] }),
    ).includes("secret"),
  ));
test("pointer escapes and Unicode", () =>
  assert.equal(
    compareContracts(
      { properties: { "用户/a": { type: "string" } } },
      { properties: { "用户/a": { type: "number" } } },
    ).data.changes[0].pointer,
    "/properties/用户~1a/type",
  ));
test("MCP schema pointer extraction", () =>
  assert.deepEqual(
    selectPointer(
      { tools: [{ inputSchema: { type: "object" } }] },
      "/tools/0/inputSchema",
    ),
    { type: "object" },
  ));
test("bad pointer", () => assert.throws(() => selectPointer({}, "/~2")));
for (const input of [
  null,
  [],
  { type: "wat" },
  { required: ["a", "a"] },
  { minLength: -1 },
  { items: [] },
])
  test("reject malformed " + JSON.stringify(input), () =>
    assert.throws(() => compareContracts(input, {})),
  );
test("output budget", () =>
  assert.equal(
    JSON.parse(encodeResult({ large: "x".repeat(70000) })).status,
    "unknown",
  ));
test("credential file blocked", () => assert.throws(() => readJson(".env")));
test("deterministic order", () =>
  assert.deepEqual(
    compareContracts(
      { properties: { b: {}, a: {} } },
      { properties: { a: { type: "string" }, b: { type: "number" } } },
    ),
    compareContracts(
      { properties: { a: {}, b: {} } },
      { properties: { b: { type: "number" }, a: { type: "string" } } },
    ),
  ));
test("real nonblank pattern case includes substring/fullmatch evidence", () => {
  const r = compareContracts(
    { pattern: "\\S" },
    { pattern: "^.*\\S.*$" },
    { samples: ["hello", " hello ", "\nhello\n", "   "] },
  );
  assert.equal(r.status, "potential-breaking");
  assert.equal(r.complete, false);
  assert.deepEqual(r.data.changes[0].samples[0], {
    index: 0,
    before: { substring: true, fullMatch: false },
    after: { substring: true, fullMatch: true },
  });
  assert.ok(!JSON.stringify(r).includes("hello"));
});
test("bad sample payload", () =>
  assert.throws(() => compareContracts({}, {}, { samples: [{}] })));
test("regex pathological sample bounded", () => {
  const start = Date.now();
  const r = compareContracts(
    { pattern: "a" },
    { pattern: "^(a+)+$" },
    { samples: ["a".repeat(100) + "!"] },
  );
  assert.equal(r.status, "unknown");
  assert.ok(Date.now() - start < 3000);
});
test("other schema drafts unknown", () =>
  assert.equal(
    status({ $schema: "https://json-schema.org/draft/2020-12/schema" }, {}),
    "unknown",
  ));
test("malformed regex rejected", () =>
  assert.throws(() => compareContracts({ pattern: "[" }, {})));
test("escaped prototype field does not inherit missing before property", () =>
  assert.equal(
    status({}, JSON.parse('{"properties":{"__proto__":{"type":"string"}}}')),
    "potential-breaking",
  ));
test("schema depth budget", () => {
  let a = {};
  for (let i = 0; i < 34; i++) a = { items: a };
  assert.throws(() => compareContracts(a, {}));
});
test("unsupported keyword plus breaking incomplete", () => {
  const r = compareContracts(
    { format: "email", type: ["null", "string"] },
    { format: "email", type: "string" },
  );
  assert.equal(r.status, "potential-breaking");
  assert.equal(r.complete, false);
});
test("unsupported semantics in newly added branch remain incomplete", () => {
  const r = compareContracts(
    { additionalProperties: false },
    { additionalProperties: false, properties: { x: { $ref: "#/hidden" } } },
  );
  assert.equal(r.status, "unknown");
  assert.equal(r.complete, false);
});
