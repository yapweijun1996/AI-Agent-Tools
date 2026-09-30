"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { tmpdir } = require("node:os");

const root = join(__dirname, "..");
const npmCli = process.env.npm_execpath;
const npmCommand = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
const npmPrefixArgs = npmCli ? [npmCli] : [];
// Keep spaces in the temporary path so package and .cmd invocation quoting is
// exercised on every platform, including the Windows runner.
const tempRoot = mkdtempSync(join(tmpdir(), "agent-impact pack smoke-"));

function runNpm(args, cwd) {
  return execFileSync(npmCommand, [...npmPrefixArgs, ...args], {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function runGit(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

try {
  const packDirectory = join(tempRoot, "pack");
  const appDirectory = join(tempRoot, "app");
  mkdirSync(packDirectory);
  mkdirSync(appDirectory);
  runNpm(["pack", "--ignore-scripts", "--pack-destination", packDirectory], root);
  const tarballs = readdirSync(packDirectory).filter((entry) => entry.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, "pack should produce exactly one tarball");
  runNpm(["init", "-y"], appDirectory);
  runNpm(["install", "--prefer-offline", "--omit=dev", "--ignore-scripts", "--no-audit", "--no-fund", join(packDirectory, tarballs[0])], appDirectory);

  const fixtureDirectory = join(tempRoot, "fixture");
  mkdirSync(join(fixtureDirectory, "src"), { recursive: true });
  writeFileSync(join(fixtureDirectory, "tsconfig.json"), JSON.stringify({
    compilerOptions: { target: "ES2022", module: "CommonJS", strict: true },
    include: ["src/**/*.ts"],
  }));
  writeFileSync(join(fixtureDirectory, "src", "base.ts"), "export const value = 1;\n");
  writeFileSync(join(fixtureDirectory, "src", "consumer.ts"), "import { value } from './base';\nexport const consumer = value;\n");
  runGit(["init", "-q"], fixtureDirectory);
  runGit(["config", "user.email", "pack-smoke@example.com"], fixtureDirectory);
  runGit(["config", "user.name", "Agent Impact Pack Smoke"], fixtureDirectory);
  runGit(["add", "."], fixtureDirectory);
  runGit(["commit", "-qm", "fixture"], fixtureDirectory);

  const apiProbe = execFileSync(process.execPath, [
    "-e",
    "const api = require('agent-change-impact'); const result = api.capabilities(); const impact = api.analyzeFile({ root: process.env.IMPACT_SMOKE_ROOT, project: 'tsconfig.json', file: 'src/base.ts' }); if (!result.ok || result.schemaVersion !== '0.1-draft' || !impact.ok || impact.operation !== 'file-impact' || impact.analysis.limits.depth !== 2 || !impact.impact.direct.some((item) => item.node && impact.graph.nodes.some((node) => node.id === item.node && node.file === 'src/consumer.ts'))) process.exit(1);",
  ], { cwd: appDirectory, encoding: "utf8", env: { ...process.env, IMPACT_SMOKE_ROOT: fixtureDirectory } });
  assert.equal(apiProbe, "");

  const cliName = process.platform === "win32" ? "agent-impact.cmd" : "agent-impact";
  const cliPath = join(appDirectory, "node_modules", ".bin", cliName);
  const cliCommand = process.platform === "win32" ? `"${cliPath}"` : cliPath;
  const cliOutput = execFileSync(cliCommand, ["capabilities", "--json"], {
    cwd: appDirectory,
    encoding: "utf8",
    ...(process.platform === "win32" ? { shell: true } : {}),
  });
  const cliResult = JSON.parse(cliOutput);
  assert.equal(cliResult.ok, true);
  assert.equal(cliResult.operation, "capabilities");
  const installedCliScript = join(appDirectory, "node_modules", "agent-change-impact", "dist", "cli.js");
  const installedPackageRoot = join(appDirectory, "node_modules", "agent-change-impact");
  assert.equal(existsSync(join(installedPackageRoot, "AGENT_GUIDE.md")), true, "packaged agent guide must be installed");
  assert.equal(existsSync(join(installedPackageRoot, "skills", "agent-change-impact", "SKILL.md")), true, "packaged agent skill must be installed");
  assert.equal(existsSync(join(installedPackageRoot, "skills", "agent-change-impact", "agents", "openai.yaml")), true, "packaged Codex metadata must be installed");
  const cliImpactOutput = execFileSync(process.execPath, [installedCliScript, "file", "src/base.ts", "--root", fixtureDirectory, "--project", "tsconfig.json", "--json"], {
    cwd: appDirectory,
    encoding: "utf8",
  });
  const cliImpact = JSON.parse(cliImpactOutput);
  assert.equal(cliImpact.ok, true);
  assert.equal(cliImpact.operation, "file-impact");
  assert.equal(cliImpact.analysis.limits.depth, 2);
  assert.ok(cliImpact.impact.direct.some((item) => cliImpact.graph.nodes.some((node) => node.id === item.node && node.file === "src/consumer.ts")));

  const compactImpactOutput = execFileSync(process.execPath, [
    installedCliScript,
    "file",
    "src/base.ts",
    "--root",
    fixtureDirectory,
    "--project",
    "tsconfig.json",
    "--max-output-bytes=16384",
    "--json",
  ], { cwd: appDirectory, encoding: "utf8" });
  const compactImpact = JSON.parse(compactImpactOutput);
  const compactBytes = Buffer.byteLength(JSON.stringify(compactImpact));
  assert.ok(compactBytes >= 256, "pack smoke fixture must exercise the minimum output budget");
  let formattedError;
  try {
    execFileSync(process.execPath, [
      installedCliScript,
      "file",
      "src/base.ts",
      "--root",
      fixtureDirectory,
      "--project",
      "tsconfig.json",
      `--max-output-bytes=${compactBytes}`,
    ], { cwd: appDirectory, encoding: "utf8" });
    assert.fail("pretty output should exceed the compact output budget");
  } catch (error) {
    assert.equal(error.status, 1);
    formattedError = JSON.parse(error.stdout);
  }
  assert.equal(formattedError.error.code, "OUTPUT_LIMIT_EXCEEDED");
  process.stdout.write("pack-smoke: pass (installed API and CLI analysis/output limits)\n");
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
