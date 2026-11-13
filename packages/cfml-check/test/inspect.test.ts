import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { Ajv2020 } from "ajv/dist/2020.js";
import { inspectFiles } from "../src/index.js";

function fixture(callback: (root: string, file: (name: string, content: string) => string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "cfml-inspect-"));
  try {
    callback(root, (name, content) => {
      const target = path.join(root, name);
      writeFileSync(target, content, "utf8");
      return target;
    });
  } finally { rmSync(root, { recursive: true, force: true }); }
}

test("inspect reports unsupported tags and later findings without claiming completeness", () => {
  fixture((root, file) => {
    const target = file("source.cfm", '<cfunknown>\n<cfif ok></cfif></cfif>\n</cfunknown>');
    const { result, exit_code } = inspectFiles({ root, files: [target] });
    assert.equal(exit_code, 3);
    assert.equal(result.schema_version, "2.0.0");
    assert.equal(result.status, "incomplete");
    assert.equal(result.complete, false);
    assert.equal(result.files[0]?.scan_complete, true);
    assert.equal(result.files[0]?.verdict, null);
    assert.deepEqual(result.files[0]?.unsupported.map((item) => item.location?.start.line), [1, 3]);
    const finding = result.files[0]?.findings.find((item) => item.code === "UNEXPECTED_CLOSE");
    assert.equal(finding?.location?.start.line, 2);
    assert.equal(finding?.confidence, "provisional");
    assert.equal(finding?.file, "source.cfm");
    assert(finding?.hint);
  });
});

test("optional-body closing forms remain incomplete and later findings provisional", () => {
  for (const tag of ["cffile", "cfheader", "cflocation", "cfpdf", "cfexecute", "cfmodule", "cfzip"]) {
    fixture((root, file) => {
      const target = file("optional.cfm", `<${tag}>body</${tag}>\n<cfelse>`);
      const { result, exit_code } = inspectFiles({ root, files: [target] });
      assert.equal(exit_code, 3, tag);
      assert.equal(result.files[0]?.verdict, null);
      assert.equal(result.files[0]?.unsupported[0]?.code, "UNSUPPORTED_SYNTAX");
      assert.equal(result.files[0]?.unsupported[0]?.location?.start.line, 1);
      assert(result.files[0]?.findings.some((item) => item.code === "INVALID_BRANCH" && item.confidence === "provisional"));
    });
  }
});

test("module and zip recognition never resolves templates or executes archive operations", () => {
  fixture((root, file) => {
    const marker = path.join(root, "archive.zip");
    const target = file("operations.cfm", `<cfmodule template="../outside.cfm"><cfzip action="zip" file="${marker}" />`);
    const { result, exit_code } = inspectFiles({ root, files: [target] });
    assert.equal(exit_code, 0);
    assert.equal(result.files[0]?.verdict, "pass");
    assert.equal(existsSync(marker), false);
  });
});

test("inspecting execute and directory tags does not run them or write output", () => {
  fixture((root, file) => {
    const marker = path.join(root, "output.txt");
    const target = file("operations.cfm", `<cfexecute name="echo" arguments="test" outputFile="${marker}"><cfdirectory action="create" directory="${root}/created">`);
    const { result, exit_code } = inspectFiles({ root, files: [target] });
    assert.equal(exit_code, 0);
    assert.equal(result.files[0]?.verdict, "pass");
    assert.equal(existsSync(marker), false);
    assert.equal(existsSync(path.join(root, "created")), false);
  });
});

test("inspect continues beyond bounded CFScript tag islands without claiming a complete check", () => {
  fixture((root, file) => {
    const target = file("island.cfm", '<cfscript>\n<cfif ok>\n</cfif>\n</cfscript>\n<cfif ok></cfif></cfif>');
    const { result, exit_code } = inspectFiles({ root, files: [target] });
    assert.equal(exit_code, 3);
    assert.equal(result.files[0]?.scan_complete, true);
    assert.deepEqual(result.files[0]?.unsupported.map((item) => item.location?.start.line), [2, 3]);
    assert(result.files[0]?.findings.some((item) => item.code === "UNEXPECTED_CLOSE" && item.location?.start.line === 5));
    assert(result.files[0]?.findings.every((item) => item.confidence === "provisional"));
  });
});

test("range preserves surrounding structural context and identifies selected scope", () => {
  fixture((root, file) => {
    const target = file("range.cfm", '<cfif ok>\n<cfelse>\n<cfelse>\n</cfif>');
    const { result, exit_code } = inspectFiles({ root, files: [target], range: { start: 3, end: 3 } });
    assert.equal(exit_code, 0);
    assert.deepEqual(result.files[0]?.range, { start: 3, end: 3 });
    assert.equal(result.files[0]?.verdict, "violations");
    const finding = result.files[0]?.findings[0];
    assert.equal(finding?.code, "INVALID_BRANCH");
    assert.equal(finding?.location?.start.line, 3);
    assert.equal(finding?.related_open?.start.line, 1);
    assert.equal(finding?.confidence, "confirmed");
    const invalid = inspectFiles({ root, files: [target], range: { start: 8, end: 9 } });
    assert.equal(invalid.exit_code, 2);
    assert.equal(invalid.result.status, "error");
    const invalidZero = inspectFiles({ root, files: [target], range: { start: 0, end: 1 } });
    assert.equal(invalidZero.exit_code, 2);
    assert.equal(invalidZero.result.files.length, 0);
  });
});

test("inspect handles explicit multiple files, root rejection, and a file count limit", () => {
  fixture((root, file) => {
    const first = file("one.cfm", '<cfset x=1>');
    const second = file("two.cfm", '<cfif x>');
    const result = inspectFiles({ root, files: [first, second] });
    assert.equal(result.exit_code, 0);
    assert.deepEqual(result.result.files.map((item) => item.path), ["one.cfm", "two.cfm"]);
    assert.equal(result.result.files[1]?.findings[0]?.code, "UNCLOSED_TAG");
    const relative = inspectFiles({ root, files: ["one.cfm", "two.cfm"] });
    assert.equal(relative.exit_code, 0);
    assert.deepEqual(relative.result.files.map((item) => item.path), ["one.cfm", "two.cfm"]);
    const unsupported = file("unsupported.cfm", '<cfunknown>');
    const mixed = inspectFiles({ root, files: [first, unsupported] });
    assert.equal(mixed.exit_code, 3);
    assert.deepEqual(mixed.result.files.map((item) => item.status), ["ok", "incomplete"]);
    assert.equal(mixed.result.files[0]?.verdict, "pass");
    assert.equal(mixed.result.files[1]?.verdict, null);
    const outside = inspectFiles({ root, files: [path.join(root, "..", "outside.cfm")] });
    assert.equal(outside.exit_code, 4);
    assert.equal(outside.result.files[0]?.errors[0]?.code, "FILE_OUTSIDE_ROOT");
    assert.equal(inspectFiles({ root, files: Array(33).fill(first) }).exit_code, 2);
  });
});

test("range retains uncertainty from unsupported syntax outside the selected lines", () => {
  fixture((root, file) => {
    const target = file("scope.cfm", '<cfunknown>\n<cfif ok></cfif></cfif>\n</cfunknown>');
    const { result, exit_code } = inspectFiles({ root, files: [target], range: { start: 2, end: 2 } });
    assert.equal(exit_code, 3);
    assert.equal(result.files[0]?.verdict, null);
    assert.deepEqual(result.files[0]?.unsupported.map((item) => item.location?.start.line), [1, 3]);
    assert.equal(result.files[0]?.findings[0]?.confidence, "provisional");
  });
});

test("inspect locates CR-only lines while retaining the legacy check contract", () => {
  fixture((root, file) => {
    const target = file("cr.cfm", '<cfunknown>\r<cfif ok></cfif></cfif>');
    const inspected = inspectFiles({ root, files: [target], range: { start: 2, end: 2 } });
    assert.equal(inspected.exit_code, 3);
    assert.equal(inspected.result.files[0]?.unsupported[0]?.location?.start.line, 1);
    assert.equal(inspected.result.files[0]?.findings[0]?.location?.start.line, 2);
  });
});

test("comparison distinguishes uniquely matched findings and new codes, without guessing under uncertainty", () => {
  fixture((root, file) => {
    const before = file("before.cfm", '<cfif x>\n');
    const after = file("after.cfm", '<cfif x>\n</cfoutput>\n');
    const { result, exit_code } = inspectFiles({ root, baseline: before, files: [after] });
    assert.equal(exit_code, 0);
    assert.equal(result.mode, "compare");
    assert.match(result.comparison_basis ?? "", /not proof/u);
    assert.deepEqual(result.comparison?.map((item) => [item.finding.code, item.classification]), [["UNCLOSED_TAG", "existing"], ["MISMATCHED_CLOSE", "new"]]);
    const partial = file("partial.cfm", '<cfunknown>\n<cfif x>\n');
    const uncertain = inspectFiles({ root, baseline: partial, files: [after] });
    assert.equal(uncertain.exit_code, 3);
    assert(uncertain.result.comparison?.every((item) => item.classification === "uncertain"));
    const shifted = file("shifted.cfm", '\n<cfif x>\n');
    const shiftedResult = inspectFiles({ root, baseline: before, files: [shifted] });
    assert.equal(shiftedResult.result.comparison?.[0]?.classification, "existing");
    const scopedShift = inspectFiles({ root, baseline: before, files: [shifted], range: { start: 2, end: 2 } });
    assert.equal(scopedShift.exit_code, 0);
    assert.equal(scopedShift.result.files[0]?.range, null);
    assert.equal(scopedShift.result.comparison?.[0]?.classification, "existing");
  });
});

test("CLI inspect provides JSON incomplete evidence and enforces output limits", () => {
  fixture((root, file) => {
    const target = file("source.cfm", '<cfunknown>\n<cfif ok></cfif></cfif>');
    const cli = path.resolve("dist/cli/index.js");
    const run = (args: string[]) => spawnSync(process.execPath, [cli, ...args], { encoding: "utf8" });
    const result = run(["inspect", "--root", root, target, "--json"]);
    assert.equal(result.status, 3);
    const envelope = JSON.parse(result.stdout);
    assert.equal(envelope.status, "incomplete");
    assert.equal(envelope.files[0].unsupported[0].location.start.line, 1);
    const limited = run(["inspect", "--root", root, target, "--json", "--max-output-bytes", "512"]);
    assert.equal(limited.status, 3);
    assert(Buffer.byteLength(limited.stdout) <= 512);
    assert.equal(JSON.parse(limited.stdout).errors[0].code, "LIMIT_EXCEEDED");
    const pretty = run(["inspect", "--root", root, target, "--json", "--pretty", "--max-output-bytes", "512"]);
    assert.equal(pretty.status, 3);
    assert(Buffer.byteLength(pretty.stdout) <= 512);
    const comparison = run(["inspect", "--root", root, "--baseline", target, target, "--json", "--max-output-bytes", "512"]);
    assert.equal(comparison.status, 3);
    assert(Buffer.byteLength(comparison.stdout) <= 512);
    assert.equal(JSON.parse(comparison.stdout).errors[0].code, "LIMIT_EXCEEDED");
    const malformed = run(["inspect", "--root", root, target, "--unknown", "--json"]);
    assert.equal(malformed.status, 2);
    assert.equal(JSON.parse(malformed.stdout).errors[0].code, "INVALID_ARGUMENT");
  });
});

test("inspect v2 schema validates complete, incomplete, comparison and bounded failures", () => {
  const schema = JSON.parse(readFileSync("schema/agent-cfml-inspect-result-v2.schema.json", "utf8"));
  const validate = new Ajv2020({ strict: false }).compile(schema);
  fixture((root, file) => {
    const good = file("good.cfm", '<cfset x=1>');
    const unknown = file("unknown.cfm", '<cfunknown>');
    const results = [
      inspectFiles({ root, files: [good] }).result,
      inspectFiles({ root, files: [unknown] }).result,
      inspectFiles({ root, baseline: good, files: [good] }).result,
      inspectFiles({ root, files: [path.join(root, "..", "outside.cfm")] }).result,
      inspectFiles({ root, files: [unknown], limits: { max_output_bytes: 512 } }).result,
      inspectFiles({ root, files: [good], range: { start: 0, end: 1 } }).result,
    ];
    for (const result of results) assert.equal(validate(result), true, JSON.stringify(validate.errors));
    assert.equal(validate({ ...results[0], complete: false }), false);
    assert.equal(validate({ ...results[1], complete: true }), false);
  });
});

test("resource limits withhold results instead of reporting a partial pass", () => {
  fixture((root, file) => {
    const target = file("limited.cfm", '<cfunknown><cfunknown>');
    const result = inspectFiles({ root, files: [target], limits: { max_findings: 1 } });
    assert.equal(result.exit_code, 3);
    assert.equal(result.result.status, "incomplete");
    assert.equal(result.result.files[0]?.verdict, null);
    assert.equal(result.result.files[0]?.errors[0]?.code, "LIMIT_EXCEEDED");
    assert.deepEqual(result.result.files[0]?.findings, []);
  });
});

test("inspect and comparison leave explicitly selected sources and directory unchanged", () => {
  fixture((root, file) => {
    const before = file("before.cfm", '<cfif x>');
    const after = file("after.cfm", '<cfif x></cfif>');
    const entries = readdirSync(root).sort();
    const bytes = [readFileSync(before), readFileSync(after)];
    inspectFiles({ root, files: [before, after] });
    inspectFiles({ root, baseline: before, files: [after] });
    assert.deepEqual(readdirSync(root).sort(), entries);
    assert.deepEqual(readFileSync(before), bytes[0]);
    assert.deepEqual(readFileSync(after), bytes[1]);
  });
});

test("text output escapes terminal control characters in filenames", { skip: process.platform === "win32" }, () => {
  fixture((root, file) => {
    const target = file("escape\u001b[31m.cfm", '<cfif x>');
    const cli = path.resolve("dist/cli/index.js");
    const result = spawnSync(process.execPath, [cli, "inspect", "--root", root, target], { encoding: "utf8" });
    assert.equal(result.status, 0);
    assert(!result.stdout.includes("\u001b"));
    assert(result.stdout.includes("\\u001b"));
  });
});
