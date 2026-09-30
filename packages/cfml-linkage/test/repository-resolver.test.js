import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveCfcLinks } from "../src/cfc-resolver.js";
import { extractFactBundle } from "../src/fact-extractor.js";
import { buildGraph, validateGraph } from "../src/graph.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { createRootGuard } from "../src/root-guard.js";
import { resolveRepositoryLinks } from "../src/repository-resolver.js";
import { createMixedStructuralScannerBackend } from "../src/web-scanner.js";
import { createSnapshot } from "../src/snapshot.js";

const fixtureRoot = path.resolve("fixtures", "golden", "sql-and-repository");

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
  const repositoryResolution = resolveRepositoryLinks({ factBundle, cfcResolution });
  const resolutions = {
    complete: factBundle.complete && pathResolution.complete && cfcResolution.complete && repositoryResolution.complete,
    resolutions: [...pathResolution.resolutions, ...cfcResolution.resolutions, ...repositoryResolution.resolutions],
    unresolved: [...pathResolution.unresolved, ...cfcResolution.unresolved, ...repositoryResolution.unresolved],
    diagnostics: [...pathResolution.diagnostics, ...cfcResolution.diagnostics, ...repositoryResolution.diagnostics],
  };
  const graph = buildGraph({
    factBundle,
    resolutions,
    rootGuard,
    snapshot,
    createdAt: "2026-09-14T00:00:00.000Z",
  });
  return { factBundle, cfcResolution, repositoryResolution, graph, parsedFiles };
}

test("resolves visible SQL and structural repository actions without filename inference", () => {
  const expected = JSON.parse(fs.readFileSync(path.join(fixtureRoot, "expected-sql-repository-v0.1.json"), "utf8"));
  const first = analyzeFixture();
  const second = analyzeFixture();
  const { factBundle, cfcResolution, repositoryResolution, graph, parsedFiles } = first;

  assert.deepEqual(first.graph, second.graph);
  assert.equal(factBundle.complete, false);
  const queries = factBundle.facts.filter((fact) => fact.kind === "QUERY" && fact.file.endsWith("OrderRepository.cfc"));
  assert.equal(queries.length, 3);
  assert.deepEqual(queries[0].attributes.tables, expected.expected_query.tables);
  assert.equal(queries[0].attributes.datasource, expected.expected_query.datasource);
  const queryExecute = queries.find((fact) => fact.attributes.statement_kind === "queryExecute");
  assert.deepEqual(queryExecute.attributes.tables, expected.expected_query.query_execute_tables);
  assert.equal(queryExecute.attributes.datasource, expected.expected_query.query_execute_datasource);
  const dynamicQueryExecute = queries.find((fact) => fact.attributes.dynamic_sql === true);
  assert.equal(dynamicQueryExecute.attributes.datasource_dynamic, true);
  assert.equal(expected.expected_query.dynamic_query_execute, true);
  assert.equal(parsedFiles.some((parsed) => parsed.tree.nodes.some((node) => node.kind === "SQL_QUERY" && node.statement_kind === "queryExecute")), true);

  const actions = factBundle.facts.filter((fact) => fact.kind === "REPOSITORY_ACTION");
  assert.deepEqual(actions.map((fact) => fact.attributes.action_name), expected.expected_repository_actions);
  assert.equal(actions[0].attributes.query_fact_ids.length, 3);
  assert.equal(factBundle.facts.some((fact) => fact.kind === "REPOSITORY_ACTION" && fact.attributes.action_name === expected.filename_only_is_not_evidence), false);

  const repositoryCalls = repositoryResolution.resolutions.filter((item) => item.relation_type === "CALLS_REPOSITORY");
  assert.equal(repositoryCalls.length, 2);
  assert.equal(repositoryCalls[0].confidence, "confirmed");
  assert.equal(repositoryCalls[0].resolution_kind, "structural-repository-action");
  assert.equal(cfcResolution.resolutions.filter((item) => item.relation_type === "CALLS_METHOD").length, 3);

  for (const edgeType of expected.expected_edges) assert.equal(graph.edges.some((edge) => edge.type === edgeType), true);
  assert.equal(graph.edges.filter((edge) => edge.type === "CALLS_REPOSITORY").length, 2);
  assert.equal(graph.nodes.some((node) => node.kind === "REPOSITORY_ACTION" && node.name === expected.expected_repository_actions[0]), true);
  assert.equal(graph.edges.some((edge) => edge.type === "CALLS_REPOSITORY" && graph.nodes.find((node) => node.id === edge.to)?.name === expected.filename_only_is_not_evidence), false);
  assert.equal(graph.edges.filter((edge) => edge.type === "QUERY_READS_TABLE").length, 2);
  assert.equal(graph.edges.filter((edge) => edge.type === "QUERY_USES_DATASOURCE").length, 2);
  assert.equal(graph.unresolved.some((item) => item.relation_type === "QUERY_READS_TABLE" && item.reason_code === "DYNAMIC_EXPRESSION" && item.expression.includes("queryExecute")), true);
  assert.equal(validateGraph(graph).length, 0);
});

test("bounds structural repository records and requires the CFC method resolution", () => {
  const result = analyzeFixture();
  assert.throws(() => resolveRepositoryLinks({ factBundle: result.factBundle, cfcResolution: result.cfcResolution, maxRecords: 0 }), /maxRecords/);
  const limited = resolveRepositoryLinks({ factBundle: result.factBundle, cfcResolution: result.cfcResolution, maxRecords: 1 });
  assert.equal(limited.resolutions.length, 1);
  assert.equal(limited.diagnostics.some((item) => item.code === "REPOSITORY_RESOURCE_LIMIT"), true);
  assert.equal(limited.complete, false);
  const empty = resolveRepositoryLinks({ factBundle: result.factBundle, cfcResolution: { ...result.cfcResolution, resolutions: [] } });
  assert.equal(empty.resolutions.length, 0);
});
