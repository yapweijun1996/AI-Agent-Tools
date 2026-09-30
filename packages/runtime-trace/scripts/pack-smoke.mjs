import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const dir = mkdtempSync(join(tmpdir(), "ait-mvp-pack-"));
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const run = (cmd, args, options = {}) => {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: process.platform === "win32" && cmd === npm,
    ...options,
  });
  if (r.status !== 0)
    throw new Error("Packed smoke command failed: " + (r.stderr || r.stdout));
  return r.stdout;
};
try {
  const packed = JSON.parse(
    run(npm, ["pack", "--json", "--ignore-scripts", "--pack-destination", dir]),
  );
  run(npm, [
    "install",
    "--prefix",
    dir,
    join(dir, packed[0].filename),
    "--ignore-scripts",
    "--no-audit",
    "--no-fund",
  ]);
  const manifest = JSON.parse(
    run(process.execPath, ["-p", 'JSON.stringify(require("./package.json"))']),
  );
  const installed = join(dir, "node_modules", manifest.name);
  for (const required of [
    "LICENSE",
    "schema/result.schema.json",
    "types/index.d.ts",
  ])
    if (!existsSync(join(installed, required)))
      throw new Error("Missing packed " + required);
  const caps = JSON.parse(
    run(process.execPath, [
      join(installed, "src/cli.js"),
      "capabilities",
      "--json",
    ]),
  );
  if (caps.schemaVersion !== "1.0" || !caps.complete)
    throw new Error("Invalid packed capabilities");
  if (process.platform !== "win32") {
    const cli = Object.keys(manifest.bin)[0];
    const linked = JSON.parse(
      run(process.execPath, [
        join(dir, "node_modules/.bin", cli),
        "capabilities",
        "--json",
      ]),
    );
    if (!linked.complete) throw new Error("Linked packed CLI failed");
  }
  const args = [
    "ui-regression-check",
    "--input",
    join(installed, "examples/mobile-pass.json"),
    "--json",
  ];
  const actual = JSON.parse(
    run(process.execPath, [join(installed, "src/cli.js"), ...args]),
  );
  if (actual.status !== "pass") throw new Error("Packed actual fixture failed");
  console.log(
    "Packed consumer capabilities, license, schema and declarations passed",
  );
} finally {
  rmSync(dir, { recursive: true, force: true });
}
