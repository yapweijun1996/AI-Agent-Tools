import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { main } from "../dist/cli.js";

function capture(args, engine) {
  let stdout = "", stderr = "";
  const exitCode = main(args, engine, { stdout: { write(s) { stdout += s; } }, stderr: { write(s) { stderr += s; } } });
  return { stdout, stderr, exitCode, value: JSON.parse(stdout) };
}

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "test-scope budget # "));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "src")); mkdirSync(join(root, "test"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node --test" } }));
  writeFileSync(join(root, "src/value.js"), "export const value = 1;\n");
  writeFileSync(join(root, "test/value.test.js"), "import test from 'node:test'; import { value } from '../src/value.js'; test('value', () => { void value; });\n");
  return root;
}

test("output budget preserves an entire fitting plan and withholds an oversized plan", (t) => {
  const root = fixture(t);
  for (const view of [[], ["--compact"], ["--summary"], ["--summary", "--compact"]]) {
    const args = ["plan", "--root", root, "--changed", "src/value.js", ...view];
    const full = capture(args);
    const fitting = capture([...args, "--max-output-bytes", "65536"]);
    assert.equal(fitting.stdout, full.stdout);
    assert.equal(fitting.stderr, full.stderr);
    assert.equal(fitting.exitCode, full.exitCode);
    const bounded = capture([...args, "--max-output-bytes", "1024"]);
    assert.ok(Buffer.byteLength(bounded.stdout) <= 1024);
    assert.equal(bounded.value.status, "partial");
    assert.deepEqual(bounded.value.data, {});
    assert.equal(bounded.value.truncation.truncated, true);
    assert.equal(bounded.value.diagnostics[0].code, "RESOURCE_LIMIT");
    assert.equal(bounded.value.diagnostics[0].details.actualBytes, Buffer.byteLength(full.stdout));
    assert.match(bounded.stderr, /results withheld/);
    assert.equal(bounded.exitCode, 0); // Existing partial-result exit contract.
    if (view.includes("--summary")) assert.deepEqual(bounded.value.omitted, []);
  }
});

test("output budget counts UTF-8 and final newline, and bounds diagnostic output", () => {
  const result = { schemaVersion: "1", status: "partial", data: {}, diagnostics: [{ code: "IMPORT_RESOLUTION_PARTIAL", message: "漢".repeat(600), severity: "warning" }], truncation: { truncated: false, reasons: [] }, stats: {} };
  const engine = { execute() { return result; } };
  const args = ["discover", "--root", ".", "--compact"];
  const full = capture(args, engine);
  const size = Buffer.byteLength(full.stdout);
  assert.equal(capture([...args, "--max-output-bytes", String(size)], engine).stdout, full.stdout);
  const bounded = capture([...args, "--max-output-bytes", String(size - 1)], engine);
  assert.deepEqual(bounded.value.data, {});
  assert.equal(bounded.value.diagnostics[0].details.withheldDiagnostics, 1);
  assert.ok(Buffer.byteLength(bounded.stderr) < 512);
  assert.equal(result.diagnostics[0].message, "漢".repeat(600));
});

test("invalid output budgets and malformed options reject before source analysis", () => {
  const invalid = { schemaVersion: "1", status: "error", data: {}, diagnostics: [], truncation: { truncated: false, reasons: [] }, stats: {} };
  const engine = { execute(request) { assert.deepEqual(request, {}); return invalid; } };
  for (const tail of [["--max-output-bytes", "1023"], ["--max-output-bytes", "8388609"], ["--max-output-bytes", "NaN"], ["--max-output-bytes", "1.5"], ["--max-output-bytes", "1024", "--max-output-bytes", "2048"], ["--unknown", "value"]]) {
    const run = capture(["plan", "--root", "unreadable-root", "--changed", "src/value.js", ...tail], engine);
    assert.equal(run.exitCode, 2);
    assert.equal(run.value.status, "error");
    assert.deepEqual(run.value.data, {});
    assert.ok(run.value.diagnostics.every(d => d.code === "INVALID_REQUEST"));
  }
});
