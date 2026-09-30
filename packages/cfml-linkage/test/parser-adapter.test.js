import assert from "node:assert/strict";
import test from "node:test";

import { createCfmlScannerBackend } from "../src/cfml-scanner.js";
import { createParserAdapter } from "../src/parser-adapter.js";

test("returns explicit unavailable evidence when no parser backend is selected", () => {
  const adapter = createParserAdapter();
  const result = adapter.parse(Buffer.from("<cfset x = 1>\n", "utf8"), "page.cfm");
  assert.equal(result.parser_version, "unselected");
  assert.equal(result.tree, null);
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics[0].code, "PARSER_UNAVAILABLE");
  assert.equal(result.sourceMap.lineCount, 2);
});

test("stops at strict decoding failure before calling the parser backend", () => {
  let called = false;
  const adapter = createParserAdapter({
    backend: { parse() { called = true; return { tree: {}, complete: true }; } },
    parserVersion: "fixture-parser/1",
  });
  const result = adapter.parse(Buffer.from([0xc3, 0x28]), "invalid.cfm");
  assert.equal(called, false);
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics[0].code, "INVALID_ENCODING");
  assert.equal(result.sourceMap, null);
});

test("normalizes a backend result while preserving partial and source-span evidence", () => {
  const adapter = createParserAdapter({
    parserVersion: "fixture-parser/1",
    backend: {
      parse(text, context) {
        assert.equal(text, "<cfset x = 1>\n");
        assert.equal(context.file, "page.cfm");
        assert.equal(context.sourceMap.positionToByteOffset(1, 0), 0);
        return {
          tree: { kind: "fixture-tree" },
          complete: false,
          diagnostics: [{ code: "UNSUPPORTED_SYNTAX", severity: "warning", message: "fixture syntax", span: { start_line: 1, start_col: 0, unbounded: "must not escape" } }],
        };
      },
    },
  });
  const result = adapter.parse(Buffer.from("<cfset x = 1>\n", "utf8"), "page.cfm");
  assert.equal(result.parser_version, "fixture-parser/1");
  assert.deepEqual(result.tree, { kind: "fixture-tree" });
  assert.equal(result.complete, false);
  assert.deepEqual(result.diagnostics, [{
    code: "UNSUPPORTED_SYNTAX",
    severity: "warning",
    message: "fixture syntax",
    file: "page.cfm",
    span: { start_line: 1, start_col: 0 },
  }]);
});

test("converts backend failures to bounded parser diagnostics", () => {
  const adapter = createParserAdapter({ backend: { parse() { throw new Error("source content must not be copied"); } } });
  const result = adapter.parse(Buffer.from("source", "utf8"), "page.cfm");
  assert.equal(result.complete, false);
  assert.deepEqual(result.diagnostics, [{
    code: "PARSER_FAILURE",
    severity: "error",
    message: "Parser backend failed: unknown.",
    file: "page.cfm",
  }]);
});

test("caps parser diagnostics and marks the result incomplete", () => {
  const adapter = createParserAdapter({
    maxDiagnostics: 2,
    backend: {
      parse() {
        return {
          tree: { kind: "fixture-tree" },
          complete: true,
          diagnostics: [
            { code: "A", severity: "warning", message: "a" },
            { code: "B", severity: "warning", message: "b" },
            { code: "C", severity: "warning", message: "c" },
          ],
        };
      },
    },
  });
  const result = adapter.parse(Buffer.from("x", "utf8"), "page.cfm");
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics.length, 2);
  assert.equal(result.diagnostics[1].code, "DIAGNOSTICS_TRUNCATED");
});

test("scans a bounded CFML tag subset without parsing comments or executing script content", () => {
  const adapter = createParserAdapter({
    parserVersion: "cfml-structural-scanner/v0.1",
    backend: createCfmlScannerBackend(),
  });
  const source = [
    "<!--- <cfinclude template=\"ignored.cfm\"> --->",
    "<cfcomponent name=\"app\">",
    "<cffunction name=\"run\">",
    "<cfinclude template=\"views/home.cfm\">",
    "<cfset result = 1>",
    "</cffunction>",
    "<cfscript>throw new Error('must not execute');</cfscript>",
    "<script>throw new Error('opaque');</script>",
  ].join("\n");
  const result = adapter.parse(Buffer.from(source, "utf8"), "Application.cfc");
  assert.equal(result.parser_version, "cfml-structural-scanner/v0.1");
  assert.equal(result.tree.kind, "CFML_STRUCTURAL_DOCUMENT");
  assert.deepEqual(result.tree.nodes.filter((node) => node.kind === "CFML_TAG").map((node) => node.name), [
    "cfcomponent",
    "cffunction",
    "cfinclude",
    "cfset",
    "cffunction",
    "cfscript",
    "cfscript",
  ]);
  const include = result.tree.nodes.find((node) => node.name === "cfinclude");
  assert.equal(include.attributes[0].value, "views/home.cfm");
  const set = result.tree.nodes.find((node) => node.name === "cfset");
  assert.equal(set.expression, "result = 1");
  assert.equal(result.tree.nodes.some((node) => node.name === "ignored"), false);
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics.some((item) => item.code === "UNSUPPORTED_SYNTAX"), true);
});

test("recognizes common switch, control, transport, and mail tags", () => {
  const source = [
    '<cfswitch expression="#form.type#">',
    '<cfcase value="invoice"><cfcontinue></cfcase>',
    "<cfdefaultcase><cfbreak></cfdefaultcase>",
    "</cfswitch>",
    '<cfhttp url="/health"><cfhttpparam name="x" value="1"></cfhttp>',
    '<cfmail to="user@example.test"><cfmailpart type="text">body</cfmailpart></cfmail>',
    '<cfinterface name="ICommon"></cfinterface>',
    '<cfsilent><cfdump var="#form#"></cfsilent>',
  ].join("\n");
  const result = createParserAdapter({ backend: createCfmlScannerBackend() }).parse(Buffer.from(source, "utf8"), "common.cfm");
  assert.deepEqual(result.tree.nodes.filter((node) => node.kind === "CFML_TAG").map((node) => node.name), [
    "cfswitch",
    "cfcase",
    "cfcontinue",
    "cfcase",
    "cfdefaultcase",
    "cfbreak",
    "cfdefaultcase",
    "cfswitch",
    "cfhttp",
    "cfhttpparam",
    "cfhttp",
    "cfmail",
    "cfmailpart",
    "cfmailpart",
    "cfmail",
    "cfinterface",
    "cfinterface",
    "cfsilent",
    "cfdump",
    "cfsilent",
  ]);
  assert.equal(result.diagnostics.some((item) => item.code === "UNSUPPORTED_SYNTAX"), false);
});

test("reports malformed tags, unsupported tags, field limits, and node limits", () => {
  const malformed = createParserAdapter({ backend: createCfmlScannerBackend() }).parse(Buffer.from("<cfinclude template=\"x", "utf8"), "bad.cfm");
  assert.equal(malformed.complete, false);
  assert.equal(malformed.diagnostics[0].code, "PARSE_PARTIAL");

  const unclosedBlock = createParserAdapter({ backend: createCfmlScannerBackend() }).parse(Buffer.from("<cfif form.ready><cfset value = 1>", "utf8"), "unclosed.cfm");
  assert.equal(unclosedBlock.complete, false);
  assert.equal(unclosedBlock.diagnostics.some((item) => item.code === "PARSE_PARTIAL"), true);

  const mismatchedBlock = createParserAdapter({ backend: createCfmlScannerBackend() }).parse(Buffer.from("<cfif form.ready></cfloop>", "utf8"), "mismatched.cfm");
  assert.equal(mismatchedBlock.complete, false);
  assert.equal(mismatchedBlock.diagnostics.some((item) => item.code === "PARSE_PARTIAL"), true);

  const unsupported = createParserAdapter({ backend: createCfmlScannerBackend() }).parse(Buffer.from("<cfunknown>", "utf8"), "unknown.cfm");
  assert.equal(unsupported.complete, false);
  assert.equal(unsupported.diagnostics[0].code, "UNSUPPORTED_SYNTAX");

  const limitedField = createParserAdapter({ backend: createCfmlScannerBackend({ maxAttributeBytes: 2 }) }).parse(Buffer.from("<cfinclude template=\"long\">", "utf8"), "limit.cfm");
  assert.equal(limitedField.complete, false);
  assert.equal(limitedField.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);

  const limitedNodes = createParserAdapter({ backend: createCfmlScannerBackend({ maxNodes: 1 }) }).parse(Buffer.from("<cfset a=1><cfset b=2>", "utf8"), "nodes.cfm");
  assert.equal(limitedNodes.complete, false);
  assert.equal(limitedNodes.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
});

test("rejects invalid adapter options, scanner options, and unsafe spans", () => {
  assert.throws(() => createParserAdapter({ parserVersion: "" }), /parserVersion/u);
  assert.throws(() => createParserAdapter({ maxDiagnostics: 0 }), /maxDiagnostics/u);
  assert.throws(() => createParserAdapter({ backend: {} }), /backend/u);
  assert.throws(() => createCfmlScannerBackend({ maxNodes: 0 }), /maxNodes/u);
  assert.throws(() => createCfmlScannerBackend({ maxAttributeBytes: 0 }), /maxAttributeBytes/u);
});
