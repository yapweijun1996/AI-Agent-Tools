import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const cliPath = path.resolve("bin/agent-cfml-linkage.js");

function runCli(args, cwd) {
  const processResult = spawnSync(process.execPath, [cliPath, ...args], {
    cwd,
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(processResult.error, undefined, processResult.error?.message);
  return {
    exitCode: processResult.status,
    stdout: JSON.parse(processResult.stdout),
    stderr: processResult.stderr,
  };
}

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "agent-cfml-linkage-cli-"));
}

function writeConfig(root, overrides = {}) {
  const config = JSON.parse(fs.readFileSync(path.resolve("examples/config-v0.1.json"), "utf8"));
  config.root = ".";
  Object.assign(config, overrides);
  fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(config), "utf8");
}

test("emits a stable JSON capabilities envelope without stderr noise", () => {
  const root = temporaryDirectory();
  try {
    const result = runCli(["capabilities"], root);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout.schema_version, "agent-cfml-linkage-result/v0.1");
    assert.equal(result.stdout.command, "capabilities");
    assert.equal(result.stdout.status, "completed");
    assert.deepEqual(result.stdout.diagnostics, []);
    assert.equal(result.stdout.data.safety.source_execution, false);
    assert.equal(result.stdout.data.commands.queries, "bounded");
    assert.deepEqual(Object.keys(result.stdout), ["schema_version", "tool", "command", "status", "data", "diagnostics"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("returns machine-readable invalid-input diagnostics and human stderr diagnostics", () => {
  const root = temporaryDirectory();
  try {
    const result = runCli([], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.status, "error");
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_INPUT");
    assert.match(result.stderr, /^ERROR INVALID_INPUT: /u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runs the bounded analysis pipeline after validating the root", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "inert.js"), "throw new Error('must not execute');\n", "utf8");
    writeConfig(root);
    const result = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout.status, "incomplete");
    assert.equal(result.stdout.data.graph.schema_version, "agent-cfml-linkage-graph/v0.1");
    assert.equal(result.stdout.data.graph.snapshot.file_count, 1);
    assert.equal(result.stdout.diagnostics[0].code, "UNSUPPORTED_SYNTAX");
    assert.match(result.stderr, /^WARNING UNSUPPORTED_SYNTAX: /u);

    const indexResult = runCli(["index", "--config", "config.json"], root);
    assert.equal(indexResult.exitCode, 3);
    assert.equal(indexResult.stdout.status, "incomplete");
    assert.equal(indexResult.stdout.data.graph.schema_version, "agent-cfml-linkage-graph/v0.1");

    fs.writeFileSync(path.join(root, "other.js"), "const inert = true;\n", "utf8");
    const evidenceConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    evidenceConfig.limits.max_output_bytes = 52428800;
    evidenceConfig.limits.max_evidence = 1;
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(evidenceConfig), "utf8");
    const evidenceLimitedResult = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(evidenceLimitedResult.exitCode, 3);
    assert.equal(evidenceLimitedResult.stdout.status, "incomplete");
    assert.equal(evidenceLimitedResult.stdout.data.graph.stats.evidence_count, 1);
    assert.equal(evidenceLimitedResult.stdout.data.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_evidence === 1), true);

    fs.writeFileSync(path.join(root, "edge-index.cfm"), '<cfinclude template="edge-target.cfm">\n<cfinclude template="edge-target-two.cfm">\n', "utf8");
    fs.writeFileSync(path.join(root, "edge-target.cfm"), "<cfset request.value = 1>\n", "utf8");
    fs.writeFileSync(path.join(root, "edge-target-two.cfm"), "<cfset request.value = 2>\n", "utf8");
    const edgeConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    edgeConfig.limits.max_evidence = 1000000;
    edgeConfig.limits.max_edges = 1;
    edgeConfig.limits.max_output_bytes = 52428800;
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(edgeConfig), "utf8");
    const edgeLimitedResult = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(edgeLimitedResult.exitCode, 3);
    assert.equal(edgeLimitedResult.stdout.status, "incomplete");
    assert.equal(edgeLimitedResult.stdout.data.graph.edges.length, 1);
    assert.equal(edgeLimitedResult.stdout.data.graph.stats.edge_count, 1);
    assert.equal(edgeLimitedResult.stdout.data.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_edges === 1), true);

    const combinedConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    combinedConfig.limits.max_edges = 1;
    combinedConfig.limits.max_evidence = 1;
    combinedConfig.limits.max_output_bytes = 52428800;
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(combinedConfig), "utf8");
    const combinedResult = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(combinedResult.exitCode, 3);
    assert.equal(combinedResult.stdout.status, "incomplete");
    assert.equal(combinedResult.stdout.data.graph.complete, false);
    assert.equal(combinedResult.stdout.data.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_edges === 1), true);
    assert.equal(combinedResult.stdout.data.graph.diagnostics.some((item) => item.code === "RESOURCE_LIMIT" && item.details?.max_evidence === 1), true);

    const boundedConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    boundedConfig.limits.max_edges = 1000000;
    boundedConfig.limits.max_evidence = 1000000;
    boundedConfig.limits.max_output_bytes = 512;
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(boundedConfig), "utf8");
    const limitedResult = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(limitedResult.exitCode, 3);
    assert.equal(limitedResult.stdout.status, "incomplete");
    assert.equal(limitedResult.stdout.data, null);
    assert.equal(limitedResult.stdout.diagnostics[0].code, "OUTPUT_LIMIT");
    assert.ok(Buffer.byteLength(JSON.stringify(limitedResult.stdout), "utf8") + 1 <= 512);

    const queryConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    queryConfig.limits.max_output_bytes = 52428800;
    for (const command of ["related", "callers", "callees", "trace", "unresolved", "explain", "stats"]) {
      queryConfig.query = ["explain", "stats"].includes(command) ? {} : { path: "inert.js" };
      fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(queryConfig), "utf8");
      const queryResult = runCli([command, "--config", "config.json"], root);
      assert.equal(queryResult.exitCode, 3);
      assert.equal(queryResult.stdout.status, "incomplete");
      assert.equal(queryResult.stdout.data.schema_version, "agent-cfml-linkage-query/v0.1");
      assert.equal(queryResult.stdout.data.operation, command === "explain" ? "explain-edge" : command);
      assert.equal(queryResult.stdout.diagnostics.some((item) => item.code === "UNIMPLEMENTED_COMMAND"), false);
    }

    queryConfig.limits.max_output_bytes = 512;
    queryConfig.query = {};
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(queryConfig), "utf8");
    const limitedQueryResult = runCli(["stats", "--config", "config.json"], root);
    assert.equal(limitedQueryResult.exitCode, 3);
    assert.equal(limitedQueryResult.stdout.status, "incomplete");
    assert.equal(limitedQueryResult.stdout.data, null);
    assert.equal(limitedQueryResult.stdout.diagnostics[0].code, "OUTPUT_LIMIT");
    assert.ok(Buffer.byteLength(JSON.stringify(limitedQueryResult.stdout), "utf8") + 1 <= 512);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("applies configured discovery policies before CLI analysis", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "kept.cfm"), "<cfset request.kept = true>\n", "utf8");
    fs.writeFileSync(path.join(root, "ignored.cfm"), "<cfset request.ignored = true>\n", "utf8");
    fs.writeFileSync(path.join(root, ".hidden.cfm"), "<cfset request.hidden = true>\n", "utf8");
    fs.mkdirSync(path.join(root, "generated"), { recursive: true });
    fs.writeFileSync(path.join(root, "generated", "output.cfm"), "<cfset request.generated = true>\n", "utf8");
    writeConfig(root, { ignore: {
      globs: ["ignored.cfm"],
      hidden_files: "ignore",
      generated_files: "ignore",
    } });
    const result = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout.data.graph.snapshot.file_count, 1);
    assert.deepEqual(result.stdout.data.fact_bundle.source_files.map((file) => file.file), ["kept.cfm"]);

    writeConfig(root, { ignore: {
      globs: ["ignored.cfm"],
      hidden_files: "ignore",
      generated_files: "include",
    } });
    const included = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(included.exitCode, 3);
    assert.equal(included.stdout.data.graph.snapshot.file_count, 2);
    assert.deepEqual(included.stdout.data.fact_bundle.source_files.map((file) => file.file), ["generated/output.cfm", "kept.cfm"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("runs a bounded query against the freshly analyzed graph", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "index.cfm"), '<cfinclude template="target.cfm">\n', "utf8");
    fs.writeFileSync(path.join(root, "target.cfm"), "<cfset request.value = 1>\n", "utf8");
    writeConfig(root, { query: { path: "index.cfm" } });
    const result = runCli(["callees", "--config", "config.json"], root);
    assert.equal(result.exitCode, 3);
    assert.equal(result.stdout.status, "incomplete");
    assert.equal(result.stdout.data.schema_version, "agent-cfml-linkage-query/v0.1");
    assert.equal(result.stdout.data.operation, "callees");
    assert.equal(result.stdout.data.results.some((item) => item.node.path === "target.cfm"), true);
    assert.equal(result.stdout.data.diagnostics.some((item) => item.code === "QUERY_TARGET_NOT_FOUND"), false);

    const includeEdge = result.stdout.data.results.find((item) => item.edge.type === "INCLUDES")?.edge;
    assert.notEqual(includeEdge, undefined);
    const explainConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    explainConfig.query = { edge_id: includeEdge.id };
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(explainConfig), "utf8");
    const explainResult = runCli(["explain", "--config", "config.json"], root);
    assert.equal(explainResult.exitCode, 3);
    assert.equal(explainResult.stdout.data.operation, "explain-edge");
    assert.equal(explainResult.stdout.data.results[0].relation_type, "INCLUDES");
    assert.match(explainResult.stdout.data.results[0].explanation, /INCLUDES/u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("maps a rejected analysis root to the configured path-rejected exit code", () => {
  const root = temporaryDirectory();
  try {
    writeConfig(root, { root: "missing-root" });
    const result = runCli(["index", "--config", "config.json"], root);
    assert.equal(result.exitCode, 4);
    assert.equal(result.stdout.status, "error");
    assert.equal(result.stdout.diagnostics[0].code, "ROOT_NOT_FOUND");
    assert.match(result.stderr, /^ERROR ROOT_NOT_FOUND /u);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("rejects malformed JSON and unsafe configuration before analysis", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "bad.json"), "{", "utf8");
    let result = runCli(["analyze", "--config", "bad.json"], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_INPUT");

    writeConfig(root, { prohibited_actions: {
      execute_source: true,
      network: false,
      database: false,
      shell: false,
      browser: false,
    } });
    result = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_CONFIG");

    writeConfig(root, { query: { operation: "stats" } });
    result = runCli(["stats", "--config", "config.json"], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_CONFIG");

    writeConfig(root, { query: { edge_types: ["NOT_AN_EDGE"] } });
    result = runCli(["stats", "--config", "config.json"], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_CONFIG");

    writeConfig(root, { query: { path: "index.cfm" } });
    result = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_CONFIG");

    writeConfig(root);
    const invalidMutations = [
      (config) => { config.extra = true; },
      (config) => { delete config.analysis.languages; },
      (config) => { config.analysis.languages = ["ruby"]; },
      (config) => { config.limits.max_workers = 0; },
      (config) => { config.analysis.enabled_plugins = ["unavailable-plugin"]; },
      (config) => { config.analysis.mappings = { "": "path" }; },
      (config) => { config.ignore.globs = ["/absolute/**"]; },
      (config) => { config.ignore.globs = ["../outside/**"]; },
      (config) => { config.exit_codes.completed = 1; },
      (config) => { config.output.include_raw_evidence = "all"; },
    ];
    for (const mutate of invalidMutations) {
      writeConfig(root);
      const invalidConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
      mutate(invalidConfig);
      fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(invalidConfig), "utf8");
      result = runCli(["analyze", "--config", "config.json"], root);
      assert.equal(result.exitCode, 2);
      assert.equal(result.stdout.diagnostics[0].code, "INVALID_CONFIG");
    }

    writeConfig(root);
    const invalidOutputConfig = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    invalidOutputConfig.limits.max_output_bytes = 299;
    fs.writeFileSync(path.join(root, "config.json"), JSON.stringify(invalidOutputConfig), "utf8");
    result = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(result.exitCode, 2);
    assert.equal(result.stdout.diagnostics[0].code, "INVALID_CONFIG");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
