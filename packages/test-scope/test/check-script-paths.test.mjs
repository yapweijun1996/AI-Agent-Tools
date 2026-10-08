import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

for (const script of ["schema-check.mjs", "docs-check.mjs"]) {
  test(`${script} resolves its package root with spaces and URL delimiters`, () => {
    const root = mkdtempSync(join(tmpdir(), "test-scope gate # "));
    try {
      mkdirSync(join(root, "scripts"));
      mkdirSync(join(root, "schemas"));
      copyFileSync(join(packageRoot, "scripts", script), join(root, "scripts", script));
      for (const file of ["request", "result", "capabilities"]) {
        writeFileSync(join(root, "schemas", `${file}.schema.json`), JSON.stringify({ $schema: "https://json-schema.org/draft/2020-12/schema", $id: `urn:fixture:${file}` }));
      }
      for (const file of ["GOAL", "SPEC", "DESIGN", "EPIC", "ROADMAP", "TASK", "PROGRESS"]) {
        writeFileSync(join(root, `${file}.md`), "Fixture: `capabilities`, `discover`, `plan`, `explain`.\n");
      }
      const result = spawnSync(process.execPath, [join(root, "scripts", script)], { cwd: tmpdir(), encoding: "utf8", timeout: 10000 });
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /Validated 3 schemas|Documentation baseline passed/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
}
