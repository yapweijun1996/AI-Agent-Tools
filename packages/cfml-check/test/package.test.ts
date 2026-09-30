import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

interface PackageManifest {
  name: string;
  version: string;
  main?: string;
  types?: string;
  exports?: { "."?: { types?: string; import?: string } };
  bin?: Record<string, string>;
}

test("package metadata exposes the TypeScript library entry and CLI", () => {
  const manifest = JSON.parse(readFileSync("package.json", "utf8")) as PackageManifest;
  assert.equal(manifest.name, "agent-cfml-check");
  assert.equal(manifest.version, "0.1.1");
  assert.equal(manifest.main, "./dist/index.js");
  assert.equal(manifest.types, "./dist/index.d.ts");
  assert.deepEqual(manifest.exports?.["."], {
    types: "./dist/index.d.ts",
    import: "./dist/index.js",
  });
  assert.equal(manifest.bin?.["agent-cfml-check"], "dist/cli/index.js");
});

test("package self-reference resolves the exported library entry", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "-e", "import('agent-cfml-check').then(({ capabilities }) => { if (typeof capabilities !== 'function') process.exit(1); })"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});
