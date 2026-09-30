import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveCfcLinks } from "../src/cfc-resolver.js";
import { extractFactBundle } from "../src/fact-extractor.js";
import { buildGraph, validateGraph } from "../src/graph.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";
import { resolveScopeLinks } from "../src/scope-resolver.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { createRootGuard } from "../src/root-guard.js";
import { createMixedStructuralScannerBackend } from "../src/web-scanner.js";
import { createSnapshot } from "../src/snapshot.js";

const fixtureRoot = path.resolve("fixtures", "adversarial", "dynamic-and-generated");

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
  const cfcResolution = resolveCfcLinks({ factBundle, indexes });
  const resolutions = {
    complete: factBundle.complete && pathResolution.complete && cfcResolution.complete,
    resolutions: [...pathResolution.resolutions, ...cfcResolution.resolutions],
    unresolved: [...pathResolution.unresolved, ...cfcResolution.unresolved],
    diagnostics: [...pathResolution.diagnostics, ...cfcResolution.diagnostics],
  };
  const scopeResolution = resolveScopeLinks({ factBundle, resolutions });
  assert.equal(scopeResolution.unresolved.some((item) => item.reason === "GENERATED_SYMBOL"), true);
  const graph = buildGraph({
    factBundle,
    resolutions,
    rootGuard,
    snapshot,
    createdAt: "2026-09-14T00:00:00.000Z",
  });
  return { factBundle, graph, parsedFiles };
}

test("preserves dynamic, generated, and SQL-dynamic evidence without guessing", () => {
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "expected-dynamic-v0.1.json"), "utf8"));
  const first = analyzeFixture();
  const second = analyzeFixture();
  const { factBundle, graph, parsedFiles } = first;
  assert.deepEqual(first.factBundle, second.factBundle);
  assert.deepEqual(first.graph, second.graph);
  const dynamicFacts = factBundle.facts
    .filter((fact) => fact.kind === "DYNAMIC_REFERENCE")
    .map((fact) => ({ source_kind: fact.attributes.source_kind, reason: fact.attributes.unresolved_reason ?? "DYNAMIC_EXPRESSION" }))
    .sort((left, right) => {
      const leftKey = `${left.source_kind}\0${left.reason}`;
      const rightKey = `${right.source_kind}\0${right.reason}`;
      return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    });
  const expectedDynamicFacts = expected.expected_dynamic_facts.slice().sort((left, right) => {
    const leftKey = `${left.source_kind}\0${left.reason}`;
    const rightKey = `${right.source_kind}\0${right.reason}`;
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
  });
  assert.deepEqual(dynamicFacts, expectedDynamicFacts);
  for (const [sourceKind, expression] of Object.entries(expected.expected_dynamic_expressions)) {
    assert.equal(factBundle.facts.some((fact) => fact.kind === "DYNAMIC_REFERENCE" && fact.attributes.source_kind === sourceKind && fact.normalized_expression === expression), true);
  }

  const query = factBundle.facts.find((fact) => fact.kind === "QUERY");
  assert.deepEqual(query.attributes.dynamic_tables, expected.expected_sql.dynamic_tables);
  assert.equal(query.attributes.datasource_expression, expected.expected_sql.datasource_expression);
  assert.equal(query.attributes.datasource_dynamic, expected.expected_sql.datasource_dynamic);
  assert.equal(parsedFiles.some((parsed) => parsed.tree.nodes.some((node) => node.kind === "SQL_QUERY" && node.dynamic_tables?.length === 2 && node.datasource_dynamic === true)), true);
  const opaque = parsedFiles.flatMap((parsed) => parsed.tree.nodes).find((node) => node.kind === "OPAQUE_REGION");
  assert.deepEqual(opaque.dynamic_constructs, ["evaluate"]);

  const reasons = [...new Set(graph.unresolved.map((item) => item.reason_code))].sort();
  assert.deepEqual(reasons, expected.expected_graph_unresolved.sort());
  assert.equal(graph.edges.some((edge) => edge.type === "QUERY_READS_TABLE"), false);
  assert.equal(graph.unresolved.filter((item) => item.relation_type === "QUERY_READS_TABLE").length, expected.expected_graph_sql_unresolved_count);
  assert.equal(graph.unresolved.every((item) => item.candidates.length === 0), true);
  assert.equal(graph.complete, false);
  assert.equal(validateGraph(graph).length, 0);
});
