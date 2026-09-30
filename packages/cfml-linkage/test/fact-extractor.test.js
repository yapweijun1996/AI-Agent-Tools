import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { extractFactBundle } from "../src/fact-extractor.js";
import { createCfmlScannerBackend } from "../src/cfml-scanner.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { createRootGuard } from "../src/root-guard.js";
import { createSnapshot } from "../src/snapshot.js";

const fixtureRoot = path.resolve("fixtures", "golden");

function parseSnapshot(snapshot, root = fixtureRoot) {
  const guard = createRootGuard(root);
  const adapter = createParserAdapter({
    parserVersion: "cfml-structural-scanner/v0.1",
    backend: createCfmlScannerBackend(),
  });
  return snapshot.files.map((file) => adapter.parse(
    fs.readFileSync(guard.resolve(file.path, { mustExist: true })),

    file.path,
  ));
}

test("extracts deterministic structural Fact IR from inert golden inputs", () => {
  const guard = createRootGuard(fixtureRoot);
  const snapshot = createSnapshot(guard, { ignoreDirectoryNames: [".git", "node_modules", "vendor", "generated", "cache", "secrets", ".agent-cfml-linkage-cache", "web-surface", "web-flow-and-conditions", "sql-and-repository"] });
  const parsed = parseSnapshot(snapshot);
  const first = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
  const second = extractFactBundle({ snapshot, parsedFiles: parseSnapshot(snapshot), parserVersion: "cfml-structural-scanner/v0.1" });
  const expected = JSON.parse(fs.readFileSync(path.resolve("fixtures", "golden", "expected-facts-v0.1.json"), "utf8"));

  assert.equal(first.schema_version, "agent-cfml-linkage-fact/v0.1");
  assert.equal(first.complete, true);
  assert.equal(first.stats.source_file_count, 2);
  assert.equal(first.stats.fact_count, first.facts.length);
  assert.equal(first.stats.diagnostic_count, 0);
  assert.deepEqual(first, second);
  assert.deepEqual(first.source_files.map((file) => file.file), [
    "cfc-inheritance-and-scope/OrderHandler.cfc",
    "core-cfml-web-surface/index.cfm",
  ]);
  for (const expectedCase of expected.cases) {
    const actualFacts = first.facts
      .filter((fact) => fact.file === expectedCase.input)
      .map((fact) => ({ kind: fact.kind, normalized_expression: fact.normalized_expression }))
      .sort((left, right) => {
        const leftKey = `${left.kind}\0${left.normalized_expression}`;
        const rightKey = `${right.kind}\0${right.normalized_expression}`;
        return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
      });
    assert.equal(first.complete, expectedCase.expected_complete);
    assert.deepEqual(actualFacts, expectedCase.expected_facts);
  }
  assert.equal(first.facts.find((fact) => fact.kind === "INCLUDE").attributes.template, "shared/header.cfm");
  assert.equal(first.facts.find((fact) => fact.kind === "INVOKE").normalized_expression, "handlers.OrderHandler.submit");
  assert.deepEqual(first.facts.find((fact) => fact.kind === "COMPONENT").attributes.implements, ["IAudited", "IOrderHandler"]);
  assert.equal(first.facts.find((fact) => fact.kind === "METHOD").enclosing_symbol, "handlers.OrderHandler");
  assert.deepEqual(first.facts.find((fact) => fact.kind === "SCOPE_WRITE").attributes.references, ["arguments.id"]);
  assert.deepEqual(first.facts.find((fact) => fact.kind === "SCOPE_WRITE" && fact.file.endsWith("core-cfml-web-surface/index.cfm")).attributes.references, ["form.id"]);
  assert.deepEqual(first.facts.find((fact) => fact.kind === "CONDITION").condition.variables, ["form.usage"]);
});

test("preserves dynamic references and parser incompleteness without guessing targets", () => {
  const root = path.resolve("dynamic-fixture");
  fs.mkdirSync(root, { recursive: true });
  const guard = createRootGuard(root);
  const source = Buffer.from([
    "<cfinclude template=\"#url.template#\">",
    "<cfscript>throw new Error('opaque');</cfscript>",
  ].join("\n"), "utf8");
  fs.writeFileSync(path.join(root, "page.cfm"), source);
  try {
    const snapshot = createSnapshot(guard);
    const adapter = createParserAdapter({
      parserVersion: "cfml-structural-scanner/v0.1",
      backend: createCfmlScannerBackend(),
    });
    const parsed = [adapter.parse(source, "page.cfm")];
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
    assert.equal(bundle.complete, false);
    assert.equal(bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE"), true);
    assert.equal(bundle.facts.some((fact) => fact.kind === "INCLUDE"), false);
    assert.equal(bundle.diagnostics.some((item) => item.code === "UNSUPPORTED_SYNTAX"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extracts switch and case conditions for common CFML control flow", () => {
  const root = path.resolve("switch-condition-fixture");
  fs.mkdirSync(root, { recursive: true });
  const source = [
    '<cfswitch expression="#form.kind#">',
    '<cfcase value="invoice"><cfset invoice = 1></cfset>',
    "<cfdefaultcase><cfset fallback = 1></cfset>",
    "</cfswitch>",
  ].join("\n");
  fs.writeFileSync(path.join(root, "page.cfm"), source, "utf8");
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const parsed = parseSnapshot(snapshot, root);
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
    const conditions = bundle.facts.filter((fact) => fact.kind === "CONDITION");
    assert.equal(bundle.complete, true);
    assert.deepEqual(conditions.map((fact) => [fact.condition.branch_kind, fact.condition.expression_normalized]), [
      ["switch", "#form.kind#"],
      ["case", "invoice"],
      ["case", "default case"],
    ]);
    const writes = bundle.facts.filter((fact) => fact.kind === "SCOPE_WRITE");
    assert.equal(writes.length, 2);
    assert.equal(writes[0].condition.expression_normalized, "#form.kind# == invoice");
    assert.equal(writes[1].condition.expression_normalized, "default case for #form.kind#");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extracts bounded control-flow Facts without evaluating CFML", () => {
  const root = path.resolve("control-flow-fact-fixture");
  fs.mkdirSync(root, { recursive: true });
  const source = [
    '<cfloop condition="form.ready">',
    "<cftry>",
    "<cfreturn request.value>",
    '<cfcatch type="any"><cfthrow message="request.failed"></cfcatch>',
    "</cftry>",
    "</cfloop>",
  ].join("\n");
  fs.writeFileSync(path.join(root, "page.cfm"), source, "utf8");
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const parsed = parseSnapshot(snapshot, root);
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
    const controls = bundle.facts.filter((fact) => fact.kind === "CONTROL_FLOW");
    assert.equal(bundle.complete, true);
    assert.deepEqual(controls.map((fact) => [fact.attributes.control_kind, fact.normalized_expression]), [
      ["loop", "loop form.ready"],
      ["try", "try"],
      ["return", "return request.value"],
      ["catch", "catch"],
      ["throw", "throw message=\"request.failed\""],
    ]);
    assert.deepEqual(controls.find((fact) => fact.attributes.control_kind === "return").attributes.references, ["request.value"]);
    assert.equal(Object.hasOwn(controls.find((fact) => fact.attributes.control_kind === "throw").attributes, "references"), false);
    assert.deepEqual(controls.find((fact) => fact.attributes.control_kind === "loop").attributes.parameters, { condition: "form.ready" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("keeps condition state within one source file", () => {
  const root = path.resolve("condition-state-fixture");
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, "a.cfm"), "<cfif form.ready><cfset first = 1>", "utf8");
  fs.writeFileSync(path.join(root, "b.cfm"), "<cfset second = 1>", "utf8");
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const parsed = parseSnapshot(snapshot, root);
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
    const nextFile = bundle.facts.find((fact) => fact.kind === "FILE" && fact.file === "b.cfm");
    assert.equal(bundle.complete, false);
    assert.equal(parsed.find((item) => item.file === "a.cfm").complete, false);
    assert.equal(nextFile.condition, null);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("keeps cfelse flow facts explicitly conditioned", () => {
  const root = path.resolve("else-condition-fixture");
  fs.mkdirSync(root, { recursive: true });
  const source = [
    "<cfif form.ok>",
    '<cfinclude template="yes.cfm">',
    "<cfelse>",
    '<cfinclude template="no.cfm">',
    "</cfif>",
  ].join("\n");
  fs.writeFileSync(path.join(root, "page.cfm"), source, "utf8");
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const parsed = parseSnapshot(snapshot, root);
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
    const includes = bundle.facts.filter((fact) => fact.kind === "INCLUDE");
    const conditions = bundle.facts.filter((fact) => fact.kind === "CONDITION");
    assert.equal(bundle.complete, true);
    assert.equal(includes.length, 2);
    assert.equal(includes.find((fact) => fact.normalized_expression === "yes.cfm").condition.expression_normalized, "form.ok");
    assert.equal(includes.find((fact) => fact.normalized_expression === "no.cfm").condition.expression_normalized, "else branch for form.ok");
    assert.equal(conditions.some((fact) => fact.condition.expression_normalized === "else branch for form.ok" && fact.condition.branch_kind === "if"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("extracts literal cfparam names as bounded scope writes", () => {
  const root = path.resolve("cfparam-fact-fixture");
  fs.mkdirSync(root, { recursive: true });
  const source = [
    '<cfparam name="request.ready" default="#form.ready#">',
    '<cfparam name="#url.name#" default="1">',
  ].join("\n");
  fs.writeFileSync(path.join(root, "page.cfm"), source, "utf8");
  try {
    const guard = createRootGuard(root);
    const snapshot = createSnapshot(guard);
    const parsed = parseSnapshot(snapshot, root);
    const bundle = extractFactBundle({ snapshot, parsedFiles: parsed, parserVersion: "cfml-structural-scanner/v0.1" });
    const write = bundle.facts.find((fact) => fact.kind === "SCOPE_WRITE");
    assert.equal(bundle.complete, true);
    assert.equal(write.normalized_expression, "request.ready");
    assert.deepEqual(write.attributes.references, ["form.ready"]);
    assert.equal(bundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === "SCOPE_WRITE"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reports missing parser results and fact limits as incomplete evidence", () => {
  const root = path.resolve("minimal-fact-fixture");
  fs.mkdirSync(root, { recursive: true });
  const guard = createRootGuard(root);
  fs.writeFileSync(path.join(root, "one.cfm"), "<cfset x = 1>\n", "utf8");
  try {
    const snapshot = createSnapshot(guard);
    const missing = extractFactBundle({ snapshot, parsedFiles: [] });
    assert.equal(missing.complete, false);
    assert.equal(missing.diagnostics[0].code, "PARSER_RESULT_MISSING");

    const parsed = parseSnapshot(snapshot, root);
    const limited = extractFactBundle({ snapshot, parsedFiles: parsed, maxFacts: 1 });
    assert.equal(limited.complete, false);
    assert.equal(limited.facts.length, 1);
    assert.equal(limited.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
