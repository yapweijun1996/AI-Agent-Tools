import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { extractFactBundle } from "../src/fact-extractor.js";
import { buildGraph } from "../src/graph.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { createRootGuard } from "../src/root-guard.js";
import { createSnapshot } from "../src/snapshot.js";
import { createMixedStructuralScannerBackend, createWebScannerBackend } from "../src/web-scanner.js";

function parseHtml(source, file = "page.html", options = {}) {
  return createParserAdapter({ backend: createWebScannerBackend(options) }).parse(Buffer.from(source, "utf8"), file);
}

function assertLocatedPartial(parsed, code) {
  assert.equal(parsed.complete, false);
  const item = parsed.diagnostics.find((value) => value.code === code);
  assert.ok(item, code);
  assert.ok(item.span);
  assert.ok(item.span.start_line >= 1);
  assert.ok(item.span.start_col >= 0);
}

test("closed literal page yields complete HTML and a resolved submit potential", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cfml-html-coverage-"));
  const source = '<!DOCTYPE html>\n<html><head><title>Orders</title><link rel="stylesheet" href="site.css"><script src="app.js"></script></head><body><main><form action="submit.cfm" method="POST"><fieldset><legend>Order</legend><label>名字<input name=order required></label><br/><button type="submit">Save</button></fieldset></form><table><tbody><tr><td>Static</td></tr></tbody></table></main></body></html>';
  try {
    fs.writeFileSync(path.join(root, "page.html"), source);
    fs.writeFileSync(path.join(root, "submit.cfm"), "");
    fs.writeFileSync(path.join(root, "site.css"), "");
    fs.writeFileSync(path.join(root, "app.js"), "");
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const adapter = createParserAdapter({ backend: createMixedStructuralScannerBackend() });
    const parsedFiles = snapshot.files.map((file) => adapter.parse(fs.readFileSync(guard.resolve(file.path, { mustExist: true })), file.path));
    const html = parsedFiles.find((file) => file.file === "page.html");
    assert.equal(html.complete, true);
    assert.deepEqual(html.diagnostics, []);
    const formNode = html.tree.nodes.find((node) => node.kind === "HTML_FORM");
    assert.equal(Buffer.from(source).subarray(formNode.byte_start, formNode.byte_end).toString(), source.slice(source.indexOf("<form"), source.indexOf("</form>") + 7));
    const bundle = extractFactBundle({ snapshot, parsedFiles, parserName: "mixed-structural-scanner" });
    assert.equal(bundle.facts.some((fact) => fact.kind === "FORM" && fact.normalized_expression === "submit.cfm"), true);
    assert.equal(bundle.facts.some((fact) => fact.kind === "CSS_ASSET" && fact.normalized_expression === "site.css"), true);
    assert.equal(bundle.facts.some((fact) => fact.kind === "INCLUDE" && fact.normalized_expression === "app.js"), true);
    const indexes = buildProjectIndexes({ factBundle: bundle });
    const resolutions = resolveLiteralPaths({ factBundle: bundle, indexes, rootGuard: guard });
    const graph = buildGraph({ factBundle: bundle, resolutions, rootGuard: guard, snapshot, createdAt: "2026-10-13T00:00:00.000Z" });
    assert.equal(graph.edges.some((edge) => edge.type === "FORM_SUBMITS_TO"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("mismatched closure is a located parse failure, not only an unsupported warning", () => {
  const parsed = parseHtml("<div>\n  <form action='submit.cfm'><span></form></div>");
  assertLocatedPartial(parsed, "PARSE_PARTIAL");
  const mismatch = parsed.diagnostics.find((item) => item.message.includes("does not match"));
  assert.equal(mismatch.span.start_line, 2);
  assert.equal(mismatch.span.start_col, 34);
});

test("raw text, RCDATA and comments cannot fabricate form or query evidence", () => {
  const fake = '<form action="fake.cfm"></form>';
  const source = `<!-- ${fake} --><title>${fake}</title><textarea>${fake} queryExecute("select * from fake_table")</textarea><script>const template = '${fake}'; fetch("/real");</script><style>/* ${fake} */ .x { background: url(real.png); }</style><form action="real.cfm"><textarea>${fake}</textarea></form>`;
  const parsed = parseHtml(source, "page.cfm");
  assert.equal(parsed.tree.nodes.filter((node) => node.kind === "HTML_FORM").length, 1);
  assert.equal(parsed.tree.nodes.find((node) => node.kind === "HTML_FORM").action, "real.cfm");
  assert.equal(parsed.tree.nodes.some((node) => node.kind === "SQL_QUERY"), false);
  assert.equal(parsed.tree.nodes.some((node) => node.kind === "JS_FETCH" && node.target.value === "/real"), true);
  assert.equal(parsed.tree.nodes.some((node) => node.kind === "CSS_REFERENCE" && node.target === "real.png"), true);
  assertLocatedPartial(parsed, "UNSUPPORTED_SYNTAX");
  assert.equal(parseHtml(`<title>${fake}</title><textarea>${fake}</textarea><!-- ${fake} -->`).complete, true);
});

test("unknown, foreign and recovery-dependent markup remain partial", () => {
  for (const source of [
    "<custom-widget></custom-widget>", "<div/>", "<ul><li>one<li>two</ul>",
    "<p><div></div></p>", "<table><tr><td>implicit tbody</td></tr></table>",
    "<select><div></div></select>", "<div xmlns='unknown'></div>",
    "<!DOCTYPE html PUBLIC 'legacy'><div></div>", "<div onclick='run()'></div>",
    "<?processing?><div></div>", "<![CDATA[<form action='fake'>]]>",
  ]) assert.equal(parseHtml(source).complete, false, source);
  for (const source of [
    "<svg><form action='fake.cfm'></form></svg>", "<math><form action='fake.cfm'></form></math>",
    "<template><form action='fake.cfm'></form></template>", "<noscript><form action='fake.cfm'></form></noscript>",
  ]) {
    const parsed = parseHtml(source);
    assertLocatedPartial(parsed, "UNSUPPORTED_SYNTAX");
    assert.equal(parsed.tree.nodes.some((node) => node.kind === "HTML_FORM"), false);
  }
});

test("malformed attribute tokenization cannot silently produce complete evidence", () => {
  for (const source of [
    "<form action='x.cfm'action='y.cfm'></form>", "<form action='x.cfm' ACTION='y.cfm'></form>",
    "<form action=></form>", "<form action=x`y></form>", "<form @action='x.cfm'></form>",
    "<form action='unterminated>", "<form action='x.cfm' / invalid></form>",
    "<form action='x.cfm'></form illegal>", "<form\u00a0action='x.cfm'></form>",
    "<form action='x\0.cfm'></form>",
  ]) {
    const parsed = parseHtml(source);
    assertLocatedPartial(parsed, "PARSE_PARTIAL");
  }
  assertLocatedPartial(parseHtml('<form action="submit.cfm?a=1&amp;b=2"></form>'), "UNSUPPORTED_SYNTAX");
});

test("structural and aggregate attribute budgets are enforced with safe Unicode spans", () => {
  assertLocatedPartial(parseHtml("<div><span></span></div>", "page.html", { maxNodes: 1 }), "RESOURCE_LIMIT");
  const limited = parseHtml('<form action="名字-long.cfm"></form>', "page.html", { maxAttributeBytes: 12 });
  assertLocatedPartial(limited, "RESOURCE_LIMIT");
  assert.equal(limited.tree.nodes.some((node) => node.kind === "HTML_FORM"), false);
  assertLocatedPartial(parseHtml('<div a="1" b="2" c="3"></div>', "page.html", { maxAttributeBytes: 12 }), "RESOURCE_LIMIT");
});

test("CFML comments are inert but output islands and interpolated markup remain partial", () => {
  const comments = parseHtml("<!--- <form action='fake.cfm'> <!--- nested ---> </form> ---><form action='real.cfm'></form>", "page.cfm");
  assert.equal(comments.complete, true);
  assert.deepEqual(comments.tree.nodes.filter((node) => node.kind === "HTML_FORM").map((node) => node.action), ["real.cfm"]);
  for (const source of [
    '<cfoutput>#fragment#</cfoutput>', '<form action="#target#"></form>',
    '<cfinclude template="fragment.cfm">', '<cfif condition><form action="real.cfm"></form></cfif>',
  ]) assertLocatedPartial(parseHtml(source, "page.cfm"), "UNSUPPORTED_SYNTAX");
  assertLocatedPartial(parseHtml("<!--- unterminated", "page.cfm"), "PARSE_PARTIAL");
});

test("standalone CFScript bodies preserve shared linkage and local SQL without HTML duplication", () => {
  const source = '<cfscript>include "real.cfm"; queryExecute("select * from orders");</cfscript><form action="submit.cfm"></form>';
  const standalone = parseHtml(source, "page.cfm");
  const mixed = createParserAdapter({ backend: createMixedStructuralScannerBackend() }).parse(Buffer.from(source), "page.cfm");
  for (const parsed of [standalone, mixed]) {
    assert.equal(parsed.tree.nodes.filter((node) => node.kind === "CFML_SCRIPT_INCLUDE").length, 1);
    assert.equal(parsed.tree.nodes.filter((node) => node.kind === "SQL_QUERY").length, 1);
    assert.equal(parsed.tree.nodes.filter((node) => node.kind === "HTML_FORM").length, 1);
    assert.equal(parsed.complete, false);
  }
  const quoted = parseHtml('<cfscript>include "</cfscript><form action=\'fake.cfm\'></form>";</cfscript>', "page.cfm");
  assert.equal(quoted.tree.nodes.some((node) => node.kind === "HTML_FORM"), false);
});

test("literal non-output CFML assignments and parameters do not erase HTML completeness", () => {
  for (const island of [
    '<cfset x = 1>', '<cfset variables.flag = true>', '<cfset text = "<form action=\'fake.cfm\'></form>">',
    '<cfset text = "literal ""quote""">', '<cfparam name="url.id" default="0" type="numeric">',
  ]) {
    const parsed = parseHtml(`${island}<form action="submit.cfm"></form>`, "page.cfm");
    assert.equal(parsed.complete, true, island);
    assert.deepEqual(parsed.tree.nodes.filter((node) => node.kind === "HTML_FORM").map((node) => node.action), ["submit.cfm"]);
  }
  for (const island of [
    '<cfset text = "#dynamic#">', '<cfset text = writeOutput("<form>")>', '<cfparam name="#name#" default="0">',
  ]) assertLocatedPartial(parseHtml(island, "page.cfm"), "UNSUPPORTED_SYNTAX");
});

test("non-JavaScript data scripts do not fabricate JavaScript flow evidence", () => {
  const parsed = parseHtml('<script type="application/json">{"note":"fetch(\\"/fake\\") <form action=fake>"} </script><form action="real.cfm"></form>');
  assertLocatedPartial(parsed, "UNSUPPORTED_SYNTAX");
  assert.equal(parsed.tree.nodes.some((node) => node.kind === "JS_FETCH"), false);
  assert.deepEqual(parsed.tree.nodes.filter((node) => node.kind === "HTML_FORM").map((node) => node.action), ["real.cfm"]);
});

test("non-CSS data styles do not fabricate asset references", () => {
  const parsed = parseHtml('<style type="unknown">url(fake.png)</style><link rel="stylesheet" href="real.css">');
  assertLocatedPartial(parsed, "UNSUPPORTED_SYNTAX");
  assert.deepEqual(parsed.tree.nodes.filter((node) => node.kind === "CSS_REFERENCE").map((node) => node.target), ["real.css"]);
});

test("repeated document sections and trailing document content do not claim recovery coverage", () => {
  for (const source of [
    "<html><head></head><head></head><body></body></html>",
    "<html><body></body><head></head></html>",
    "<html><body></body></html><form action='after.cfm'></form>",
  ]) assertLocatedPartial(parseHtml(source), "UNSUPPORTED_SYNTAX");
});

test("select insertion context rejects ignored form markup through option descendants", () => {
  for (const source of [
    "<select><option><form action='fake.cfm'></form></option></select>",
    "<select><optgroup><option><form action='fake.cfm'></form></option></optgroup></select>",
    "<select><option><span><form action='fake.cfm'></form></span></option></select>",
  ]) {
    const parsed = parseHtml(source);
    assertLocatedPartial(parsed, "UNSUPPORTED_SYNTAX");
    assert.equal(parsed.tree.nodes.some((node) => node.kind === "HTML_FORM"), false);
  }
  assert.equal(parseHtml("<form action='real.cfm'><select><option>One</option><optgroup label='Group'><option>Two</option></optgroup></select></form>").complete, true);
});

test("ignored select form source cannot produce a FORM fact or resolved submit edge", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cfml-html-select-"));
  const source = "<select><option><form action='fake.cfm'></form></option></select>";
  try {
    fs.writeFileSync(path.join(root, "page.html"), source);
    fs.writeFileSync(path.join(root, "fake.cfm"), "");
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const adapter = createParserAdapter({ backend: createMixedStructuralScannerBackend() });
    const parsedFiles = snapshot.files.map((file) => adapter.parse(fs.readFileSync(guard.resolve(file.path, { mustExist: true })), file.path));
    const bundle = extractFactBundle({ snapshot, parsedFiles, parserName: "mixed-structural-scanner" });
    assert.equal(bundle.complete, false);
    assert.equal(bundle.facts.some((fact) => fact.kind === "FORM"), false);
    const indexes = buildProjectIndexes({ factBundle: bundle });
    const resolutions = resolveLiteralPaths({ factBundle: bundle, indexes, rootGuard: guard });
    const graph = buildGraph({ factBundle: bundle, resolutions, rootGuard: guard, snapshot, createdAt: "2026-10-13T00:00:00.000Z" });
    assert.equal(graph.edges.some((edge) => edge.type === "FORM_SUBMITS_TO"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("trailing-solidus raw-text end tags are located malformed boundaries, not swallowed content", () => {
  for (const name of ["textarea", "title", "script", "style"]) {
    const source = `<${name}>text</${name}/><form action="real.cfm"></form></${name}>`;
    const parsed = parseHtml(source);
    assertLocatedPartial(parsed, "PARSE_PARTIAL");
    const malformed = parsed.diagnostics.find((item) => item.code === "PARSE_PARTIAL");
    assert.equal(malformed.span.start_col, source.indexOf("/>"));
  }
  const prefix = parseHtml('<textarea>text</textareax><form action="fake.cfm"></form></textarea>');
  assert.equal(prefix.complete, true);
  assert.equal(prefix.tree.nodes.some((node) => node.kind === "HTML_FORM"), false);
});

test("heading and paragraph-closing recovery does not claim explicit-tree coverage", () => {
  for (const source of [
    "<h1><h2>Nested</h2></h1>", "<h1><span><h6>Nested</h6></span></h1>",
    "<ruby><rt><rp>Nested</rp></rt></ruby>",
  ]) assertLocatedPartial(parseHtml(source), "UNSUPPORTED_SYNTAX");
  for (const name of ["details", "dialog", "figure", "figcaption", "summary", "header", "footer", "hgroup", "main", "search", "section"]) {
    const parsed = parseHtml(`<p><${name}><form action="fake.cfm"></form></${name}></p>`);
    assertLocatedPartial(parsed, "UNSUPPORTED_SYNTAX");
    assert.equal(parsed.tree.nodes.some((node) => node.kind === "HTML_FORM"), false, name);
  }
});
