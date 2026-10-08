import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), "ait-patch-guard pack # -"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npmCli = process.env.npm_execpath || join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
  npm_config_cache: join(consumer, "cache"),
  npm_config_update_notifier: "false",
};
function run(command, args, cwd = root) {
  const useNpmCli = command === npm && existsSync(npmCli);
  const result = spawnSync(useNpmCli ? process.execPath : command, useNpmCli ? [npmCli, ...args] : args, {
    cwd,
    env,
    encoding: "utf8",
    timeout: 60_000,
    maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0)
    throw new Error(`Packed smoke failed: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}
try {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
  const [packed] = JSON.parse(
    run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", consumer]),
  );
  run(npm, [
    "install", "--prefix", consumer, join(consumer, packed.filename),
    "--offline", "--ignore-scripts", "--no-audit", "--no-fund",
  ]);
  const installed = join(consumer, "node_modules", manifest.name);
  assert.equal(
    readFileSync(join(installed, "LICENSE"), "utf8"),
    readFileSync(join(root, "LICENSE"), "utf8"),
  );
  for (const artifact of ["schema/policy.schema.json", "schema/result.schema.json"])
    assert.equal(JSON.parse(readFileSync(join(installed, artifact), "utf8")).$schema,
      "https://json-schema.org/draft/2020-12/schema");
  assert.match(readFileSync(join(installed, "types/index.d.ts"), "utf8"),
    /export function checkPatch/);
  const cli = join(installed, "src/cli.js");
  const caps = JSON.parse(run(process.execPath, [cli, "capabilities", "--json"]));
  assert.equal(caps.schema_version, "1.0.0");
  assert.equal(caps.tool.id, "agent-patch-guard");
  assert.equal(caps.tool.version, manifest.version);
  assert.equal(caps.status, "ok");
  assert.equal(caps.complete, true);
  const fixture = JSON.parse(run(process.execPath, [
    cli, "check", "--root", installed,
    "--diff", "examples/safe.diff", "--policy", "examples/policy.json", "--json",
  ]));
  assert.equal(fixture.status, "ok");
  assert.equal(fixture.complete, true);
  assert.equal(fixture.data.verdict, "pass");
  assert.equal(fixture.data.summary.files, 1);
  assert.equal(fixture.data.summary.added_lines, 1);
  assert.equal(fixture.data.summary.deleted_lines, 1);
  assert.deepEqual(fixture.data.findings, []);
  const imported = JSON.parse(run(process.execPath, [
    "--input-type=module", "--eval",
    `const api = await import(${JSON.stringify(manifest.name)}); console.log(JSON.stringify(api.capabilities()));`,
  ], consumer));
  assert.equal(imported.tool.id, manifest.name);
  if (process.platform !== "win32") {
    const linked = JSON.parse(run(process.execPath, [
      join(consumer, "node_modules/.bin/agent-patch-guard"), "capabilities", "--json",
    ]));
    assert.equal(linked.complete, true);
  }
  console.log("Packed consumer CLI, API, safe fixture, schemas, license and declarations passed");
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
