import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createRootGuard } from "../src/root-guard.js";
import { createSnapshot } from "../src/snapshot.js";

function makeTemporaryProject() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-snapshot-"));
  fs.mkdirSync(path.join(root, "src", "nested"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "ignored"), { recursive: true });
  fs.mkdirSync(path.join(root, "generated"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "z.cfm"), "z\n");
  fs.writeFileSync(path.join(root, "src", "nested", "a.cfc"), "a\n");
  fs.writeFileSync(path.join(root, "src", "client.js"), "throw new Error('inert fixture');\n");
  fs.writeFileSync(path.join(root, "src", "style.css"), "body { color: black; }\n");
  fs.writeFileSync(path.join(root, "src", "query.sql"), "select 1;\n");
  fs.writeFileSync(path.join(root, "README.txt"), "unsupported extension\n");
  fs.writeFileSync(path.join(root, "node_modules", "ignored", "package.cfm"), "ignored\n");
  fs.writeFileSync(path.join(root, "generated", "output.cfm"), "ignored\n");
  return root;
}

function removeTemporaryProject(root) {
  fs.rmSync(root, { recursive: true, force: true });
}

test("discovers supported files in sorted order and ignores configured default directories", () => {
  const root = makeTemporaryProject();
  try {
    const snapshot = createSnapshot(createRootGuard(root));
    assert.deepEqual(snapshot.files.map((file) => file.path), [
      "src/client.js",
      "src/nested/a.cfc",
      "src/query.sql",
      "src/style.css",
      "src/z.cfm",
    ]);
    assert.equal(snapshot.file_count, 5);
    assert.equal(snapshot.complete, true);
    assert.equal(snapshot.diagnostics.length, 0);
    assert.match(snapshot.source_fingerprint, /^sha256:[0-9a-f]{64}$/u);
  } finally {
    removeTemporaryProject(root);
  }
});

test("applies the bounded generated-directory policy before source admission", () => {
  const root = makeTemporaryProject();
  try {
    const guard = createRootGuard(root);
    const ignored = createSnapshot(guard, { generatedFilePolicy: "ignore" });
    assert.equal(ignored.files.some((file) => file.path === "generated/output.cfm"), false);
    const included = createSnapshot(guard, { generatedFilePolicy: "include" });
    assert.equal(included.files.some((file) => file.path === "generated/output.cfm"), true);
    const explicitlyIgnored = createSnapshot(guard, { generatedFilePolicy: "include", ignoreGlobs: ["generated/**"] });
    assert.equal(explicitlyIgnored.files.some((file) => file.path === "generated/output.cfm"), false);
  } finally {
    removeTemporaryProject(root);
  }
});

test("applies configured ignore policies without changing deterministic discovery", () => {
  const root = makeTemporaryProject();
  try {
    fs.mkdirSync(path.join(root, "custom", "nested"), { recursive: true });
    fs.mkdirSync(path.join(root, "pruned"), { recursive: true });
    fs.mkdirSync(path.join(root, ".hidden-directory"), { recursive: true });
    fs.writeFileSync(path.join(root, "custom", "ignored.cfm"), "ignored\n");
    fs.writeFileSync(path.join(root, "custom", "nested", "ignored.cfm"), "ignored\n");
    fs.writeFileSync(path.join(root, "pruned", "ignored.cfm"), "ignored\n");
    fs.writeFileSync(path.join(root, "src", "ignored.cfm"), "ignored\n");
    fs.writeFileSync(path.join(root, ".hidden.cfm"), "hidden\n");
    fs.writeFileSync(path.join(root, ".hidden-directory", "nested.cfm"), "hidden\n");
    const ignoreGlobs = [String.raw`custom\**\*.cfm`, "pruned/**", "src/ignored.cfm"];
    const snapshot = createSnapshot(createRootGuard(root), { ignoreGlobs, hiddenFilePolicy: "ignore" });
    assert.deepEqual(snapshot.files.map((file) => file.path), [
      "src/client.js",
      "src/nested/a.cfc",
      "src/query.sql",
      "src/style.css",
      "src/z.cfm",
    ]);
    assert.equal(snapshot.complete, true);
    assert.deepEqual(snapshot.diagnostics, []);
    const included = createSnapshot(createRootGuard(root), { ignoreGlobs, hiddenFilePolicy: "include" });
    assert.equal(included.files.some((file) => file.path === ".hidden.cfm"), true);
    assert.equal(included.files.some((file) => file.path === ".hidden-directory/nested.cfm"), true);
  } finally {
    removeTemporaryProject(root);
  }
});

test("does not execute source while hashing it and produces repeatable fingerprints", () => {
  const root = makeTemporaryProject();
  try {
    const guard = createRootGuard(root);
    const first = createSnapshot(guard);
    const second = createSnapshot(guard);
    assert.equal(first.source_fingerprint, second.source_fingerprint);
    assert.deepEqual(
      first.files.map(({ path: filePath, bytes, content_sha256 }) => ({ path: filePath, bytes, content_sha256 })),
      second.files.map(({ path: filePath, bytes, content_sha256 }) => ({ path: filePath, bytes, content_sha256 })),
    );
  } finally {
    removeTemporaryProject(root);
  }
});

test("changes the content fingerprint without changing the relative file identity", () => {
  const root = makeTemporaryProject();
  try {
    const guard = createRootGuard(root);
    const first = createSnapshot(guard);
    fs.writeFileSync(path.join(root, "src", "z.cfm"), "changed\n");
    const second = createSnapshot(guard);
    assert.notEqual(first.source_fingerprint, second.source_fingerprint);
    assert.equal(first.files.find((file) => file.path === "src/z.cfm").path, "src/z.cfm");
    assert.notEqual(
      first.files.find((file) => file.path === "src/z.cfm").content_sha256,
      second.files.find((file) => file.path === "src/z.cfm").content_sha256,
    );
  } finally {
    removeTemporaryProject(root);
  }
});

test("records and skips symlink entries instead of following them", (t) => {
  const root = makeTemporaryProject();
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-snapshot-outside-"));
  try {
    fs.writeFileSync(path.join(outside, "outside.cfm"), "outside\n");
    try {
      fs.symlinkSync(outside, path.join(root, "linked"), process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlink creation unavailable: ${error.code ?? error.message}`);
      return;
    }

    const snapshot = createSnapshot(createRootGuard(root));
    assert.equal(snapshot.files.some((file) => file.path.includes("outside.cfm")), false);
    assert.equal(snapshot.complete, false);
    assert.deepEqual(snapshot.diagnostics, [{
      code: "SYMLINK_SKIPPED",
      path: "linked",
      message: "Symbolic links are not followed during discovery.",
    }]);
  } finally {
    removeTemporaryProject(root);
    removeTemporaryProject(outside);
  }
});

test("returns an incomplete snapshot when a file limit is reached", () => {
  const root = makeTemporaryProject();
  try {
    const snapshot = createSnapshot(createRootGuard(root), { maxFiles: 2 });
    assert.equal(snapshot.files.length, 2);
    assert.equal(snapshot.complete, false);
    assert.equal(snapshot.diagnostics.at(-1).code, "RESOURCE_LIMIT");
  } finally {
    removeTemporaryProject(root);
  }
});
