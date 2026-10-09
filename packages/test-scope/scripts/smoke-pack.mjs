import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
for (const file of ["dist/index.js", "dist/index.d.ts", "dist/cjs/index.js", "dist/cli.js", "dist/cli-summary.js", "schemas/request.schema.json", "schemas/result.schema.json", "schemas/capabilities.schema.json", "schemas/summary.schema.json"]) assert.ok(existsSync(resolve(root, file)), `packaged file is missing: ${file}`);
assert.equal(packageJson.main, "./dist/cjs/index.js");
assert.equal(packageJson.exports["."]?.import, "./dist/index.js");
assert.equal(packageJson.exports["."]?.require, "./dist/cjs/index.js");
assert.equal(packageJson.bin["agent-test-scope"], "dist/cli.js");
const output = mkdtempSync(join(tmpdir(), "agent-test-scope-pack-"));
try {
  assert.ok(process.env.npm_execpath, "Run this check through npm run smoke:pack");
  const packed = JSON.parse(execFileSync(process.execPath, [process.env.npm_execpath, "pack", "--ignore-scripts", "--pack-destination", output, "--json"], { cwd: root, encoding: "utf8" }))[0];
  assert.equal(typeof packed.filename, "string");
  const archive = join(output, packed.filename);
  const extracted = join(output, "package");
  execFileSync("tar", ["-xzf", archive, "-C", output]);
  assert.ok(existsSync(join(extracted, "dist", "index.js")));
  assert.ok(existsSync(join(extracted, "dist", "cjs", "index.js")));
  assert.ok(existsSync(join(extracted, "dist", "cjs", "package.json")));
  assert.ok(existsSync(join(extracted, "dist", "cli.js")));
  assert.ok(existsSync(join(extracted, "schemas", "request.schema.json")));
  assert.ok(existsSync(join(extracted, "schemas", "summary.schema.json")));
  const api = await import(pathToFileURL(join(extracted, "dist", "index.js")).href);
  assert.equal(api.getCapabilities(extracted).status, "complete");
  const cliProcess = spawnSync(process.execPath, [join(extracted, "dist", "cli.js"), "capabilities", "--root", extracted], { encoding: "utf8" });
  assert.equal(cliProcess.status, 0, `packaged CLI failed: ${cliProcess.stderr}`);
  assert.ok(cliProcess.stdout.trim(), `packaged CLI returned no stdout: ${cliProcess.stderr}`);
  const cli = JSON.parse(cliProcess.stdout);
  assert.equal(cli.status, "complete");
  const compactProcess = spawnSync(process.execPath, [join(extracted, "dist", "cli.js"), "capabilities", "--root", extracted, "--compact"], { encoding: "utf8" });
  assert.equal(compactProcess.status, 0, compactProcess.stderr);
  assert.deepEqual(JSON.parse(compactProcess.stdout), cli);
  assert.equal(compactProcess.stdout, JSON.stringify(cli) + "\n");
  const fixture = join(output, "consumer project #");
  mkdirSync(join(fixture, "test", "fixtures"), { recursive: true });
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ scripts: { test: "node --test" } }));
  writeFileSync(join(fixture, "test", "unit.test.js"), "import test from 'node:test'; test('unit', () => {});\n");
  writeFileSync(join(fixture, "test", "helpers.js"), "export const helper = true;\n");
  writeFileSync(join(fixture, "test", "fixtures", "fail.mjs"), "import test from 'node:test'; test('fixture', () => { throw Error('fixture'); });\n");
  const filtered = api.discoverTests({ root: fixture });
  assert.deepEqual(filtered.data.discovery.tests.map(t => t.path), ["test/unit.test.js"]);
  const planned = spawnSync(process.execPath, [join(extracted, "dist", "cli.js"), "plan", "--root", fixture, "--changed", "test/helpers.js", "--compact"], { encoding: "utf8" });
  assert.equal(planned.status, 0, planned.stderr);
  assert.deepEqual(JSON.parse(planned.stdout), api.planTestScope({ root: fixture, changed: ["test/helpers.js"] }));
  const nodeModules = join(output, "node_modules");
  mkdirSync(nodeModules);
  symlinkSync(extracted, join(nodeModules, "agent-test-scope"), process.platform === "win32" ? "junction" : "dir");
  const cjsProcess = spawnSync(process.execPath, ["-e", "const api = require('agent-test-scope'); const result = api.getCapabilities(process.cwd()); if (result.status !== 'complete') process.exit(1); process.stdout.write(result.status);"], { cwd: output, encoding: "utf8" });
  assert.equal(cjsProcess.status, 0, `packaged CJS entry failed: ${cjsProcess.stderr}`);
  assert.equal(cjsProcess.stdout, "complete");
  const installedRoot = join(output, "installed consumer #");
  mkdirSync(installedRoot);
  writeFileSync(join(installedRoot, "package.json"), JSON.stringify({ private: true, scripts: { postinstall: "node -e \"throw new Error('Unexpected lifecycle execution')\"" } }));
  execFileSync(process.execPath, [process.env.npm_execpath, "install", "--ignore-scripts", "--no-audit", "--no-fund", archive], { cwd: installedRoot, encoding: "utf8" });
  const installed = join(installedRoot, "node_modules", "agent-test-scope");
  assert.ok(existsSync(join(installed, "schemas", "summary.schema.json")));
  assert.ok(existsSync(join(installed, "LICENSE")));
  const installedApi = await import(pathToFileURL(join(installed, "dist", "index.js")).href);
  const full = installedApi.planTestScope({ root: fixture, changed: ["test/helpers.js"] });
  const summaryProcess = spawnSync(process.execPath, [join(installed, "dist", "cli.js"), "plan", "--root", fixture, "--changed", "test/helpers.js", "--summary", "--compact"], { encoding: "utf8" });
  assert.equal(summaryProcess.status, planned.status, summaryProcess.stderr);
  assert.equal(summaryProcess.stderr, planned.stderr);
  const summary = JSON.parse(summaryProcess.stdout);
  assert.equal(summary.view, "summary");
  assert.equal(summary.status, full.status);
  assert.deepEqual(summary.diagnostics, full.diagnostics);
  assert.deepEqual(summary.truncation, full.truncation);
  for (const level of ["minimum", "recommended", "release"]) {
    for (const kind of ["tests", "commands"]) {
      assert.deepEqual(summary.data.plan[level][kind].map(({ evidenceCount, evidenceTypes, ...decision }) => decision), full.data.plan[level][kind].map(({ evidence, ...decision }) => decision));
    }
  }
  console.log("Packaged tarball smoke passed");
} finally {
  rmSync(output, { recursive: true, force: true });
}
