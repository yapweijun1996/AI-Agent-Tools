import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import { assert, validateWithSchema } from "./helpers.js";

for (const name of ["complete", "partial", "unsupported", "error"]) {
  test(`schema example: ${name}`, () => {
    const file = path.resolve(process.cwd(), `examples/${name}.json`);
    const profile = JSON.parse(fs.readFileSync(file, "utf8")) as never;
    validateWithSchema(profile);
    assert(typeof profile === "object" && profile !== null, `${name} example is not an object`);
  });
}
