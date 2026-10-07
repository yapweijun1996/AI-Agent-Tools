import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { runRequest } from "../src/cli.js";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const cli = path.join(packageRoot, "src/cli.js");
const hook = path.join(packageRoot, "test-support/input-read-hook.mjs");
const profileText = fs.readFileSync(path.join(packageRoot, "profiles/example.json"));

for (const target of ["source", "profile"]) {
  for (const mode of ["oversized", "growth"]) {
    test(target + " " + mode + " input cannot exceed its read budget", () => {
      const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "cfml-policy-read-boundary-")));
      const source = path.join(root, "source.cfm");
      const profile = path.join(root, "profile.json");
      const file = target === "source" ? source : profile;
      try {
        fs.writeFileSync(source, "<p>ok</p>");
        fs.writeFileSync(profile, profileText);
        const limit = mode === "oversized" ? 16 : fs.statSync(file).size;
        if (mode === "oversized") {
          const fd = fs.openSync(file, "w");
          try { fs.ftruncateSync(fd, 8 * 1024 * 1024); } finally { fs.closeSync(fd); }
        }
        const limits = { [target === "source" ? "max_file_bytes" : "max_profile_bytes"]: limit };
        const child = spawnSync(process.execPath, ["--import", pathToFileURL(hook).href, cli, "check", "--root", root,
          "--file", "source.cfm", "--profile", "profile.json", "--limits", JSON.stringify(limits), "--json"], {
          encoding: "utf8", timeout: 5000,
          env: { ...process.env, POLICY_TEST_READ_BOUNDARY: JSON.stringify({ file, mode }) },
        });
        assert.ifError(child.error);
        assert.equal(child.status, 3, child.stderr || child.stdout);
        const result = JSON.parse(child.stdout);
        assert.equal(result.status, "incomplete");
        assert.equal(result.complete, false);
        assert.equal(result.data, null);
        assert.equal(result.errors[0].code, "RESOURCE_LIMIT");
        const line = child.stderr.split("\n").find(value => value.startsWith("READ_OBSERVATION:"));
        assert.ok(line, child.stderr);
        const observation = JSON.parse(line.slice("READ_OBSERVATION:".length));
        assert.equal(observation.fullReadBytes, 0, "input was read in full before rejection");
        assert.ok(observation.readBytes <= limit + 1);
        if (mode === "oversized") assert.equal(observation.readBytes, 0);
        else {
          assert.equal(observation.grew, true);
          assert.ok(observation.readBytes > 0);
          assert.equal(observation.closed, true);
        }
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    });
  }
}

test("exact UTF-8 byte limits preserve verdicts and encoding errors", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cfml-policy-exact-read-"));
  try {
    const source = "<p>Unicode: \u4e2d\u6587</p>";
    fs.writeFileSync(path.join(root, "source.cfm"), source);
    fs.writeFileSync(path.join(root, "profile.json"), profileText);
    const request = { operation: "check", root, file: "source.cfm", profile: "profile.json",
      limits: { max_file_bytes: Buffer.byteLength(source), max_profile_bytes: profileText.length } };
    const success = runRequest(request);
    assert.equal(success.exitCode, 0);
    assert.equal(success.result.data.verdict, "pass");
    fs.writeFileSync(path.join(root, "source.cfm"), Buffer.from([0xff]));
    const invalid = runRequest(request);
    assert.equal(invalid.exitCode, 2);
    assert.equal(invalid.result.errors[0].code, "UNSUPPORTED_ENCODING");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
