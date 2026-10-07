import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { CheckData, Envelope } from "../src/schema/types.js";
import { checkFile } from "../src/index.js";
import { createHash } from "node:crypto";

const packageRoot = fileURLToPath(new URL("../../", import.meta.url));
const hook = path.join(packageRoot, "test-support/source-boundary-hook.mjs");
const cli = path.join(packageRoot, "dist/cli/index.js");
const api = pathToFileURL(path.join(packageRoot, "dist/index.js")).href;

function checkBoundary(mode: "leaf" | "ancestor" | "growth" | "oversized" | "fifo", operation: "api" | "cli") {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cfml-check-boundary-")));
  const root = path.join(workspace, "root");
  const directory = path.join(root, "nested");
  const outsideDirectory = path.join(workspace, "outside");
  fs.mkdirSync(directory, { recursive: true });
  fs.mkdirSync(outsideDirectory);
  const file = path.join(directory, "input.cfm");
  const outside = path.join(outsideDirectory, "input.cfm");
  const held = path.join(root, "held");
  const source = "<cfset inside = 1>\n";
  const limit = Buffer.byteLength(source);
  fs.writeFileSync(file, source);
  fs.writeFileSync(outside, "<cfif true>\n<!--- SYNTHETIC_OUTSIDE_MARKER --->\n");
  if (mode === "oversized") fs.appendFileSync(file, " ".repeat(8192));
  try {
    const args = ["--import", pathToFileURL(hook).href];
    const limited = mode === "growth" || mode === "oversized";
    if (operation === "cli") {
      args.push(cli, "check", "--root", root, file, "--json");
      if (limited) args.push("--max-source-bytes", String(limit));
    } else {
      const request = { root, file, ...(limited ? { limits: { max_source_bytes: limit } } : {}) };
      args.push("--input-type=module", "--eval", "const { checkFile } = await import(" +
        JSON.stringify(api) + "); console.log(JSON.stringify(checkFile(" + JSON.stringify(request) + ")));");
    }
    const child = spawnSync(process.execPath, args, {
      cwd: packageRoot, encoding: "utf8", timeout: 3000, killSignal: "SIGKILL",
      env: { ...process.env, CFML_CHECK_TEST_BOUNDARY: JSON.stringify({
        mode, file, directory, outside, outsideDirectory, held,
      }) },
    });
    assert.ifError(child.error);
    assert.ok(child.stdout, child.stderr);
    const response = JSON.parse(child.stdout) as Envelope<CheckData> | { envelope: Envelope<CheckData>; exit_code: number };
    const envelope = "envelope" in response ? response.envelope : response;
    const exitCode = "envelope" in response ? response.exit_code : child.status;
    const line = child.stderr.split("\n").find(value => value.startsWith("BOUNDARY_OBSERVATION:"));
    assert.ok(line, child.stderr);
    const observation = JSON.parse(line.slice("BOUNDARY_OBSERVATION:".length)) as {
      mutated: boolean; grew: boolean; readBytes: number; closed: boolean;
    };
    assert.equal(exitCode, 3);
    assert.equal(envelope.status, "incomplete");
    assert.equal(envelope.complete, false);
    assert.equal(envelope.data, null);
    assert.equal(envelope.errors[0]?.code, limited ? "LIMIT_EXCEEDED" : "SOURCE_CHANGED");
    if (mode === "growth") {
      assert.equal(observation.grew, true);
      assert.ok(observation.readBytes > 0);
      assert.ok(observation.readBytes <= limit + 1);
      assert.equal(observation.closed, true);
    } else {
      assert.equal(observation.readBytes, 0, "Rejected input body was consumed");
      if (mode !== "oversized") assert.equal(observation.mutated, true);
      if (mode === "ancestor" || mode === "fifo") assert.equal(observation.closed, true);
    }
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

for (const operation of ["api", "cli"] as const) {
  test(operation + " rejects actual outside-root leaf substitution before source reads", {
    skip: process.platform === "win32" ? "File symlink creation requires Windows privileges" : false,
  }, () => checkBoundary("leaf", operation));
  test(operation + " rejects actual ancestor link or junction substitution before source reads",
    () => checkBoundary("ancestor", operation));
}
test("growing source reads stay within the admitted byte budget", () => checkBoundary("growth", "api"));
test("oversized source is rejected without body reads", () => checkBoundary("oversized", "cli"));
test("a FIFO substituted after admission cannot block source reading", {
  skip: process.platform === "win32" ? "POSIX FIFO fixture" : false,
}, () => checkBoundary("fifo", "cli"));
test("ordinary UTF-8 source preserves BOM, hash and static escape rejection", () => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cfml-check-read-control-")));
  const file = path.join(root, "input.cfm");
  const source = "\uFEFF<cfif ok>中文</cfif>\n";
  try {
    fs.writeFileSync(file, source);
    const success = checkFile({ root, file, limits: { max_source_bytes: Buffer.byteLength(source) } });
    assert.equal(success.exit_code, 0);
    assert.equal(success.envelope.data?.verdict, "pass");
    assert.equal(success.envelope.data?.source.bom, true);
    assert.equal(success.envelope.data?.source.sha256, createHash("sha256").update(source).digest("hex"));
    const escape = checkFile({ root, file: path.join(root, "..", "outside.cfm") });
    assert.equal(escape.exit_code, 4);
    assert.equal(escape.envelope.errors[0]?.code, "FILE_OUTSIDE_ROOT");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
