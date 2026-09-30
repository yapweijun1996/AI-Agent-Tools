import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { main } from "../dist/cli.js";
import { createEngine, discoverTests, explainRecommendation, getCapabilities, planTestScope } from "../dist/index.js";

function fixture(framework = "vitest") {
  const root = mkdtempSync(join(tmpdir(), "agent-test-scope-"));
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  const testImport = framework === "vitest" ? "import { describe, expect, it } from 'vitest';\n" : framework === "jest" ? "import { jest } from '@jest/globals';\nvoid jest;\n" : "import { test } from 'node:test';\nvoid test;\n";
  const testCommand = framework === "vitest" ? "vitest run" : framework === "jest" ? "jest" : "node --test tests/service.test.ts";
  const dependencies = framework === "vitest" ? { vitest: "^2.0.0" } : framework === "jest" ? { jest: "^30.0.0", "@jest/globals": "^30.0.0" } : undefined;
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module", scripts: { test: testCommand, typecheck: "tsc --noEmit", build: "tsc -p tsconfig.json" }, ...(dependencies ? { devDependencies: dependencies } : {}) }), "utf8");
  writeFileSync(join(root, "src", "service.ts"), "export function service(value: string): string { return value; }\n", "utf8");
  writeFileSync(join(root, "tests", "service.test.ts"), `${testImport}import { service } from '../src/service.js';\nvoid service;\n`, "utf8");
  writeFileSync(join(root, "secrets.key"), "do-not-read", "utf8");
  return root;
}

test("capabilities and discovery expose the bounded contract", () => {
  const root = fixture();
  try {
    const capabilities = getCapabilities(root);
    assert.equal(capabilities.status, "complete");
    assert.deepEqual(capabilities.data.capabilities?.operations, ["capabilities", "discover", "plan", "explain"]);
    assert.equal(capabilities.data.capabilities?.readOnly, true);
    const discovery = discoverTests({ root });
    assert.equal(discovery.status, "complete");
    assert.deepEqual(discovery.data.discovery?.frameworks.map(item => item.framework), ["vitest"]);
    assert.deepEqual(discovery.data.discovery?.tests.map(item => item.path), ["tests/service.test.ts"]);
    assert.ok(!JSON.stringify(discovery).includes("do-not-read"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("plan maps direct tests, preserves evidence, and never executes commands", () => {
  const root = fixture();
  try {
    const result = planTestScope({ root, changed: ["src/service.ts"] });
    assert.equal(result.status, "complete");
    const plan = result.data.plan;
    assert.ok(plan);
    assert.equal(plan.risk.level, "low");
    assert.deepEqual(plan.minimum.tests.map(item => item.path), ["tests/service.test.ts"]);
    assert.equal(plan.minimum.tests[0]?.confidence, "confirmed");
    assert.ok(plan.minimum.tests[0]?.evidence.some(item => item.type === "direct-source-test-mapping"));
    assert.ok(plan.recommended.commands.some(item => item.command.includes("vitest run")));
    assert.ok(plan.recommended.commands.every(item => item.executed === false));
    assert.deepEqual(result, planTestScope({ root, changed: ["src/service.ts"] }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("invalid boundaries and malformed external evidence fail before analysis", () => {
  const root = fixture();
  try {
    const outside = planTestScope({ root, changed: ["../outside.ts"] });
    assert.equal(outside.status, "error");
    assert.equal(outside.diagnostics[0]?.code, "PATH_OUTSIDE_ROOT");
    const malformed = planTestScope({ root, changed: ["src/service.ts"], symbolEvidence: { schemaVersion: "1" } });
    assert.equal(malformed.status, "error");
    assert.equal(malformed.diagnostics[0]?.code, "INVALID_REQUEST");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("explain returns the evidence for a selected recommendation", () => {
  const root = fixture();
  try {
    const result = explainRecommendation({ root, changed: ["src/service.ts"], target: { path: "tests/service.test.ts" } });
    assert.equal(result.status, "complete");
    assert.equal(result.data.explanation?.matched?.path, "tests/service.test.ts");
    assert.ok(result.data.explanation?.reasons.some(item => item.type === "direct-source-test-mapping"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("framework detection covers Vitest, Jest, and node:test", () => {
  for (const framework of ["vitest", "jest", "node"]) {
    const root = fixture(framework);
    try {
      const result = discoverTests({ root });
      assert.deepEqual(result.data.discovery?.frameworks.map(item => item.framework), [framework]);
      const plan = planTestScope({ root, changed: ["src/service.ts"] });
      assert.equal(plan.status, "complete");
      assert.equal(plan.data.plan?.minimum.tests[0]?.framework, framework);
      assert.ok(plan.data.plan?.minimum.commands.some(item => item.purpose === "test"));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});

test("test-file, spec-file, and test-directory conventions are discovered", () => {
  const root = fixture();
  try {
    mkdirSync(join(root, "__tests__"), { recursive: true });
    writeFileSync(join(root, "src", "other.spec.ts"), "export const other = true;\n", "utf8");
    writeFileSync(join(root, "__tests__", "helper.js"), "export const helper = true;\n", "utf8");
    const paths = discoverTests({ root }).data.discovery?.tests.map(item => item.path);
    assert.deepEqual(paths, ["__tests__/helper.js", "src/other.spec.ts", "tests/service.test.ts"]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("literal CommonJS require contributes static import evidence", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "src", "consumer.cjs"), "const service = require('./service.js');\nmodule.exports = service;\n", "utf8");
    writeFileSync(join(root, "tests", "consumer.test.cjs"), "const consumer = require('../src/consumer.cjs');\nvoid consumer;\n", "utf8");
    const result = planTestScope({ root, changed: ["src/service.ts"] });
    const recommendation = result.data.plan?.recommended.tests.find(item => item.path === "tests/consumer.test.cjs");
    assert.ok(recommendation);
    assert.ok(recommendation?.evidence.some(item => item.type === "static-module-reachability"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI and library use the same result contract", () => {
  const root = fixture();
  try {
    const output = { stdout: "", stderr: "" };
    const code = main(["plan", "--root", root, "--changed", "src/service.ts"], undefined, {
      stdout: { write: chunk => { output.stdout += chunk; } },
      stderr: { write: chunk => { output.stderr += chunk; } }
    });
    assert.equal(code, 0);
    assert.equal(output.stderr, "");
    assert.deepEqual(JSON.parse(output.stdout), planTestScope({ root, changed: ["src/service.ts"] }));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("dynamic loading is surfaced as partial instead of confirmed reachability", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "src", "dynamic.ts"), "export async function dynamic() { return import('./service.js'); }\n", "utf8");
    writeFileSync(join(root, "tests", "dynamic.test.ts"), "import { dynamic } from '../src/dynamic.js';\nvoid dynamic;\n", "utf8");
    const result = planTestScope({ root, changed: ["src/dynamic.ts"] });
    assert.equal(result.status, "partial");
    assert.ok(result.diagnostics.some(item => item.code === "IMPORT_RESOLUTION_PARTIAL"));
    assert.ok(result.data.plan?.recommended.tests.some(item => item.path === "tests/dynamic.test.ts"));
    assert.ok(!result.data.plan?.recommended.tests.find(item => item.path === "tests/service.test.ts")?.evidence.some(item => item.type === "direct-import"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("result limits are explicit and bounded", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "tests", "other.test.ts"), "import { service } from '../src/service.js';\nvoid service;\n", "utf8");
    const result = planTestScope({ root, changed: ["src/service.ts"], limit: 1 });
    assert.equal(result.data.plan?.recommended.tests.length, 1);
    assert.equal(result.status, "partial");
    assert.ok(result.truncation.truncated);
    assert.ok(result.truncation.reasons.includes("RESOURCE_LIMIT"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("equally strong test mappings are reported as ambiguous", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, "src", "service.spec.ts"), "import { service } from './service.js';\nvoid service;\n", "utf8");
    const result = planTestScope({ root, changed: ["src/service.ts"] });
    assert.equal(result.status, "complete");
    assert.ok(result.diagnostics.some(item => item.code === "AMBIGUOUS_TEST_MAPPING"));
    assert.ok((result.data.plan?.minimum.tests.length ?? 0) >= 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("include and exclude precedence is deterministic", () => {
  const root = fixture();
  try {
    writeFileSync(join(root, ".gitignore"), "ignored.ts\nignored-dir/\n", "utf8");
    mkdirSync(join(root, "ignored-dir"), { recursive: true });
    writeFileSync(join(root, "ignored.ts"), "export const ignored = 1;\n", "utf8");
    writeFileSync(join(root, "ignored-dir", "nested.ts"), "export const nested = 1;\n", "utf8");
    assert.equal(discoverTests({ root }).stats.filesScanned, 3);
    const included = discoverTests({ root, include: ["ignored.ts"] });
    assert.equal(included.stats.filesScanned, 1);
    const excluded = discoverTests({ root, include: ["ignored.ts"], exclude: ["ignored.ts"] });
    assert.equal(excluded.stats.filesScanned, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("symlinks, resource limits, and timeout remain bounded", () => {
  const root = fixture();
  try {
    try {
      symlinkSync(join(root, "src"), join(root, "linked-src"), "dir");
      symlinkSync(join(root, "src", "service.ts"), join(root, "src", "linked.ts"));
    } catch {
      // Symlink creation can be unavailable in restricted test environments.
    }
    const normal = discoverTests({ root });
    assert.ok(!normal.data.discovery?.tests.some(item => item.path.includes("linked")));
    const limited = createEngine({ limits: { maxDiscoveredFiles: 1 } }).execute({ operation: "discover", root });
    assert.equal(limited.status, "partial");
    assert.ok(limited.truncation.reasons.includes("RESOURCE_LIMIT"));
    const timed = createEngine({ limits: { timeoutMs: 0 } }).execute({ operation: "plan", root, changed: ["src/service.ts"] });
    assert.equal(timed.status, "partial");
    assert.ok(timed.truncation.reasons.includes("TIMEOUT"));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
