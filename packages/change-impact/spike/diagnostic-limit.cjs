"use strict";

const { execFileSync } = require("node:child_process");
const { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const os = require("node:os");

const repository = join(__dirname, "..");
const fixtureRoot = join(repository, "test", "fixtures", "basic");
const api = require(join(repository, "dist", "index.js"));
const noiseCount = readCount("AGENT_IMPACT_DIAGNOSTIC_FILES", 20000);
const noiseBytes = readCount("AGENT_IMPACT_DIAGNOSTIC_FILE_BYTES", 300);

function readCount(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 50000) {
    throw new Error(`${name} must be between 1 and 50000`);
  }
  return value;
}

function git(root, args) {
  execFileSync("git", args, { cwd: root, stdio: "ignore" });
}

const root = mkdtempSync(join(os.tmpdir(), "agent-impact-diagnostic-limit-"));
try {
  cpSync(fixtureRoot, root, { recursive: true });
  rmSync(join(root, "src", "dynamic.ts"));
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "benchmark@example.com"]);
  git(root, ["config", "user.name", "Agent Impact Diagnostic Benchmark"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "fixture"]);
  const noise = join(root, "noise");
  mkdirSync(noise);
  const content = "x".repeat(noiseBytes);
  for (let index = 1; index <= noiseCount; index += 1) {
    writeFileSync(join(noise, `oversized-${index}.ts`), content);
  }

  const result = api.analyzeFile({
    root,
    project: "tsconfig.json",
    file: "src/math.ts",
    limits: { maxFileBytes: 256, maxOutputBytes: 16 * 1024 * 1024 },
  });
  const output = JSON.stringify(result);
  console.log(JSON.stringify({
    noiseFiles: noiseCount,
    noiseBytes,
    ok: result.ok,
    status: result.ok ? result.analysis.status : undefined,
    maxDiagnostics: result.ok ? result.analysis.limits.maxDiagnostics : undefined,
    warnings: result.ok ? result.warnings.length : undefined,
    bytes: Buffer.byteLength(output),
    codes: result.ok ? [...new Set(result.warnings.map((entry) => entry.code))] : [result.error.code],
  }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
