import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import { capabilities, checkFile } from "../src/index.js";

const schema = JSON.parse(readFileSync("schema/agent-cfml-check-result-v1.schema.json", "utf8"));
const validator = new Ajv2020({ strict: false }).compile(schema);

function assertValidEnvelope(envelope: unknown): void {
  assert.equal(validator(envelope), true, JSON.stringify(validator.errors));
}

test("JSON Schema validates capabilities and completed check envelopes", () => {
  assertValidEnvelope(capabilities());
  assertValidEnvelope(checkFile({ root: process.cwd(), file: "fixtures/valid.cfm" }).envelope);
  assertValidEnvelope(checkFile({ root: process.cwd(), file: "fixtures/misnested.cfm" }).envelope);
});

test("JSON Schema validates incomplete and error envelopes", () => {
  const root = mkdtempSync("agent-cfml-check-schema-");
  const file = `${root}/unknown.cfm`;
  writeFileSync(file, "<cfunknown />", "utf8");
  try {
    assertValidEnvelope(checkFile({ root, file }).envelope);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
  assertValidEnvelope(checkFile({ root: process.cwd(), file: "fixtures/missing.cfm" }).envelope);
});

test("JSON Schema rejects an envelope with an inconsistent completion flag", () => {
  const invalid = { ...capabilities(), complete: false };
  assert.equal(validator(invalid), false);
});
