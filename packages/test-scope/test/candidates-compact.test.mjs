import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { main } from "../dist/cli.js";
import { createEngine, discoverTests, planTestScope, validateResult } from "../dist/index.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "test-scope candidates # "));
  const files = {
    "package.json": JSON.stringify({ type: "module", scripts: { test: "node --test" } }),
    "src/service.js": "export const service = 1;\n",
    "tests/helpers.js": "import { service } from '../src/service.js'; export const helper = service;\n",
    "tests/service.test.js": "import test from 'node:test'; import { helper } from './helpers.js'; test('service', () => {});\n",
    "tests/plain.mjs": "import check from 'node:test'; check('plain', () => {});\n",
    "tests/fixtures/pass.mjs": "import test from 'node:test'; test('fixture', () => {});\n",
    "tests/fixtures/fail.mjs": "import test from 'node:test'; test('fixture failure', () => { throw Error('fixture'); });\n",
    "tests/support/bootstrap.cjs": "module.exports = {};\n",
    "tests/__mocks__/service.ts": "export const service = 0;\n",
    "tests/type-contract.ts": "import { service } from '../src/service.js'; const typed: number = service;\n",
    "tests/service.d.ts": "export declare const service: number;\n",
    "tests/fixtures/fixture.spec.js": "import test from 'node:test'; test('named fixture behavior', () => {});\n",
    "tests/helpers.test.js": "import test from 'node:test'; test('named helpers behavior', () => {});\n",
  };
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text);
  }
  return root;
}

function capture(args, engine) {
  const output = { stdout: "", stderr: "" };
  const exitCode = main(args, engine, {
    stdout: { write(chunk) { output.stdout += chunk; } },
    stderr: { write(chunk) { output.stderr += chunk; } },
  });
  return { ...output, exitCode, result: JSON.parse(output.stdout) };
}

test("directory-only support files are excluded while named and plain tests remain", () => {
  const root = fixture();
  try {
    const result = discoverTests({ root });
    assert.equal(result.status, "complete");
    assert.deepEqual(result.data.discovery.tests.map(t => t.path), [
      "tests/fixtures/fixture.spec.js", "tests/helpers.test.js", "tests/plain.mjs", "tests/service.test.js",
    ]);
    const plan = planTestScope({ root, changed: ["src/service.js"] });
    for (const level of ["minimum", "recommended", "release"]) {
      assert.ok(!plan.data.plan[level].tests.some(t => /(?:helpers\.js|type-contract|service\.d\.ts|pass\.mjs|fail\.mjs|bootstrap|__mocks__)/.test(t.path)));
      assert.ok(!plan.data.plan[level].commands.some(c => /(?:fixtures\/(?:pass|fail)|helpers\.js|type-contract|service\.d\.ts|bootstrap|__mocks__)/.test(c.command)));
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("support files remain in static reachability and changes to helpers select consumers", () => {
  const root = fixture();
  try {
    const source = planTestScope({ root, changed: ["src/service.js"] });
    const recommendation = source.data.plan.minimum.tests.find(t => t.path === "tests/service.test.js");
    assert.ok(recommendation);
    assert.ok(recommendation.evidence.some(e => e.source === "tests/helpers.js" && e.target === "src/service.js"));
    const helper = planTestScope({ root, changed: ["tests/helpers.js"] });
    // helpers.test.js has the stronger direct-name mapping; the importing
    // service suite must still remain in the recommended regression scope.
    const consumer = helper.data.plan.recommended.tests.find(t => t.path === "tests/service.test.js");
    assert.ok(consumer?.evidence.some(e => e.source === "tests/service.test.js" && e.target === "tests/helpers.js"));
    assert.ok(helper.data.plan.recommended.tests.every(t => t.path !== "tests/helpers.js"));
    assert.equal(readFileSync(join(root, "tests/helpers.js"), "utf8"), "import { service } from '../src/service.js'; export const helper = service;\n");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("compact CLI preserves every parsed field, diagnostic and exit across operations", () => {
  const root = fixture();
  try {
    for (const args of [
      ["capabilities", "--root", root], ["discover", "--root", root],
      ["plan", "--root", root, "--changed", "src/service.js"],
      ["explain", "--root", root, "--changed", "src/service.js", "--path", "tests/service.test.js"],
      ["plan", "--root", root],
    ]) {
      const full = capture(args), compact = capture([...args, "--compact"]);
      assert.deepEqual(compact.result, full.result);
      assert.equal(validateResult(compact.result).valid, true);
      assert.equal(compact.exitCode, full.exitCode); assert.equal(compact.stderr, full.stderr);
      assert.equal(compact.stdout, JSON.stringify(full.result) + "\n");
      assert.ok(Buffer.byteLength(compact.stdout) < Buffer.byteLength(full.stdout));
    }
    const args = ["plan", "--root", root, "--changed", "src/service.js", "--limit", "1"];
    const limited = capture([...args, "--compact"]);
    assert.equal(limited.result.status, "partial"); assert.equal(limited.result.truncation.truncated, true);
    assert.deepEqual(limited.result, capture(args).result);
    const timed = capture(["plan", "--root", root, "--changed", "src/service.js", "--compact"], createEngine({ limits: { timeoutMs: 0 } }));
    assert.equal(timed.result.status, "partial"); assert.ok(timed.result.truncation.reasons.includes("TIMEOUT"));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("compact flag rejects duplicate or value-bearing forms without changing exits", () => {
  const root = fixture();
  try {
    for (const suffix of [["--compact", "--compact"], ["--compact=true"], ["--compact", "true"]]) {
      const run = capture(["discover", "--root", root, ...suffix]);
      assert.equal(run.exitCode, 2); assert.match(run.stderr, /INVALID_REQUEST/);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("mixed framework names and declaration extensions preserve candidate precedence", () => {
  const root = fixture();
  const cases = {
    "__tests__/helpers/order.spec.ts": "import { test } from 'vitest'; test('order', () => {});",
    "test/__fixtures__/parser.test.mts": "import test from 'node:test'; test('parser', () => {});",
    "tests/__mocks__/view.spec.jsx": "import { test } from '@jest/globals'; test('view', () => {});",
    "test/SUPPORT/SETUP.TEST.cts": "import test from 'node:test'; test('setup', () => {});",
    "tests/teardown.spec.cjs": "require('node:test')('teardown', () => {});",
    "tests/fixture/input.mjs": "export const input = {};",
    "tests/__fixtures__/output.mts": "export const output = {};",
    "tests/mocks/service.cts": "export const service = {};",
    "tests/helpers/seed.tsx": "export const seed = {};",
    "__tests__/SETUP.mts": "export const setup = {};",
    "test/test-utils.cts": "export const utils = {};",
    "tests/typecheck.ts": "export const value: number = 1;",
    "tests/order.test.d.ts": "export declare const order: number;",
    "tests/parser.d.mts": "export declare const parser: number;",
    "tests/view.d.cts": "export declare const view: number;",
  };
  try {
    for (const [path, text] of Object.entries(cases)) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), text + "\n");
    }
    const discovered = discoverTests({ root }).data.discovery.tests.map(t => t.path);
    for (const path of Object.keys(cases).slice(0, 5)) assert.ok(discovered.includes(path), path);
    for (const path of Object.keys(cases).slice(5)) assert.ok(!discovered.includes(path), path);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("support heuristics apply within the test directory and do not match name prefixes", () => {
  const root = fixture();
  const retained = ["fixtures/tests/plain.js", "tests/fixtures-cache/plain.js", "tests/supportive/plain.js", "tests/helpers-extra.js", "packages/api/tests/ordinary.ts", "src/support/service.test.ts"];
  const omitted = ["contest/plain.js", "packages/api/tests/support/plain.js", "packages/ui/__tests__/test-helper.ts", "tests/teardown.js", "tests/util.ts", "tests/test-helpers.js"];
  try {
    for (const path of [...retained, ...omitted]) {
      mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), "export const value = 1;\n");
    }
    const discovered = discoverTests({ root }).data.discovery.tests.map(t => t.path);
    for (const path of retained) assert.ok(discovered.includes(path), path);
    for (const path of omitted) assert.ok(!discovered.includes(path), path);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("include filters cannot promote support inputs and exclude still removes explicit tests", () => {
  const root = fixture();
  try {
    const narrowed = discoverTests({ root, include: ["tests/fixtures/**"] });
    assert.deepEqual(narrowed.data.discovery.tests.map(t => t.path), ["tests/fixtures/fixture.spec.js"]);
    const excluded = discoverTests({ root, include: ["tests/fixtures/**"], exclude: ["**/fixture.spec.js"] });
    assert.deepEqual(excluded.data.discovery.tests, []);
    const helper = discoverTests({ root, include: ["tests/helpers.js"] });
    assert.deepEqual(helper.data.discovery.tests, []);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
