import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runRequest } from "../src/cli.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const profile = "profiles/example.json";
const globe3Profile = "profiles/globe3-legacy-printform.json";
const profileText = fs.readFileSync(path.join(repoRoot, profile), "utf8");

function check(file, root = ".", extra = {}) {
  return runRequest({ operation: "check", root, file, profile, ...extra }, { cwd: repoRoot });
}

function checkGlobe3(file) {
  return runRequest({ operation: "check", root: ".", file, profile: globe3Profile }, { cwd: repoRoot });
}

test("capabilities exposes the AIT-callable contract", () => {
  const response = runRequest({ operation: "capabilities" }, { cwd: repoRoot });
  assert.equal(response.exitCode, 0);
  assert.equal(response.result.status, "ok");
  assert.equal(response.result.complete, true);
  assert.deepEqual(response.result.data.operations, ["capabilities", "check"]);
  assert.equal(response.result.tool, "agent-cfml-policy-check");
});

test("static table with direct colgroup and col passes", () => {
  const response = check("test/fixtures/pass.cfm");
  assert.equal(response.exitCode, 0);
  assert.equal(response.result.data.verdict, "pass");
  assert.equal(response.result.data.finding_count, 0);
});

test("missing colgroup produces a stable finding", () => {
  const response = check("test/fixtures/missing-colgroup.cfm");
  assert.equal(response.exitCode, 0);
  assert.equal(response.result.data.verdict, "violations");
  assert.deepEqual(response.result.data.findings[0], {
    rule_id: "html.table.requires-colgroup",
    severity: "error",
    message: "Table must contain a direct colgroup element.",
    line: 1,
    column: 1
  });
});

test("empty colgroup produces the col finding", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cfml-policy-"));
  try {
    fs.writeFileSync(path.join(temporary, "empty.cfm"), "<table><colgroup></colgroup></table>\n", "utf8");
    fs.writeFileSync(path.join(temporary, "profile.json"), profileText, "utf8");
    const result = runRequest({ operation: "check", root: temporary, file: "empty.cfm", profile: "profile.json" });
    assert.equal(result.exitCode, 0);
    assert.deepEqual(result.result.data.findings.map(finding => finding.rule_id), ["html.table.requires-col"]);
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("comments do not create active table findings", () => {
  const response = check("test/fixtures/comments.cfm");
  assert.equal(response.exitCode, 0);
  assert.equal(response.result.data.finding_count, 0);
});

test("static markup inside cfoutput remains checkable", () => {
  const response = check("test/fixtures/pass.cfm");
  assert.equal(response.result.status, "ok");
  assert.equal(response.result.complete, true);
});

test("Globe3 profile covers stable legacy table regions and nesting", () => {
  const response = checkGlobe3("test/fixtures/globe3-legacy-printform.cfm");
  assert.equal(response.exitCode, 0);
  assert.equal(response.result.data.verdict, "pass");
  assert.equal(response.result.data.finding_count, 0);
  assert.equal(response.result.data.profile.id, "globe3-legacy-printform");
});

test("Globe3 dynamic row fails closed", () => {
  const response = checkGlobe3("test/fixtures/globe3-dynamic-row.cfm");
  assert.equal(response.exitCode, 3);
  assert.equal(response.result.status, "incomplete");
  assert.equal(response.result.data, null);
});

test("Globe3 profile ignores commented layout examples", () => {
  const response = checkGlobe3("test/fixtures/globe3-commented-layout.cfm");
  assert.equal(response.exitCode, 0);
  assert.equal(response.result.data.finding_count, 0);
});

test("Globe3 profile reports an empty colgroup", () => {
  const response = checkGlobe3("test/fixtures/globe3-missing-column.cfm");
  assert.equal(response.exitCode, 0);
  assert.deepEqual(response.result.data.findings.map(finding => finding.rule_id), ["html.table.requires-col"]);
});

test("output limit returns an incomplete result with exit code 3", () => {
  const response = spawnSync(
    process.execPath,
    [path.join(repoRoot, "src", "cli.js"), "capabilities", "--json", "--limits", '{"max_output_bytes":300}'],
    { cwd: repoRoot, encoding: "utf8" }
  );
  assert.equal(response.status, 3);
  const result = JSON.parse(response.stdout);
  assert.equal(result.status, "incomplete");
  assert.equal(result.errors[0].code, "RESOURCE_LIMIT");
});

test("dynamic CFML affecting a table fails closed", () => {
  const response = check("test/fixtures/dynamic.cfm");
  assert.equal(response.exitCode, 3);
  assert.equal(response.result.status, "incomplete");
  assert.equal(response.result.complete, false);
  assert.equal(response.result.data, null);
  assert.equal(response.result.errors[0].code, "CFML_STRUCTURE_UNCERTAIN");
});

test("path escape is rejected without reading outside the root", () => {
  const response = runRequest({ operation: "check", root: "test/fixtures", file: "../../outside.cfm", profile: "../../profiles/example.json" }, { cwd: repoRoot });
  assert.equal(response.exitCode, 4);
  assert.equal(response.result.errors[0].code, "PATH_ESCAPE");
});

test("malformed profile is rejected", () => {
  const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cfml-policy-"));
  try {
    fs.writeFileSync(path.join(temporary, "source.cfm"), "<table></table>\n", "utf8");
    fs.writeFileSync(path.join(temporary, "bad.json"), "{\"schema_version\":\"1.0.0\",\"profile\":{},\"rules\":[]}", "utf8");
    const response = runRequest({ operation: "check", root: temporary, file: "source.cfm", profile: "bad.json" });
    assert.equal(response.exitCode, 2);
    assert.equal(response.result.errors[0].code, "INVALID_PROFILE");
  } finally {
    fs.rmSync(temporary, { recursive: true, force: true });
  }
});

test("repeated runs are byte-stable and source is unchanged", () => {
  const sourcePath = path.join(repoRoot, "test/fixtures/missing-colgroup.cfm");
  const before = fs.readFileSync(sourcePath);
  const first = JSON.stringify(check("test/fixtures/missing-colgroup.cfm").result);
  const second = JSON.stringify(check("test/fixtures/missing-colgroup.cfm").result);
  assert.equal(first, second);
  assert.deepEqual(fs.readFileSync(sourcePath), before);
});
