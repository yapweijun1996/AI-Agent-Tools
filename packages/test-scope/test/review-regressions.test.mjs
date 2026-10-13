import test from "node:test";
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { discoverTests, planTestScope } from "../dist/index.js";

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "scope-review-"));
  const write = (name, content) => {
    const p = join(root, name); mkdirSync(join(p, ".."), { recursive: true }); writeFileSync(p, content);
  };
  return { root, write };
}

test("include reachability retains basename globs and arbitrary globstar depth", () => {
  const { root, write } = fixture();
  try {
    write("package.json", JSON.stringify({ scripts: { test: "node --test" } }));
    write("src/top.test.js", 'import test from "node:test"; test("top",()=>{});');
    write("src/a/deep/file.test.js", 'import test from "node:test"; test("deep",()=>{});');
    write("other/unrelated.test.js", 'import test from "node:test"; test("other",()=>{});');
    for (const pattern of ["*.test.js", "src/**/*.js", "src/**/**/*.test.js"]) {
      const result = discoverTests({ root, include: [pattern] });
      assert.equal(result.status, "complete");
      const expected = pattern.startsWith("src/") ? ["src/a/deep/file.test.js", "src/top.test.js"] : ["other/unrelated.test.js", "src/a/deep/file.test.js", "src/top.test.js"];
      assert.deepEqual(result.data.discovery.tests.map(item => item.path).sort(), expected);
    }
    const excluded = discoverTests({ root, include: ["src/**/*.js"], exclude: ["src/a/**"] });
    assert.deepEqual(excluded.data.discovery.tests.map(item => item.path), ["src/top.test.js"]);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("release plans retain the root verification gate for child-only changes", () => {
  const { root, write } = fixture();
  try {
    write("package.json", JSON.stringify({ scripts: { verify: "echo verify" } }));
    write("packages/widget/package.json", JSON.stringify({ scripts: { test: "vitest run" }, devDependencies: { vitest: "1.0.0" } }));
    write("packages/widget/src/a.ts", "export const a = 1;");
    write("packages/widget/src/a.test.ts", 'import {test} from "vitest"; import {a} from "./a"; test("a",()=>a);');
    const result = planTestScope({ root, changed: ["packages/widget/src/a.ts"] });
    assert.equal(result.status, "complete");
    assert.ok(result.data.plan.release.commands.some(item => item.command === "npm run verify" && item.scope === "repository"));
    assert.equal(result.data.plan.recommended.commands.some(item => item.command === "npm run verify"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("targeted Vitest and Jest commands execute in their owning package", { skip: process.platform === "win32" }, () => {
  for (const framework of ["vitest", "jest"]) {
    const { root, write } = fixture();
    const owner = "packages/widget's space";
    try {
      write("package.json", "{}");
      write(`${owner}/package.json`, JSON.stringify({ devDependencies: { [framework]: "1.0.0" } }));
      write(`${owner}/src/a.ts`, "export const a = 1;");
      write(`${owner}/src/a.test.ts`, `import {test} from "${framework === "jest" ? "@jest/globals" : framework}"; import {a} from "./a"; test("a",()=>a);`);
      const bin = `${owner}/node_modules/.bin/${framework}`;
      write(bin, '#!/usr/bin/env node\nconst fs=require("node:fs"); if (!fs.existsSync("src/a.test.ts") || !process.argv.includes("src/a.test.ts")) process.exit(91); console.log(process.cwd());\n');
      chmodSync(join(root, bin), 0o755);
      const result = planTestScope({ root, changed: [`${owner}/src/a.ts`] });
      const command = result.data.plan.minimum.commands[0].command;
      const child = spawnSync("sh", ["-c", command], { cwd: root, encoding: "utf8", timeout: 10000, env: { ...process.env, npm_config_offline: "true", npm_config_cache: join(root, ".npm-cache") } });
      assert.equal(child.status, 0, child.stderr);
      assert.ok(child.stdout.trim().endsWith(owner));
    } finally { rmSync(root, { recursive: true, force: true }); }
  }
});
