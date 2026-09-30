import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";

const cli = path.resolve("dist/cli/index.js");

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
}

test("CLI JSON mode keeps stdout to one parseable envelope", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-cfml-check-cli-"));
  const file = path.join(root, "valid.cfm");
  writeFileSync(file, "<cfif ok></cfif>", "utf8");
  try {
    const result = runCli(["check", "--root", root, file, "--json"]);
    assert.equal(result.status, 0);
    const envelope = JSON.parse(result.stdout) as { status: string; data: { verdict: string } };
    assert.equal(envelope.status, "ok");
    assert.equal(envelope.data.verdict, "pass");
    assert.equal(result.stdout.trim().split("\n").length, 1);
    assert.equal(result.stderr, "");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI reports unsupported input as a bounded JSON failure", () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-cfml-check-cli-"));
  const file = path.join(root, "unknown.cfm");
  writeFileSync(file, "<cfunknown />", "utf8");
  try {
    const result = runCli(["check", "--root", root, file, "--json"]);
    assert.equal(result.status, 3);
    const envelope = JSON.parse(result.stdout) as { status: string; data: unknown; errors: Array<{ code: string }> };
    assert.equal(envelope.status, "incomplete");
    assert.equal(envelope.data, null);
    assert.equal(envelope.errors[0]?.code, "UNSUPPORTED_SYNTAX");
    assert.match(result.stderr, /UNSUPPORTED_SYNTAX/u);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("CLI capabilities is available without a source file", () => {
  const result = runCli(["capabilities", "--json"]);
  assert.equal(result.status, 0);
  const envelope = JSON.parse(result.stdout) as { data: { profile: string } };
  assert.equal(envelope.data.profile, "cfml-structure-v1");
});
