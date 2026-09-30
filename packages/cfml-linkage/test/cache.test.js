import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  compareSnapshotFiles,
  createCacheContext,
  createCacheRecord,
  createDisposableCache,
  fingerprintConfig,
  inspectCacheRecord,
} from "../src/cache.js";
import { createRootGuard } from "../src/root-guard.js";
import { createSnapshot } from "../src/snapshot.js";

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-cache-"));
}

function snapshot(root, files, sourceFingerprint = "sha256:source") {
  return {
    root_path: root,
    source_fingerprint: sourceFingerprint,
    files,
  };
}

test("fingerprints configuration independent of object key insertion order", () => {
  assert.equal(
    fingerprintConfig({ root: ".", limits: { files: 10, bytes: 20 } }),
    fingerprintConfig({ limits: { bytes: 20, files: 10 }, root: "." }),
  );
  assert.notEqual(
    fingerprintConfig({ languages: ["cfml", "html"] }),
    fingerprintConfig({ languages: ["html", "cfml"] }),
  );
});

test("reports sorted added, changed, and removed source files", () => {
  const previous = [
    { path: "z.cfm", content_sha256: "sha256:z" },
    { path: "changed.cfm", content_sha256: "sha256:old" },
    { path: "removed.cfm", content_sha256: "sha256:removed" },
  ];
  const current = [
    { path: "new.cfm", content_sha256: "sha256:new" },
    { path: "changed.cfm", content_sha256: "sha256:new-content" },
    { path: "z.cfm", content_sha256: "sha256:z" },
  ];
  assert.deepEqual(compareSnapshotFiles(previous, current), {
    added: ["new.cfm"],
    changed: ["changed.cfm"],
    removed: ["removed.cfm"],
  });
});

test("classifies fresh and stale cache contexts with file-level invalidation", () => {
  const root = path.resolve("cache-fixture");
  const first = snapshot(root, [
    { path: "a.cfm", content_sha256: "sha256:a" },
    { path: "b.cfm", content_sha256: "sha256:b" },
  ], "sha256:first");
  const firstOptions = { config: { mode: "one" }, parserVersion: "p1" };
  const context = createCacheContext(first, firstOptions);
  const record = createCacheRecord(first, firstOptions);
  assert.deepEqual(inspectCacheRecord(record, context, first), {
    status: "fresh",
    reason: null,
    changed_files: { added: [], changed: [], removed: [] },
  });

  const second = snapshot(root, [
    { path: "a.cfm", content_sha256: "sha256:changed" },
    { path: "c.cfm", content_sha256: "sha256:c" },
  ], "sha256:second");
  const secondContext = createCacheContext(second, firstOptions);
  const stale = inspectCacheRecord(record, secondContext, second);
  assert.equal(stale.status, "stale");
  assert.equal(stale.reason, "SOURCE_CHANGED");
  assert.deepEqual(stale.changed_files, {
    added: ["c.cfm"],
    changed: ["a.cfm"],
    removed: ["b.cfm"],
  });

  const configContext = createCacheContext(first, { config: { mode: "two" }, parserVersion: "p1" });
  assert.equal(inspectCacheRecord(record, configContext).reason, "CONFIG_CHANGED");
  const parserContext = createCacheContext(first, { config: { mode: "one" }, parserVersion: "p2" });
  assert.equal(inspectCacheRecord(record, parserContext).reason, "PARSER_CHANGED");
  assert.equal(inspectCacheRecord(null, context).reason, "CACHE_MISS");
  assert.equal(inspectCacheRecord({ bad: true }, context).reason, "CACHE_CORRUPT");
});

test("writes and reloads a root-contained disposable cache without storing source text", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "source.cfm"), "<cfset secretLike = 'not cache output'>\n", "utf8");
    const guard = createRootGuard(root);
    const sourceSnapshot = createSnapshot(guard);
    const options = { config: { root: "." } };
    const record = createCacheRecord(sourceSnapshot, options);
    const cache = createDisposableCache(guard);
    const writeResult = cache.write(record);
    assert.equal(writeResult.status, "written");
    assert.equal(fs.existsSync(cache.file), true);
    assert.equal(cache.load().status, "loaded");
    assert.equal(cache.load().record.files[0].content, undefined);
    assert.equal(fs.readFileSync(cache.file, "utf8").includes("not cache output"), false);

    const secondWrite = cache.write(record);
    assert.equal(secondWrite.status, "written");
    assert.equal(cache.load().status, "loaded");
    assert.equal(cache.discard().status, "discarded");
    assert.equal(cache.load().status, "miss");
    assert.equal(cache.discard().status, "absent");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reports corrupt cache JSON and rejects cache paths outside the root", () => {
  const root = temporaryDirectory();
  try {
    const guard = createRootGuard(root);
    const cache = createDisposableCache(guard);
    fs.mkdirSync(cache.directory, { recursive: true });
    fs.writeFileSync(cache.file, "{", "utf8");
    assert.deepEqual(cache.load(), { status: "corrupt", reason: "CACHE_CORRUPT", record: null });
    assert.throws(() => createDisposableCache(guard, { cacheDirectory: "../outside" }), (error) => error.code === "PATH_TRAVERSAL");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
