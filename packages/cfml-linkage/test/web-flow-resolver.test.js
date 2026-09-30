import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildGraph, validateGraph } from "../src/graph.js";
import { extractFactBundle } from "../src/fact-extractor.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { createRootGuard } from "../src/root-guard.js";
import { createMixedStructuralScannerBackend } from "../src/web-scanner.js";
import { resolveWebFlowLinks } from "../src/web-flow-resolver.js";
import { createSnapshot } from "../src/snapshot.js";

const fixtureRoot = path.resolve("fixtures", "golden", "web-flow-and-conditions");

function analyzeFixture() {
  const rootGuard = createRootGuard(fixtureRoot);
  const snapshot = createSnapshot(rootGuard);
  const adapter = createParserAdapter({
    parserVersion: "mixed-structural-scanner/v0.1",
    backend: createMixedStructuralScannerBackend(),
  });
  const parsedFiles = snapshot.files.map((file) => adapter.parse(
    fs.readFileSync(rootGuard.resolve(file.path, { mustExist: true })),
    file.path,
  ));
  const factBundle = extractFactBundle({ snapshot, parsedFiles, parserName: "mixed-structural-scanner" });
  const indexes = buildProjectIndexes({ factBundle });
  const pathResolution = resolveLiteralPaths({ factBundle, indexes, rootGuard });
  const webFlow = resolveWebFlowLinks({ factBundle, resolutions: pathResolution });
  return { factBundle, indexes, pathResolution, webFlow, rootGuard };
}

test("resolves fixture-backed web flows, known wrappers, and explicit conditions", () => {
  const { factBundle, pathResolution, webFlow } = analyzeFixture();
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "expected-web-flow-v0.1.json"), "utf8"));
  const pageFacts = factBundle.facts.filter((fact) => fact.file === expected.input);

  for (const expectedFact of expected.expected_facts) {
    const actual = pageFacts.find((fact) => fact.kind === expectedFact.kind && fact.normalized_expression === expectedFact.normalized_expression);
    assert.ok(actual, `missing ${expectedFact.kind} ${expectedFact.normalized_expression}`);
    assert.equal(Boolean(actual.condition), expectedFact.conditioned);
    if (expectedFact.wrapper) assert.equal(actual.attributes.wrapper, expectedFact.wrapper);
  }
  for (const expectedRoute of expected.expected_routes) {
    assert.equal(pathResolution.resolutions.some((item) => item.relation_type === expectedRoute.relation_type && item.to_file === expectedRoute.to_file), true);
  }

  assert.equal(webFlow.complete, false);
  assert.equal(webFlow.resolutions.length, expected.expected_condition_edges);
  assert.equal(webFlow.resolutions.every((item) => item.relation_type === "ROUTES_WHEN"), true);
  assert.equal(webFlow.resolutions.every((item) => item.source_node_kind === "fact"), true);
  assert.equal(webFlow.unresolved.length, 0);
  assert.deepEqual(webFlow, resolveWebFlowLinks({ factBundle, resolutions: pathResolution }));
});

test("materializes condition and wrapper flow evidence without executing source", () => {
  const { factBundle, pathResolution, webFlow, rootGuard } = analyzeFixture();
  const graph = buildGraph({
    factBundle,
    resolutions: {
      complete: pathResolution.complete && webFlow.complete,
      resolutions: [...pathResolution.resolutions, ...webFlow.resolutions],
      unresolved: [...pathResolution.unresolved, ...webFlow.unresolved],
      diagnostics: [...pathResolution.diagnostics, ...webFlow.diagnostics],
    },
    rootGuard,
    createdAt: "2026-09-14T00:00:00.000Z",
  });
  const routeEdges = graph.edges.filter((edge) => edge.type === "ROUTES_WHEN");
  assert.equal(routeEdges.length, 4);
  assert.equal(routeEdges.every((edge) => edge.evidence[0].kind === "condition"), true);
  assert.equal(routeEdges.every((edge) => edge.condition?.branch_kind === "if"), true);
  assert.equal(graph.edges.some((edge) => edge.type === "AJAX_CALLS" && edge.attributes.to_file === "orders/search.cfm"), true);
  assert.equal(graph.edges.some((edge) => edge.type === "AJAX_CALLS" && edge.attributes.to_file === "orders/xhr.cfm"), true);
  assert.equal(validateGraph(graph).length, 0);
});

test("bounds web-flow records without hiding incomplete coverage", () => {
  const { factBundle, pathResolution } = analyzeFixture();
  const result = resolveWebFlowLinks({ factBundle, resolutions: pathResolution, maxRecords: 1 });
  assert.equal(result.complete, false);
  assert.equal(result.resolutions.length + result.unresolved.length <= 1, true);
  assert.equal(result.diagnostics.some((item) => item.code === "WEB_FLOW_RESOURCE_LIMIT"), true);
});

test("preserves an explicitly conditioned flow with no condition source as unresolved", () => {
  const factBundle = {
    source_files: [{ file: "page.cfm", language: "cfml", fingerprint: "sha256:page" }],
    complete: true,
    diagnostics: [],
    facts: [{
      fact_id: "form",
      kind: "FORM",
      file: "page.cfm",
      language: "html",
      span: { start_line: 2, start_col: 0, end_line: 2, end_col: 20 },
      normalized_expression: "/orders",
      enclosing_symbol: null,
      condition: {
        expression_normalized: "url.mode",
        source_span: { start_line: 1, start_col: 0, end_line: 1, end_col: 10 },
        variables: ["url.mode"],
        branch_kind: "if",
        evaluation: "runtime",
      },
      extraction_rule_id: "test-v0.1",
      attributes: { action: "/orders", method: "GET" },
    }],
  };
  const result = resolveWebFlowLinks({ factBundle });
  assert.equal(result.complete, false);
  assert.equal(result.resolutions.length, 0);
  assert.deepEqual(result.unresolved[0].candidates, []);
  assert.equal(result.unresolved[0].reason, "MAPPING_UNKNOWN");
});
