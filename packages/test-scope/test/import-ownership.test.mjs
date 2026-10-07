import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { planTestScope } from "../dist/index.js";

for (const [runtime, typed] of [["js", "ts"], ["jsx", "tsx"], ["mjs", "mts"], ["cjs", "cts"]]) {
  for (const exactExists of [true, false]) {
    test(`${runtime} imports ${exactExists ? "retain the exact file beside" : "fall back to"} ${typed}`, () => {
      const root = mkdtempSync(join(tmpdir(), "test-scope-import-owner-"));
      try {
        mkdirSync(join(root, "src"));
        mkdirSync(join(root, "test"));
        writeFileSync(join(root, "src", `a.${typed}`), "export const value = 2;\n");
        if (exactExists) writeFileSync(join(root, "src", `a.${runtime}`), "export const value = 1;\n");
        writeFileSync(join(root, "test/aaa.test.js"), "import test from 'node:test'; test('unrelated', () => {});\n");
        writeFileSync(join(root, "test/regression.test.js"), `import test from 'node:test'; import { value } from '../src/a.${runtime}'; test('value', () => {});\n`);
        const changed = `src/a.${exactExists ? runtime : typed}`;
        const result = planTestScope({ root, changed: [changed] });
        assert.equal(result.status, "complete");
        assert.deepEqual(result.data.plan.minimum.tests.map(item => item.path), ["test/regression.test.js"]);
        const selected = result.data.plan.minimum.tests[0];
        assert.equal(selected.confidence, "strong");
        assert.ok(selected.evidence.some(item => item.type === "static-module-reachability" && item.target === changed));
        if (exactExists) {
          const other = planTestScope({ root, changed: [`src/a.${typed}`] });
          const regression = other.data.plan.recommended.tests.find(item => item.path === "test/regression.test.js");
          assert.equal(regression.confidence, "candidate");
          assert.ok(!regression.evidence.some(item => item.type === "static-module-reachability"));
        }
      } finally { rmSync(root, { recursive: true, force: true }); }
    });
  }
}
