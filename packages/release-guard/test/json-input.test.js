import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { runCli } from "../src/cli.js";
import { readJson } from "../src/index.js";

const fixture = readFileSync(new URL("../examples/server-pass.json", import.meta.url), "utf8");
function withInput(text, operation) {
  const root = mkdtempSync(join(tmpdir(), "release-guard-json-"));
  try {
    const file = join(root, "evidence.json");
    writeFileSync(file, text);
    return operation(file);
  } finally { rmSync(root, { recursive: true, force: true }); }
}
for (const fields of [
  '"conclusion":"fail","conclusion":"pass"',
  '"conclusion":"pass","conclusion":"fail"',
  '"conclusion":"fail","concl\\u0075sion":"pass"',
]) {
  test(`deployment rejects ambiguous conclusion keys: ${fields}`, () => {
    withInput(fixture.replace('"conclusion": "pass"', fields), file => {
      const result = runCli(["deploy-verify", "--input", file, "--json"]);
      assert.equal(result.code, 2);
      const parsed = JSON.parse(result.stdout);
      assert.equal(parsed.status, "error");
      assert.equal(parsed.complete, false);
      assert.equal(parsed.data, null);
    });
  });
}
test("evidence reader rejects duplicate fields at the root and inside arrays", () => {
  for (const text of ['{"ci":[],"ci":[]}', '{"ci":[{"id":"first","id":"last"}]}']) {
    withInput(text, file => assert.throws(() => readJson(file), { code: "INVALID_INPUT" }));
  }
});
test("reader bounds nesting before parsing", () => {
  withInput("[".repeat(32) + "null" + "]".repeat(32), file => assert.ok(Array.isArray(readJson(file))));
  withInput("[".repeat(33) + "null" + "]".repeat(33), file => assert.throws(() => readJson(file), { code: "INVALID_INPUT" }));
});
test("repeated names in separate objects and key-like strings remain valid", () => {
  const value = { rows: [{ id: "one" }, { id: "two" }], text: '"id":"one","id":"two"', number: -1.5e3 };
  withInput(JSON.stringify(value), file => assert.deepEqual(readJson(file), value));
});
test("unambiguous deployment pass and fail keep their native exit codes", () => {
  for (const [text, status, code] of [[fixture, "pass", 0], [fixture.replace('"conclusion": "pass"', '"conclusion": "fail"'), "fail", 1]]) {
    withInput(text, file => {
      const result = runCli(["deploy-verify", "--input", file, "--json"]);
      assert.equal(result.code, code);
      assert.equal(JSON.parse(result.stdout).status, status);
    });
  }
});
