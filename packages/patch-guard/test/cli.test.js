import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cli = path.join(packageRoot, "src/cli.js");
const defaultPolicy = { schema_version: "1.0.0", allowed_paths: ["*"] };
const diff = "diff --git a/src/a.js b/src/a.js\nindex 1111111..2222222 100644\n--- a/src/a.js\n+++ b/src/a.js\n@@ -1 +1 @@\n-old\n+new\n";
function run(args, options = {}) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: packageRoot, encoding: "utf8", timeout: 10000, ...options });
}
function parsed(response, exit = 0, code) {
  assert.equal(response.error, undefined);
  assert.equal(response.status, exit, response.stderr || response.stdout);
  assert.ok(response.stdout.endsWith("\n"));
  const result = JSON.parse(response.stdout);
  assert.equal(result.schema_version, "1.0.0");
  assert.equal(result.tool.id, "agent-patch-guard");
  assert.equal(result.status, exit === 0 ? "ok" : exit === 3 ? "incomplete" : "error");
  assert.equal(result.complete, exit === 0);
  if (exit) {
    assert.equal(result.data, null);
    assert.ok(result.errors.length);
    if (code) assert.equal(result.errors[0].code, code);
  }
  return result;
}
function fixture(callback, selectedPolicy = defaultPolicy, selectedDiff = diff) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-cli-"));
  try {
    fs.writeFileSync(path.join(root, "change.diff"), selectedDiff);
    fs.writeFileSync(path.join(root, "policy.json"), JSON.stringify(selectedPolicy));
    return callback(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
const checkArgs = (root, extra = []) => ["check", "--root", root, "--diff", "change.diff", "--policy", "policy.json", "--json", ...extra];

test("capabilities, help and version are explicit stable modes", () => {
  const capability = parsed(run(["capabilities", "--json"]));
  assert.deepEqual(capability.data.operations, ["capabilities", "check"]);
  assert.equal(run(["capabilities", "--json"]).stdout, run(["capabilities", "--json"]).stdout);
  const help = run(["--help"]);
  assert.equal(help.status, 0);
  assert.match(help.stdout, /check/);
  assert.match(help.stdout, /--diff/);
  assert.match(help.stdout, /capabilities/);
  const version = run(["--version"]);
  const packageVersion = JSON.parse(fs.readFileSync(path.join(packageRoot, "package.json"), "utf8")).version;
  assert.equal(version.status, 0);
  assert.ok(version.stdout.includes(packageVersion));
});

test("CLI uses selected root, emits one JSON envelope and leaves inputs untouched", () => fixture((root) => {
  const inputBefore = fs.readFileSync(path.join(root, "change.diff"));
  const policyBefore = fs.readFileSync(path.join(root, "policy.json"));
  const first = run(checkArgs(root));
  const result = parsed(first);
  assert.equal(first.stderr, "");
  assert.equal(result.data.verdict, "pass");
  assert.equal(result.data.origin, "snapshot");
  assert.equal(result.data.files[0].path, "src/a.js");
  assert.equal(first.stdout, run(checkArgs(root)).stdout);
  assert.deepEqual(fs.readFileSync(path.join(root, "change.diff")), inputBefore);
  assert.deepEqual(fs.readFileSync(path.join(root, "policy.json")), policyBefore);
  assert.deepEqual(fs.readdirSync(root).sort(), ["change.diff", "policy.json"]);
  assert.ok(!first.stdout.includes(root));
}));

test("root defaults to caller cwd and absolute contained artifact paths are allowed", () => fixture((root) => {
  parsed(run(["check", "--diff", "change.diff", "--policy", "policy.json", "--json"], { cwd: root }));
  parsed(run(["check", "--root", root, "--diff", path.join(root, "change.diff"), "--policy", path.join(root, "policy.json"), "--json"]));
}));

test("a completed policy violation exits zero and must be read from the verdict", () => fixture((root) => {
  const result = parsed(run(checkArgs(root)));
  assert.equal(result.data.verdict, "violations");
  assert.ok(result.data.findings.some((finding) => finding.rule_id === "OUT_OF_SCOPE"));
}, { schema_version: "1.0.0", allowed_paths: ["docs/"] }));

test("CLI accepts documented origins and rejects untracked modifications", () => fixture((root) => {
  for (const origin of ["snapshot", "staged", "unstaged"]) {
    assert.equal(parsed(run(checkArgs(root, ["--origin", origin]))).data.origin, origin);
  }
  parsed(run(checkArgs(root, ["--origin", "untracked"])), 2, "INVALID_INPUT");
  parsed(run(checkArgs(root, ["--origin", "invented"])), 2, "INVALID_INPUT");
}));

test("malformed, missing, unknown and duplicate arguments remain machine-readable", () => fixture((root) => {
  for (const args of [
    ["check", "--json"], ["unknown", "--json"], [...checkArgs(root), "--unknown"],
    [...checkArgs(root), "--diff", "other.diff"], [...checkArgs(root), "--json"],
    [...checkArgs(root), "--origin"], ["capabilities", "--json", "--diff", "change.diff"],
    [...checkArgs(root), "positional"],
  ]) parsed(run(args), 2, "INVALID_INPUT");
}));

test("extensions restrict artifact roles and missing artifacts are input errors", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "source.js"), diff);
  fs.writeFileSync(path.join(root, "source.patch"), diff);
  fs.writeFileSync(path.join(root, "settings.txt"), JSON.stringify(defaultPolicy));
  for (const args of [
    ["check", "--root", root, "--diff", "source.js", "--policy", "policy.json", "--json"],
    ["check", "--root", root, "--diff", "change.diff", "--policy", "settings.txt", "--json"],
  ]) parsed(run(args), 2, "INVALID_INPUT");
  parsed(run(["check", "--root", root, "--diff", "missing.diff", "--policy", "policy.json", "--json"]), 2, "INPUT_IO");
  parsed(run(["check", "--root", root, "--diff", "source.patch", "--policy", "policy.json", "--json"]));
}));

test("malformed JSON, duplicate policy keys and malformed UTF-8 never become passes", () => fixture((root) => {
  for (const raw of [
    "{", '{"schema_version":"1.0.0","allowed_paths":["docs/"],"allowed_paths":["*"]}',
    '{"schema_version":"1.0.0","allowed_paths":["*"],"allow_binary":false,"allow_binary":true}',
  ]) {
    fs.writeFileSync(path.join(root, "policy.json"), raw);
    parsed(run(checkArgs(root)), 2, "INVALID_INPUT");
  }
  fs.writeFileSync(path.join(root, "policy.json"), JSON.stringify(defaultPolicy));
  fs.writeFileSync(path.join(root, "change.diff"), Buffer.from([0xff, 0xfe]));
  parsed(run(checkArgs(root)), 2, "INVALID_ENCODING");
  fs.writeFileSync(path.join(root, "change.diff"), diff);
  fs.writeFileSync(path.join(root, "policy.json"), Buffer.from([0xff]));
  parsed(run(checkArgs(root)), 2, "INVALID_ENCODING");
}));

test("deeply nested policy JSON is rejected within parser depth bounds", () => fixture((root) => {
  fs.writeFileSync(path.join(root, "policy.json"), `${"[".repeat(40)}0${"]".repeat(40)}`);
  const response = run(checkArgs(root));
  assert.ok([2, 3].includes(response.status));
  const result = parsed(response, response.status);
  assert.ok(["INVALID_INPUT", "RESOURCE_LIMIT"].includes(result.errors[0].code));
}));

test("traversal and absolute outside artifacts are security errors without path leakage", () => fixture((root) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-outside-"));
  try {
    fs.writeFileSync(path.join(outside, "outside.diff"), diff);
    for (const selected of [path.join(outside, "outside.diff"), "../outside.diff"]) {
      const response = run(["check", "--root", root, "--diff", selected, "--policy", "policy.json", "--json"]);
      parsed(response, 4, "UNSAFE_PATH");
      assert.ok(!response.stdout.includes(outside));
      assert.ok(!response.stdout.includes(root));
    }
    fs.mkdirSync(path.join(root, "directory.diff"));
    parsed(run(["check", "--root", root, "--diff", "directory.diff", "--policy", "policy.json", "--json"]), 4, "UNSAFE_PATH");
    fs.mkdirSync(path.join(root, "directory.json"));
    parsed(run(["check", "--root", root, "--diff", "change.diff", "--policy", "directory.json", "--json"]), 4, "UNSAFE_PATH");
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
}));

test("artifact file symlinks are rejected", (context) => fixture((root) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-symlink-"));
  try {
    fs.writeFileSync(path.join(outside, "outside.diff"), diff);
    try { fs.symlinkSync(path.join(outside, "outside.diff"), path.join(root, "linked.diff"), "file"); }
    catch (error) {
      if (process.platform === "win32" && ["EPERM", "EACCES"].includes(error.code)) {
        context.skip("Windows file symlink creation requires developer mode or elevated permission");
        return;
      }
      throw error;
    }
    fs.symlinkSync(path.join(root, "change.diff"), path.join(root, "inside.diff"));
    for (const selected of ["linked.diff", "inside.diff"]) {
      parsed(run(["check", "--root", root, "--diff", selected, "--policy", "policy.json", "--json"]), 4, "UNSAFE_PATH");
    }
    fs.symlinkSync(path.join(root, "policy.json"), path.join(root, "linked.json"));
    parsed(run(["check", "--root", root, "--diff", "change.diff", "--policy", "linked.json", "--json"]), 4, "UNSAFE_PATH");
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
}));

test("symlink parent components are rejected for inside and outside targets", () => fixture((root) => {
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-directory-link-"));
  try {
    const inside = path.join(root, "real-directory");
    fs.mkdirSync(inside);
    fs.writeFileSync(path.join(inside, "inside.diff"), diff);
    fs.writeFileSync(path.join(outside, "outside.diff"), diff);
    const linkType = process.platform === "win32" ? "junction" : "dir";
    fs.symlinkSync(outside, path.join(root, "outside-directory"), linkType);
    fs.symlinkSync(inside, path.join(root, "inside-directory"), linkType);
    for (const selected of ["outside-directory/outside.diff", "inside-directory/inside.diff"]) {
      parsed(run(["check", "--root", root, "--diff", selected, "--policy", "policy.json", "--json"]), 4, "UNSAFE_PATH");
    }
  } finally { fs.rmSync(outside, { recursive: true, force: true }); }
}));

test("an explicitly selected root symlink is canonicalized", () => fixture((root) => {
  const container = fs.mkdtempSync(path.join(os.tmpdir(), "patch-guard-root-"));
  try {
    const alias = path.join(container, "root-alias");
    fs.symlinkSync(root, alias, process.platform === "win32" ? "junction" : "dir");
    parsed(run(checkArgs(alias)));
  } finally { fs.rmSync(container, { recursive: true, force: true }); }
}));

test("unsupported quoted Git names and unsafe changed paths preserve their distinct failures", () => {
  fixture((root) => parsed(run(checkArgs(root)), 3, "UNSUPPORTED_INPUT"), defaultPolicy,
    'diff --git "a/space name.js" "b/space name.js"\n');
  fixture((root) => parsed(run(checkArgs(root)), 4, "UNSAFE_PATH"), defaultPolicy,
    diff.replaceAll("src/a.js", "../escape.js"));
});

test("input and finding caps return incomplete JSON rather than partial success", () => fixture((root) => {
  parsed(run(checkArgs(root, ["--max-input-bytes", "32"])), 3, "RESOURCE_LIMIT");
  fs.writeFileSync(path.join(root, "change.diff"), "x".repeat(1048577));
  parsed(run(checkArgs(root)), 3, "RESOURCE_LIMIT");
  fs.writeFileSync(path.join(root, "change.diff"), diff.replace("@@ -1 +1 @@\n-old\n+new\n", "@@ -1 +1,2 @@\n-old\n+TODO\n+TODO\n"));
  fs.writeFileSync(path.join(root, "policy.json"), JSON.stringify({ ...defaultPolicy, content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }] }));
  parsed(run(checkArgs(root, ["--max-findings", "1"])), 3, "RESOURCE_LIMIT");
}));

test("invalid numeric caps reject NaN, coercions and hard-limit expansion", () => fixture((root) => {
  for (const extra of [
    ["--max-files", "257"], ["--max-input-bytes", "1048577"], ["--max-files", "0"],
    ["--max-findings", "1.5"], ["--max-changed-lines", "NaN"], ["--max-files", "1e2"],
    ["--max-output-bytes", "1023"], ["--max-files", "-1"],
  ]) parsed(run(checkArgs(root, extra)), 2, "INVALID_INPUT");
}));

test("custom output cap includes handled error envelopes and stdout terminator", () => fixture((root) => {
  const many = Array.from({ length: 25 }, () => "+TODO").join("\n");
  fs.writeFileSync(path.join(root, "change.diff"), diff.replace("@@ -1 +1 @@\n-old\n+new\n", `@@ -1 +1,25 @@\n-old\n${many}\n`));
  const response = run(checkArgs(root, ["--max-output-bytes", "1024"]));
  const result = parsed(response, 3, "RESOURCE_LIMIT");
  assert.equal(result.meta.limits.max_output_bytes, 1024);
  assert.ok(Buffer.byteLength(response.stdout) <= 1024);
  const malformed = run([...checkArgs(root), "--max-output-bytes", "1024", "--unknown"]);
  const error = parsed(malformed, 2, "INVALID_INPUT");
  assert.equal(error.meta.limits.max_output_bytes, 1024);
  assert.ok(Buffer.byteLength(malformed.stdout) <= 1024);
}, { ...defaultPolicy, content_rules: [{ id: "NO_TODO", needle: "TODO", severity: "error" }] }));

test("malicious content, credential-shaped text and invalid policy payloads are redacted", () => fixture((root) => {
  const marker = path.join(root, "executed");
  const secret = "sk-proj-secretCredential0123456789";
  const content = `$(touch ${marker}) ${secret}`;
  fs.writeFileSync(path.join(root, "change.diff"), diff.replace("+new", `+${content}`));
  const response = run(checkArgs(root));
  parsed(response);
  assert.ok(!response.stdout.includes(secret));
  assert.ok(!response.stdout.includes(marker));
  assert.equal(fs.existsSync(marker), false);
  fs.writeFileSync(path.join(root, "policy.json"), JSON.stringify({ ...defaultPolicy, secret }));
  const invalid = run(checkArgs(root));
  parsed(invalid, 2, "INVALID_INPUT");
  assert.ok(!invalid.stdout.includes(secret));
  assert.ok(!invalid.stderr.includes(secret));
}));
