import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { planTestScope } from "../dist/index.js";

const root = mkdtempSync(join(tmpdir(), "agent-test-scope-benchmark-"));
try {
  mkdirSync(join(root, "src"), { recursive: true });
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ type: "module", scripts: { test: "node --test" } }), "utf8");
  for (let index = 0; index < 80; index += 1) {
    const name = String(index).padStart(3, "0");
    writeFileSync(join(root, "src", `module-${name}.ts`), `export const value${name} = ${index};\n`, "utf8");
    writeFileSync(join(root, "tests", `module-${name}.test.ts`), `import { value${name} } from '../src/module-${name}.js';\nvoid value${name};\n`, "utf8");
  }

  const request = { root, changed: ["src/module-000.ts"] };
  const startedAt = performance.now();
  const first = planTestScope(request, { limits: { maxDiscoveredFiles: 25, maxTestCandidates: 10, maxReturnedTests: 10 } });
  const elapsedMs = performance.now() - startedAt;
  assert.equal(first.status, "partial");
  assert.ok(first.truncation.truncated);
  assert.ok(first.diagnostics.some(item => item.code === "RESOURCE_LIMIT"));
  assert.ok((first.data.plan?.recommended.tests.length ?? 0) <= 10);

  const second = planTestScope(request, { limits: { maxDiscoveredFiles: 25, maxTestCandidates: 10, maxReturnedTests: 10 } });
  assert.deepEqual(second, first);
  console.log(`Benchmark check passed: bounded 160-file fixture in ${elapsedMs.toFixed(1)}ms`);
} finally {
  rmSync(root, { recursive: true, force: true });
}
