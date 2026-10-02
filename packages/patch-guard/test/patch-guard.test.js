import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { capabilities, checkPatch, encodeResult, exitCode } from "../src/index.js";

const policy = (extra = {}) => ({ schema_version: "1.0.0", allowed_paths: ["*"], ...extra });
const lines = (values, prefix) => values.map((value) => `${prefix}${value}`).join("\n");
function patch(file = "src/a.js", before = ["before"], after = ["after"], extra = []) {
  return [
    `diff --git a/${file} b/${file}`,
    ...extra,
    `--- ${before.length ? `a/${file}` : "/dev/null"}`,
    `+++ ${after.length ? `b/${file}` : "/dev/null"}`,
    `@@ -${before.length ? 1 : 0},${before.length} +${after.length ? 1 : 0},${after.length} @@`,
    ...(before.length ? [lines(before, "-")] : []),
    ...(after.length ? [lines(after, "+")] : []),
    "",
  ].join("\n");
}
function ok(result, verdict = "pass") {
  assert.equal(result.schema_version, "1.0.0");
  assert.equal(result.tool.id, "agent-patch-guard");
  assert.equal(result.status, "ok");
  assert.equal(result.complete, true);
  assert.equal(exitCode(result), 0);
  assert.deepEqual(result.errors, []);
  assert.equal(result.data.verdict, verdict);
  assert.ok(Array.isArray(result.warnings));
  assert.equal(typeof result.meta.scope, "string");
  assert.equal(typeof result.meta.limits.max_input_bytes, "number");
  return result.data;
}
function failed(result, expectedExit, code) {
  assert.equal(result.status, expectedExit === 3 ? "incomplete" : "error");
  assert.equal(result.complete, false);
  assert.equal(result.data, null);
  assert.equal(exitCode(result), expectedExit);
  assert.ok(result.errors.length > 0);
  if (code) assert.equal(result.errors[0].code, code);
}
const ids = (data) => data.findings.map((finding) => finding.rule_id);

test("capabilities uses the Hub envelope and names supported operations", () => {
  const result = capabilities();
  assert.equal(result.status, "ok");
  assert.equal(result.complete, true);
  assert.equal(exitCode(result), 0);
  assert.deepEqual(result.data.operations, ["capabilities", "check"]);
  assert.equal(result.tool.id, "agent-patch-guard");
});

test("empty diff is a complete empty snapshot", () => {
  const data = ok(checkPatch("", policy()));
  assert.equal(data.origin, "snapshot");
  assert.deepEqual(data.summary, { files: 0, added_lines: 0, deleted_lines: 0 });
  assert.deepEqual(data.files, []);
  assert.deepEqual(data.findings, []);
  assert.deepEqual(data.exceptions_applied, []);
});

test("text modification reports counts and one-based added line locations", () => {
  const data = ok(checkPatch(patch("src/a.js", ["old"], ["TODO", "new"]), policy({
    content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "warning" }],
  })));
  assert.deepEqual(data.summary, { files: 1, added_lines: 2, deleted_lines: 1 });
  assert.deepEqual(data.files, [{
    path: "src/a.js", previous_path: null, kind: "modified", binary: false,
    symlink: false, added_lines: 2, deleted_lines: 1,
  }]);
  assert.equal(data.findings[0].rule_id, "NO_TODO");
  assert.equal(data.findings[0].severity, "warning");
  assert.equal(data.findings[0].path, "src/a.js");
  assert.equal(data.findings[0].line, 1);
  assert.equal(typeof data.findings[0].diff_line, "number");
});

test("literal scope selectors distinguish exact files from directory prefixes", () => {
  const diff = patch("src/a.js") + patch("src-extra/b.js") + patch("README.md");
  const data = ok(checkPatch(diff, policy({ allowed_paths: ["src/", "README.md"] })), "violations");
  assert.deepEqual(data.findings.filter((finding) => finding.rule_id === "OUT_OF_SCOPE").map((finding) => finding.path), ["src-extra/b.js"]);
  assert.equal(ok(checkPatch(patch("src/a.js"), policy({ allowed_paths: ["src/a.js"] }))).findings.length, 0);
  assert.equal(ok(checkPatch(patch("src/a.js"), policy({ allowed_paths: ["src"] })), "violations").findings[0].rule_id, "OUT_OF_SCOPE");
});

test("path protections, generated selectors and lockfile selectors remain caller owned", () => {
  const data = ok(checkPatch(patch("test/a.test.js") + patch("generated/a.js") + patch("package-lock.json"), policy({
    protected_paths: ["test/"], generated_paths: ["generated/"], lockfile_paths: ["package-lock.json"],
  })), "violations");
  assert.deepEqual(new Set(ids(data)), new Set(["PROTECTED_PATH", "GENERATED_PATH", "LOCKFILE"]));
  const allowed = policy({ generated_paths: ["generated/"], lockfile_paths: ["package-lock.json"], allow_generated: true, allow_lockfiles: true });
  ok(checkPatch(patch("generated/a.js") + patch("package-lock.json"), allowed));
});

test("deleting a test is denied by defaults and remains protected with deletion enabled", () => {
  const diff = patch("test/a.test.js", ["assert(true)"], [], ["deleted file mode 100644"]);
  assert.ok(ids(ok(checkPatch(diff, policy()), "violations")).includes("DELETION"));
  const data = ok(checkPatch(diff, policy({ allow_deletions: true, protected_paths: ["test/"] })), "violations");
  assert.deepEqual(ids(data), ["PROTECTED_PATH"]);
  assert.equal(data.files[0].kind, "deleted");
  ok(checkPatch(diff, policy({ allow_deletions: true })));
});

test("pure renames check both old and new paths", () => {
  const diff = "diff --git a/private/old.js b/src/new.js\nsimilarity index 100%\nrename from private/old.js\nrename to src/new.js\n";
  const data = ok(checkPatch(diff, policy({ allowed_paths: ["src/"], protected_paths: ["private/"] })), "violations");
  assert.equal(data.files[0].kind, "renamed");
  assert.equal(data.files[0].previous_path, "private/old.js");
  assert.ok(ids(data).includes("RENAME"));
  assert.ok(data.findings.some((finding) => finding.rule_id === "OUT_OF_SCOPE" && finding.path === "private/old.js"));
  assert.ok(data.findings.some((finding) => finding.rule_id === "PROTECTED_PATH" && finding.path === "private/old.js"));
  ok(checkPatch(diff, policy({ allow_renames: true })));
});

test("mode-only changes are supported and symlink mode is explicit", () => {
  const modeOnly = "diff --git a/run.sh b/run.sh\nold mode 100644\nnew mode 100755\n";
  const data = ok(checkPatch(modeOnly, policy()));
  assert.deepEqual(data.summary, { files: 1, added_lines: 0, deleted_lines: 0 });
  const symlink = patch("link", [], ["target"], ["new file mode 120000"]);
  assert.ok(ids(ok(checkPatch(symlink, policy()), "violations")).includes("SYMLINK"));
  ok(checkPatch(symlink, policy({ allow_symlinks: true })));
});

test("zero-byte additions and deletions use metadata without invented hunk evidence", () => {
  const added = "diff --git a/empty.txt b/empty.txt\nnew file mode 100644\nindex 0000000..e69de29\n";
  const deleted = "diff --git a/empty.txt b/empty.txt\ndeleted file mode 100644\nindex e69de29..0000000\n";
  assert.equal(ok(checkPatch(added, policy())).files[0].kind, "added");
  const data = ok(checkPatch(deleted, policy({ allow_deletions: true })));
  assert.equal(data.files[0].kind, "deleted");
  assert.equal(data.summary.added_lines + data.summary.deleted_lines, 0);
});

test("multiple hunks preserve new-file line numbers and treat patch-shaped source as content", () => {
  const diff = [
    "diff --git a/src/a.js b/src/a.js", "--- a/src/a.js", "+++ b/src/a.js",
    "@@ -1,2 +1,2 @@ source context is private", " context", "-old", "+TODO first",
    "@@ -10 +10,2 @@", "-old", "+diff --git a/private b/private", "+TODO second", "",
  ].join("\n");
  const result = checkPatch(diff, policy({ content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }] }));
  const data = ok(result, "violations");
  assert.deepEqual(data.findings.map((finding) => finding.line), [2, 11]);
  assert.equal(data.files.length, 1);
  assert.equal(data.summary.added_lines, 3);
  assert.equal(data.summary.deleted_lines, 2);
  assert.ok(!encodeResult(result).includes("source context is private"));
});

test("binary marker is bounded metadata and content requirements make it incomplete", () => {
  const diff = "diff --git a/image.png b/image.png\nindex 1111111..2222222 100644\nBinary files a/image.png and b/image.png differ\n";
  const data = ok(checkPatch(diff, policy()), "violations");
  assert.equal(data.files[0].binary, true);
  assert.ok(ids(data).includes("BINARY"));
  ok(checkPatch(diff, policy({ allow_binary: true })));
  failed(checkPatch(diff, policy({ allow_binary: true, content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }] })), 3, "UNSUPPORTED_INPUT");
  for (const threshold of [{ max_added_lines: 0 }, { max_deleted_lines: 20000 }]) {
    failed(checkPatch(diff, policy({ allow_binary: true, ...threshold })), 3, "UNSUPPORTED_INPUT");
  }
});

test("content rules inspect added lines only, using literal rather than regex semantics", () => {
  const data = ok(checkPatch(patch("src/a.js", ["TODO", ".*"], ["safe .* literal"]), policy({
    content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }, { id: "LITERAL", needle: ".*", severity: "warning" }],
  })));
  assert.deepEqual(ids(data), ["LITERAL"]);
});

test("path-local exceptions are auditable and cannot relax a different path", () => {
  const data = ok(checkPatch(patch("src/allowed.js", ["old"], ["TODO"]) + patch("src/denied.js", ["old"], ["TODO"]), policy({
    content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }],
    exceptions: [{ rule_id: "NO_TODO", paths: ["src/allowed.js"] }],
  })), "violations");
  assert.deepEqual(data.findings.map((finding) => finding.path), ["src/denied.js"]);
  assert.equal(data.exceptions_applied.length, 1);
  assert.equal(data.exceptions_applied[0].rule_id, "NO_TODO");
  assert.equal(data.exceptions_applied[0].path, "src/allowed.js");
});

test("policy totals are completed findings, distinct from resource limits", () => {
  const data = ok(checkPatch(patch("a.js", ["old", "old2"], ["new", "new2"]) + patch("b.js"), policy({
    max_files: 1, max_added_lines: 1, max_deleted_lines: 0,
  })), "violations");
  assert.ok(ids(data).includes("MAX_FILES"));
  assert.ok(ids(data).includes("MAX_ADDED_LINES"));
  assert.ok(ids(data).includes("MAX_DELETED_LINES"));
});

test("equivalent policy key order produces byte-stable, redacted evidence", () => {
  const secret = "sk-proj-privateCredential0123456789";
  const diff = patch("src/a.js", ["old"], [`TODO ${secret}`]);
  const a = policy({ content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }] });
  const b = { content_rules: [{ severity: "error", needle: "TODO", id: "NO_TODO" }], allowed_paths: ["*"], schema_version: "1.0.0" };
  const first = encodeResult(checkPatch(diff, a));
  assert.equal(first, encodeResult(checkPatch(diff, b)));
  assert.ok(!first.includes(secret));
  assert.ok(!first.includes(`TODO ${secret}`));
  assert.equal(diff, patch("src/a.js", ["old"], [`TODO ${secret}`]));
});

test("origin is explicit and untracked origin permits additions only", () => {
  const added = patch("new.js", [], ["new"], ["new file mode 100644"]);
  const data = ok(checkPatch(added, policy(), { origin: "untracked" }));
  assert.equal(data.origin, "untracked");
  for (const origin of ["unstaged", "staged", "snapshot"]) {
    assert.equal(ok(checkPatch(patch(), policy(), { origin })).origin, origin);
  }
  failed(checkPatch(patch(), policy(), { origin: "untracked" }), 2, "INVALID_INPUT");
  failed(checkPatch(patch(), policy(), { origin: "invented" }), 2, "INVALID_INPUT");
});

test("invalid policy never becomes an empty pass", () => {
  for (const bad of [
    null, [], {}, { schema_version: "2.0.0", allowed_paths: ["*"] }, policy({ allowed_paths: [] }),
    policy({ allowed_paths: ["src/*.js"] }), policy({ allowed_paths: ["../"] }),
    policy({ unknown: true }), policy({ allow_binary: "true" }), policy({ max_files: 0 }),
    policy({ max_added_lines: -1 }), policy({ content_rules: [{ id: "BAD", needle: "", severity: "error" }] }),
    policy({ content_rules: [{ id: "BAD", needle: "x", severity: "fatal" }] }),
    policy({ exceptions: [{ rule_id: "UNKNOWN", paths: ["*"] }] }),
    policy({ exceptions: [{ rule_id: "MAX_FILES", paths: ["*"] }] }),
    policy({ protected_paths: null }), policy({ generated_paths: null }), policy({ lockfile_paths: null }),
    policy({ content_rules: null }), policy({ exceptions: null }),
  ]) failed(checkPatch(patch(), bad), 2, "INVALID_INPUT");
});

test("explicit null or malformed options do not silently select defaults", () => {
  for (const options of [null, [], { origin: null }, { limits: null }, { limits: [] }]) {
    failed(checkPatch(patch(), policy(), options), 2, "INVALID_INPUT");
  }
});

test("truncated hunk bodies withhold partial evidence as incomplete", () => {
  for (const diff of [
    patch().replace("@@ -1,1 +1,1 @@", "@@ -1,2 +1,1 @@"),
    patch().replace("@@ -1,1 +1,1 @@", "@@ -1,1 +1,2 @@"),
    patch().replace("-before\n+after\n", "-before\n"),
    patch().replace("-before\n+after\n", ""),
  ]) failed(checkPatch(diff, policy()), 3, "INCOMPLETE_RESULT");
});

test("excess hunk bodies and contradictory headers are invalid", () => {
  for (const diff of [
    patch().replace("+after\n", "+after\n+excess\n"),
    patch().replace("--- a/src/a.js", "--- a/other.js"),
    patch().replace("+++ b/src/a.js", "+++ b/other.js"),
    patch("src/a.js", ["old"], ["new"], ["deleted file mode 100644"]),
    "diff --git a/a.js b/a.js\n--- a/a.js\n+++ b/a.js\n@@ malformed @@\n-old\n+new\n",
    "diff --git a/a.js b/a.js\n",
    "diff --git a/a.js b/a.js\nindex 1111111..2222222 100644\n",
    "this is not a git diff\n",
  ]) failed(checkPatch(diff, policy()), 2, "INVALID_INPUT");
});

test("duplicate files and duplicate structural headers fail closed", () => {
  failed(checkPatch(patch() + patch(), policy()), 3, "AMBIGUOUS_INPUT");
  failed(checkPatch(patch().replace("--- a/src/a.js", "--- a/src/a.js\n--- a/src/a.js"), policy()), 2, "INVALID_INPUT");
});

test("unsafe paths are rejected before policy evaluation", () => {
  for (const file of ["../escape.js", "/absolute.js", "src/../../escape.js", "src\\escape.js", "src//a.js", "src/./a.js"]) {
    failed(checkPatch(patch(file), policy()), 4, "UNSAFE_PATH");
  }
  const rename = "diff --git a/../old.js b/src/new.js\nsimilarity index 100%\nrename from ../old.js\nrename to src/new.js\n";
  failed(checkPatch(rename, policy({ allow_renames: true })), 4, "UNSAFE_PATH");
});

test("unsupported Git formats disclose incompleteness", () => {
  for (const diff of [
    "diff --cc a.js\nindex 1111111,2222222..3333333\n",
    'diff --git "a/space name.js" "b/space name.js"\n',
    "diff --git a/a.js b/b.js\nsimilarity index 100%\ncopy from a.js\ncopy to b.js\n",
    "diff --git a/submodule b/submodule\nindex 1111111..2222222 160000\n--- a/submodule\n+++ b/submodule\n@@ -1 +1 @@\n-Subproject commit 1111111\n+Subproject commit 2222222\n",
    "diff --git a/image.png b/image.png\nindex 1111111..2222222 100644\nGIT binary patch\nliteral 1\nAaaaa\n",
  ]) failed(checkPatch(diff, policy()), 3, "UNSUPPORTED_INPUT");
});

test("resource limits withhold all partial evidence", () => {
  const diff = patch();
  for (const [input, limits] of [
    [diff, { max_input_bytes: 32 }],
    [diff + patch("b.js"), { max_files: 1 }],
    [diff, { max_changed_lines: 1 }],
    [patch("a.js", ["old"], ["TODO", "TODO"]), { max_findings: 1 }],
  ]) {
    const selected = limits.max_findings ? policy({ content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }] }) : policy();
    failed(checkPatch(input, selected, { limits }), 3, "RESOURCE_LIMIT");
  }
  for (const limits of [{ max_files: 257 }, { max_input_bytes: 1048577 }, { max_findings: 0 }, { max_changed_lines: -1 }, { unknown: 1 }]) {
    failed(checkPatch(diff, policy(), { limits }), 2, "INVALID_INPUT");
  }
});

test("output exhaustion produces bounded valid JSON with consistent failure metadata", () => {
  const result = checkPatch(patch("src/a.js", ["old"], Array.from({ length: 20 }, () => "TODO")), policy({
    content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }],
  }), { limits: { max_output_bytes: 1024 } });
  const encoded = encodeResult(result);
  assert.ok(Buffer.byteLength(encoded) <= 1024);
  const parsed = JSON.parse(encoded);
  failed(parsed, 3, "RESOURCE_LIMIT");
  assert.equal(parsed.meta.limits.max_output_bytes, 1024);
});

test("patch content is data and never runs commands or writes its target", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-readonly-"));
  try {
    const marker = path.join(directory, "executed");
    const target = path.join(directory, "target.js");
    fs.writeFileSync(target, "unchanged\n");
    const content = `$(touch ${marker}); process.exit(17); require('node:fs').writeFileSync('${marker}', 'bad')`;
    ok(checkPatch(patch("target.js", ["unchanged"], [content]), policy()));
    assert.equal(fs.readFileSync(target, "utf8"), "unchanged\n");
    assert.equal(fs.existsSync(marker), false);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});

test("real Git output supports modifications, renames, deletion, modes, binary markers and no-newline records", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-git-"));
  const git = (...args) => {
    const result = spawnSync("git", ["-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false", ...args], { cwd: directory, encoding: "utf8", timeout: 10000 });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };
  try {
    git("init", "-q");
    fs.writeFileSync(path.join(directory, "modify.js"), "old\n");
    fs.writeFileSync(path.join(directory, "rename.js"), "same content\n".repeat(10));
    fs.writeFileSync(path.join(directory, "delete.js"), "delete\n");
    fs.writeFileSync(path.join(directory, "run.sh"), "#!/bin/sh\n");
    fs.writeFileSync(path.join(directory, "no-newline.js"), "old");
    fs.writeFileSync(path.join(directory, "binary.dat"), Buffer.from([0, 1, 2, 3]));
    fs.writeFileSync(path.join(directory, "space name.txt"), "old\n");
    git("add", ".");
    git("-c", "user.name=Patch Guard Tests", "-c", "user.email=patch-guard@example.invalid", "-c", "commit.gpgsign=false", "commit", "-q", "-m", "fixture");
    fs.writeFileSync(path.join(directory, "modify.js"), "new\nnext\n");
    fs.renameSync(path.join(directory, "rename.js"), path.join(directory, "renamed.js"));
    fs.unlinkSync(path.join(directory, "delete.js"));
    fs.chmodSync(path.join(directory, "run.sh"), 0o755);
    fs.writeFileSync(path.join(directory, "no-newline.js"), "new");
    fs.writeFileSync(path.join(directory, "binary.dat"), Buffer.from([0, 1, 3, 4]));
    fs.writeFileSync(path.join(directory, "space name.txt"), "new\n");
    git("add", "-A");
    const diff = git("diff", "--cached", "--no-ext-diff", "--no-color", "--find-renames");
    const data = ok(checkPatch(diff, policy({ allow_deletions: true, allow_renames: true, allow_binary: true }), { origin: "staged" }));
    assert.equal(data.files.length, 7);
    assert.ok(data.files.some((file) => file.kind === "renamed" && file.previous_path === "rename.js"));
    assert.ok(data.files.some((file) => file.kind === "deleted"));
    assert.ok(data.files.some((file) => file.binary));
    assert.equal(data.files.find((file) => file.path === "no-newline.js").added_lines, 1);
    assert.equal(data.files.find((file) => file.path === "run.sh").added_lines, 0);
    assert.equal(data.files.find((file) => file.path === "space name.txt").added_lines, 1);
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
});
