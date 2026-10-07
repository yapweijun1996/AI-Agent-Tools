import assert from "node:assert/strict";
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { discoverTests, planTestScope } from "../dist/index.js";

const owners = [".", "packages/app one", "packages/app's-two"];
const scripts = ["test", "test:quoted ' owner"];
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "test-scope-monorepo-"));
  for (const [index, owner] of owners.entries()) {
    const dir = join(root, owner);
    mkdirSync(join(dir, "src"), { recursive: true });
    mkdirSync(join(dir, "test"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({
      name: `fixture-owner-${index}`, version: "1.0.0", type: "module",
      scripts: Object.fromEntries(scripts.map(name => [name, "node marker.cjs"])),
    }));
    writeFileSync(join(dir, "marker.cjs"), `require('node:fs').writeFileSync('owner.txt', '${index}'); console.log('OWNER:${index}');\n`);
    writeFileSync(join(dir, "src/a.js"), "export const a = 1;\n");
    writeFileSync(join(dir, "test/a.test.js"), "import test from 'node:test'; import { a } from '../src/a.js'; test('a', () => {});\n");
  }
  return root;
}

test("discover and plan keep same-name scripts bound to every package owner", () => {
  const root = fixture();
  try {
    const discovery = discoverTests({ root });
    const result = planTestScope({ root, changed: owners.map(owner => `${owner === "." ? "" : owner + "/"}src/a.js`) });
    assert.equal(discovery.status, "complete");
    assert.equal(result.status, "complete");
    const commands = result.data.plan.recommended.commands.filter(item => item.scope === "package");
    assert.equal(commands.length, owners.length * scripts.length);
    assert.equal(new Set(commands.map(item => item.command)).size, commands.length);
    for (const item of commands) {
      assert.equal(item.executed, false);
      assert.equal(item.command, discovery.data.discovery.commands.find(command => command.source === item.source)?.command);
      if (item.source.startsWith("packages/")) assert.match(item.command, /^npm --prefix /);
    }
    for (const owner of owners) assert.equal(existsSync(join(root, owner, "owner.txt")), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("reported POSIX commands execute their declared owner from the request root", {
  skip: process.platform === "win32" ? "POSIX command execution requires a POSIX shell" : false,
}, () => {
  const root = fixture();
  try {
    const result = discoverTests({ root });
    for (const [index, owner] of owners.entries()) {
      const packagePath = `${owner === "." ? "" : owner + "/"}package.json`;
      for (const name of scripts) {
        const command = result.data.discovery.commands.find(item => item.source === `${packagePath}#scripts.${name}`);
        assert.ok(command);
        const ran = spawnSync("sh", ["-c", command.command], { cwd: root, encoding: "utf8", timeout: 10000 });
        assert.equal(ran.status, 0, ran.stderr);
        assert.match(ran.stdout, new RegExp(`OWNER:${index}(?:\\r?\\n|$)`));
      }
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("shared command discovery ignores malformed scripts metadata", () => {
  const root = fixture();
  try {
    for (const scripts of [null, ["node --test"], true, "node --test"]) {
      writeFileSync(join(root, "package.json"), JSON.stringify({ scripts }));
      const discovery = discoverTests({ root });
      const planned = planTestScope({ root, changed: ["src/a.js"] });
      assert.equal(discovery.status, "complete");
      assert.equal(planned.status, "complete");
      assert.equal(discovery.data.discovery.commands.some(item => item.source.startsWith("package.json#")), false);
      assert.equal(planned.data.plan.recommended.commands.some(item => item.scope === "package"), false);
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
