import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildGraph } from "../src/graph.js";
import { resolveScopeLinks } from "../src/scope-resolver.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { createRootGuard } from "../src/root-guard.js";

function fact({ fact_id, kind, file, expression, attributes = {}, line = 1, condition = null }) {
  return {
    fact_id,
    kind,
    file,
    language: "cfml",
    span: { start_line: line, start_col: 0, end_line: line, end_col: 12 },
    normalized_expression: expression,
    enclosing_symbol: null,
    condition,
    extraction_rule_id: "test-scope-resolver-v0.1",
    attributes,
  };
}

function bundle() {
  const source_files = [
    "app/page.cfm",
    "app/shared.cfm",
    "app/other.cfm",
  ].map((file) => ({ file, language: "cfml", fingerprint: `sha256:${file}` }));
  return {
    source_files,
    complete: true,
    diagnostics: [],
    facts: [
      fact({ fact_id: "page-file", kind: "FILE", file: "app/page.cfm", expression: "source_file app/page.cfm" }),
      fact({ fact_id: "shared-file", kind: "FILE", file: "app/shared.cfm", expression: "source_file app/shared.cfm" }),
      fact({ fact_id: "other-file", kind: "FILE", file: "app/other.cfm", expression: "source_file app/other.cfm" }),
      fact({ fact_id: "page-user", kind: "SCOPE_WRITE", file: "app/page.cfm", expression: "request.user", attributes: { target: "request.user", references: [] }, line: 1 }),
      fact({ fact_id: "include", kind: "INCLUDE", file: "app/page.cfm", expression: "shared.cfm", attributes: { template: "shared.cfm", order_index: 1 }, line: 2 }),
      fact({ fact_id: "shared-user", kind: "SCOPE_WRITE", file: "app/shared.cfm", expression: "request.user", attributes: { target: "request.user", references: [] }, line: 1 }),
      fact({ fact_id: "shared-id", kind: "SCOPE_WRITE", file: "app/shared.cfm", expression: "request.sharedId", attributes: { target: "request.sharedId", references: [] }, line: 2 }),
      fact({ fact_id: "page-after", kind: "SCOPE_WRITE", file: "app/page.cfm", expression: "request.after", attributes: { target: "request.after", references: ["request.sharedId"] }, line: 3 }),
      fact({ fact_id: "condition", kind: "CONDITION", file: "app/page.cfm", expression: "request.after", condition: { expression_normalized: "request.after", source_span: { start_line: 4, start_col: 0, end_line: 4, end_col: 12 }, variables: ["request.after"], branch_kind: "if", evaluation: "runtime" }, line: 4 }),
      fact({ fact_id: "dynamic", kind: "DYNAMIC_REFERENCE", file: "app/other.cfm", expression: "variables.scopeName", attributes: { source_kind: "SCOPE_WRITE", dynamic: true }, line: 1 }),
    ],
  };
}

function includeResolution() {
  return {
    complete: true,
    resolutions: [{ source_fact_id: "include", relation_type: "INCLUDES", from_file: "app/page.cfm", to_file: "app/shared.cfm", span: { start_line: 2, start_col: 0, end_line: 2, end_col: 12 } }],
    unresolved: [],
    diagnostics: [],
  };
}

test("resolves ordered scope production, consumption, and overrides across includes", () => {
  const factBundle = bundle();
  const result = resolveScopeLinks({ factBundle, resolutions: includeResolution(), indexes: buildProjectIndexes({ factBundle }) });
  const again = resolveScopeLinks({ factBundle, resolutions: includeResolution(), indexes: buildProjectIndexes({ factBundle }) });

  assert.equal(result.complete, true);
  assert.deepEqual(result, again);
  assert.equal(result.unresolved.some((item) => item.source_fact_id === "dynamic" && item.reason === "DYNAMIC_EXPRESSION"), true);
  assert.equal(result.resolutions.some((item) => item.relation_type === "SCOPE_PRODUCES" && item.source_fact_id === "shared-id"), true);
  assert.equal(result.resolutions.some((item) => item.relation_type === "SCOPE_CONSUMES" && item.source_fact_id === "page-after" && item.to_fact_id === "shared-id"), true);
  assert.equal(result.resolutions.some((item) => item.relation_type === "SCOPE_CONSUMES" && item.source_fact_id === "condition" && item.to_fact_id === "page-after"), true);
  assert.equal(result.resolutions.some((item) => item.relation_type === "SCOPE_OVERRIDES" && item.source_fact_id === "shared-user" && item.to_fact_id === "page-user"), true);
  assert.equal(result.resolutions.every((item) => Number.isSafeInteger(item.order)), true);
});

test("materializes scope-flow resolutions as ordered Graph IR edges", () => {
  const root = path.resolve("scope-graph-fixture");
  fs.mkdirSync(root, { recursive: true });
  try {
    const factBundle = bundle();
    const indexes = buildProjectIndexes({ factBundle });
    const scope = resolveScopeLinks({ factBundle, resolutions: includeResolution(), indexes });
    const graph = buildGraph({
      factBundle,
      resolutions: { complete: true, resolutions: [...includeResolution().resolutions, ...scope.resolutions], unresolved: scope.unresolved, diagnostics: scope.diagnostics },
      rootGuard: createRootGuard(root),
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    const consume = graph.edges.find((edge) => edge.type === "SCOPE_CONSUMES" && edge.attributes.scope_name === "request.sharedId");
    assert.equal(graph.complete, true);
    assert.equal(consume.evidence[0].kind, "scope_flow");
    assert.equal(Number.isSafeInteger(consume.order), true);
    assert.equal(graph.nodes.find((node) => node.id === consume.to)?.kind, "SCOPE_VARIABLE");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("bounds scope expansion and record output without throwing", () => {
  const factBundle = bundle();
  const depthBundle = bundle();
  depthBundle.facts.push(fact({ fact_id: "nested-include", kind: "INCLUDE", file: "app/shared.cfm", expression: "other.cfm", attributes: { template: "other.cfm", order_index: 3 }, line: 3 }));
  const depthResolution = includeResolution();
  depthResolution.resolutions.push({ source_fact_id: "nested-include", relation_type: "INCLUDES", from_file: "app/shared.cfm", to_file: "app/other.cfm", span: { start_line: 3, start_col: 0, end_line: 3, end_col: 12 } });
  const limitedEvents = resolveScopeLinks({ factBundle, resolutions: includeResolution(), maxEvents: 1 });
  const limitedDepth = resolveScopeLinks({ factBundle: depthBundle, resolutions: depthResolution, maxDepth: 1 });
  const limitedRecords = resolveScopeLinks({ factBundle, resolutions: includeResolution(), maxRecords: 1 });
  assert.equal(limitedEvents.complete, false);
  assert.equal(limitedEvents.diagnostics.some((item) => item.code === "SCOPE_RESOURCE_LIMIT"), true);
  assert.equal(limitedDepth.complete, false);
  assert.equal(limitedDepth.diagnostics.some((item) => item.code === "SCOPE_RESOURCE_LIMIT"), true);
  assert.equal(limitedRecords.complete, false);
  assert.equal(limitedRecords.resolutions.length + limitedRecords.unresolved.length <= 1, true);
  assert.equal(limitedRecords.diagnostics.some((item) => item.code === "SCOPE_RESOURCE_LIMIT"), true);
});

test("marks scope coverage incomplete when a static include has no bounded resolution", () => {
  const factBundle = bundle();
  const result = resolveScopeLinks({ factBundle, resolutions: { complete: true, resolutions: [], unresolved: [], diagnostics: [] } });
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics[0].code, "SCOPE_INCLUDE_RESOLUTION_MISSING");
  assert.equal(result.resolutions.some((item) => item.relation_type === "SCOPE_PRODUCES"), true);
});
