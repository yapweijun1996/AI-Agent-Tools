import assert from "node:assert/strict";
import test from "node:test";

import { buildProjectIndexes, lookupIndex } from "../src/project-index.js";

function sourceFile(file, language = "cfml") {
  return { file, language, fingerprint: `sha256:${file}` };
}

function fact({ fact_id, kind, file, expression, attributes = {}, enclosing_symbol = null, line = 1 }) {
  return {
    fact_id,
    kind,
    file,
    language: "cfml",
    span: { start_line: line, start_col: 0, end_line: line, end_col: 10 },
    normalized_expression: expression,
    enclosing_symbol,
    condition: null,
    extraction_rule_id: "test-v0.1",
    attributes,
  };
}

function fixtureBundle() {
  return {
    schema_version: "agent-cfml-linkage-fact/v0.1",
    source_files: [sourceFile("handlers/OrderHandler.cfc"), sourceFile("index.cfm")],
    complete: true,
    facts: [
      fact({ fact_id: "component", kind: "COMPONENT", file: "handlers/OrderHandler.cfc", expression: "component handlers.OrderHandler", attributes: { component_name: "handlers.OrderHandler" } }),
      fact({ fact_id: "method", kind: "METHOD", file: "handlers/OrderHandler.cfc", expression: "method handlers.OrderHandler.submit", enclosing_symbol: "handlers.OrderHandler", attributes: { method_name: "submit" }, line: 2 }),
      fact({ fact_id: "query", kind: "QUERY", file: "index.cfm", expression: "orders", attributes: { tables: ["orders"], datasource: "main" }, line: 3 }),
      fact({ fact_id: "dynamic", kind: "DYNAMIC_REFERENCE", file: "index.cfm", expression: "dynamic target", attributes: { source_kind: "INCLUDE", dynamic: true }, line: 4 }),
    ],
  };
}

test("builds deterministic immutable indexes from normalized facts", () => {
  const bundle = fixtureBundle();
  const first = buildProjectIndexes({ factBundle: bundle });
  const second = buildProjectIndexes({ factBundle: { ...bundle, facts: [...bundle.facts].reverse() } });

  assert.deepEqual(first, second);
  assert.equal(first.schema_version, "agent-cfml-linkage-index/v0.1");
  assert.equal(first.complete, true);
  assert.deepEqual(lookupIndex(first, "componentIndex", "handlers.OrderHandler").state, "unique");
  assert.deepEqual(lookupIndex(first, "methodIndex", "handlers.OrderHandler.submit").state, "unique");
  assert.deepEqual(lookupIndex(first, "queryIndex", "orders").state, "unique");
  assert.deepEqual(lookupIndex(first, "queryIndex", "missing").state, "missing");
  assert.equal(first.factByFile["index.cfm"].length, 2);
  assert.equal(first.symbolIndex["dynamic target"], undefined);
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.componentIndex), true);
  assert.equal(Object.isFrozen(first.componentIndex["handlers.OrderHandler"]), true);
  assert.equal(Object.isFrozen(first.componentIndex["handlers.OrderHandler"][0]), true);

  bundle.facts[0].attributes.component_name = "changed";
  assert.equal(first.componentIndex["handlers.OrderHandler"][0].attributes.component_name, "handlers.OrderHandler");
  assert.throws(() => {
    first.componentIndex["new"] = [];
  }, TypeError);
});

test("retains ambiguous candidates instead of selecting a component", () => {
  const bundle = fixtureBundle();
  bundle.facts.push(fact({ fact_id: "duplicate", kind: "COMPONENT", file: "index.cfm", expression: "component handlers.OrderHandler", attributes: { component_name: "handlers.OrderHandler" }, line: 8 }));
  const indexes = buildProjectIndexes({ factBundle: bundle });
  const result = lookupIndex(indexes, "componentIndex", "handlers.OrderHandler");
  assert.equal(result.state, "ambiguous");
  assert.equal(result.candidates.length, 2);
  assert.deepEqual(result.candidates.map((candidate) => candidate.fact_id), ["component", "duplicate"]);
});

test("marks facts outside the source index incomplete without dropping evidence", () => {
  const bundle = fixtureBundle();
  bundle.facts.push(fact({ fact_id: "orphan", kind: "INCLUDE", file: "missing.cfm", expression: "missing.cfm", attributes: { template: "missing.cfm" }, line: 9 }));
  const indexes = buildProjectIndexes({ factBundle: bundle });
  assert.equal(indexes.complete, false);
  assert.deepEqual(indexes.diagnostics, [{
    code: "INDEX_SOURCE_FILE_MISSING",
    severity: "error",
    file: "missing.cfm",
    message: "Fact references a source file absent from the source-file index.",
  }]);
  assert.equal(lookupIndex(indexes, "factByFile", "missing.cfm").candidates.length, 1);
});
