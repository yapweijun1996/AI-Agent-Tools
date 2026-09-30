import test from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import { readFileSync } from "node:fs";
import { capabilities } from "../src/index.js";
test("published result schema validates capabilities", () => {
  const validate = new Ajv().compile(
    JSON.parse(
      readFileSync(new URL("../schema/result.schema.json", import.meta.url)),
    ),
  );
  assert.equal(validate(capabilities()), true, JSON.stringify(validate.errors));
});
