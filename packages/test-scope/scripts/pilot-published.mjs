import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

assert.ok(process.argv[2], "Usage: node scripts/pilot-published.mjs <extracted-package-root>");
const packageRoot = resolve(process.argv[2]);

const skillPath = join(packageRoot, "skills", "agent-test-scope", "SKILL.md");
const skill = readFileSync(skillPath, "utf8");
assert.match(skill, /name: agent-test-scope/);
assert.match(skill, /Commands are data/);

const pilotRoot = mkdtempSync(join(tmpdir(), "agent-test-scope-pilot-"));
const fixtureRoot = join(pilotRoot, "fixture");
mkdirSync(join(fixtureRoot, "src", "order"), { recursive: true });
mkdirSync(join(fixtureRoot, "tests", "order"), { recursive: true });
writeFileSync(join(fixtureRoot, "package.json"), JSON.stringify({
  type: "module",
  scripts: { test: "vitest run" },
  devDependencies: { vitest: "^2.0.0" }
}, null, 2) + "\n", "utf8");
writeFileSync(join(fixtureRoot, "src", "order", "service.ts"), "export function placeOrder(): boolean { return true; }\n", "utf8");
writeFileSync(join(fixtureRoot, "tests", "order", "service.test.ts"), "import { placeOrder } from '../../src/order/service.js';\nvoid placeOrder;\n", "utf8");

function snapshot(directory) {
  const files = [];
  function visit(current) {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) visit(path);
      else if (entry.isFile()) {
        files.push([
          relative(directory, path),
          createHash("sha256").update(readFileSync(path)).digest("hex")
        ]);
      }
    }
  }
  visit(directory);
  return files.sort((left, right) => left[0].localeCompare(right[0]));
}

function runCli(...args) {
  const cli = join(packageRoot, "dist", "cli.js");
  const processResult = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
  assert.equal(processResult.status, 0, `published CLI failed: ${processResult.stderr}`);
  return JSON.parse(processResult.stdout);
}

const before = snapshot(fixtureRoot);
const capabilities = runCli("capabilities", "--root", fixtureRoot);
assert.equal(capabilities.status, "complete");
assert.equal(capabilities.data.capabilities?.readOnly, true);

const discovered = runCli("discover", "--root", fixtureRoot);
assert.equal(discovered.status, "complete");
assert.deepEqual(discovered.data.discovery?.tests.map(item => item.path), ["tests/order/service.test.ts"]);

const planned = runCli("plan", "--root", fixtureRoot, "--changed", "src/order/service.ts");
assert.ok(["complete", "partial"].includes(planned.status));
assert.ok((planned.data.plan?.recommended.tests.length ?? 0) > 0);
assert.ok(planned.data.plan?.recommended.commands.every(command => command.executed === false));

const library = await import(pathToFileURL(join(packageRoot, "dist", "index.js")).href);
const libraryPlan = library.planTestScope({ root: fixtureRoot, changed: ["src/order/service.ts"] });
assert.equal(libraryPlan.status, planned.status);
assert.deepEqual(libraryPlan.data.plan?.minimum.tests.map(item => item.path), planned.data.plan?.minimum.tests.map(item => item.path));

const after = snapshot(fixtureRoot);
assert.deepEqual(after, before, "published package changed the pilot repository");
console.log(JSON.stringify({
  status: "passed",
  packageVersion: JSON.parse(readFileSync(join(packageRoot, "package.json"), "utf8")).version,
  skillLoaded: true,
  operations: ["capabilities", "discover", "plan"],
  targetRepositoryMutated: false,
  fixtureRoot
}, null, 2));
