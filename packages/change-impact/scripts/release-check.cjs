"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { join } = require("node:path");

const root = join(__dirname, "..");
const packageJsonPath = join(root, "package.json");
const lockfilePath = join(root, "package-lock.json");
const changelogPath = join(root, "CHANGELOG.md");
const schemaPath = join(root, "schemas", "result-v0.1-draft.schema.json");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function runNpm(args) {
  const npmCli = process.env.npm_execpath;
  const command = npmCli ? process.execPath : process.platform === "win32" ? "npm.cmd" : "npm";
  const prefix = npmCli ? [npmCli] : [];
  return execFileSync(command, [...prefix, ...args], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

try {
  const packageJson = readJson(packageJsonPath);
  const lockfile = readJson(lockfilePath);
  const changelog = readFileSync(changelogPath, "utf8");
  const schema = readJson(schemaPath);

  assert.equal(typeof packageJson.name, "string", "package name is required");
  assert.match(packageJson.version, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, "package version must be semver-like");
  assert.equal(packageJson.private, undefined, "published package must not be private");
  assert.equal(lockfile.packages?.[""].name, packageJson.name, "lockfile root name must match package.json");
  assert.equal(lockfile.packages?.[""].version, packageJson.version, "lockfile root version must match package.json");
  assert.equal(typeof packageJson.license, "string", "package license is required");
  assert.equal(typeof packageJson.engines?.node, "string", "Node engine range is required");
  const releaseTag = process.env.AGENT_IMPACT_RELEASE_TAG;
  if (releaseTag !== undefined) {
    assert.equal(releaseTag, `v${packageJson.version}`, "release tag must be v<package.version>");
  }

  const versionHeading = new RegExp(`^## \\[${escapeRegExp(packageJson.version)}\\] - (?:Unreleased|\\d{4}-\\d{2}-\\d{2})$`, "m");
  assert.match(changelog, versionHeading, "CHANGELOG must contain the package version heading");
  assert.equal(schema.$defs?.success?.properties?.schemaVersion?.const, "0.1-draft", "success schema version must match the draft contract");
  assert.equal(schema.$defs?.error?.properties?.schemaVersion?.const, "0.1-draft", "error schema version must match the draft contract");

  const requiredFiles = new Set([
    "CHANGELOG.md",
    "LICENSE",
    "README.md",
    "package.json",
    packageJson.main,
    packageJson.types,
    typeof packageJson.bin === "string" ? packageJson.bin : packageJson.bin?.["agent-impact"],
    "schemas/result-v0.1-draft.schema.json",
    "AGENT_GUIDE.md",
    "skills/agent-change-impact/SKILL.md",
    "skills/agent-change-impact/agents/openai.yaml",
  ]);
  for (const file of requiredFiles) {
    assert.equal(typeof file, "string", "package entry paths must be strings");
    assert.equal(existsSync(join(root, file)), true, `required release file is missing: ${file}`);
  }

  const packed = JSON.parse(runNpm(["pack", "--dry-run", "--ignore-scripts", "--json"]));
  const metadata = Array.isArray(packed) ? packed[0] : packed;
  assert.equal(metadata.name, packageJson.name, "packed name must match package.json");
  assert.equal(metadata.version, packageJson.version, "packed version must match package.json");
  const packedFiles = new Set((metadata.files ?? []).map((entry) => entry.path));
  for (const file of requiredFiles) {
    assert.equal(packedFiles.has(file), true, `required release file is absent from the tarball: ${file}`);
  }
  assert.equal([...packedFiles].some((file) => /^(?:test|spike|src|scripts)\//.test(file)), false, "development sources must stay out of the tarball");

  process.stdout.write(`release-check: pass (${packageJson.name}@${packageJson.version}, ${packedFiles.size} packaged files)\n`);
} catch (error) {
  process.stderr.write(`release-check: fail: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
