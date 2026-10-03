import assert from "node:assert/strict";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { readArtifact } from "../src/input.js";

test("ancestor substitution and restoration cannot return outside-root bytes", {
  concurrency: false,
  skip: process.platform === "win32" ? "Directory symlink permission is environment-specific" : false,
}, () => {
  const directory = fs.realpathSync(fs.mkdtempSync(join(tmpdir(), "ait-context-pack-race-")));
  const root = join(directory, "root");
  const outside = join(directory, "outside");
  const artifacts = join(root, "artifacts");
  const held = join(root, "held-artifacts");
  const file = join(artifacts, "input.json");
  fs.mkdirSync(artifacts, { recursive: true });
  fs.mkdirSync(outside);
  fs.writeFileSync(file, "inside input\n");
  fs.writeFileSync(join(outside, "input.json"), "outside sentinel\n");
  const originalRealpath = fs.realpathSync;
  const originalOpen = fs.openSync;
  let substituted = false;
  try {
    // Schedule a directory replacement immediately after canonical validation,
    // then restore it after open. The fd must still match the original target.
    fs.realpathSync = function (name, ...args) {
      const actual = originalRealpath(name, ...args);
      if (!substituted && name === file) {
        substituted = true;
        fs.renameSync(artifacts, held);
        fs.symlinkSync(outside, artifacts, "dir");
      }
      return actual;
    };
    fs.openSync = function (name, ...args) {
      const descriptor = originalOpen(name, ...args);
      if (substituted && name === file) {
        fs.unlinkSync(artifacts);
        fs.renameSync(held, artifacts);
      }
      return descriptor;
    };
    syncBuiltinESMExports();
    assert.throws(
      () => readArtifact(root, "artifacts/input.json", [".json"], 1024),
      error => error.code === "UNSAFE_PATH",
    );
    assert.equal(substituted, true);
  } finally {
    fs.realpathSync = originalRealpath;
    fs.openSync = originalOpen;
    syncBuiltinESMExports();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
