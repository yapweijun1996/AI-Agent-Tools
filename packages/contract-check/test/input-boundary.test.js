import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { readJson } from "../src/index.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));

test("invalid UTF-8 is rejected instead of compared as replacement characters", () => {
  const root = mkdtempSync(join(tmpdir(), "contract-utf8-"));
  try {
    const before = join(root, "before.json"), after = join(root, "after.json");
    writeFileSync(before, Buffer.concat([Buffer.from('{"const":"'), Buffer.from([255]), Buffer.from('"}')]));
    writeFileSync(after, '{"const":"\\uFFFD"}');
    assert.throws(() => readJson(before), { code: "INVALID_INPUT" });
    assert.deepEqual(readJson(after), { const: "\uFFFD" });
    const result = spawnSync(process.execPath, [cli, "compare", "--before", before, "--after", after, "--json"], { encoding: "utf8", timeout: 3000 });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).status, "error");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("writerless FIFOs are rejected without blocking", { skip: process.platform === "win32" }, () => {
  const root = mkdtempSync(join(tmpdir(), "contract-fifo-"));
  try {
    const file = join(root, "fifo.json");
    assert.equal(spawnSync("mkfifo", [file]).status, 0);
    const result = spawnSync(process.execPath, [cli, "compare", "--before", file, "--after", file, "--json"], { encoding: "utf8", timeout: 3000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).status, "error");
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("a regular-file-to-FIFO substitution cannot block descriptor admission", { skip: process.platform === "win32" }, () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "contract-substitute-")));
  try {
    const file = join(root, "input.json");
    writeFileSync(file, "{}");
    const script = `
      const fs = require('node:fs');
      const original = fs.openSync;
      fs.openSync = (name, ...args) => {
        if (name === process.argv[1]) {
          fs.unlinkSync(name);
          require('node:child_process').execFileSync('mkfifo', [name]);
        }
        return original(name, ...args);
      };
      require('node:module').syncBuiltinESMExports();
      import(process.argv[2]).then(({ readJson }) => {
        try { readJson(process.argv[1]); process.exitCode = 1; }
        catch (error) { console.log(error.code); }
      });`;
    const module = new URL("../src/index.js", import.meta.url).href;
    const result = spawnSync(process.execPath, ["-e", script, file, module], { encoding: "utf8", timeout: 3000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout.trim(), "INVALID_INPUT");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
