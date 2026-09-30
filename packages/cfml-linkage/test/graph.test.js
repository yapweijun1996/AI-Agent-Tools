import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildGraph, buildReverseAdjacency, validateGraph } from "../src/graph.js";
import { resolveCfcLinks } from "../src/cfc-resolver.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { createRootGuard } from "../src/root-guard.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";

function fact({ fact_id, kind, file, language = "cfml", expression, attributes = {}, line = 1, enclosing_symbol = null }) {
  return {
    fact_id,
    kind,
    file,
    language,
    span: { start_line: line, start_col: 0, end_line: line, end_col: 12 },
    normalized_expression: expression,
    enclosing_symbol,
    condition: null,
    extraction_rule_id: "test-graph-v0.1",
    attributes,
  };
}

function fixture() {
  const root = path.resolve("graph-fixture");
  fs.mkdirSync(path.join(root, "app"), { recursive: true });
  fs.writeFileSync(path.join(root, "app", "page.cfm"), "page\n");
  fs.writeFileSync(path.join(root, "app", "target.cfm"), "target\n");
  fs.writeFileSync(path.join(root, "app", "Target.cfc"), "target\n");
  fs.writeFileSync(path.join(root, "app", "query.sql"), "select * from orders\n");
  return root;
}

function bundle() {
  const sourceFiles = [
    { file: "app/page.cfm", language: "cfml", fingerprint: "sha256:page" },
    { file: "app/query.sql", language: "sql", fingerprint: "sha256:query" },
    { file: "app/target.cfm", language: "cfml", fingerprint: "sha256:target" },
  ];
  return {
    source_files: sourceFiles,
    source_fingerprint: "sha256:bundle",
    complete: true,
    diagnostics: [],
    facts: [
      fact({ fact_id: "file-page", kind: "FILE", file: "app/page.cfm", expression: "source_file app/page.cfm" }),
      fact({ fact_id: "file-query", kind: "FILE", file: "app/query.sql", language: "sql", expression: "source_file app/query.sql", line: 2 }),
      fact({ fact_id: "file-target", kind: "FILE", file: "app/target.cfm", expression: "source_file app/target.cfm", line: 3 }),
      fact({ fact_id: "include", kind: "INCLUDE", file: "app/page.cfm", expression: "target.cfm", attributes: { template: "target.cfm" }, line: 4 }),
      fact({ fact_id: "control", kind: "CONTROL_FLOW", file: "app/page.cfm", expression: "return request.value", attributes: { control_kind: "return", references: ["request.value"] }, line: 4 }),
      fact({ fact_id: "dynamic", kind: "DYNAMIC_REFERENCE", file: "app/page.cfm", expression: "url.template", attributes: { source_kind: "INCLUDE", dynamic: true }, line: 5 }),
      fact({ fact_id: "query", kind: "QUERY", file: "app/query.sql", language: "sql", expression: "orders", attributes: { tables: ["orders"], datasource: "main" }, line: 6 }),
    ],
  };
}

test("builds deterministic Graph IR while preserving resolved and unresolved evidence", () => {
  const root = fixture();
  try {
    const factBundle = bundle();
    const indexes = buildProjectIndexes({ factBundle });
    const resolution = resolveLiteralPaths({ factBundle, indexes, rootGuard: createRootGuard(root) });
    const options = {
      factBundle,
      resolutions: resolution,
      rootGuard: createRootGuard(root),
      snapshot: { source_fingerprint: "sha256:snapshot", file_count: 3, files: factBundle.source_files.map((file) => ({ path: file.file, content_sha256: file.fingerprint })) },
      createdAt: "2026-09-14T00:00:00.000Z",
    };
    const graph = buildGraph(options);
    const graphAgain = buildGraph(options);

    assert.equal(graph.complete, true);
    assert.equal(validateGraph(graph).length, 0);
    const adjacency = buildReverseAdjacency(graph);
    const includeEdge = graph.edges.find((edge) => edge.type === "INCLUDES");
    assert.equal(adjacency.incoming[includeEdge.to].includes(includeEdge.id), true);
    assert.equal(adjacency.outgoing[includeEdge.from].includes(includeEdge.id), true);
    assert.equal(Object.isFrozen(adjacency), true);
    assert.deepEqual(graph.nodes.map((node) => node.id), graphAgain.nodes.map((node) => node.id));
    assert.deepEqual(graph.edges.map((edge) => edge.id), graphAgain.edges.map((edge) => edge.id));
    assert.deepEqual(graph.unresolved.map((item) => item.reason_code), ["DYNAMIC_EXPRESSION"]);
    assert.equal(graph.edges.some((edge) => edge.type === "INCLUDES"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "QUERY_READS_TABLE"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "QUERY_USES_DATASOURCE"), true);
    assert.equal(graph.nodes.some((node) => node.kind === "DATABASE_TABLE" && node.name === "orders"), true);
    assert.equal(graph.nodes.some((node) => node.kind === "DATASOURCE" && node.name === "main"), true);
    assert.equal(graph.nodes.some((node) => node.kind === "CONTROL_FLOW" && node.name === "return request.value"), true);
    assert.equal(graph.stats.node_count, graph.nodes.length);
    assert.equal(graph.stats.edge_count, graph.edges.length);
    assert.equal(graph.stats.unresolved_count, graph.unresolved.length);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("materializes semantic CFC component and method targets in Graph IR", () => {
  const root = fixture();
  try {
    const source_files = [
      { file: "app/page.cfm", language: "cfml", fingerprint: "sha256:page" },
      { file: "app/Target.cfc", language: "cfml", fingerprint: "sha256:target-cfc" },
    ];
    const factBundle = {
      source_files,
      complete: true,
      diagnostics: [],
      facts: [
        fact({ fact_id: "page-file", kind: "FILE", file: "app/page.cfm", expression: "source_file app/page.cfm" }),
        fact({ fact_id: "component-file", kind: "FILE", file: "app/Target.cfc", expression: "source_file app/Target.cfc" }),
        fact({ fact_id: "component", kind: "COMPONENT", file: "app/Target.cfc", expression: "component app.Target", attributes: { component_name: "app.Target", extends: null, implements: [] }, line: 2 }),
        fact({ fact_id: "method", kind: "METHOD", file: "app/Target.cfc", expression: "method app.Target.run", attributes: { method_name: "run", access: "public" }, enclosing_symbol: "app.Target", line: 3 }),
        fact({ fact_id: "invoke", kind: "INVOKE", file: "app/page.cfm", expression: "app.Target.run", attributes: { component: "app.Target", method: "run" }, line: 4 }),
      ],
    };
    const indexes = buildProjectIndexes({ factBundle });
    const cfcResolution = resolveCfcLinks({ factBundle, indexes });
    const graph = buildGraph({ factBundle, resolutions: cfcResolution, rootGuard: createRootGuard(root), createdAt: "2026-09-14T00:00:00.000Z" });
    assert.equal(graph.complete, true);
    assert.equal(graph.edges.some((edge) => edge.type === "CFINVOKES" && graph.nodes.find((node) => node.id === edge.to)?.kind === "CFC_COMPONENT"), true);
    assert.equal(graph.edges.some((edge) => edge.type === "CALLS_METHOD" && graph.nodes.find((node) => node.id === edge.to)?.kind === "CFC_METHOD"), true);
    assert.equal(validateGraph(graph).length, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("marks graph incomplete and reports invariant failures without dropping evidence", () => {
  const root = fixture();
  try {
    const factBundle = bundle();
    factBundle.complete = false;
    const graph = buildGraph({ factBundle, rootGuard: createRootGuard(root), createdAt: "2026-09-14T00:00:00.000Z" });
    assert.equal(graph.complete, false);
    assert.equal(graph.unresolved.length, 2);
    assert.equal(validateGraph({ ...graph, edges: [{ ...graph.edges[0], to: "node:missing" }] }).length > 0, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
