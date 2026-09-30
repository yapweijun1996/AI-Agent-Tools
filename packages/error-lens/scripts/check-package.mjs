import { mkdtemp, readFile, rm } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const packageJson = JSON.parse(await readFile("package.json", "utf8"));
const releaseMode = process.env.AGENT_ERROR_LENS_RELEASE === "1";
const npmExecPath = process.env.npm_execpath;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const command = npmExecPath ? process.execPath : npmCommand;
const commandArgs = npmExecPath
  ? [npmExecPath, "pack", "--dry-run", "--json", "--ignore-scripts"]
  : ["pack", "--dry-run", "--json", "--ignore-scripts"];
const pack = spawnSync(command, commandArgs, { encoding: "utf8" });
if (pack.status !== 0) {
  const failureDetail = [pack.stderr, pack.stdout, pack.error?.message]
    .filter(Boolean)
    .join("\n")
    .trim();
  console.error(failureDetail || "npm pack dry-run failed");
  process.exit(1);
}

let metadata;
try {
  metadata = JSON.parse(pack.stdout);
} catch {
  console.error("npm pack dry-run did not return JSON metadata");
  process.exit(1);
}

const files = metadata[0]?.files?.map((entry) => entry.path).sort() ?? [];
const packageMetadata = metadata[0];
const allowed = (path) => path === "package.json"
  || path === "README.md"
  || path === "CHANGELOG.md"
  || path === "LICENSE"
  || path === "contract/agent-error-lens-v1.schema.json"
  || path.startsWith("dist/");
const required = [
  "package.json",
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "contract/agent-error-lens-v1.schema.json",
  "dist/src/index.js",
  "dist/src/index.d.ts",
  "dist/src/index.js.map",
  "dist/src/index.d.ts.map",
  "dist/src/cli.js",
  "dist/src/cli.d.ts",
  "dist/src/cli.js.map",
  "dist/src/core/serialize.js",
];

function npmInvocation(args) {
  return npmExecPath
    ? { command, args: [npmExecPath, ...args] }
    : { command, args };
}

function failureDetail(result) {
  return [result.stderr, result.stdout, result.error?.message].filter(Boolean).join("\n").trim();
}

function runNode(args, options = {}) {
  return spawnSync(process.execPath, args, { encoding: "utf8", ...options });
}

const expectedPrivate = !releaseMode;
if (packageJson.private !== expectedPrivate
  || packageJson.type !== "module"
  || packageJson.license !== "MIT"
  || packageJson.engines?.node !== ">=20.11.0 <25"
  || packageJson.repository?.type !== "git"
  || packageJson.repository?.url !== "git+https://github.com/yapweijun1996/AI-Agent-Tools.git"
  || packageJson.repository?.directory !== "packages/error-lens"
  || packageJson.publishConfig?.registry !== "https://registry.npmjs.org/"
  || packageJson.publishConfig?.access !== "public") {
  console.error(`package metadata does not match the frozen ${releaseMode ? "release-ready" : "private"} MIT ESM Node contract`);
  process.exit(1);
}
if (Object.keys(packageJson.dependencies ?? {}).length !== 0) {
  console.error("runtime dependencies are not empty");
  process.exit(1);
}
if (packageJson.exports?.["."]?.types !== "./dist/src/index.d.ts"
  || packageJson.exports?.["."]?.import !== "./dist/src/index.js"
  || packageJson.exports?.["./contract"] !== "./contract/agent-error-lens-v1.schema.json"
  || packageJson.bin?.["agent-error-lens"] !== "./dist/src/cli.js") {
  console.error("package exports or bin mappings do not match the frozen package contract");
  process.exit(1);
}
if (!/^sha512-[A-Za-z0-9+/]+=*$/u.test(packageMetadata?.integrity ?? "")
  || !/^[0-9a-f]{40}$/u.test(packageMetadata?.shasum ?? "")) {
  console.error("npm pack dry-run did not return stable integrity metadata");
  process.exit(1);
}
if (files.some((path) => !allowed(path)) || required.some((path) => !files.includes(path))) {
  console.error(`package allowlist mismatch: ${files.join(", ")}`);
  process.exit(1);
}

const packDirectory = await mkdtemp(join(tmpdir(), "agent-error-lens-pack-"));
const consumerDirectory = await mkdtemp(join(tmpdir(), "agent-error-lens-consumer-"));
let packedConsumerPassed = false;
try {
  const packed = spawnSync(command, npmInvocation(["pack", "--json", "--ignore-scripts", "--pack-destination", packDirectory]).args, {
    encoding: "utf8",
  });
  if (packed.status !== 0) {
    throw new Error(failureDetail(packed) || "npm pack failed");
  }
  let packedMetadata;
  try {
    packedMetadata = JSON.parse(packed.stdout);
  } catch {
    throw new Error("npm pack did not return JSON metadata");
  }
  const filename = packedMetadata[0]?.filename;
  if (typeof filename !== "string" || basename(filename) !== filename) {
    throw new Error("npm pack returned an invalid tarball filename");
  }
  const tarball = join(packDirectory, filename);
  const installed = spawnSync(command, npmInvocation([
    "install",
    "--prefix",
    consumerDirectory,
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
    "--package-lock=false",
    tarball,
  ]).args, { encoding: "utf8" });
  if (installed.status !== 0) {
    throw new Error(failureDetail(installed) || "packed consumer install failed");
  }

  const importProbe = runNode(["--input-type=module", "-e", "const pkg = await import('agent-error-lens'); if (pkg.capabilities().schemaVersion !== '1') process.exit(1);"], { cwd: consumerDirectory });
  if (importProbe.status !== 0) {
    throw new Error(failureDetail(importProbe) || "packed consumer import failed");
  }

  const cliPath = join(consumerDirectory, "node_modules", packageJson.name, "dist", "src", "cli.js");
  const cliRequest = JSON.stringify({
    schemaVersion: "1",
    artifacts: [{ id: "stderr", stream: "stderr", content: "src/order.ts(1,1): error TS2339: packed smoke\n" }],
  });
  const cliProbe = runNode([cliPath, "parse", "--stdin", "--format", "json"], { cwd: consumerDirectory, input: cliRequest });
  if (cliProbe.status !== 0) {
    throw new Error(failureDetail(cliProbe) || "packed CLI smoke failed");
  }
  let cliResult;
  try {
    cliResult = JSON.parse(cliProbe.stdout);
  } catch {
    throw new Error("packed CLI did not return JSON");
  }
  if (cliResult.status !== "complete" || cliResult.data?.diagnostics?.[0]?.code !== "TS2339") {
    throw new Error("packed CLI returned an unexpected diagnostic result");
  }
  packedConsumerPassed = true;
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
} finally {
  await Promise.all([
    rm(packDirectory, { recursive: true, force: true }),
    rm(consumerDirectory, { recursive: true, force: true }),
  ]);
}

if (packedConsumerPassed) console.log(`package allowlist and packed consumer audit: passed (${files.length} files; ${releaseMode ? "release-ready" : "private"} boundary)`);
