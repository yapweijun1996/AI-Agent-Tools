import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Ajv2020 } from "ajv/dist/2020.js";

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("packed consumer validates installed CLI outputs against installed schemas", { timeout: 120_000 }, (context) => {
  const temporary = mkdtempSync(path.join(tmpdir(), "code-slice packed schemas # -"));
  context.after(() => rmSync(temporary, { recursive: true, force: true }));
  const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  assert.ok(existsSync(npmCli), "Run this packed-consumer test through npm or a Node distribution with npm");

  function npm(args: string[]): string {
    const result = spawnSync(process.execPath, [npmCli, ...args], {
      cwd: repository, encoding: "utf8", timeout: 60_000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  }

  const packed = JSON.parse(npm(["pack", "--json", "--ignore-scripts", "--pack-destination", temporary])) as Array<{ filename: string }>;
  assert.equal(packed.length, 1);
  const installed = path.join(temporary, "installed");
  npm(["install", "--prefix", installed, "--no-save", "--omit=dev", "--ignore-scripts", "--prefer-offline", "--no-audit", "--no-fund", path.join(temporary, packed[0]!.filename)]);
  const packageRoot = path.join(installed, "node_modules", "agent-code-slice");
  const cli = path.join(packageRoot, "dist", "cli", "index.js");
  const fixture = path.join(temporary, "fixture.js");
  writeFileSync(fixture, "export function packedFixture() { return 1; }\n");

  for (const scenario of [
    { schema: "code-slice-result-v1.schema.json", args: ["outline", fixture, "--root", temporary, "--json"], status: 0, ok: true },
    { schema: "code-slice-result-v1.1.schema.json", args: ["--unknown-option", "--json"], status: 2, ok: false },
  ]) {
    const schemaBytes = readFileSync(path.join(packageRoot, "schemas", scenario.schema));
    assert.deepEqual(schemaBytes, readFileSync(path.join(repository, "schemas", scenario.schema)), "Installed schema must match its maintained source");
    const validate = new Ajv2020({ strict: false }).compile(JSON.parse(schemaBytes.toString("utf8")) as object);
    const result = spawnSync(process.execPath, [cli, ...scenario.args], { cwd: installed, encoding: "utf8", timeout: 30_000 });
    assert.ifError(result.error);
    assert.equal(result.status, scenario.status, result.stderr);
    assert.equal(result.stderr, "");
    const envelope = JSON.parse(result.stdout) as { ok: boolean };
    assert.equal(envelope.ok, scenario.ok);
    assert.equal(validate(envelope), true, JSON.stringify(validate.errors));
  }
});
