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

test("explicit JSON alias preserves native output and rejects duplicate or valued flags", () => {
  const root = temporaryDirectory();
  try {
    assert.deepEqual(runCli(["capabilities", "--json"], root), runCli(["capabilities"], root));
    for (const args of [["capabilities", "--json", "--json"], ["capabilities", "--json=true"]]) {
      const result = runCli(args, root);
      assert.equal(result.exitCode, 2);
      assert.equal(result.stdout.status, "error");
    }
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
    assert.equal(result.stdout.diagnostics[0].details.path, "inert.js");
    assert.equal(result.stdout.diagnostics[0].span.start_line, 1);
    assert.equal(result.stdout.diagnostics[0].span.start_col, 0);
    assert.ok(result.stderr.includes("[inert.js:1:0]"));

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
    assert.equal(result.stdout.data.graph.snapshot.file_count, 1);
    assert.deepEqual(result.stdout.data.fact_bundle.source_files.map((file) => file.file), ["kept.cfm"]);

    writeConfig(root, { ignore: {
      globs: ["ignored.cfm"],
      hidden_files: "ignore",
      generated_files: "include",
    } });
    const included = runCli(["analyze", "--config", "config.json"], root);
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

test("CFML structural mode confirms a closed include while explicitly excluding non-CFML discovery", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "index.cfm"), '<cfinclude template="target.cfml">\n', "utf8");
    fs.writeFileSync(path.join(root, "target.cfml"), "<cfset request.value = 1>\n", "utf8");
    fs.writeFileSync(path.join(root, "Component.cfc"), "<cfcomponent></cfcomponent>\n", "utf8");
    for (const file of ["web.html", "web.htm", "client.js", "client.mjs", "style.css", "query.sql"]) {
      fs.writeFileSync(path.join(root, file), "unsupported and never executed", "utf8");
    }
    writeConfig(root);
    const mixed = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(mixed.exitCode, 3);
    assert.equal(mixed.stdout.data.graph.complete, false);
    assert.equal(Object.hasOwn(mixed.stdout.data, "scope"), false);
    const explicitMixed = runCli(["analyze", "--config", "config.json", "--mode", "mixed"], root);
    assert.equal(explicitMixed.exitCode, 3);
    assert.deepEqual(explicitMixed.stdout.data.fact_bundle.source_files, mixed.stdout.data.fact_bundle.source_files);
    assert.equal(Object.hasOwn(explicitMixed.stdout.data, "scope"), false);

    for (const command of ["analyze", "index"]) {
      const result = runCli([command, "--config", "config.json", "--mode", "cfml-structural", "--json"], root);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.status, "completed");
      assert.equal(result.stdout.data.graph.complete, true);
      assert.equal(result.stdout.data.fact_bundle.parser.name, "cfml-structural-scanner");
      assert.deepEqual(result.stdout.data.fact_bundle.source_files.map((file) => file.file), ["Component.cfc", "index.cfm", "target.cfml"]);
      const graph = result.stdout.data.graph;
      const edge = graph.edges.find((item) => item.type === "INCLUDES");
      assert.equal(graph.nodes.find((node) => node.id === edge.from).path, "index.cfm");
      assert.equal(graph.nodes.find((node) => node.id === edge.to).path, "target.cfml");
      assert.equal(edge.confidence.level, "confirmed");
      assert.equal(edge.dynamic, false);
      assert.equal(result.stdout.data.scope.mode, "cfml-structural");
      assert.deepEqual(result.stdout.data.scope.source_extensions, [".cfm", ".cfml", ".cfc"]);
      assert.deepEqual(result.stdout.data.scope.excluded_capabilities, ["ordinary-html-web-flow-parsing", "standalone-javascript-analysis", "standalone-css-analysis", "standalone-sql-analysis", "runtime-semantics"]);
    }
    writeConfig(root, { query: { path: "index.cfm" } });
    const callees = runCli(["callees", "--mode", "cfml-structural", "--config", "config.json"], root);
    assert.equal(callees.exitCode, 0);
    assert.equal(callees.stdout.data.complete, true);
    assert.equal(callees.stdout.data.scope.mode, "cfml-structural");
    const include = callees.stdout.data.results.find((item) => item.edge.type === "INCLUDES");
    assert.equal(include.node.path, "target.cfml");
    assert.equal(include.edge.confidence.level, "confirmed");
    for (const command of ["related", "callers", "trace", "unresolved", "stats", "explain"]) {
      writeConfig(root, { query: command === "explain" ? { edge_id: include.edge.id } : command === "stats" ? {} : { path: "index.cfm" } });
      const query = runCli([command, "--config", "config.json", "--mode", "cfml-structural"], root);
      assert.equal(query.exitCode, 0);
      assert.equal(query.stdout.data.scope.mode, "cfml-structural");
      assert.equal(query.stdout.data.complete, true);
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("mode values and special-command combinations are rejected before analysis", () => {
  const root = temporaryDirectory();
  try {
    writeConfig(root);
    for (const args of [
      ["analyze", "--config", "config.json", "--mode"],
      ["analyze", "--config", "config.json", "--mode", "--json"],
      ["analyze", "--config", "config.json", "--mode", "unknown"],
      ["analyze", "--config", "config.json", "--mode=cfml-structural"],
      ["analyze", "--config", "config.json", "--mode", "mixed", "--mode", "cfml-structural"],
      ["index", "--config", "config.json", "--mode", "cfml-structural", "--mode", "cfml-structural"],
      ["--help", "--mode", "mixed"],
      ["--version", "--mode", "cfml-structural"],
      ["capabilities", "--mode", "mixed"],
    ]) {
      const result = runCli(args, root);
      assert.equal(result.exitCode, 2, args.join(" "));
      assert.equal(result.stdout.data, null);
      assert.equal(result.stdout.diagnostics[0].code, "INVALID_INPUT");
    }
    for (const command of ["--help", "capabilities"]) {
      const result = runCli([command, "--json"], root);
      assert.equal(result.exitCode, 0);
      assert.equal(result.stdout.data.default_mode, "mixed");
      assert.equal(result.stdout.data.modes["cfml-structural"].mode, "cfml-structural");
    }
    writeConfig(root, { analysis: { languages: ["html"], mappings: {}, enabled_plugins: [] } });
    const absent = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(absent.exitCode, 2);
    assert.equal(absent.stdout.data, null);
    assert.equal(absent.stdout.diagnostics[0].code, "INVALID_CONFIG");
    writeConfig(root, { mode: "cfml-structural" });
    const configured = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(configured.exitCode, 2);
    assert.equal(configured.stdout.diagnostics[0].code, "INVALID_CONFIG");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CFML structural mode preserves malformed, unsupported and opaque diagnostics with source locations", () => {
  const root = temporaryDirectory();
  try {
    fs.mkdirSync(path.join(root, "nested"));
    writeConfig(root);
    for (const [source, code, line, col] of [
      ['\n  <cfinclude template="unterminated', "PARSE_PARTIAL", 2, 2],
      ["\n  <cfunknown>", "UNSUPPORTED_SYNTAX", 2, 2],
      ["<script>\nthrow 'never execute';\n</script>", "UNSUPPORTED_SYNTAX", 1, 8],
    ]) {
      fs.writeFileSync(path.join(root, "nested", "page.cfm"), source, "utf8");
      const result = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
      assert.equal(result.exitCode, 3);
      assert.equal(result.stdout.data.graph.complete, false);
      const item = result.stdout.diagnostics.find((value) => value.code === code);
      assert.equal(item.details.path, "nested/page.cfm");
      assert.equal(item.span.start_line, line);
      assert.equal(item.span.start_col, col);
      assert.ok(result.stderr.includes(`[nested/page.cfm:${line}:${col}]`));
      assert.deepEqual(result.stdout.data.fact_bundle.diagnostics.find((value) => value.id === item.id), item);
      assert.deepEqual(result.stdout.data.graph.diagnostics.find((value) => value.id === item.id), item);
    }
    fs.writeFileSync(path.join(root, "nested", "page.cfm"), '<form action="target.cfm"><input name="id"></form>', "utf8");
    fs.writeFileSync(path.join(root, "nested", "target.cfm"), "", "utf8");
    const structural = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(structural.stdout.data.fact_bundle.facts.some((fact) => fact.kind === "FORM"), false);
    assert.equal(structural.stdout.data.graph.edges.some((edge) => edge.type === "FORM_SUBMITS_TO"), false);
    const mixed = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(mixed.stdout.data.graph.edges.some((edge) => edge.type === "FORM_SUBMITS_TO"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("structural stage completeness never confirms dynamic or missing include targets", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "index.cfm"), '<cfinclude template="#url.template#">', "utf8");
    fs.writeFileSync(path.join(root, "target.cfm"), "", "utf8");
    writeConfig(root);
    const result = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(result.exitCode, 0);
    assert.equal(result.stdout.data.graph.complete, true);
    assert.equal(result.stdout.data.fact_bundle.parser.completeness, "complete");
    assert.equal(result.stdout.data.graph.edges.some((edge) => edge.type === "INCLUDES"), false);
    assert.deepEqual(result.stdout.data.graph.unresolved.map((item) => item.reason_code), ["DYNAMIC_EXPRESSION"]);
    fs.appendFileSync(path.join(root, "index.cfm"), '\n<cfinclude template="missing.cfm">', "utf8");
    const missing = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(missing.exitCode, 3);
    assert.equal(missing.stdout.data.graph.complete, false);
    assert.equal(missing.stdout.data.fact_bundle.parser.completeness, "complete");
    assert.equal(missing.stdout.data.graph.edges.some((edge) => edge.type === "INCLUDES"), false);
    assert.deepEqual(missing.stdout.data.graph.unresolved.map((item) => item.reason_code).sort(), ["DYNAMIC_EXPRESSION", "PATH_NOT_FOUND"]);
    writeConfig(root, { query: { path: "index.cfm" } });
    const unresolved = runCli(["unresolved", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(unresolved.exitCode, 3);
    assert.equal(unresolved.stdout.data.complete, false);
    assert.equal(unresolved.stdout.data.scope.mode, "cfml-structural");
    assert.deepEqual(unresolved.stdout.data.results.map((item) => item.reason_code).sort(), ["DYNAMIC_EXPRESSION", "PATH_NOT_FOUND"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("CFML structural mode preserves root, discovery, graph and output limits", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "index.cfm"), '<cfinclude template="one.cfm">\n<cfinclude template="two.cfm">', "utf8");
    fs.writeFileSync(path.join(root, "one.cfm"), "", "utf8");
    fs.writeFileSync(path.join(root, "two.cfm"), "", "utf8");
    fs.writeFileSync(path.join(root, "excluded.js"), "x".repeat(1000), "utf8");
    writeConfig(root);
    const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    for (const [limit, value] of [["max_files", 1], ["max_facts", 1], ["max_edges", 1], ["max_evidence", 1], ["max_total_bytes", 1]]) {
      writeConfig(root, { limits: { ...config.limits, [limit]: value } });
      const result = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
      assert.equal(result.exitCode, 3, limit);
      assert.equal(result.stdout.data.graph.complete, false);
      assert.equal(result.stdout.data.scope.mode, "cfml-structural");
      assert.equal(result.stdout.diagnostics.some((item) => item.code === "RESOURCE_LIMIT"), true);
    }
    writeConfig(root, { limits: { ...config.limits, max_file_bytes: 200 } });
    const excluded = runCli(["index", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(excluded.exitCode, 0);
    assert.equal(excluded.stdout.data.graph.snapshot.file_count, 3);
    writeConfig(root, { limits: { ...config.limits, max_output_bytes: 512 } });
    for (const command of ["analyze", "stats"]) {
      const output = runCli([command, "--config", "config.json", "--mode", "cfml-structural"], root);
      assert.equal(output.exitCode, 3);
      assert.equal(output.stdout.data, null);
      assert.equal(output.stdout.diagnostics[0].code, "OUTPUT_LIMIT");
    }
    writeConfig(root, { root: "missing-root" });
    const missing = runCli(["index", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(missing.exitCode, 4);
    assert.equal(missing.stdout.diagnostics[0].code, "ROOT_NOT_FOUND");
    fs.rmSync(path.join(root, "index.cfm"));
    fs.rmSync(path.join(root, "one.cfm"));
    fs.rmSync(path.join(root, "two.cfm"));
    writeConfig(root);
    const empty = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(empty.exitCode, 3);
    assert.equal(empty.stdout.data, null);
    assert.equal(empty.stdout.diagnostics[0].code, "NO_SOURCE_FILES");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("unsupported script methods cannot fabricate include evidence in either CLI mode", () => {
  const root = temporaryDirectory();
  try {
    fs.mkdirSync(path.join(root, "nested"));
    fs.writeFileSync(path.join(root, "nested", "fake.cfm"), "", "utf8");
    writeConfig(root);
    for (const prefix of ["", "// header\n", "/* header */\n", "<!--- header --->\n"]) {
      fs.writeFileSync(path.join(root, "nested", "Service.cfc"), `${prefix}  component extends="BaseService" { public any run() { var literal = '<cfinclude template="fake.cfm">'; return new Service(); } }`, "utf8");
      for (const args of [[], ["--mode", "cfml-structural"]]) {
        const result = runCli(["analyze", "--config", "config.json", ...args], root);
        assert.equal(result.exitCode, 3);
        assert.equal(result.stdout.data.graph.complete, false);
        assert.equal(result.stdout.data.graph.edges.some((edge) => edge.type === "INCLUDES"), false);
      }
    }
    fs.writeFileSync(path.join(root, "nested", "Service.cfc"), '<!--- header --->\n<cfcomponent><cffunction name="run"><cfreturn 1></cffunction></cfcomponent>', "utf8");
    const tagged = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(tagged.exitCode, 0);
    assert.equal(tagged.stdout.data.fact_bundle.facts.some((fact) => fact.kind === "METHOD"), true);
    const mixed = runCli(["analyze", "--config", "config.json"], root);
    assert.equal(mixed.exitCode, 3);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stderr omits C1-control snapshot locators without suppressing resource diagnostics", () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "a.cfm"), "", "utf8");
    fs.writeFileSync(path.join(root, "z\u0085unsafe.cfm"), "xx", "utf8");
    writeConfig(root);
    const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    writeConfig(root, { limits: { ...config.limits, max_file_bytes: 1 } });
    const result = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
    assert.equal(result.exitCode, 3);
    const resource = result.stdout.diagnostics.find((item) => item.code === "RESOURCE_LIMIT");
    assert.equal(resource.details.path, "z\u0085unsafe.cfm");
    assert.ok(result.stderr.includes(`ERROR RESOURCE_LIMIT: ${resource.message}`));
    assert.equal(result.stderr.includes("\u0085"), false);
    assert.equal(result.stderr.includes("unsafe.cfm"), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("stderr rejects actual POSIX LF CR and ESC filename locators", { skip: process.platform === "win32" }, () => {
  const root = temporaryDirectory();
  try {
    fs.writeFileSync(path.join(root, "a.cfm"), "", "utf8");
    writeConfig(root);
    const config = JSON.parse(fs.readFileSync(path.join(root, "config.json"), "utf8"));
    writeConfig(root, { limits: { ...config.limits, max_file_bytes: 1 } });
    for (const control of ["\n", "\r", "\u001b"]) {
      const file = `z${control}unsafe.cfm`;
      fs.writeFileSync(path.join(root, file), "xx", "utf8");
      const result = runCli(["analyze", "--config", "config.json", "--mode", "cfml-structural"], root);
      assert.equal(result.exitCode, 3);
      const resource = result.stdout.diagnostics.find((item) => item.code === "RESOURCE_LIMIT");
      assert.equal(resource.details.path, file);
      assert.ok(result.stderr.includes(`ERROR RESOURCE_LIMIT: ${resource.message}`));
      assert.equal(result.stderr.includes("unsafe.cfm"), false);
      assert.equal(result.stderr.includes("\u001b"), false);
      assert.equal(result.stderr.includes("\r"), false);
      assert.deepEqual(result.stderr.split("\n").filter(Boolean).map((line) => line.startsWith("ERROR RESOURCE_LIMIT:")), [true]);
      fs.rmSync(path.join(root, file));
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
