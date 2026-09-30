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
for (const name of ["requirements", "snapshot"])
  test(name + " input schema validates documented fixture", () => {
    const validate = new Ajv().compile(
      JSON.parse(
        readFileSync(
          new URL("../schema/" + name + ".schema.json", import.meta.url),
        ),
      ),
    );
    assert.equal(
      validate(
        JSON.parse(
          readFileSync(
            new URL("../examples/" + name + ".json", import.meta.url),
          ),
        ),
      ),
      true,
      JSON.stringify(validate.errors),
    );
  });
