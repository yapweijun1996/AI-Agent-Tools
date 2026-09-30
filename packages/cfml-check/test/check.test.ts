import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkFile } from "../src/index.js";

function withSource(source: string, extension = ".cfm", callback: (root: string, file: string) => void): void {
  const root = mkdtempSync(path.join(os.tmpdir(), "agent-cfml-check-"));
  const file = path.join(root, `fixture${extension}`);
  writeFileSync(file, source, "utf8");
  try {
    callback(root, file);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

function run(source: string, extension = ".cfm") {
  let result: ReturnType<typeof checkFile> | undefined;
  withSource(source, extension, (root, file) => {
    result = checkFile({ root, file });
  });
  assert(result !== undefined);
  return result;
}

test("CF-01 reports an extra closing tag without inventing an opener", () => {
  const result = run("<cfif ok>value</cfif></cfif>");
  assert.equal(result.exit_code, 0);
  assert.equal(result.envelope.status, "ok");
  assert.equal(result.envelope.data?.verdict, "violations");
  const finding = result.envelope.data?.findings.find((item) => item.code === "UNEXPECTED_CLOSE");
  assert(finding);
  assert.equal(finding.related_open, null);
});

test("CF-02 reports misnesting even when counts are equal", () => {
  const result = run("<cfif ok><cfloop array=items></cfif></cfloop>");
  const finding = result.envelope.data?.findings.find((item) => item.code === "MISMATCHED_CLOSE");
  assert(finding);
  assert.equal(finding.related_open?.start.line, 1);
  assert.equal(finding.related_open?.start.column, 10);
});

test("CF-03 ignores nested fake tags in a CFML comment", () => {
  const result = run("<cfif ok><!--- <cfif fake></cfif> <!--- <cfloop fake> ---> ---></cfif>");
  assert.equal(result.exit_code, 0);
  assert.equal(result.envelope.data?.verdict, "pass");
});

test("CF-04 respects quoted tag values and CFScript strings", () => {
  const result = run("<cfoutput title=\"<cfif fake>\">#hello#</cfoutput><cfscript>writeOutput(\"<cfloop fake>\");</cfscript>");
  assert.equal(result.exit_code, 0);
  assert.equal(result.envelope.data?.verdict, "pass");
});

test("CF-05 validates branch ownership and order", () => {
  const result = run("<cfelse><cfif ok><cfelse><cfelse><cfelseif later></cfif>");
  const findings = result.envelope.data?.findings.filter((item) => item.code === "INVALID_BRANCH") ?? [];
  assert.equal(findings.length, 3);
});

test("CF-06 accepts bodyless and mixed-case paired tags", () => {
  const result = run("<CFIF ok><cfset x=1 /><cfreturn x></cFiF>");
  assert.equal(result.envelope.data?.verdict, "pass");
});

test("CF-07 does not hide CFML in an HTML comment or query body", () => {
  const result = run("<!-- <cfif ok> --><cfquery name=\"q\"><cfif inner></cfif></cfquery>");
  assert(result.envelope.data?.findings.some((item) => item.code === "UNCLOSED_TAG"));
});

test("CF-08 reports unterminated strings and ignores delimiters in script comments", () => {
  const result = run("<cfscript>/* ({[ */ function ok() { return \"unterminated; }</cfscript>");
  assert.equal(result.exit_code, 3);
  assert.equal(result.envelope.status, "incomplete");
  assert(result.envelope.errors.some((item) => item.code === "UNTERMINATED_STRING"));
});

test("CF-09 fails closed for unknown tags and tag islands", () => {
  const unknown = run("<cfunknown>value</cfunknown>");
  assert.equal(unknown.exit_code, 3);
  assert.equal(unknown.envelope.data, null);
  const island = run("<cfscript>if (ok) { <cfif nope> } </cfscript>");
  assert.equal(island.exit_code, 3);
  assert(island.envelope.errors.some((item) => item.code === "UNSUPPORTED_SYNTAX"));
});

test("CF-10 preserves UTF-8 byte coordinates for non-ASCII input", () => {
  const result = run("😀\r\n<cfif ok>\r\n</cfif>");
  const data = result.envelope.data;
  assert(data);
  assert.equal(data.source.byte_size, Buffer.byteLength("😀\r\n<cfif ok>\r\n</cfif>"));
  assert.equal(data.source.path, "fixture.cfm");
});

test("CF-11 returns incomplete when the findings cap is reached", () => {
  const result = run("</cfif></cfif>", ".cfm");
  withSource("</cfif></cfif>", ".cfm", (root, file) => {
    const limited = checkFile({ root, file, limits: { max_findings: 1 } });
    assert.equal(limited.exit_code, 3);
    assert.equal(limited.envelope.data, null);
  });
  assert.equal(result.exit_code, 0);
});

test("CF-12 rejects a path outside the explicit root", () => {
  const result = run("<cfif ok></cfif>");
  withSource("<cfif ok></cfif>", ".cfm", (root, file) => {
    const outsideFile = path.join(path.dirname(root), `${path.basename(root)}-outside.cfm`);
    writeFileSync(outsideFile, "<cfif ok></cfif>", "utf8");
    try {
      const outside = checkFile({ root, file: outsideFile });
      assert.equal(outside.exit_code, 4);
      assert.equal(outside.envelope.errors[0]?.code, "FILE_OUTSIDE_ROOT");
    } finally {
      rmSync(outsideFile, { force: true });
    }
  });
  assert.equal(result.exit_code, 0);
});

test("CF-13 repeated checks are deterministic and read-only", () => {
  withSource("<cfif ok><cfloop array=items></cfloop></cfif>", ".cfm", (root, file) => {
    const first = checkFile({ root, file });
    const second = checkFile({ root, file });
    assert.deepEqual(first, second);
  });
});

test("pure-script CFCs use the script delimiter checker", () => {
  const result = run("component { function ok() { return [\"<cfif fake>\"]; } }", ".cfc");
  assert.equal(result.exit_code, 0);
  assert.equal(result.envelope.data?.verdict, "pass");
  const broken = run("component { function ok() { return [; }", ".cfc");
  assert.equal(broken.envelope.data?.verdict, "violations");
  assert(broken.envelope.data?.findings.some((item) => item.code === "UNBALANCED_DELIMITER"));
});
