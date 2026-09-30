import assert from "node:assert/strict";
import test from "node:test";

import { SourceMap } from "../src/source-map.js";
import { createTreeSitterCfmlBackend, TREE_SITTER_CFML_PARSER_VERSION } from "../src/tree-sitter-backend.js";

function fakeNode(type, text, startIndex, namedChildren = [], flags = {}) {
  return {
    type,
    text,
    startIndex,
    endIndex: startIndex + Buffer.byteLength(text, "utf8"),
    namedChildren,
    hasError: flags.hasError === true,
    isError: flags.isError === true,
    isMissing: flags.isMissing === true,
  };
}

function fakeBackend(root, options = {}) {
  class FakeParser {
    setLanguage(language) {
      this.language = language;
    }

    parse() {
      return { rootNode: root };
    }
  }

  return createTreeSitterCfmlBackend({
    Parser: FakeParser,
    grammars: { cfml: { language: "cfml-language" }, cfhtml: { language: "cfhtml-language" }, cfscript: { language: "cfscript-language" } },
    ...options,
  });
}

function sourceMap(text) {
  return new SourceMap(text, Buffer.byteLength(text, "utf8"));
}

test("normalizes Tree-sitter CFML tags into the existing structural tree", () => {
  const source = '<cfinclude template="views/home.cfm"><cfset result = 1>';
  const attributeValue = fakeNode("cf_attribute_value", '"views/home.cfm"', 21);
  const attribute = fakeNode("cf_attribute", 'template="views/home.cfm"', 13, [
    fakeNode("cf_attribute_name", "template", 13),
    attributeValue,
  ]);
  const attributes = fakeNode("tag_attributes", ' template="views/home.cfm"', 12, [attribute]);
  const include = fakeNode("cf_start_tag", '<cfinclude template="views/home.cfm">', 0, [
    fakeNode("cf_tag_name", "cfinclude", 1),
    attributes,
  ]);
  const expression = fakeNode("expression", "result = 1", 44);
  const set = fakeNode("cf_set_tag", "<cfset result = 1>", 37, [expression]);
  const root = fakeNode("program", source, 0, [include, set]);
  const backend = fakeBackend(root);
  const result = backend.parse(source, { file: "page.cfm", sourceMap: sourceMap(source) });

  assert.equal(TREE_SITTER_CFML_PARSER_VERSION, "tree-sitter-cfml/0.26.2");
  assert.equal(result.complete, true);
  assert.equal(result.tree.grammar, "cfhtml");
  assert.deepEqual(result.tree.nodes.filter((node) => node.kind === "CFML_TAG").map((node) => node.name), ["cfinclude", "cfset"]);
  assert.equal(result.tree.nodes[0].attributes[0].value, "views/home.cfm");
  assert.equal(result.tree.nodes[1].expression, "result = 1");
  assert.deepEqual(result.tree.nodes[0].span, { start_line: 1, start_col: 0, end_line: 1, end_col: 37 });
});

test("recognizes common switch tags without adding unsupported diagnostics", () => {
  const source = "<cfswitch><cfcase></cfcase></cfswitch>";
  const switchStart = fakeNode("cf_start_tag", "<cfswitch>", 0, [fakeNode("cf_tag_name", "cfswitch", 1)]);
  const caseStart = fakeNode("cf_start_tag", "<cfcase>", 10, [fakeNode("cf_tag_name", "cfcase", 11)]);
  const caseEnd = fakeNode("cf_end_tag", "</cfcase>", 19);
  const switchEnd = fakeNode("cf_end_tag", "</cfswitch>", 28);
  const backend = fakeBackend(fakeNode("program", source, 0, [switchStart, caseStart, caseEnd, switchEnd]));
  const result = backend.parse(source, { file: "page.cfm", sourceMap: sourceMap(source) });

  assert.equal(result.complete, true);
  assert.deepEqual(result.tree.nodes.filter((node) => node.kind === "CFML_TAG").map((node) => node.name), ["cfswitch", "cfcase", "cfcase", "cfswitch"]);
  assert.equal(result.diagnostics.some((item) => item.code === "UNSUPPORTED_SYNTAX"), false);
});

test("preserves script regions as incomplete opaque evidence", () => {
  const source = "<cfscript>doWork();</cfscript>";
  const content = fakeNode("cf_script_content", "doWork();", 10);
  const script = fakeNode("cf_script_tag", source, 0, [content]);
  const backend = fakeBackend(fakeNode("program", source, 0, [script]));
  const result = backend.parse(source, { file: "page.cfm", sourceMap: sourceMap(source) });

  assert.equal(result.complete, false);
  assert.equal(result.tree.nodes.some((node) => node.kind === "OPAQUE_REGION"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "UNSUPPORTED_SYNTAX"), true);
});

test("reports syntax errors and parser node limits without guessing evidence", () => {
  const source = "<cfset x = 1><cfset y = 2>";
  const first = fakeNode("cf_set_tag", "<cfset x = 1>", 0, [fakeNode("expression", "x = 1", 7)]);
  const second = fakeNode("cf_set_tag", "<cfset y = 2>", 14, [], { hasError: true, isError: true });
  const root = fakeNode("program", source, 0, [first, second], { hasError: true });
  const result = fakeBackend(root, { maxNodes: 1 }).parse(source, { file: "page.cfm", sourceMap: sourceMap(source) });

  assert.equal(result.complete, false);
  assert.equal(result.tree.nodes.length, 1);
  assert.equal(result.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  assert.equal(result.diagnostics.some((item) => item.code === "PARSER_ERROR"), true);
});

test("fails closed for non-CFML files", () => {
  const source = "<html></html>";
  const backend = fakeBackend(fakeNode("program", source, 0));
  const result = backend.parse(source, { file: "index.html", sourceMap: sourceMap(source) });

  assert.equal(result.complete, false);
  assert.equal(result.tree.nodes.length, 0);
  assert.equal(result.diagnostics[0].code, "UNSUPPORTED_LANGUAGE");
});

test("rejects invalid backend limits", () => {
  assert.throws(() => fakeBackend(fakeNode("program", "", 0), { maxNodes: 0 }), /maxNodes/u);
  assert.throws(() => fakeBackend(fakeNode("program", "", 0), { maxAttributeBytes: 0 }), /maxAttributeBytes/u);
});
