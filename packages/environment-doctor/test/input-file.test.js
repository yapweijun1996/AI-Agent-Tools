import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { LIMITS, readJson } from "../src/index.js";
import { runCli } from "../src/cli.js";

const cli = fileURLToPath(new URL("../src/cli.js", import.meta.url));
const posix = { skip: process.platform === "win32" ? "POSIX FIFO files are unavailable on Windows" : false };
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "env-doctor-input-")));
  writeFileSync(join(root, "requirements.json"), JSON.stringify({ schemaVersion: "1.0", runtimes: { node: null } }));
  writeFileSync(join(root, "snapshot.json"), JSON.stringify({ schemaVersion: "1.0", runtimes: { node: { available: true } } }));
  return root;
}
test("CLI rejects a writerless FIFO in every input position without blocking", posix, () => {
  const root = fixture();
  try {
    const fifo = join(root, "pipe.json");
    const made = spawnSync("mkfifo", [fifo], { encoding: "utf8" });
    assert.equal(made.status, 0, made.stderr);
    for (const position of ["--requirements", "--snapshot", "--manifest"]) {
      const args = ["check", "--requirements", join(root, "requirements.json"), "--snapshot", join(root, "snapshot.json"), "--json"];
      if (position === "--manifest") args.push(position, fifo);
      else args[args.indexOf(position) + 1] = fifo;
      const result = spawnSync(process.execPath, [cli, ...args], { encoding: "utf8", timeout: 2000 });
      assert.equal(result.error, undefined, `${position}: ${result.error?.code}`);
      assert.equal(result.status, 2, result.stderr);
      assert.equal(JSON.parse(result.stdout).status, "error");
      assert.equal(result.stderr, "");
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("regular-file substitution with a FIFO cannot block descriptor validation", posix, () => {
  const root = fixture();
  try {
    const file = join(root, "requirements.json");
    const script = `
      import fs from 'node:fs';
      import { spawnSync } from 'node:child_process';
      import { syncBuiltinESMExports } from 'node:module';
      const file = ${JSON.stringify(file)};
      const original = fs.openSync;
      let substituted = false;
      fs.openSync = (path, flags, ...rest) => {
        if (path === file) {
          fs.unlinkSync(file);
          if (spawnSync('mkfifo', [file]).status !== 0) throw new Error('fixture failure');
          substituted = true;
        }
        return original(path, flags, ...rest);
      };
      syncBuiltinESMExports();
      const { runCli } = await import(${JSON.stringify(new URL("../src/cli.js", import.meta.url).href)});
      const result = runCli(['check', '--requirements', file, '--snapshot', ${JSON.stringify(join(root, "snapshot.json"))}, '--json']);
      if (!substituted) throw new Error('fixture did not substitute the input');
      process.stdout.write(result.stdout);
      process.exitCode = result.code;
    `;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8", timeout: 2000 });
    assert.equal(result.error, undefined, result.error?.code);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(JSON.parse(result.stdout).status, "error");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("directories and oversized regular files remain invalid", () => {
  const root = fixture();
  try {
    const directory = join(root, "directory.json");
    mkdirSync(directory);
    assert.throws(() => readJson(directory), { code: "INVALID_INPUT" });
    const oversized = join(root, "large.json");
    writeFileSync(oversized, Buffer.alloc(LIMITS.inputBytes + 1, 32));
    assert.throws(() => readJson(oversized), { code: "INVALID_INPUT" });
  } finally { rmSync(root, { recursive: true, force: true }); }
});
test("ordinary offline inputs still produce a passing result", () => {
  const root = fixture();
  try {
    const requirements = join(root, "requirements.json");
    assert.equal(readJson(requirements).schemaVersion, "1.0");
    const result = runCli(["check", "--requirements", requirements, "--snapshot", join(root, "snapshot.json"), "--json"]);
    assert.equal(result.code, 0);
    assert.equal(JSON.parse(result.stdout).status, "pass");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
