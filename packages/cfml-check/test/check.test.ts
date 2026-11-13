import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { capabilities, checkFile } from "../src/index.js";
import { scanCfml } from "../src/core/lexer.js";
import { DEFAULT_LIMITS } from "../src/core/limits.js";
import "./source-boundary.test.js";
import "./inspect.test.js";

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

test("output withholding returns incomplete exit 3 and rejects impossible budgets", () => {
  withSource("<cfset n = 1>", ".cfm", (root, file) => {
    const limited = checkFile({ root, file, limits: { max_output_bytes: 512 } });
    assert.equal(limited.envelope.status, "incomplete");
    assert.equal(limited.exit_code, 3);
    assert.ok(Buffer.byteLength(JSON.stringify(limited.envelope)) + 1 <= 512);
    const worst = checkFile({ root, file, limits: { max_output_bytes: 512, max_source_bytes: 16 * 1024 * 1024, max_nesting: 1024, max_findings: 1000, time_limit_ms: 30000 } });
    assert.equal(worst.exit_code, 3);
    assert.ok(Buffer.byteLength(JSON.stringify(worst.envelope)) + 1 <= 512);
    const invalid = checkFile({ root, file, limits: { max_output_bytes: 1 } });
    assert.equal(invalid.exit_code, 2);
    assert.equal(invalid.envelope.errors[0]?.code, "INVALID_LIMIT");
  });
});

test("dot-prefixed in-root filenames are not parent traversal", () => {
  withSource("<cfset n = 1>", ".cfm", (root) => {
    const file = path.join(root, "..config.cfm");
    writeFileSync(file, "<cfset n = 1>");
    assert.equal(checkFile({ root, file }).exit_code, 0);
  });
});

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

test("CFML path backslashes do not hide later tag diagnostics", () => {
  const source = String.raw`<cfif ok><cfset p = "C:\"><cfmystery></cfif><cfunknown>`;
  const scan = scanCfml(source, DEFAULT_LIMITS, true);
  assert.equal(scan.incomplete.length, 2);
  assert.match(scan.incomplete[0]?.message ?? "", /cfmystery/u);
  assert.match(scan.incomplete[1]?.message ?? "", /cfunknown/u);
  assert.equal(scan.findings.length, 0);
  const after = run(String.raw`<cfif ok><cfset p = "C:\"></cfif><cfelse>`);
  assert.equal(after.envelope.data?.verdict, "violations");
  assert(after.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"));
});

test("CFScript path backslashes do not hide subsequent delimiters", () => {
  const result = run(String.raw`<cfscript>p = "C:\"; (</cfscript>`);
  assert.equal(result.exit_code, 0);
  assert(result.envelope.data?.findings.some((item) => item.code === "UNBALANCED_DELIMITER"));
  const quoted = run(`<cfoutput title="a ""quoted"" value">ok</cfoutput><cfscript>p = "a ""quoted"" value";</cfscript>`);
  assert.equal(quoted.envelope.data?.verdict, "pass");
});

test("common standalone tags retain subsequent structural checks", () => {
  for (const tag of ["cfabort", "cfbreak", "cferror", "cfcookie", "cfheader", "cffile", "cfimage"]) {
    const result = run(`<${tag}><cfif ok></cfif>`);
    assert.equal(result.exit_code, 0, tag);
    assert.equal(result.envelope.data?.verdict, "pass", tag);
    assert(capabilities().data?.supported_tags.bodyless.includes(tag));
    const after = run(`<${tag}><cfelse>`);
    assert(after.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"), tag);
    const closed = run(`<${tag}></${tag}>`);
    assert.equal(closed.exit_code, 3, tag);
    assert.equal(closed.envelope.status, "incomplete", tag);
  }
});

test("location, PDF, directory and execute standalone tags preserve structural checks", () => {
  for (const tag of ["cflocation", "cfpdf", "cfdirectory", "cfexecute"]) {
    const source = `<CFIF ok><${tag.toUpperCase()}\n action="example" /><cfelse></CFIF>`;
    const result = run(source);
    assert.equal(result.exit_code, 0, tag);
    assert.equal(result.envelope.data?.verdict, "pass", tag);
    assert(capabilities().data?.supported_tags.bodyless.includes(tag));
    const later = run(`<${tag}><cfelse>`);
    assert(later.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"), tag);
    const closed = run(`<${tag}></${tag}>`);
    assert.equal(closed.exit_code, 3, tag);
    assert.equal(closed.envelope.status, "incomplete", tag);
  }
});

test("flush, module and zip standalone tags preserve later diagnostics", () => {
  for (const source of [
    '<cfflush interval="10">',
    '<cfmodule template="../outside.cfm" attr="#value#">',
    '<cfmodule template="#dynamicPath#" />',
    '<cfzip action="readbinary" file="#archive#" entrypath="#entry#" />',
  ]) {
    const result = run(`<cfif ok>${source}</cfif><cfelse>`);
    assert.equal(result.exit_code, 0, source);
    assert(result.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"), source);
  }
  for (const tag of ["cfflush", "cfmodule", "cfzip"]) {
    assert(capabilities().data?.supported_tags.bodyless.includes(tag));
    const result = run(`<${tag}></${tag}>`);
    assert.equal(result.exit_code, 3, tag);
    assert.equal(result.envelope.status, "incomplete", tag);
  }
  const custom = run('<cf_customtag value="x">');
  assert.equal(custom.exit_code, 3);
  assert.equal(custom.envelope.status, "incomplete");
});

test("standalone cfsetting supports legacy syntax without hiding later errors", () => {
  for (const setting of ['<cfsetting showdebugoutput="false">', '<CFSETTING\n requesttimeout="120" />']) {
    const valid = run(`<cfif ok>${setting}</cfif>`);
    assert.equal(valid.exit_code, 0, setting);
    assert.equal(valid.envelope.data?.verdict, "pass", setting);
    const invalid = run(`${setting}<cfelse>`);
    assert(invalid.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"), setting);
  }
  assert(capabilities().data?.supported_tags.bodyless.includes("cfsetting"));
  const closed = run('<cfsetting showdebugoutput="false">body</cfsetting>');
  assert.equal(closed.exit_code, 3);
  assert.equal(closed.envelope.status, "incomplete");
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

test("cfparam is a bodyless tag without suppressing later checks", () => {
  for (const source of [
    '<cfparam name="emailproc_yn" default="n">',
    '<CFPARAM name="emailproc_yn" default="n" />',
    '<cfif ok><cfparam name="emailproc_yn" default="n"></cfif>',
  ]) {
    const result = run(source);
    assert.equal(result.exit_code, 0, source);
    assert.equal(result.envelope.status, "ok", source);
    assert.equal(result.envelope.data?.verdict, "pass", source);
  }
  assert(capabilities().data?.supported_tags.bodyless.includes("cfparam"));
  const violation = run('<cfparam name="x" default="n"><cfif ok>');
  assert.equal(violation.envelope.data?.verdict, "violations");
  assert(violation.envelope.data?.findings.some((item) => item.code === "UNCLOSED_TAG"));
  for (const source of ['<cfparam name="x"></cfparam>', '<cfparam name="x"><cfunknown>']) {
    const result = run(source);
    assert.equal(result.exit_code, 3, source);
    assert.equal(result.envelope.status, "incomplete", source);
    assert.equal(result.envelope.data, null, source);
    assert.equal(result.envelope.errors[0]?.code, "UNSUPPORTED_SYNTAX", source);
  }
});

test("try blocks accept catches, finally, and independently nested handlers", () => {
  const sources = [
    '<cftry><cfif fileexists(path)><cfset fileurl=path></cfif><cfcatch type="any"><cfset fileurl=""></cfcatch></cftry>',
    '<CFTRY><cfcatch type="database"></cfcatch><CFCATCH type="any"></CFCATCH><CFFINALLY></CFFINALLY></CFTRY>',
    '<cftry><cffinally><cfset x=1></cffinally></cftry>',
    '<cftry><cfcatch><cftry><cfcatch></cfcatch><cffinally></cffinally></cftry></cfcatch><cffinally></cffinally></cftry>',
  ];
  for (const source of sources) {
    const result = run(source);
    assert.equal(result.exit_code, 0, source);
    assert.equal(result.envelope.status, "ok", source);
    assert.equal(result.envelope.data?.verdict, "pass", source);
  }
  const tags = capabilities().data?.supported_tags.paired_bodies ?? [];
  for (const tag of ["cftry", "cfcatch", "cffinally"]) assert(tags.includes(tag), tag);
});

test("try handlers report invalid ownership, order, and missing handlers", () => {
  const sources = [
    '<cfcatch></cfcatch>',
    '<cffinally></cffinally>',
    '<cftry><cfif x><cfcatch></cfcatch></cfif></cftry>',
    '<cftry><cffinally></cffinally><cfcatch></cfcatch></cftry>',
    '<cftry><cffinally></cffinally><cffinally></cffinally></cftry>',
    '<cftry><cfset x=1></cftry>',
  ];
  for (const source of sources) {
    const result = run(source);
    assert.equal(result.exit_code, 0, source);
    assert.equal(result.envelope.status, "ok", source);
    assert.equal(result.envelope.data?.verdict, "violations", source);
    assert(result.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"), source);
  }
});

test("try tags preserve mismatch, incomplete syntax, and existing boundaries", () => {
  const mismatch = run('<cftry><cfcatch></cftry></cfcatch>');
  assert.equal(mismatch.envelope.data?.verdict, "violations");
  assert(mismatch.envelope.data?.findings.some((item) => item.code === "MISMATCHED_CLOSE"));
  const unclosed = run('<cftry><cfcatch></cfcatch>');
  assert(unclosed.envelope.data?.findings.some((item) => item.code === "UNCLOSED_TAG"));
  for (const source of [
    '<cftry><cfcatch /></cftry>',
    '<cftry><cffinally /></cftry>',
    '<cftry><cfunknown></cftry>',
  ]) {
    const result = run(source);
    assert.equal(result.exit_code, 3, source);
    assert.equal(result.envelope.status, "incomplete", source);
    assert.equal(result.envelope.data, null, source);
    assert.equal(result.envelope.errors[0]?.code, "UNSUPPORTED_SYNTAX", source);
  }
});

test("transaction and switch structures accept bounded Globe3 forms", () => {
  for (const source of [
    '<cftransaction><cfset x=1><cftransaction action="rollback"></cftransaction>',
    '<cftransaction action="begin"><cftransaction action="commit" /></cftransaction>',
    '<cfswitch expression="x"><cfcase value="a"><cfset x=1></cfcase><cfdefaultcase></cfdefaultcase></cfswitch>',
    '<cfswitch expression="x"><cfcase value="a"><cfswitch expression="y"><cfdefaultcase></cfdefaultcase></cfswitch></cfcase></cfswitch>',
  ]) {
    const result = run(source);
    assert.equal(result.exit_code, 0, source);
    assert.equal(result.envelope.data?.verdict, "pass", source);
  }
  const tags = capabilities().data?.supported_tags.paired_bodies ?? [];
  for (const tag of ["cftransaction", "cfswitch", "cfcase", "cfdefaultcase"]) assert(tags.includes(tag));
});

test("switch ownership and uncertain transaction actions do not pass silently", () => {
  for (const source of [
    '<cfcase value="a"></cfcase>',
    '<cfswitch expression="x"><cfdefaultcase></cfdefaultcase><cfdefaultcase></cfdefaultcase></cfswitch>',
  ]) {
    const result = run(source);
    assert.equal(result.envelope.data?.verdict, "violations", source);
    assert(result.envelope.data?.findings.some((item) => item.code === "INVALID_BRANCH"), source);
  }
  for (const source of [
    '<cftransaction action="#operation#">',
    '<cftransaction attributeCollection="#attrs#">',
    '<cftransaction action="begin" action="rollback">',
    '<cftransaction action="begin" />',
  ]) {
    const result = run(source);
    assert.equal(result.exit_code, 3, source);
    assert.equal(result.envelope.status, "incomplete", source);
    assert.equal(result.envelope.data, null, source);
  }
  const misleading = run('<cftransaction note=" action=rollback "><cfset x=1></cftransaction>');
  assert.equal(misleading.envelope.data?.verdict, "pass");
});

test("recovery reports unsupported tags at their positions and continues provisionally", () => {
  const source = '<cfunknown>\n<cfif ok></cfif></cfif>\n</cfunknown>';
  const result = scanCfml(source, DEFAULT_LIMITS, true);
  assert.equal(result.scan_complete, true);
  assert.deepEqual(result.incomplete.map((item) => item.location?.start.line), [1, 3]);
  assert(result.findings.some((item) => item.code === "UNEXPECTED_CLOSE" && item.location.start.line === 2));
  const legacy = run(source);
  assert.equal(legacy.exit_code, 3);
  assert.equal(legacy.envelope.data, null);
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

test("CFScript identifiers containing cf are not markup", () => {
  for (const source of [
    "<cfscript>var cfnunique = 1;</cfscript>",
    "<cfscript>var account_cfnunique = 1;</cfscript>",
    "<cfscript> cfhelper();</cfscript>",
    "<cfscript>var value = cookie.cookcfnunique;</cfscript>",
    "<cfscript>var cfscriptValue = 1;</cfscript>",
    "<cfscript>\r\n// cfnunique\r\nvar cfnunique = 1;\r\n</cfscript>",
    '<cfscript>var value = "<cfif fake>"; /* <cfset fake> */</cfscript>',
  ]) {
    const result = run(source);
    assert.equal(result.exit_code, 0, source);
    assert.equal(result.envelope.data?.verdict, "pass", source);
  }
});

test("actual CFScript tag islands remain incomplete at their source position", () => {
  for (const tag of ["<cfif ok>", "<CFSET x=1>", "<cfunknown />"]) {
    const result = run(`<cfscript>var cfnunique = 1;\n${tag}\n</cfscript>`);
    assert.equal(result.exit_code, 3);
    assert.equal(result.envelope.data, null);
    assert.equal(result.envelope.errors[0]?.code, "UNSUPPORTED_SYNTAX");
    assert.match(result.envelope.errors[0]?.message ?? "", /line 2, column 1$/u);
  }
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
