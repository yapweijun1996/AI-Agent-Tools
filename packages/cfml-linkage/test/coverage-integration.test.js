import assert from "node:assert/strict";
import test from "node:test";

import { createParserAdapter } from "../src/parser-adapter.js";
import { createMixedStructuralScannerBackend, createWebScannerBackend } from "../src/web-scanner.js";

const scriptSource = '<cfscript>include "child.cfm";</cfscript>';

function parse(source, file, backend) {
  return createParserAdapter({ backend }).parse(Buffer.from(source, "utf8"), file);
}

test("mixed script coverage respects expression bounds without tightening unrelated HTML attributes", () => {
  const bounded = createMixedStructuralScannerBackend({ maxExpressionBytes: 5 });
  const script = parse(scriptSource, "page.cfm", bounded);
  assert.equal(script.complete, false);
  assert.equal(script.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  const html = parse('<form action="long-literal-target.cfm"><input name="id"></form>', "page.html", bounded);
  assert.equal(html.complete, true);
  assert.equal(html.tree.nodes.find((node) => node.kind === "HTML_FORM").action, "long-literal-target.cfm");
});

test("mixed script coverage fits its real node budget and refuses a smaller budget", () => {
  const admitted = parse(scriptSource, "page.cfm", createMixedStructuralScannerBackend({ maxNodes: 3 }));
  assert.equal(admitted.complete, true);
  assert.equal(admitted.tree.nodes.some((node) => node.kind === "CFML_SCRIPT_INCLUDE" && node.target === "child.cfm"), true);
  const limited = parse(scriptSource, "page.cfm", createMixedStructuralScannerBackend({ maxNodes: 2 }));
  assert.equal(limited.complete, false);
  assert.equal(limited.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
});

test("standalone web scanning never interprets a CFC string as a form", () => {
  const source = 'component { function run() { var text = \'<form action="ghost.cfm"></form>\'; return 1; } }';
  const result = parse(source, "Service.cfc", createWebScannerBackend());
  assert.equal(result.complete, true);
  assert.equal(result.tree.nodes.some((node) => node.kind === "HTML_FORM"), false);
});
