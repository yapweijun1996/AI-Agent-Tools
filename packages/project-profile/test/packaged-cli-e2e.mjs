import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const PACKAGE_VERSION = "0.1.2";
const VALID_STATUSES = new Set(["complete", "partial", "unsupported", "error"]);
const repoRoot = process.cwd();
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "agent-project-profile-packaged-e2e-"));
const packDir = path.join(tempRoot, "pack");
const consumerDir = path.join(tempRoot, "consumer");
fs.mkdirSync(packDir, { recursive: true });
fs.mkdirSync(consumerDir, { recursive: true });

const npmExecPath = process.env.npm_execpath;
assert.ok(npmExecPath, "npm_execpath is required; run this E2E through the npm script");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? repoRoot,
    encoding: "utf8",
    shell: options.shell ?? false,
    env: { ...process.env, NO_COLOR: "1" },
  });
  if (result.error) throw result.error;
  return result;
}

function runNpm(args, cwd = repoRoot) {
  return run(process.execPath, [npmExecPath, ...args], { cwd });
}

function assertSuccess(result, label) {
  assert.equal(
    result.status,
    0,
    `${label} failed with exit ${result.status}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
}

function installedBinaryPath() {
  const name = process.platform === "win32" ? "agent-project-profile.cmd" : "agent-project-profile";
  return path.join(consumerDir, "node_modules", ".bin", name);
}

try {
  const pack = runNpm(["pack", "--pack-destination", packDir]);
  assertSuccess(pack, "npm pack");

  const tarballs = fs.readdirSync(packDir).filter((name) => name.endsWith(".tgz"));
  assert.equal(tarballs.length, 1, `expected exactly one tarball, found: ${tarballs.join(", ")}`);
  const tarball = path.join(packDir, tarballs[0]);

  fs.writeFileSync(
    path.join(consumerDir, "package.json"),
    `${JSON.stringify({
      name: "agent-profile-consumer-test",
      version: "1.0.0",
      private: true,
      scripts: { build: "echo build", test: "echo test" },
      engines: { node: ">=20" },
    }, null, 2)}\n`,
    "utf8",
  );

  const install = runNpm(
    ["install", "--ignore-scripts", "--no-audit", "--no-fund", tarball],
    consumerDir,
  );
  assertSuccess(install, "consumer npm install");

  const installedManifest = JSON.parse(
    fs.readFileSync(path.join(consumerDir, "node_modules", "agent-project-profile", "package.json"), "utf8"),
  );
  assert.equal(installedManifest.version, PACKAGE_VERSION, "installed package version must match release version");
  assert.equal(installedManifest.bin?.["agent-project-profile"], "dist/bin.js", "installed bin mapping is incorrect");

  const binary = installedBinaryPath();
  assert.ok(fs.existsSync(binary), `installed npm binary missing: ${binary}`);

  const invoke = (args) => run(binary, args, { cwd: consumerDir, shell: process.platform === "win32" });

  const profileResult = invoke([".", "--format", "json"]);
  assert.equal(
    profileResult.status,
    0,
    `installed binary profile failed with exit ${profileResult.status}\nstdout:\n${profileResult.stdout}\nstderr:\n${profileResult.stderr}`,
  );
  assert.ok(profileResult.stdout.trim().length > 0, "installed binary returned empty stdout");

  const profile = JSON.parse(profileResult.stdout);
  assert.ok(profile.schemaVersion, "schemaVersion is required");
  assert.equal(profile.toolVersion, PACKAGE_VERSION);
  assert.ok(VALID_STATUSES.has(profile.status), `unexpected status: ${profile.status}`);
  assert.equal(profile.project?.name, "agent-profile-consumer-test");
  assert.ok(profile.project && typeof profile.project === "object", "project is required");
  assert.ok(profile.coverage && typeof profile.coverage === "object", "coverage is required");
  assert.ok(Array.isArray(profile.ecosystems), "ecosystems must be an array");
  assert.equal(profile.packageManager?.name, "npm");
  assert.ok(Array.isArray(profile.runtimes), "runtimes must be an array");
  assert.ok(Array.isArray(profile.commands?.build) && profile.commands.build.length > 0, "build command is required");
  assert.ok(Array.isArray(profile.commands?.test) && profile.commands.test.length > 0, "test command is required");
  assert.ok(Array.isArray(profile.warnings), "warnings must be an array");
  assert.ok(Array.isArray(profile.evidence), "evidence must be an array");

  const version = invoke(["--version"]);
  assertSuccess(version, "installed binary --version");
  assert.equal(version.stdout.trim(), PACKAGE_VERSION);

  const help = invoke(["--help"]);
  assertSuccess(help, "installed binary --help");
  assert.match(help.stdout, /Usage:/u);
  assert.match(help.stdout, /agent-project-profile/u);

  process.stdout.write(
    `packaged CLI E2E PASS: ${path.basename(tarball)} -> installed binary -> JSON/toolVersion/help/version verified\n`,
  );
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}
