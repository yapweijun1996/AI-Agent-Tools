import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { analyzeProject, serializeAnalysis } from "../src/index.js";
import { createMixedStructuralScannerBackend } from "../src/web-scanner.js";
import { validateGraph } from "../src/graph.js";

const scannerOptions = {
  parserBackend: createMixedStructuralScannerBackend(),
  parserVersion: "mixed-structural-scanner/v0.1",
  parserName: "mixed-structural-scanner",
  createdAt: "2026-09-14T00:00:00.000Z",
};

function analyze(fixture, options = {}) {
  return analyzeProject({
    rootPath: path.resolve("fixtures", fixture),
    ...scannerOptions,
    ...options,
  });
}

test("runs the bounded stages in order and exposes graph evidence", () => {
  const result = analyze("golden/sql-and-repository");
  assert.equal(result.schema_version, "agent-cfml-linkage-analysis/v0.1");
  assert.equal(result.complete, false);
  assert.equal(result.fact_bundle.source_files.length, 3);
  assert.equal(result.graph.stats.file_count, 3);
  assert.equal(result.graph.edges.some((edge) => edge.type === "CALLS_REPOSITORY"), true);
  assert.equal(result.graph.edges.some((edge) => edge.type === "QUERY_READS_TABLE"), true);
  assert.deepEqual(validateGraph(result.graph), []);
  assert.equal(Object.isFrozen(result.reverse_adjacency), true);
});

test("preserves deterministic combined budgets and the serialization boundary", () => {
  const first = analyze("golden/web-flow-and-conditions");
  const second = analyze("golden/web-flow-and-conditions");
  assert.deepEqual(first.fact_bundle, second.fact_bundle);
  assert.deepEqual(first.resolutions, second.resolutions);
  assert.deepEqual(first.graph, second.graph);
  assert.deepEqual(first.reverse_adjacency, second.reverse_adjacency);

  const serialized = serializeAnalysis(first);
  assert.equal(serialized.complete, true);
  assert.equal(serialized.json, JSON.stringify(first));
  assert.equal(serialized.bytes, Buffer.byteLength(serialized.json, "utf8"));

  const limited = serializeAnalysis(first, { config: { limits: { max_output_bytes: serialized.bytes - 1 } } });
  assert.equal(limited.complete, false);
  assert.equal(limited.json, null);
  assert.equal(limited.bytes, serialized.bytes);
  assert.equal(limited.diagnostics[0].code, "OUTPUT_LIMIT");
  assert.equal(limited.diagnostics[0].details.max_output_bytes, serialized.bytes - 1);

  const bounded = analyze("golden/sql-and-repository", { config: { limits: { max_edges: 1, max_evidence: 1 } } });
  const boundedAgain = analyze("golden/sql-and-repository", { config: { limits: { max_edges: 1, max_evidence: 1 } } });
  assert.equal(bounded.complete, false);
  assert.equal(bounded.graph.complete, false);
  assert.equal(bounded.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_edges === 1), true);
  assert.equal(bounded.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_evidence === 1), true);
  assert.deepEqual(bounded, boundedAgain);
  assert.deepEqual(validateGraph(bounded.graph), []);
  const boundedJson = serializeAnalysis(bounded, { maxOutputBytes: 50_000_000 });
  assert.equal(boundedJson.complete, true);
  const restored = JSON.parse(boundedJson.json);
  assert.equal(restored.complete, false);
  assert.equal(restored.graph.complete, false);
  assert.deepEqual(Object.keys(restored).sort(), ["complete", "diagnostics", "fact_bundle", "graph", "resolutions", "reverse_adjacency", "schema_version", "stats", "tool"].sort());
  const outputLimited = serializeAnalysis(bounded, { maxOutputBytes: 300 });
  assert.equal(outputLimited.complete, false);
  assert.equal(outputLimited.json, null);
  assert.equal(outputLimited.diagnostics[0].code, "OUTPUT_LIMIT");
});

test("enforces the configured library evidence budget deterministically", () => {
  const first = analyze("golden/sql-and-repository", { config: { limits: { max_evidence: 1 } } });
  const second = analyze("golden/sql-and-repository", { config: { limits: { max_evidence: 1 } } });
  assert.equal(first.complete, false);
  assert.equal(first.graph.complete, false);
  assert.equal(first.graph.stats.evidence_count, 1);
  assert.equal(first.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_evidence === 1), true);
  assert.equal(first.graph.edges.length > 0, true);
  assert.equal(first.graph.edges.filter((edge) => edge.evidence.length > 0).length, 1);
  assert.equal(validateGraph(first.graph).length, 0);
  assert.deepEqual(first.graph, second.graph);
});

test("enforces the configured library graph-edge budget deterministically", () => {
  const first = analyze("golden/sql-and-repository", { config: { limits: { max_edges: 1 } } });
  const second = analyze("golden/sql-and-repository", { config: { limits: { max_edges: 1 } } });
  assert.equal(first.complete, false);
  assert.equal(first.graph.complete, false);
  assert.equal(first.graph.edges.length, 1);
  assert.equal(first.graph.stats.edge_count, 1);
  assert.equal(first.graph.nodes.length > 0, true);
  assert.equal(first.graph.unresolved.length > 0, true);
  assert.equal(first.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_edges === 1), true);
  assert.equal(validateGraph(first.graph).length, 0);
  assert.equal(Object.values(first.reverse_adjacency.outgoing).flat().length, 1);
  assert.deepEqual(first.graph, second.graph);
  assert.deepEqual(first.reverse_adjacency, second.reverse_adjacency);
});

test("forwards configured discovery policies to deterministic snapshot discovery", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-analyzer-ignore-"));
  try {
    fs.writeFileSync(path.join(root, "ignored.cfm"), "<cfset request.ignored = true>\n", "utf8");
    fs.writeFileSync(path.join(root, ".hidden.cfm"), "<cfset request.hidden = true>\n", "utf8");
    fs.mkdirSync(path.join(root, "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, "generated", "output.cfm"), "<cfset request.generated = true>\n", "utf8");
    fs.writeFileSync(path.join(root, "kept.cfm"), "<cfset request.kept = true>\n", "utf8");
    const result = analyzeProject({
      rootPath: root,
      ...scannerOptions,
      config: { ignore: { globs: ["ignored.cfm"], hidden_files: "ignore", generated_files: "include" } },
    });
    assert.deepEqual(result.graph.snapshot.file_count, 2);
    assert.deepEqual(result.fact_bundle.source_files.map((file) => file.file), ["generated/output.cfm", "kept.cfm"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("applies configured component mappings without filename inference", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-analyzer-mapping-"));
  try {
    fs.mkdirSync(path.join(root, "lib"), { recursive: true });
    fs.writeFileSync(path.join(root, "lib", "Mapped.cfc"), '<cfcomponent name="lib.Mapped"></cfcomponent>\n', "utf8");
    fs.writeFileSync(path.join(root, "page.cfm"), "<cfscript>new app.Mapped();</cfscript>\n", "utf8");
    const result = analyzeProject({
      rootPath: root,
      ...scannerOptions,
      config: { analysis: { mappings: { app: "lib" } } },
    });
    const resolution = result.resolutions.resolutions.find((item) => item.source_fact_id && item.relation_type === "INSTANTIATES");
    assert.equal(resolution.resolution_kind, "mapped-component");
    assert.equal(resolution.to_file, "lib/Mapped.cfc");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("keeps the parser boundary fail-closed when no backend is selected", () => {
  const result = analyzeProject({
    rootPath: path.resolve("fixtures/golden/core-cfml-web-surface"),
    createdAt: "2026-09-14T00:00:00.000Z",
  });
  assert.equal(result.complete, false);
  assert.equal(result.fact_bundle.parser.completeness, "unsupported");
  assert.equal(result.fact_bundle.diagnostics.some((item) => item.code === "PARSER_UNAVAILABLE"), true);
  assert.equal(result.graph.nodes.length > 0, true);
});

test("applies the configured language and fact limits without executing source", () => {
  const result = analyze("golden/web-surface", {
    config: { analysis: { languages: ["javascript"] } },
    maxFacts: 1,
  });
  assert.equal(result.graph.snapshot.file_count, 1);
  assert.equal(result.fact_bundle.facts.length, 1);
  assert.equal(result.complete, false);
  assert.equal(result.fact_bundle.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
  assert.equal(fs.existsSync(path.resolve("fixtures/golden/web-surface/client.js")), true);

  const oneWorker = analyze("golden/web-surface", { config: { limits: { max_workers: 1 } } });
  const higherWorkerLimit = analyze("golden/web-surface", { config: { limits: { max_workers: 4 } } });
  assert.deepEqual(oneWorker.graph, higherWorkerLimit.graph);
  assert.throws(() => analyze("golden/web-surface", { config: { limits: { max_workers: 0 } } }), /maxWorkers/u);
});

test("marks source mutation and wall-time limit results incomplete", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-analyzer-"));
  const sourcePath = path.join(root, "page.cfm");
  fs.writeFileSync(sourcePath, "<cfset request.value = 1>\n", "utf8");
  let changed = false;
  try {
    const result = analyzeProject({
      rootPath: root,
      parserBackend: {
        version: "test-mutating-backend/v0.1",
        parse(text) {
          if (!changed) {
            changed = true;
            fs.writeFileSync(sourcePath, `${text}<cfset request.value = 2>\n`, "utf8");
          }
          return { tree: { kind: "TEST_DOCUMENT", nodes: [] }, complete: true, diagnostics: [] };
        },
      },
      parserVersion: "test-mutating-backend/v0.1",
      parserName: "test-mutating-backend",
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    assert.equal(result.complete, false);
    assert.equal(result.fact_bundle.diagnostics.some((item) => item.code === "SNAPSHOT_DRIFT"), true);

    fs.writeFileSync(sourcePath, "<cfset request.value = 1>\n", "utf8");
    let clockValue = 0;
    let parseCalled = false;
    const limited = analyzeProject({
      rootPath: root,
      parserBackend: {
        version: "test-time-budget-backend/v0.1",
        parse() {
          parseCalled = true;
          return { tree: { kind: "TEST_DOCUMENT", nodes: [] }, complete: true, diagnostics: [] };
        },
      },
      parserVersion: "test-time-budget-backend/v0.1",
      parserName: "test-time-budget-backend",
      config: { limits: { max_wall_time_ms: 3 } },
      clock: () => clockValue++,
      createdAt: "2026-09-14T00:00:00.000Z",
    });
    assert.equal(parseCalled, false);
    assert.equal(limited.complete, false);
    assert.equal(limited.graph.complete, false);
    assert.equal(limited.resolutions.complete, false);
    assert.equal(limited.fact_bundle.diagnostics.some((item) => item.code === "TIME_LIMIT"), true);
    assert.equal(limited.graph.diagnostics.some((item) => item.code === "TIME_LIMIT" && item.details?.max_wall_time_ms === 3), true);
    assert.equal(limited.graph.diagnostics.find((item) => item.code === "TIME_LIMIT")?.details?.stage, "snapshot:complete");
    assert.deepEqual(validateGraph(limited.graph), []);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
