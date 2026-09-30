"use strict";

const { performance } = require("node:perf_hooks");
const { spawnSync, execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync, rmSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");
const os = require("node:os");

const repository = join(__dirname, "..");
const apiEntry = join(repository, "dist", "index.js");
const cliEntry = join(repository, "dist", "cli.js");
const directCount = readCount("AGENT_IMPACT_BENCH_DIRECT", 120);
const transitiveCount = readCount("AGENT_IMPACT_BENCH_TRANSITIVE", 120);
const hardLimits = {
  depth: 5,
  maxNodes: 5000,
  maxEdges: 15000,
  maxPathsPerTarget: 8,
  maxOutputBytes: 16 * 1024 * 1024,
  maxFiles: 100000,
  maxFileBytes: 16 * 1024 * 1024,
  maxTotalFileBytes: 512 * 1024 * 1024,
  maxDiagnostics: 10000,
};

const apiChild = [
  "const { performance } = require('node:perf_hooks');",
  `const api = require(${JSON.stringify(apiEntry)});`,
  "const root = process.env.AGENT_IMPACT_BENCH_ROOT;",
  "const rawLimits = process.env.AGENT_IMPACT_BENCH_LIMITS;",
  "const request = { root, project: 'tsconfig.json', file: 'src/base.ts' };",
  "if (rawLimits) request.limits = JSON.parse(rawLimits);",
  "const before = process.memoryUsage().rss;",
  "const started = performance.now();",
  "const result = api.analyzeFile(request);",
  "const elapsedMs = performance.now() - started;",
  "const summary = result.ok ? { ok: true, status: result.analysis.status, returnedNodes: result.analysis.returnedNodes, returnedEdges: result.analysis.returnedEdges, stopReasons: result.analysis.stopReasons } : { ok: false, error: result.error.code };",
  "process.stdout.write(JSON.stringify({ elapsedMs: Number(elapsedMs.toFixed(1)), rssDeltaMiB: Number(((process.memoryUsage().rss - before) / (1024 * 1024)).toFixed(1)), ...summary }));",
].join("\n");

function readCount(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined) {
    return fallback;
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a positive integer`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < 1 || value > 250) {
    throw new Error(`${name} must be between 1 and 250`);
  }
  return value;
}

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function makeRepository() {
  const root = mkdtempSync(join(os.tmpdir(), "agent-impact-benchmark-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { target: "ES2022", module: "CommonJS", strict: true }, include: ["src/**/*.ts"] }, null, 2));
  writeFileSync(join(root, "src", "base.ts"), "export const value = 1;\n");
  for (let index = 0; index < directCount; index += 1) {
    const name = String(index).padStart(3, "0");
    writeFileSync(join(root, "src", `direct-${name}.ts`), `import { value } from './base';\nexport const direct${index} = value + ${index};\n`);
  }
  for (let index = 0; index < transitiveCount; index += 1) {
    const name = String(index).padStart(3, "0");
    writeFileSync(join(root, "src", `transitive-${name}.ts`), `import { direct${index} } from './direct-${name}';\nexport const transitive${index} = direct${index} + 1;\n`);
  }
  git(root, ["init", "-q"]);
  git(root, ["config", "user.email", "benchmark@example.com"]);
  git(root, ["config", "user.name", "Agent Impact Benchmark"]);
  git(root, ["add", "."]);
  git(root, ["commit", "-qm", "benchmark"]);
  return root;
}

function summarize(value) {
  if (!value.ok) {
    return { ok: false, error: value.error.code };
  }
  return {
    ok: true,
    status: value.analysis.status,
    returnedNodes: value.analysis.returnedNodes,
    returnedEdges: value.analysis.returnedEdges,
    stopReasons: value.analysis.stopReasons,
  };
}

function runApi(root, name, limits) {
  const started = performance.now();
  const child = spawnSync(process.execPath, ["-e", apiChild], {
    cwd: repository,
    env: {
      ...process.env,
      AGENT_IMPACT_BENCH_ROOT: root,
      ...(limits ? { AGENT_IMPACT_BENCH_LIMITS: JSON.stringify(limits) } : {}),
    },
    encoding: "utf8",
    maxBuffer: 4 * 1024 * 1024,
  });
  const wallMs = performance.now() - started;
  if (child.status !== 0) {
    throw new Error(`${name} failed: ${child.stderr || child.stdout}`);
  }
  return { name, mode: "api-child", wallMs: Number(wallMs.toFixed(1)), ...JSON.parse(child.stdout) };
}

function runCli(root, name, limits) {
  const args = [cliEntry, "file", "src/base.ts", "--root", root, "--project", "tsconfig.json", "--json"];
  if (limits) {
    args.push(
      "--depth", String(limits.depth),
      "--max-nodes", String(limits.maxNodes),
      "--max-edges", String(limits.maxEdges),
      "--max-paths", String(limits.maxPathsPerTarget),
      "--max-output-bytes", String(limits.maxOutputBytes),
      "--max-files", String(limits.maxFiles),
      "--max-file-bytes", String(limits.maxFileBytes),
      "--max-total-file-bytes", String(limits.maxTotalFileBytes),
      "--max-diagnostics", String(limits.maxDiagnostics),
    );
  }
  const started = performance.now();
  const child = spawnSync(process.execPath, args, { cwd: repository, encoding: "utf8", maxBuffer: 4 * 1024 * 1024 });
  const wallMs = performance.now() - started;
  if (child.status !== 0) {
    throw new Error(`${name} failed: ${child.stderr || child.stdout}`);
  }
  return { name, mode: "cli-child", wallMs: Number(wallMs.toFixed(1)), ...summarize(JSON.parse(child.stdout)) };
}

const root = makeRepository();
try {
  const results = [
    runApi(root, "api-default", undefined),
    runApi(root, "api-hard", hardLimits),
    runCli(root, "cli-default", undefined),
    runCli(root, "cli-hard", hardLimits),
  ];
  console.log(JSON.stringify({
    node: process.version,
    platform: process.platform,
    arch: process.arch,
    files: directCount + transitiveCount + 1,
    graph: { directFiles: directCount, transitiveFiles: transitiveCount },
    limits: { default: "package defaults", hard: hardLimits },
    results,
  }, null, 2));
} finally {
  rmSync(root, { recursive: true, force: true });
}
