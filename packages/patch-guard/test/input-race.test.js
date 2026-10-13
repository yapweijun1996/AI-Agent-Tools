import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const inputUrl = new URL("../src/input.js", import.meta.url).href;
const cliUrl = new URL("../src/cli.js", import.meta.url).href;

function capture(mode, cli = false) {
  const directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "ait-patch-race-")));
  const script = `
    import assert from "node:assert/strict";
    import fs from "node:fs";
    import { syncBuiltinESMExports } from "node:module";
    import { join } from "node:path";
    const { readArtifact, InputError } = await import(${JSON.stringify(inputUrl)});
    const { runCli } = await import(${JSON.stringify(cliUrl)});
    const directory = ${JSON.stringify(directory)};
    const mode = ${JSON.stringify(mode)}, cli = ${JSON.stringify(cli)};
    const root = join(directory, "root"), artifacts = join(root, "artifacts");
    const outside = join(directory, "outside"), held = join(root, "held-artifacts");
    fs.mkdirSync(artifacts, { recursive: true });
    fs.mkdirSync(outside);
    const file = join(artifacts, "input.diff"), name = "artifacts/input.diff";
    const originalText = "inside input\\n", changedText = "changed text\\n";
    assert.equal(Buffer.byteLength(originalText), Buffer.byteLength(changedText));
    if (mode === "directory") fs.mkdirSync(file);
    else {
      fs.writeFileSync(file, originalText);
      fs.utimesSync(file, 1000000000, 1000000000);
    }
    fs.writeFileSync(join(outside, "input.diff"), "outside sentinel\\n");
    fs.writeFileSync(join(root, "policy.json"), JSON.stringify({
      schema_version: "1.0.0", allowed_paths: ["*"],
    }));
    const open = fs.openSync, read = fs.readSync, stat = fs.fstatSync, realpath = fs.realpathSync;
    let triggered = false, opened = false, targetFd, descriptorStats = 0;
    fs.realpathSync = function (name, ...args) {
      const actual = realpath(name, ...args);
      if (mode === "ancestor" && name === file && !triggered) {
        triggered = true;
        fs.renameSync(artifacts, held);
        fs.symlinkSync(outside, artifacts, "dir");
      }
      return actual;
    };
    fs.openSync = function (name, ...args) {
      if (name !== file) return open(name, ...args);
      opened = true;
      if (mode === "size-before-open" || mode === "same-size-before-open") {
        triggered = true;
        fs.writeFileSync(file, mode === "size-before-open" ? changedText + "extra" : changedText);
        fs.utimesSync(file, 1000000000, 1000000010);
      }
      targetFd = open(name, ...args);
      if (mode === "ancestor" && triggered) {
        fs.unlinkSync(artifacts);
        fs.renameSync(held, artifacts);
      }
      return targetFd;
    };
    fs.readSync = function (...args) {
      const count = read(...args);
      if (args[0] === targetFd && !triggered &&
          (mode === "change-during-read" || mode === "replace-during-read")) {
        triggered = true;
        if (mode === "replace-during-read") fs.renameSync(file, file + ".old");
        fs.writeFileSync(file, changedText + "extra");
      }
      return count;
    };
    fs.fstatSync = function (fd, ...args) {
      const snapshot = stat(fd, ...args);
      if (fd === targetFd && ++descriptorStats === 2 &&
          (mode === "replace-after-fstat" || mode === "symlink-after-fstat")) {
        // Substitute only after the final descriptor snapshot. During-read
        // renames may already be caught by ctime and are not this boundary.
        triggered = true;
        fs.renameSync(file, file + ".old");
        if (mode === "symlink-after-fstat") fs.symlinkSync(join(outside, "input.diff"), file);
        else fs.writeFileSync(file, changedText);
      }
      return snapshot;
    };
    syncBuiltinESMExports();
    if (cli) {
      assert.equal(runCli(["check", "--diff", name, "--policy", "policy.json", "--root", root, "--json"]), 3);
    } else if (mode === "valid") {
      assert.equal(readArtifact(root, name, [".diff"], 1024), originalText);
    } else {
      const unsafe = ["ancestor", "directory"].includes(mode);
      assert.throws(() => readArtifact(root, name, [".diff"], 1024), error =>
        error instanceof InputError && error.code === (unsafe ? "UNSAFE_PATH" : "INPUT_CHANGED") &&
        error.status === (unsafe ? "error" : "incomplete"));
    }
    if (mode === "directory") assert.equal(opened, false);
    else assert.equal(opened, true);
    assert.equal(triggered, !["valid", "directory"].includes(mode));
  `;
  try {
    const result = spawnSync(process.execPath, ["--input-type=module", "--eval", script], {
      encoding: "utf8", timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.equal(result.stderr, "");
    if (cli) {
      const envelope = JSON.parse(result.stdout);
      assert.equal(envelope.status, "incomplete");
      assert.equal(envelope.complete, false);
      assert.equal(envelope.data, null);
      assert.equal(envelope.errors[0].code, "INPUT_CHANGED");
    } else assert.equal(result.stdout, "");
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test("ordinary valid reads retain their text return shape", () => capture("valid"));
test("non-regular files are rejected before open", () => capture("directory"));
for (const mode of ["size-before-open", "same-size-before-open", "change-during-read",
  "replace-during-read", "replace-after-fstat"]) {
  test("read primitive withholds bytes: " + mode, () => capture(mode));
  test("native CLI retains INPUT_CHANGED incomplete/exit 3: " + mode, () => capture(mode, true));
}
test("final named-path symlink substitution withholds bytes", {
  skip: process.platform === "win32" ? "File symlink permission is environment-specific" : false,
}, () => capture("symlink-after-fstat"));
test("ancestor substitution and restoration cannot return outside-root bytes", {
  skip: process.platform === "win32" ? "Directory symlink permission is environment-specific" : false,
}, () => capture("ancestor"));
