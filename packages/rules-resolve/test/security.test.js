import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { encodeResult, exitCode, resolveRules } from "../src/index.js";

function fixture(callback) {
  const container = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "rules-resolve-security-")));
  const root = path.join(container, "root");
  const outside = path.join(container, "outside");
  fs.mkdirSync(root);
  fs.mkdirSync(outside);
  try { return callback(root, outside, container); }
  finally { fs.rmSync(container, { recursive: true, force: true }); }
}
const options = (root, extra = {}) => ({ root, target: ".", targetKind: "directory", profile: "agents-chain-v1", ...extra });
function fail(result, code, expectedExit) {
  assert.equal(result.complete, false, JSON.stringify(result));
  assert.equal(result.data, null);
  assert.equal(result.errors[0].code, code);
  assert.equal(exitCode(result), expectedExit);
}
function createFileLink(context, target, link) {
  try { fs.symlinkSync(target, link, "file"); return true; }
  catch (error) {
    if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
      context.skip("Windows file symlink creation requires developer mode or elevated permission");
      return false;
    }
    throw error;
  }
}
const directoryLinkType = process.platform === "win32" ? "junction" : "dir";

test("descendant directory symlinks are rejected even when they point within the root", (context) => fixture((root, outside) => {
  fs.mkdirSync(path.join(root, "real"));
  fs.writeFileSync(path.join(root, "real/AGENTS.md"), "inside\n");
  fs.writeFileSync(path.join(outside, "AGENTS.md"), "outside-secret\n");
  fs.symlinkSync(path.join(root, "real"), path.join(root, "inside-link"), directoryLinkType);
  fs.symlinkSync(outside, path.join(root, "outside-link"), directoryLinkType);
  for (const target of ["inside-link", "outside-link"]) {
    const result = resolveRules(options(root, { target }));
    fail(result, "UNSAFE_PATH", 4);
    assert.ok(!encodeResult(result).includes("outside-secret"));
    assert.ok(!encodeResult(result).includes(root));
  }
}));

test("rule file symlinks and metadata-only target symlinks are unsafe", (context) => fixture((root, outside) => {
  const external = path.join(outside, "rules.md");
  fs.writeFileSync(external, "outside-secret\n");
  if (!createFileLink(context, external, path.join(root, "AGENTS.md"))) return;
  fail(resolveRules(options(root)), "UNSAFE_PATH", 4);
  fs.unlinkSync(path.join(root, "AGENTS.md"));
  fs.writeFileSync(path.join(root, "inside.txt"), "inside\n");
  if (!createFileLink(context, path.join(root, "inside.txt"), path.join(root, "target.txt"))) return;
  fail(resolveRules(options(root, { target: "target.txt", targetKind: "file" })), "UNSAFE_PATH", 4);
}));

test("a shadowed symlink remains unsafe even though its content would not be opened", (context) => fixture((root, outside) => {
  fs.writeFileSync(path.join(root, "AGENTS.override.md"), "selected\n");
  fs.writeFileSync(path.join(outside, "rules.md"), "shadowed-secret\n");
  if (!createFileLink(context, path.join(outside, "rules.md"), path.join(root, "AGENTS.md"))) return;
  const result = resolveRules(options(root));
  fail(result, "UNSAFE_PATH", 4);
  assert.ok(!encodeResult(result).includes("shadowed-secret"));
}));

test("the caller-selected root alias is canonicalized without exposing an absolute root", () => fixture((root, outside, container) => {
  fs.writeFileSync(path.join(root, "AGENTS.md"), "root\n");
  const alias = path.join(container, "alias");
  fs.symlinkSync(root, alias, directoryLinkType);
  const result = resolveRules(options(alias));
  assert.equal(result.status, "ok", JSON.stringify(result));
  assert.equal(result.data.sources[0].path, "AGENTS.md");
  assert.ok(!encodeResult(result).includes(alias));
  assert.ok(!encodeResult(result).includes(root));
}));

test("FIFO candidates and file targets are rejected without blocking on reads", {
  skip: process.platform === "win32" ? "Windows does not expose POSIX FIFO files" : false,
}, () => fixture((root) => {
  for (const filename of ["AGENTS.md", "target.txt"]) {
    const response = spawnSync("mkfifo", [path.join(root, filename)], { encoding: "utf8", timeout: 5000 });
    assert.equal(response.error, undefined);
    assert.equal(response.status, 0, response.stderr);
  }
  fail(resolveRules(options(root)), "UNSAFE_PATH", 4);
  fs.unlinkSync(path.join(root, "AGENTS.md"));
  fail(resolveRules(options(root, { target: "target.txt", targetKind: "file" })), "UNSAFE_PATH", 4);
}));

test("candidate replacement between metadata validation and open is incomplete", { concurrency: false }, () => fixture((root) => {
  const candidate = path.join(root, "AGENTS.md");
  fs.writeFileSync(candidate, "original\n");
  const originalOpen = fs.openSync;
  let mutated = false;
  try {
    fs.openSync = function (name, ...args) {
      if (String(name) === candidate && !mutated) {
        mutated = true;
        fs.renameSync(candidate, path.join(root, "held.md"));
        fs.writeFileSync(candidate, "replacement-secret\n");
      }
      return originalOpen(name, ...args);
    };
    syncBuiltinESMExports();
    const result = resolveRules(options(root, { includeContent: true }));
    fail(result, "INPUT_CHANGED", 3);
    assert.equal(mutated, true);
    assert.ok(!encodeResult(result).includes("replacement-secret"));
  } finally {
    fs.openSync = originalOpen;
    syncBuiltinESMExports();
  }
}));

test("in-place file growth during bounded reads is incomplete", { concurrency: false }, () => fixture((root) => {
  const candidate = path.join(root, "AGENTS.md");
  fs.writeFileSync(candidate, "original\n");
  const originalRead = fs.readSync;
  let mutated = false;
  try {
    fs.readSync = function (...args) {
      const length = originalRead(...args);
      if (!mutated) {
        mutated = true;
        fs.appendFileSync(candidate, "mutated-secret\n");
      }
      return length;
    };
    syncBuiltinESMExports();
    const result = resolveRules(options(root, { includeContent: true }));
    fail(result, "INPUT_CHANGED", 3);
    assert.equal(mutated, true);
    assert.ok(!encodeResult(result).includes("mutated-secret"));
  } finally {
    fs.readSync = originalRead;
    syncBuiltinESMExports();
  }
}));

test("a previously absent higher-priority candidate appearing before final verification is incomplete", { concurrency: false }, () => fixture((root) => {
  const absent = path.join(root, "AGENTS.override.md");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "fallback\n");
  const originalStat = fs.lstatSync;
  let probes = 0;
  try {
    fs.lstatSync = function (name, ...args) {
      if (String(name) === absent && ++probes === 2) fs.writeFileSync(absent, "new override\n");
      return originalStat(name, ...args);
    };
    syncBuiltinESMExports();
    fail(resolveRules(options(root)), "INPUT_CHANGED", 3);
    assert.equal(probes, 2);
  } finally {
    fs.lstatSync = originalStat;
    syncBuiltinESMExports();
  }
}));

test("the metadata-only target snapshot also detects a new file appearing during discovery", { concurrency: false }, () => fixture((root) => {
  const candidate = path.join(root, "AGENTS.md");
  fs.writeFileSync(candidate, "root\n");
  const originalOpen = fs.openSync;
  let mutated = false;
  try {
    fs.openSync = function (name, ...args) {
      if (String(name) === candidate && !mutated) {
        mutated = true;
        fs.writeFileSync(path.join(root, "new.js"), "new target\n");
      }
      return originalOpen(name, ...args);
    };
    syncBuiltinESMExports();
    fail(resolveRules(options(root, { target: "new.js", targetKind: "file" })), "INPUT_CHANGED", 3);
    assert.equal(mutated, true);
  } finally {
    fs.openSync = originalOpen;
    syncBuiltinESMExports();
  }
}));

test("shadowed candidate mutations invalidate the final inventory", { concurrency: false }, () => fixture((root) => {
  fs.writeFileSync(path.join(root, "AGENTS.override.md"), "root selected\n");
  fs.writeFileSync(path.join(root, "AGENTS.md"), "root shadowed\n");
  fs.mkdirSync(path.join(root, "src"));
  const child = path.join(root, "src/AGENTS.md");
  fs.writeFileSync(child, "child\n");
  const originalOpen = fs.openSync;
  let mutated = false;
  try {
    fs.openSync = function (name, ...args) {
      if (String(name) === child && !mutated) {
        mutated = true;
        fs.appendFileSync(path.join(root, "AGENTS.md"), "changed\n");
      }
      return originalOpen(name, ...args);
    };
    syncBuiltinESMExports();
    fail(resolveRules(options(root, { target: "src" })), "INPUT_CHANGED", 3);
    assert.equal(mutated, true);
  } finally {
    fs.openSync = originalOpen;
    syncBuiltinESMExports();
  }
}));

test("ancestor substitution and restoration cannot return outside-root rule text", {
  concurrency: false,
  skip: process.platform === "win32" ? "Directory symlink replacement permission is environment-specific" : false,
}, () => fixture((root, outside) => {
  const inside = path.join(root, "src");
  const held = path.join(root, "held-src");
  const candidate = path.join(inside, "AGENTS.md");
  fs.mkdirSync(inside);
  fs.writeFileSync(candidate, "inside\n");
  fs.writeFileSync(path.join(outside, "AGENTS.md"), "outside-secret\n");
  const originalRealpath = fs.realpathSync;
  const originalOpen = fs.openSync;
  let validations = 0;
  let substituted = false;
  try {
    fs.realpathSync = function (name, ...args) {
      const actual = originalRealpath(name, ...args);
      if (String(name) === candidate && ++validations === 2) {
        fs.renameSync(inside, held);
        fs.symlinkSync(outside, inside, "dir");
        substituted = true;
      }
      return actual;
    };
    fs.openSync = function (name, ...args) {
      const fd = originalOpen(name, ...args);
      if (String(name) === candidate && substituted) {
        fs.unlinkSync(inside);
        fs.renameSync(held, inside);
      }
      return fd;
    };
    syncBuiltinESMExports();
    const result = resolveRules(options(root, { target: "src", includeContent: true }));
    assert.equal(result.complete, false, JSON.stringify(result));
    assert.equal(result.data, null);
    assert.ok(["INPUT_CHANGED", "UNSAFE_PATH"].includes(result.errors[0].code));
    assert.equal(substituted, true);
    assert.ok(!encodeResult(result).includes("outside-secret"));
  } finally {
    fs.realpathSync = originalRealpath;
    fs.openSync = originalOpen;
    syncBuiltinESMExports();
  }
}));

test("cooperative duration caps reject delayed filesystem operations", { concurrency: false }, () => fixture((root) => {
  const originalRealpath = fs.realpathSync;
  let delayed = false;
  try {
    fs.realpathSync = function (...args) {
      if (!delayed) {
        delayed = true;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
      }
      return originalRealpath(...args);
    };
    syncBuiltinESMExports();
    fail(resolveRules(options(root, { limits: { max_duration_ms: 1 } })), "RESOURCE_LIMIT", 3);
    assert.equal(delayed, true);
  } finally {
    fs.realpathSync = originalRealpath;
    syncBuiltinESMExports();
  }
}));
