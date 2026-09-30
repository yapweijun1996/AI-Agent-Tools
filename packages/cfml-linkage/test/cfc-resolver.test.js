import assert from "node:assert/strict";
import test from "node:test";

import { resolveCfcLinks } from "../src/cfc-resolver.js";
import { buildProjectIndexes } from "../src/project-index.js";

function fact({ fact_id, kind, file, expression, attributes = {}, line = 1, enclosing_symbol = null }) {
  return {
    fact_id,
    kind,
    file,
    language: "cfml",
    span: { start_line: line, start_col: 0, end_line: line, end_col: 12 },
    normalized_expression: expression,
    enclosing_symbol,
    condition: null,
    extraction_rule_id: "test-cfc-resolver-v0.1",
    attributes,
  };
}

function bundle() {
  const source_files = [
    "app/page.cfm",
    "cfc/BaseHandler.cfc",
    "cfc/OrderHandler.cfc",
    "cfc/OtherOrder.cfc",
    "cfc/IOrder.cfc",
  ].map((file) => ({ file, language: "cfml", fingerprint: `sha256:${file}` }));
  return {
    source_files,
    complete: true,
    diagnostics: [],
    facts: [
      fact({ fact_id: "file-page", kind: "FILE", file: "app/page.cfm", expression: "source_file app/page.cfm" }),
      fact({ fact_id: "file-base", kind: "FILE", file: "cfc/BaseHandler.cfc", expression: "source_file cfc/BaseHandler.cfc" }),
      fact({ fact_id: "file-order", kind: "FILE", file: "cfc/OrderHandler.cfc", expression: "source_file cfc/OrderHandler.cfc" }),
      fact({ fact_id: "file-other", kind: "FILE", file: "cfc/OtherOrder.cfc", expression: "source_file cfc/OtherOrder.cfc" }),
      fact({ fact_id: "file-interface", kind: "FILE", file: "cfc/IOrder.cfc", expression: "source_file cfc/IOrder.cfc" }),
      fact({ fact_id: "base", kind: "COMPONENT", file: "cfc/BaseHandler.cfc", expression: "component BaseHandler", attributes: { component_name: "BaseHandler", extends: null, implements: [] }, line: 1 }),
      fact({ fact_id: "order", kind: "COMPONENT", file: "cfc/OrderHandler.cfc", expression: "component handlers.OrderHandler", attributes: { component_name: "handlers.OrderHandler", extends: "BaseHandler", implements: ["IOrder"] }, line: 2 }),
      fact({ fact_id: "interface", kind: "COMPONENT", file: "cfc/IOrder.cfc", expression: "component IOrder", attributes: { component_name: "IOrder", extends: null, implements: [] }, line: 4 }),
      fact({ fact_id: "method", kind: "METHOD", file: "cfc/OrderHandler.cfc", expression: "method handlers.OrderHandler.submit", attributes: { method_name: "submit", access: "public" }, enclosing_symbol: "handlers.OrderHandler", line: 5 }),
      fact({ fact_id: "instantiate", kind: "INSTANTIATE", file: "app/page.cfm", expression: "BaseHandler", attributes: { component: "BaseHandler" }, line: 6 }),
      fact({ fact_id: "invoke", kind: "INVOKE", file: "app/page.cfm", expression: "handlers.OrderHandler.submit", attributes: { component: "handlers.OrderHandler", method: "submit" }, line: 7 }),
      fact({ fact_id: "missing-method", kind: "INVOKE", file: "app/page.cfm", expression: "BaseHandler.missing", attributes: { component: "BaseHandler", method: "missing" }, line: 8 }),
      fact({ fact_id: "dynamic", kind: "DYNAMIC_REFERENCE", file: "app/page.cfm", expression: "variables.componentName", attributes: { source_kind: "INVOKE", dynamic: true }, line: 9 }),
    ],
  };
}

test("resolves unique CFC inheritance, instantiation, invoke, and method edges", () => {
  const factBundle = bundle();
  const indexes = buildProjectIndexes({ factBundle });
  const result = resolveCfcLinks({ factBundle, indexes });

  assert.equal(result.complete, true);
  assert.deepEqual(result.resolutions.map((item) => item.relation_type), ["CALLS_METHOD", "CFINVOKES", "CFINVOKES", "INSTANTIATES", "EXTENDS", "IMPLEMENTS"]);
  assert.deepEqual(result.resolutions.filter((item) => item.source_fact_id === "invoke").map((item) => item.to_fact_id), ["method", "order"]);
  assert.equal(result.resolutions.find((item) => item.relation_type === "EXTENDS").to_fact_id, "base");
  assert.equal(result.unresolved.some((item) => item.source_fact_id === "dynamic" && item.reason === "DYNAMIC_EXPRESSION"), true);
  assert.equal(result.unresolved.some((item) => item.source_fact_id === "missing-method" && item.reason === "MAPPING_UNKNOWN" && item.relation_type === "CALLS_METHOD"), true);
});

test("resolves an explicitly declared import mapping without filename heuristics", () => {
  const factBundle = {
    source_files: [
      { file: "app/page.cfm", language: "cfml", fingerprint: "sha256:page" },
      { file: "cfc/Mapped.cfc", language: "cfml", fingerprint: "sha256:mapped" },
    ],
    complete: true,
    diagnostics: [],
    facts: [
      fact({ fact_id: "file-page", kind: "FILE", file: "app/page.cfm", expression: "source_file app/page.cfm" }),
      fact({ fact_id: "file-mapped", kind: "FILE", file: "cfc/Mapped.cfc", expression: "source_file cfc/Mapped.cfc" }),
      fact({ fact_id: "mapping", kind: "MAPPING", file: "app/page.cfm", expression: "cfc", attributes: { path: "cfc", prefix: "app" }, line: 2 }),
      fact({ fact_id: "mapped", kind: "COMPONENT", file: "cfc/Mapped.cfc", expression: "component cfc.Mapped", attributes: { component_name: "cfc.Mapped", extends: null, implements: [] }, line: 1 }),
      fact({ fact_id: "instantiate-mapped", kind: "INSTANTIATE", file: "app/page.cfm", expression: "app.Mapped", attributes: { component: "app.Mapped" }, line: 3 }),
    ],
  };
  const result = resolveCfcLinks({ factBundle, indexes: buildProjectIndexes({ factBundle }) });
  const resolution = result.resolutions.find((item) => item.source_fact_id === "instantiate-mapped");
  assert.equal(resolution.resolution_kind, "mapped-component");
  assert.equal(resolution.to_fact_id, "mapped");
  assert.equal(result.unresolved.length, 0);
});

test("retains ambiguous component candidates and does not guess a target", () => {
  const factBundle = bundle();
  const indexes = buildProjectIndexes({ factBundle });
  const ambiguousFact = fact({ fact_id: "ambiguous", kind: "INSTANTIATE", file: "app/page.cfm", expression: "handlers.OrderHandler", attributes: { component: "handlers.OrderHandler" }, line: 10 });
  const otherComponent = fact({ fact_id: "other", kind: "COMPONENT", file: "cfc/OtherOrder.cfc", expression: "component handlers.OrderHandler", attributes: { component_name: "handlers.OrderHandler", extends: null, implements: [] }, line: 3 });
  const ambiguousBundle = { ...factBundle, facts: factBundle.facts.concat([otherComponent, ambiguousFact]) };
  const result = resolveCfcLinks({ factBundle: ambiguousBundle, indexes: buildProjectIndexes({ factBundle: ambiguousBundle }) });
  const unresolved = result.unresolved.find((item) => item.source_fact_id === "ambiguous");
  assert.equal(unresolved.reason, "AMBIGUOUS_COMPONENT");
  assert.deepEqual(unresolved.candidates, ["order", "other"]);
  assert.equal(result.resolutions.some((item) => item.source_fact_id === "ambiguous"), false);
});
