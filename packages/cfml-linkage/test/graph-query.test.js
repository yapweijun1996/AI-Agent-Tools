import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { createGraphSnapshot, queryGraph } from "../src/graph-query.js";

const graphFixture = JSON.parse(fs.readFileSync("examples/graph-v0.1.json", "utf8"));
const PAGE = "node:page:orders/submit.cfm";
const INDEX = "node:page:index.cfm";
const HEADER = "node:page:header.cfm";
const QUERY = "node:query:index.order-query";

function resultTypes(result) {
  return result.results.map((item) => item.edge?.type ?? item.relation_type).sort();
}

test("queries an immutable GraphSnapshot with deterministic evidence slices", () => {
  const original = JSON.stringify(graphFixture);
  const snapshot = createGraphSnapshot(graphFixture);
  assert.equal(snapshot.snapshot_type, "GraphSnapshot/v0.1");
  assert.equal(Object.isFrozen(snapshot), true);
  assert.equal(Object.isFrozen(snapshot.graph), true);
  assert.equal(Object.isFrozen(snapshot.graph.nodes[0]), true);
  const suppliedSnapshot = { snapshot_type: "GraphSnapshot/v0.1", graph: JSON.parse(JSON.stringify(graphFixture)) };
  const copiedSnapshot = createGraphSnapshot(suppliedSnapshot);
  suppliedSnapshot.graph.nodes[0].name = "mutated-input";
  assert.notEqual(copiedSnapshot.graph.nodes[0].name, "mutated-input");
  assert.equal(Object.isFrozen(copiedSnapshot), true);

  const callers = queryGraph(snapshot, { operation: "callers", node_id: PAGE });
  assert.equal(callers.complete, true);
  assert.deepEqual(callers, queryGraph(snapshot, { operation: "callers", node_id: PAGE }));
  assert.deepEqual(resultTypes(callers), ["FETCHES", "FORM_SUBMITS_TO"]);
  assert.equal(callers.results[0].edge.evidence.length > 0, true);

  const callees = queryGraph(snapshot, { operation: "callees", path: "orders/submit.cfm" });
  assert.deepEqual(resultTypes(callees), ["CFINVOKES"]);
  assert.equal(callees.results[0].node.id, "node:method:handlers/OrderHandler.submit");

  const related = queryGraph(snapshot, { operation: "related", node_id: PAGE });
  assert.deepEqual(resultTypes(related), ["CFINVOKES", "FETCHES", "FORM_SUBMITS_TO"]);
  assert.equal(related.stats.visited_node_count, 4);

  const includes = queryGraph(snapshot, { operation: "includes", node_id: INDEX });
  assert.deepEqual(resultTypes(includes), ["INCLUDES"]);
  const includedBy = queryGraph(snapshot, { operation: "included-by", node_id: HEADER });
  assert.deepEqual(resultTypes(includedBy), ["INCLUDES"]);

  const tables = queryGraph(snapshot, { operation: "tables", node_id: QUERY });
  assert.equal(tables.results.length, 1);
  assert.equal(tables.results[0].node.kind, "DATABASE_TABLE");
  const routes = queryGraph(snapshot, { operation: "routes", node_id: PAGE });
  assert.deepEqual(resultTypes(routes), ["FETCHES", "FORM_SUBMITS_TO"]);
  const scopeFlow = queryGraph(snapshot, { operation: "scope-flow" });
  assert.equal(scopeFlow.complete, true);
  assert.deepEqual(scopeFlow.results, []);

  const unresolved = queryGraph(snapshot, { operation: "unresolved", reason_code: "DYNAMIC_EXPRESSION" });
  assert.equal(unresolved.results.length, 1);
  assert.equal(unresolved.results[0].source_node, "node:js:assets/orders.js#submitOrder");

  const trace = queryGraph(snapshot, { operation: "trace", node_id: INDEX });
  assert.equal(trace.results.length, 1);
  assert.deepEqual(trace.results[0].node_ids, [INDEX, HEADER]);
  assert.deepEqual(trace.results[0].edge_ids, ["edge:include:index:header"]);
  const cyclicGraph = JSON.parse(JSON.stringify(graphFixture));
  cyclicGraph.edges.push({ ...cyclicGraph.edges.find((edge) => edge.id === "edge:include:index:header"), id: "edge:include:header:index", from: HEADER, to: INDEX });
  const cyclicTrace = queryGraph(createGraphSnapshot(cyclicGraph), { operation: "trace", node_id: INDEX });
  assert.equal(cyclicTrace.complete, true);
  assert.equal(cyclicTrace.results.length, 1);

  const impact = queryGraph(snapshot, { operation: "impact-evidence", node_id: PAGE });
  assert.deepEqual(resultTypes(impact), ["FETCHES", "FORM_SUBMITS_TO"]);
  assert.equal(impact.results.every((item) => item.depth === 1), true);

  const explanation = queryGraph(snapshot, { operation: "explain-edge", edge_id: "edge:fetch:submit-order" });
  assert.equal(explanation.results.length, 1);
  assert.match(explanation.results[0].explanation, /FETCHES/u);
  assert.equal(explanation.results[0].evidence.length > 0, true);
  assert.equal(explanation.results[0].confidence.level, "strong");

  const stats = queryGraph(snapshot, { operation: "stats" });
  assert.equal(stats.results[0].graph_complete, true);
  assert.equal(stats.stats.node_count, graphFixture.nodes.length);

  explanation.results[0].from.name = "mutated-result";
  assert.equal(queryGraph(snapshot, { operation: "explain-edge", edge_id: "edge:fetch:submit-order" }).results[0].from.name, "submitOrder");
  assert.equal(JSON.stringify(graphFixture), original);
});

test("keeps query output bounded and reports incomplete traversal evidence", () => {
  const snapshot = createGraphSnapshot(graphFixture);
  const limited = queryGraph(snapshot, { operation: "related", node_id: INDEX, max_results: 1 });
  assert.equal(limited.results.length, 1);
  assert.equal(limited.truncated, true);
  assert.equal(limited.complete, false);
  assert.equal(limited.diagnostics.some((item) => item.code === "QUERY_RESULT_LIMIT"), true);

  const depthLimited = queryGraph(snapshot, { operation: "trace", node_id: INDEX, max_depth: 0 });
  assert.equal(depthLimited.results.length, 0);
  assert.equal(depthLimited.complete, false);
  assert.equal(depthLimited.diagnostics.some((item) => item.code === "QUERY_DEPTH_LIMIT"), true);
  const visitedLimited = queryGraph(snapshot, { operation: "trace", node_id: INDEX, max_visited: 1 });
  assert.equal(visitedLimited.complete, false);
  assert.equal(visitedLimited.diagnostics.some((item) => item.code === "QUERY_VISITED_NODE_LIMIT"), true);

  const missing = queryGraph(snapshot, { operation: "callers" });
  assert.equal(missing.complete, false);
  assert.equal(missing.diagnostics.some((item) => item.code === "QUERY_TARGET_REQUIRED"), true);
  const missingOptionalTarget = queryGraph(snapshot, { operation: "tables", node_id: "node:missing" });
  assert.equal(missingOptionalTarget.results.length, 0);
  assert.equal(missingOptionalTarget.complete, false);
  const missingEdge = queryGraph(snapshot, { operation: "explain-edge", edge_id: "edge:missing" });
  assert.equal(missingEdge.complete, false);
  assert.equal(missingEdge.diagnostics.some((item) => item.code === "QUERY_EDGE_NOT_FOUND"), true);
  const incompleteGraph = JSON.parse(JSON.stringify(graphFixture));
  incompleteGraph.complete = false;
  assert.equal(queryGraph(incompleteGraph, { operation: "stats" }).complete, false);
});

test("does not guess an ambiguous exact node selector and rejects invalid query options", () => {
  const ambiguousGraph = JSON.parse(JSON.stringify(graphFixture));
  ambiguousGraph.nodes.push({ ...ambiguousGraph.nodes.find((node) => node.id === PAGE), id: "node:duplicate-submit" });
  const snapshot = createGraphSnapshot(ambiguousGraph);
  const result = queryGraph(snapshot, { operation: "callees", name: "submit.cfm" });
  assert.equal(result.results.length, 0);
  assert.equal(result.complete, false);
  assert.equal(result.diagnostics.some((item) => item.code === "QUERY_TARGET_AMBIGUOUS"), true);
  assert.throws(() => queryGraph(snapshot, { operation: "related", node_id: PAGE, max_results: 0 }), /max_results/u);
  assert.throws(() => queryGraph(snapshot, { operation: "related", node_id: PAGE, edge_types: ["NOT_AN_EDGE"] }), /edge_types/u);
  assert.throws(() => queryGraph(snapshot, { operation: "related", node_id: PAGE, edge_types: ["INCLUDES", "INCLUDES"] }), /duplicate/u);
  assert.throws(() => queryGraph(snapshot, { operation: "unknown" }), /Unsupported graph query operation/u);
});
