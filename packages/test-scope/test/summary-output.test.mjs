import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { main } from "../dist/cli.js";
import { createEngine, planTestScope } from "../dist/index.js";

const cli = fileURLToPath(new URL("../dist/cli.js", import.meta.url));
const levels = ["minimum", "recommended", "release"];

function fixture(withTests = true) {
  const root = mkdtempSync(join(tmpdir(), "test-scope summary # "));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node --test", build: "tsc -p tsconfig.json" } }));
  writeFileSync(join(root, "src/service.js"), "export const service = 1;\n");
  if (withTests) {
    mkdirSync(join(root, "test"));
    for (const name of ["one", "two", "three"]) {
      writeFileSync(join(root, `test/${name}.test.js`), `import test from 'node:test'; import { service } from '../src/service.js'; test('${name}', () => { void service; });\n`);
    }
  }
  return root;
}

function cleanup(root) {
  assert.equal(dirname(resolve(root)), resolve(tmpdir()));
  assert.ok(basename(root).startsWith("test-scope summary # "));
  rmSync(root, { recursive: true, force: true });
}

function capture(args, engine) {
  let stdout = "", stderr = "";
  const exitCode = main(args, engine, { stdout: { write(chunk) { stdout += chunk; } }, stderr: { write(chunk) { stderr += chunk; } } });
  return { stdout, stderr, exitCode, result: JSON.parse(stdout) };
}

function decisionsPreserved(full, summary) {
  assert.equal(summary.view, "summary");
  for (const key of ["schemaVersion", "status", "diagnostics", "truncation", "stats"]) assert.deepEqual(summary[key], full[key], key);
  if (!full.data.plan) {
    assert.deepEqual(summary.data, {});
    assert.deepEqual(summary.omitted, []);
    return;
  }
  assert.deepEqual(summary.omitted, ["recommendation-evidence"]);
  for (const key of ["changes", "risk", "escalation"]) assert.deepEqual(summary.data.plan[key], full.data.plan[key], key);
  for (const level of levels) {
    for (const kind of ["tests", "commands"]) {
      const originals = full.data.plan[level][kind], projected = summary.data.plan[level][kind];
      assert.equal(projected.length, originals.length, `${level}.${kind}`);
      for (let index = 0; index < originals.length; index++) {
        const { evidence, ...decision } = originals[index];
        const { evidenceCount, evidenceTypes, ...summaryDecision } = projected[index];
        assert.deepEqual(summaryDecision, decision);
        assert.equal(evidenceCount, evidence.length);
        assert.deepEqual(evidenceTypes, [...new Set(evidence.map(item => item.type))].sort());
        assert.ok(!("evidence" in projected[index]));
        if (kind === "commands") assert.equal(projected[index].executed, false);
      }
    }
  }
}

function freeze(value) {
  if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}

test("summary preserves every tied recommendation and decision without mutating the full API result", () => {
  const root = fixture();
  try {
    const args = ["plan", "--root", root, "--changed", "src/service.js"];
    const full = freeze(planTestScope({ root, changed: ["src/service.js"] }));
    assert.equal(full.status, "complete");
    assert.equal(full.data.plan.minimum.tests.length, 3);
    const engine = { execute() { return full; } };
    const before = capture(args, engine), summary = capture([...args, "--summary"], engine);
    decisionsPreserved(full, summary.result);
    assert.equal(summary.exitCode, before.exitCode);
    assert.equal(summary.stderr, before.stderr);
    assert.equal(capture(args, engine).stdout, before.stdout);
    assert.deepEqual(before.result, full);
  } finally { cleanup(root); }
});

test("summary and compact are independent flags with one JSON object and unchanged stderr", () => {
  const root = fixture();
  try {
    const args = ["plan", "--root", root, "--changed", "src/service.js"];
    const full = capture([...args, "--compact"]);
    const pretty = capture([...args, "--summary"]), compact = capture([...args, "--summary", "--compact"]);
    decisionsPreserved(full.result, compact.result);
    assert.deepEqual(compact.result, pretty.result);
    assert.equal(compact.stdout, JSON.stringify(compact.result) + "\n");
    assert.equal(pretty.stdout, JSON.stringify(pretty.result, null, 2) + "\n");
    assert.equal(compact.stderr, full.stderr);
    assert.ok(Buffer.byteLength(compact.stdout) < Buffer.byteLength(full.stdout));
  } finally { cleanup(root); }
});

test("summary retains partial status, all limit/deadline diagnostics and truncation reasons", () => {
  const root = fixture();
  try {
    for (const limits of [{ maxReturnedTests: 1 }, { timeoutMs: 0 }]) {
      const args = ["plan", "--root", root, "--changed", "src/service.js"];
      const full = capture(args, createEngine({ limits })), summary = capture([...args, "--summary"], createEngine({ limits }));
      assert.equal(full.result.status, "partial");
      assert.equal(summary.exitCode, full.exitCode);
      assert.equal(summary.stderr, full.stderr);
      decisionsPreserved(full.result, summary.result);
      assert.equal(summary.result.truncation.truncated, true);
    }
  } finally { cleanup(root); }
});

test("empty and invalid-path plans retain absence, diagnostics and native exits", () => {
  const root = fixture(false);
  try {
    for (const path of ["src/service.js", "../outside.js"]) {
      const args = ["plan", "--root", root, "--changed", path];
      const full = capture(args), summary = capture([...args, "--summary"]);
      decisionsPreserved(full.result, summary.result);
      assert.equal(summary.exitCode, full.exitCode);
      assert.equal(summary.stderr, full.stderr);
      if (path === "src/service.js") {
        assert.equal(summary.result.status, "complete");
        assert.equal(summary.result.data.plan.minimum.tests.length, 0);
        assert.ok(summary.result.diagnostics.some(item => item.code === "TEST_NOT_FOUND"));
      } else assert.equal(summary.exitCode, 1);
    }
  } finally { cleanup(root); }
});

test("invalid summary flags reject before repository analysis with a structured error", () => {
  const root = fixture();
  try {
    for (const args of [
      ["discover", "--root", root, "--summary"],
      ["capabilities", "--root", root, "--summary"],
      ["explain", "--root", root, "--changed", "src/service.js", "--path", "test/one.test.js", "--summary"],
      ["plan", "--root", root, "--changed", "src/service.js", "--summary", "--summary"],
      ["plan", "--root", root, "--changed", "src/service.js", "--summary=true"],
      ["plan", "--root", root, "--changed", "src/service.js", "--summary", "true"],
    ]) {
      const run = capture(args, { execute(request) { assert.deepEqual(request, {}); return createEngine().execute(request); } });
      assert.equal(run.exitCode, 2);
      assert.equal(run.result.status, "error");
      assert.deepEqual(run.result.data, {});
      assert.match(run.stderr, /INVALID_REQUEST/);
      assert.ok(run.result.diagnostics.every(item => item.code === "INVALID_REQUEST" && /summary|positional/.test(item.message)));
    }
  } finally { cleanup(root); }
});

test("installed-style CLI accepts changed stdin and keeps summary/full API decisions equal", () => {
  const root = fixture();
  try {
    const run = spawnSync(process.execPath, [cli, "plan", "--root", root, "--changed-stdin", "--summary", "--compact"], { encoding: "utf8", input: "src/service.js\ntest/one.test.js\n" });
    assert.equal(run.status, 0, run.stderr);
    const summary = JSON.parse(run.stdout);
    assert.equal(summary.data.plan.changes.length, 2);
    decisionsPreserved(planTestScope({ root, changed: ["src/service.js", "test/one.test.js"] }), summary);
  } finally { cleanup(root); }
});
