import assert from "node:assert/strict";
import crypto from "node:crypto";
import test from "node:test";

import { createCfmlScannerBackend } from "../src/cfml-scanner.js";
import { findCfscriptClose, isScriptCfcSource, scanCfmlComment, scanCfscript } from "../src/cfscript-scanner.js";
import { extractFactBundle } from "../src/fact-extractor.js";
import { createParserAdapter } from "../src/parser-adapter.js";

function parse(source, file = "page.cfm", options = {}) {
  return createParserAdapter({ backend: createCfmlScannerBackend(options) }).parse(Buffer.from(source, "utf8"), file);
}

function facts(source, file = "page.cfm", options = {}) {
  const parsed = parse(source, file, options);
  const snapshot = { complete: true, files: [{ path: file, bytes: Buffer.byteLength(source, "utf8"), content_sha256: `sha256:${crypto.createHash("sha256").update(source).digest("hex")}` }] };
  return { parsed, bundle: extractFactBundle({ snapshot, parsedFiles: [parsed] }) };
}

const links = (bundle) => bundle.facts.filter((fact) => ["INCLUDE", "INSTANTIATE", "INVOKE", "CUSTOM_TAG", "REDIRECT"].includes(fact.kind));

test("admits real script CFC declarations and literal links with method ownership and coordinates", () => {
  const source = [
    "// inert header",
    'component extends="Base" implements="IA,IB" {',
    "  public any function run() {",
    '    include "child.cfm";',
    "    return new Child();",
    "  }",
    '  include "outside.cfm";',
    "}",
  ].join("\r\n");
  const { parsed, bundle } = facts(source, "handlers/Controller.cfc");
  assert.equal(parsed.tree.kind, "CFML_SCRIPT_DOCUMENT");
  assert.equal(parsed.complete, true);
  assert.equal(bundle.complete, true);
  const component = bundle.facts.find((fact) => fact.kind === "COMPONENT");
  assert.equal(component.attributes.component_name, "handlers.Controller");
  assert.equal(component.attributes.extends, "Base");
  assert.deepEqual(component.attributes.implements, ["IA", "IB"]);
  const method = bundle.facts.find((fact) => fact.kind === "METHOD");
  assert.equal(method.normalized_expression, "method handlers.Controller.run");
  assert.equal(method.enclosing_symbol, "handlers.Controller");
  assert.equal(method.attributes.access, "public");
  assert.equal(method.span.start_line, 3);
  assert.equal(method.span.start_col, 2);
  assert.deepEqual(links(bundle).map((fact) => [fact.kind, fact.normalized_expression, fact.enclosing_symbol]).sort(), [
    ["INCLUDE", "child.cfm", "handlers.Controller.run"],
    ["INCLUDE", "outside.cfm", "handlers.Controller"],
    ["INSTANTIATE", "Child", "handlers.Controller.run"],
  ].sort());
  const includeNode = parsed.tree.nodes.find((node) => node.kind === "CFML_SCRIPT_INCLUDE");
  assert.equal(Buffer.from(source).subarray(includeNode.byte_start, includeNode.byte_end).toString(), 'include "child.cfm"');
});

test("supports empty/literal methods, interfaces and tagged CFScript with the same core scanner", () => {
  for (const source of ["component {}", "component { function empty() {} public numeric function run(required string name, numeric count=1) { var value=1; return 2; } }", "interface extends=\"IBase\" { public any function run(required string name); }"]) {
    const { bundle } = facts(source, "Example.cfc");
    assert.equal(bundle.complete, true, source);
    assert.equal(bundle.facts.some((fact) => fact.kind === "COMPONENT"), true);
  }
  const tagged = facts('<cfcomponent name="Tagged"><cfscript>function run() { include "child.cfm"; return new Child(); }</cfscript></cfcomponent>', "Tagged.cfc");
  assert.equal(tagged.bundle.complete, true);
  assert.equal(tagged.bundle.facts.find((fact) => fact.kind === "METHOD").enclosing_symbol, "Tagged");
  assert.equal(tagged.bundle.facts.find((fact) => fact.kind === "INCLUDE").enclosing_symbol, "Tagged.run");
  const simple = facts('<cfscript>var text="literal"; var number=1; return true;</cfscript>');
  assert.equal(simple.bundle.complete, true);
});

test("CFML strings, interpolation and all line endings keep fake tags and calls inert", () => {
  for (const newline of ["\n", "\r\n", "\r"]) {
    const source = [
      '// include "comment.cfm"; <cfinclude template="comment.cfm">',
      "/* new Fake(); location('fake'); */",
      'component { public any function run() {',
      "var fake = '<cfinclude template=" + '"fake.cfm"' + ">'' include " + '"fake2.cfm"' + ";';",
      'var interpolation = "#replace(\'x\', \'x\', \'<cfinclude template=\"fake3.cfm\">\')#";',
      'include "real.cfm";',
      "} }",
    ].join(newline);
    const { bundle } = facts(source, "Safe.cfc");
    assert.equal(bundle.complete, false); // Dynamic interpolation is not admitted.
    assert.deepEqual(links(bundle).map((fact) => fact.normalized_expression), ["real.cfm"]);
  }
  const escaped = facts('<cfscript>include "it\'s##literal.cfm"; include \'it\'\'s.cfm\';</cfscript>');
  assert.equal(escaped.bundle.complete, true);
  assert.deepEqual(links(escaped.bundle).map((fact) => fact.normalized_expression).sort(), ["it's#literal.cfm", "it's.cfm"].sort());
  const closingLiteral = '<cfscript>var fake="</cfscript><cfinclude template=\'fake.cfm\'>"; /* </cfscript> */ include "real.cfm";</cfscript>';
  const parsed = facts(closingLiteral);
  assert.equal(parsed.bundle.complete, true);
  assert.deepEqual(links(parsed.bundle).map((fact) => fact.normalized_expression), ["real.cfm"]);
  assert.equal(findCfscriptClose(closingLiteral, 10), closingLiteral.lastIndexOf("</cfscript>"));
});

test("preserves literal include, construction, invocation, redirect and script-tag forms", () => {
  const source = '<cfscript>' + [
    'include "a.cfm";',
    'cfinclude(template="b.cfm");',
    'cfinclude template="c.cfm";',
    "new pkg.Child();",
    'createObject("component", "pkg.Child");',
    'createObject(type="component", class="pkg.Child");',
    'cfobject(component="pkg.Child");',
    'cfobject component="pkg.Child";',
    'invoke("pkg.Child", "run");',
    'invoke(component="pkg.Child", method="run");',
    'cfinvoke(component="pkg.Child", method="run");',
    'cfinvoke component="pkg.Child" method="run";',
    "pkg.Child.run();",
    'location("/done");',
    'location(url="/named", addToken=false);',
    'cfmodule(name="custom.child");',
    'cfmodule(template="child.cfm");',
    'cfmodule template="other.cfm";',
  ].join("\n") + "</cfscript>";
  const { bundle } = facts(source);
  assert.equal(bundle.complete, true);
  assert.equal(links(bundle).length, 18);
  assert.equal(bundle.facts.filter((fact) => fact.kind === "INCLUDE").length, 3);
  assert.equal(bundle.facts.filter((fact) => fact.kind === "INSTANTIATE").length, 5);
  assert.equal(bundle.facts.filter((fact) => fact.kind === "INVOKE").length, 5);
  assert.equal(bundle.facts.filter((fact) => fact.kind === "REDIRECT").length, 2);
});

test("dynamic expressions, literal prefixes, receivers and scope-qualified calls never guess links", () => {
  for (const expression of [
    "include target;", 'include "safe" & suffix;', 'cfinclude(template="safe" & suffix);',
    'cfinclude(template="safe", template="other");', 'location("safe" & suffix);',
    'invoke("pkg.Child", methodName);', 'createObject(type=kind, class="pkg.Child");',
    "new variables.Child();", "new local.Child();", "variables.Child.run();", "this.Child.run();", "session.Child.run();",
    'new "#componentName#"();',
    'obj.location("safe");', 'obj.cfinclude(template="safe");',
    'var obj = 1; obj.Child.run();', 'cfmodule(name=dynamic, template="safe");',
    'cfmodule name=dynamic template="safe";', "include 1;", "location(1);",
  ]) {
    const { bundle } = facts(`<cfscript>${expression}</cfscript>`);
    assert.equal(bundle.complete, false, expression);
    assert.equal(links(bundle).length, 0, expression);
    assert.equal(bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE"), true, expression);
  }
  const fakeBuiltins = facts('<cfscript>somethingCreateObject("component","pkg.Child"); myinclude("fake.cfm"); αnew Child();</cfscript>');
  assert.equal(fakeBuiltins.bundle.complete, false);
  assert.equal(links(fakeBuiltins.bundle).length, 0);
});

test("unknown bodies preserve safe lexical links but cannot create guessed method declarations", () => {
  const unknown = facts('component { public any run() { include "real.cfm"; } function real() { if (flag) { include "nested.cfm"; } evaluate(code); } }', "Service.cfc");
  assert.equal(unknown.bundle.complete, false);
  assert.deepEqual(unknown.bundle.facts.filter((fact) => fact.kind === "METHOD").map((fact) => fact.attributes.method_name), ["real"]);
  assert.deepEqual(links(unknown.bundle).map((fact) => fact.normalized_expression).sort(), ["nested.cfm", "real.cfm"]);
  assert.equal(unknown.bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.unresolved_reason === "GENERATED_SYMBOL"), true);
  for (const body of ["1 2;", 'location("/one") location("/two");', 'return "unterminated;', "include \"safe.cfm\"", "new Child(];", "/* unterminated"]) {
    const { bundle } = facts(`<cfscript>${body}</cfscript>`);
    assert.equal(bundle.complete, false, body);
    assert.equal(bundle.diagnostics.some((item) => ["PARSE_PARTIAL", "UNSUPPORTED_SYNTAX"].includes(item.code)), true, body);
  }
  for (const body of ['include "safe.cfm"', 'new Child(];', 'include "safe.cfm"; /* unterminated']) {
    assert.equal(links(facts(`<cfscript>${body}</cfscript>`).bundle).length, 0, body);
  }
});

test("field, token, node, depth and diagnostics bounds stay incomplete and content-free", () => {
  const limited = facts('<cfscript>include "long-target.cfm";</cfscript>', "page.cfm", { maxAttributeBytes: 8 });
  assert.equal(limited.bundle.complete, false);
  assert.equal(links(limited.bundle).length, 0);
  assert.equal(limited.bundle.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  const nodes = parse('component { function run() { include "child.cfm"; } }', "Service.cfc", { maxNodes: 2 });
  assert.equal(nodes.complete, false);
  assert.equal(nodes.tree.nodes.length <= 2, true);
  assert.equal(nodes.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  const deepSource = "(".repeat(65) + "1" + ")".repeat(65) + ";";
  const deep = parse(`<cfscript>${deepSource}</cfscript>`);
  assert.equal(deep.complete, false);
  assert.equal(deep.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  const many = parse(`<cfscript>${"mystery();".repeat(200)}</cfscript>`);
  assert.equal(many.complete, false);
  assert.equal(many.diagnostics.length <= 64, true);
  assert.equal(many.diagnostics.every((item) => item.span && !item.message.includes("mystery")), true);
  const raw = parse("", "Empty.cfc");
  for (const option of ["maxNodes", "maxExpressionBytes", "maxDepth"]) {
    assert.throws(() => scanCfscript("", 0, 0, raw.sourceMap, "Empty.cfc", { [option]: 0 }), new RegExp(option));
  }
  const tokenSource = "1;".repeat(200);
  const tokenBound = scanCfscript(tokenSource, 0, tokenSource.length, parse(tokenSource).sourceMap, "page.cfm", { maxNodes: 1 });
  assert.equal(tokenBound.complete, false);
  assert.equal(tokenBound.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
});

test("shared CFC classification handles leading trivia without losing original byte coordinates", () => {
  for (const prefix of ["", "// header\n", "// header\r", "// header\r\n", "/* header */\n", "<!--- header --->\n", '<!-- <cfinclude template="fake.cfm"> -->\n']) {
    const source = `${prefix}  component { public any function run() { include "real.cfm"; } }`;
    assert.equal(isScriptCfcSource(source), true);
    const { parsed, bundle } = facts(source, "Safe.CFC");
    assert.equal(bundle.complete, true);
    assert.equal(parsed.tree.kind, "CFML_SCRIPT_DOCUMENT");
    assert.equal(parsed.tree.nodes.find((node) => node.kind === "CFML_SCRIPT_COMPONENT").byte_start, Buffer.byteLength(prefix) + 2);
    assert.deepEqual(links(bundle).map((fact) => fact.normalized_expression), ["real.cfm"]);
    if (prefix === "// header\r") {
      assert.equal(bundle.facts.find((fact) => fact.kind === "COMPONENT").span.start_line, 1);
      assert.equal(bundle.facts.find((fact) => fact.kind === "COMPONENT").span.start_col, prefix.length + 2);
    }
  }
  assert.equal(isScriptCfcSource("<!--- header --->\n<cfcomponent></cfcomponent>"), false);
  const unsafe = facts("component { function run() {} }", "unsafe-folder/Service.cfc");
  assert.equal(unsafe.bundle.complete, false);
  assert.equal(unsafe.bundle.facts.some((fact) => fact.kind === "COMPONENT"), false);
  assert.equal(unsafe.bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "COMPONENT"), true);
});

test("nested CFML comments remain wholly inert in script, leading trivia and tagged source", () => {
  const comment = '<!--- outer <!--- inner ---> include "ghost.cfm"; <cfinclude template="ghost.cfm"> </cfscript> --->';
  const bare = facts(`component { ${comment} function run() { include "real.cfm"; } }`, "Service.cfc");
  assert.equal(bare.bundle.complete, true);
  assert.deepEqual(links(bare.bundle).map((fact) => fact.normalized_expression), ["real.cfm"]);
  const leading = facts(`${comment}\ncomponent { function run() {} }`, "Service.cfc");
  assert.equal(leading.bundle.complete, true);
  assert.equal(isScriptCfcSource(`${comment}\ncomponent {}`), true);
  assert.equal(isScriptCfcSource(`${comment}\n<cfcomponent></cfcomponent>`), false);
  assert.equal(links(leading.bundle).length, 0);
  const tagged = facts(`${comment}\n<cfcomponent name="Service"><cfinclude template="real.cfm"></cfcomponent>`, "Service.cfc");
  assert.equal(tagged.bundle.complete, true);
  assert.deepEqual(links(tagged.bundle).map((fact) => fact.normalized_expression), ["real.cfm"]);
  const embeddedSource = `<cfscript>${comment} include "real.cfm";</cfscript>`;
  assert.equal(findCfscriptClose(embeddedSource, 10), embeddedSource.lastIndexOf("</cfscript>"));
  assert.deepEqual(links(facts(embeddedSource).bundle).map((fact) => fact.normalized_expression), ["real.cfm"]);
  const tooDeep = "<!---".repeat(65) + 'include "ghost.cfm";' + "--->".repeat(65);
  assert.equal(scanCfmlComment(tooDeep, 0).code, "RESOURCE_LIMIT");
  for (const source of [`component { ${tooDeep} }`, `${tooDeep}<cfcomponent></cfcomponent>`, `component { <!--- outer <!--- inner ---> include "ghost.cfm"; }`]) {
    const { bundle } = facts(source, "Service.cfc");
    assert.equal(bundle.complete, false);
    assert.equal(links(bundle).length, 0);
    assert.equal(bundle.diagnostics.some((item) => ["PARSE_PARTIAL", "RESOURCE_LIMIT"].includes(item.code)), true);
  }
});

test("known callback/local and forward component-method bindings cannot masquerade as builtins", () => {
  for (const [callee, argumentsText] of [
    ["createObject", '"component","Child"'],
    ["invoke", '"Child","run"'],
    ["location", '"/fake"'],
    ["cfinclude", 'template="fake.cfm"'],
    ["cfobject", 'component="Child"'],
    ["cfmodule", 'template="fake.cfm"'],
    ["cfinvoke", 'component="Child",method="run"'],
  ]) {
    for (const body of [
      `function run(required any ${callee}) { return ${callee}(${argumentsText}); }`,
      `function run() { var ${callee}=1; return ${callee}(${argumentsText}); }`,
      `function run() { return ${callee}(${argumentsText}); } function ${callee}() {}`,
    ]) {
      const { bundle } = facts(`component { ${body} }`, "Service.cfc");
      assert.equal(bundle.complete, false, body);
      assert.equal(links(bundle).length, 0, body);
      assert.equal(bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "INVOKE"), true, body);
    }
  }
});

test("parameter and local bindings do not leak into sibling methods", () => {
  for (const first of ["function first(any Child) {}", "function first() { var Child=1; }", "function first(any createObject) {}", "function Child() {}"]) {
    const source = `component { ${first} function second() { return new Child(); } function third() { return createObject("component", "Child"); } }`;
    const { bundle } = facts(source, "Service.cfc");
    assert.equal(bundle.complete, true, first);
    assert.deepEqual(links(bundle).map((fact) => [fact.kind, fact.normalized_expression, fact.enclosing_symbol]).sort(), [
      ["INSTANTIATE", "Child", "Service.second"], ["INSTANTIATE", "Child", "Service.third"],
    ].sort());
  }
});

test("rejected method declarations cannot become confirmed method-index targets", () => {
  for (const source of [
    "component { function run(); }",
    "component { public private function run() {} }",
    "component { function run(any name=unknownValue) {} }",
    "interface { function run() {} }",
  ]) {
    const { bundle } = facts(source, "Service.cfc");
    assert.equal(bundle.complete, false, source);
    assert.equal(bundle.facts.some((fact) => fact.kind === "METHOD"), false, source);
    assert.equal(bundle.diagnostics.some((item) => item.code === "UNSUPPORTED_SYNTAX"), true, source);
  }
  assert.equal(facts("interface { function run(); }", "Service.cfc").bundle.facts.filter((fact) => fact.kind === "METHOD").length, 1);
});

test("quoted keyword tokens never establish statements or declarations", () => {
  for (const body of [
    '"include" "ghost.cfm";',
    '"cfinclude" template="ghost.cfm";',
    '"cfmodule" template="ghost.cfm";',
    '"function" run() {}',
    '"component" {}',
  ]) {
    const { bundle } = facts(`<cfscript>${body}</cfscript>`);
    assert.equal(bundle.complete, false, body);
    assert.equal(links(bundle).length, 0, body);
    assert.equal(bundle.facts.some((fact) => ["METHOD", "COMPONENT"].includes(fact.kind)), false, body);
  }
});
