import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const consumer = mkdtempSync(join(tmpdir(), "ait-context-pack-pack-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  PATH: `${dirname(process.execPath)}${delimiter}${process.env.PATH ?? ""}`,
  npm_config_cache: join(consumer, "cache"),
  npm_config_update_notifier: "false",
};
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    shell: process.platform === "win32" && command === npm,
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
  for (const name of ["request", "result"])
    assert.equal(JSON.parse(readFileSync(join(installed, `schema/${name}.schema.json`), "utf8")).$schema,
      "https://json-schema.org/draft/2020-12/schema");
  assert.match(readFileSync(join(installed, "types/index.d.ts"), "utf8"), /export function packContext/);
  const cli = join(installed, "src/cli.js");
  const caps = JSON.parse(run(process.execPath, [cli, "capabilities", "--json"]));
  assert.equal(caps.schema_version, "1.0.0");
  assert.equal(caps.tool.id, "agent-context-pack");
  assert.equal(caps.tool.version, manifest.version);
  assert.equal(caps.status, "ok");
  assert.equal(caps.complete, true);
  const output = run(process.execPath, [cli, "pack", "--manifest", "examples/manifest.json", "--root", installed, "--json"]);
  const fixture = JSON.parse(output);
  assert.equal(fixture.status, "ok");
  assert.equal(fixture.complete, true);
  assert.deepEqual(fixture.data.included.map(item => item.tool.id), ["agent-rules-resolve", "agent-patch-guard"]);
  assert.equal(fixture.data.budget.used, Buffer.byteLength(output, "utf8"));
  const imported = JSON.parse(run(process.execPath, [
    "--input-type=module", "--eval",
    `const api = await import(${JSON.stringify(manifest.name)}); console.log(JSON.stringify(api.capabilities()));`,
  ], consumer));
  assert.equal(imported.tool.id, manifest.name);
  if (process.platform !== "win32") {
    const linked = JSON.parse(run(process.execPath, [
      join(consumer, "node_modules/.bin/agent-context-pack"), "capabilities", "--json",
    ]));
    assert.equal(linked.complete, true);
  }
  console.log("Packed consumer CLI, API, example pack, byte accounting, schemas, license and declarations passed");
} finally {
  rmSync(consumer, { recursive: true, force: true });
}
