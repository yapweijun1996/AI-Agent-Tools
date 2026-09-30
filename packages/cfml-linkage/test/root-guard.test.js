import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRootGuard, RootGuardError } from "../src/root-guard.js";

function makeTemporaryProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-root-"));
  fs.mkdirSync(path.join(root, "src"));
  fs.writeFileSync(path.join(root, "src", "index.cfm"), "<cfoutput>fixture</cfoutput>\n");
  return root;
}

function removeTemporaryProject(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

function assertRootError(callback, code) {
  assert.throws(callback, (error) => {
    assert.ok(error instanceof RootGuardError);
    assert.equal(error.code, code);
    return true;
  });
}

test("admits an existing in-root file and returns its canonical path", () => {
  const root = makeTemporaryProject();
  try {
    const guard = createRootGuard(root);
    assert.equal(guard.rootPath, fs.realpathSync.native(root));
    assert.equal(guard.resolve("src/index.cfm", { mustExist: true }), fs.realpathSync.native(path.join(root, "src", "index.cfm")));
  } finally {
    removeTemporaryProject(root);
  }
});

test("rejects parent traversal even when it normalizes back inside the root", () => {
  const root = makeTemporaryProject();
  try {
    const guard = createRootGuard(root);
    assertRootError(() => guard.resolve("src/../src/index.cfm"), "PATH_TRAVERSAL");
    assertRootError(() => guard.resolve("../outside.cfm"), "PATH_TRAVERSAL");
  } finally {
    removeTemporaryProject(root);
  }
});

test("rejects absolute references", () => {
  const root = makeTemporaryProject();
  try {
    const guard = createRootGuard(root);
    assertRootError(() => guard.resolve(path.join(root, "src", "index.cfm")), "ABSOLUTE_REFERENCE");
    assertRootError(() => guard.resolve("/etc/passwd"), "ABSOLUTE_REFERENCE");
  } finally {
    removeTemporaryProject(root);
  }
});

test("rejects symlink segments", (t) => {
  const root = makeTemporaryProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-outside-"));
  try {
    fs.writeFileSync(path.join(outside, "secret.cfm"), "fixture-secret-marker\n");
    const link = path.join(root, "linked");
    try {
      fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlink creation unavailable: ${error.code ?? error.message}`);
      return;
    }

    const guard = createRootGuard(root);
    assertRootError(() => guard.resolve("linked/secret.cfm"), "SYMLINK_NOT_ALLOWED");
  } finally {
    removeTemporaryProject(root);
    removeTemporaryProject(outside);
  }
});

test("rejects a missing required reference and a non-directory root", () => {
  const root = makeTemporaryProject();
  const file = path.join(root, "src", "index.cfm");
  try {
    const guard = createRootGuard(root);
    assertRootError(() => guard.resolve("src/missing.cfm", { mustExist: true }), "REFERENCE_NOT_FOUND");
    assertRootError(() => createRootGuard(file), "ROOT_NOT_DIRECTORY");
  } finally {
    removeTemporaryProject(root);
  }
});

test("rejects a missing root", () => {
  const missing = path.join(os.tmpdir(), "agent-cfml-linkage-root-does-not-exist");
  fs.rmSync(missing, { recursive: true, force: true });
  assertRootError(() => createRootGuard(missing), "ROOT_NOT_FOUND");
});
