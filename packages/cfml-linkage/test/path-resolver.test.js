import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { buildProjectIndexes } from "../src/project-index.js";
import { createRootGuard } from "../src/root-guard.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";

function sourceFile(file) {
  return { file, language: file.endsWith(".cfc") || file.endsWith(".cfm") ? "cfml" : "html", fingerprint: `sha256:${file}` };
}

function fact({ fact_id, kind, file, expression, attributes = {}, line = 1 }) {
  return {
    fact_id,
    kind,
    file,
    language: "cfml",
    span: { start_line: line, start_col: 0, end_line: line, end_col: 12 },
    normalized_expression: expression,
    enclosing_symbol: null,
    condition: null,
    extraction_rule_id: "test-v0.1",
    attributes,
  };
}

function makeFixture() {
  const root = path.resolve("path-resolver-fixture");
  fs.mkdirSync(path.join(root, "app", "shared"), { recursive: true });
  fs.writeFileSync(path.join(root, "app", "Application.cfc"), "inert\n");
  fs.writeFileSync(path.join(root, "app", "page.cfm"), "inert\n");
  fs.writeFileSync(path.join(root, "app", "shared", "header.cfm"), "inert\n");
  fs.writeFileSync(path.join(root, "app", "custom.cfm"), "inert\n");
  fs.writeFileSync(path.join(root, "app", "orders.cfm"), "inert\n");
  fs.writeFileSync(path.join(root, "app", "orders.html"), "inert\n");
  return root;
}

test("resolves literal relative and root-relative paths while preserving application governance", () => {
  const root = makeFixture();
  try {
    const sourceFiles = [
      "app/Application.cfc",
      "app/page.cfm",
      "app/shared/header.cfm",
      "app/custom.cfm",
      "app/orders.cfm",
      "app/orders.html",
    ].map(sourceFile);
    const factBundle = {
      source_files: sourceFiles,
      complete: true,
      facts: [
        fact({ fact_id: "include", kind: "INCLUDE", file: "app/page.cfm", expression: "shared/header.cfm", attributes: { template: "shared/header.cfm" }, line: 2 }),
        fact({ fact_id: "custom", kind: "CUSTOM_TAG", file: "app/page.cfm", expression: "custom tag custom.cfm", attributes: { name: "custom.cfm" }, line: 3 }),
        fact({ fact_id: "form", kind: "FORM", file: "app/page.cfm", expression: "/app/orders", attributes: { action: "/app/orders" }, line: 4 }),
        fact({ fact_id: "hook", kind: "APPLICATION_HOOK", file: "app/Application.cfc", expression: "application hook onRequestStart", attributes: { application_name: "app/Application.cfc", hook_name: "onRequestStart" }, line: 5 }),
        fact({ fact_id: "file-app", kind: "FILE", file: "app/Application.cfc", expression: "source_file app/Application.cfc" }),
        ...sourceFiles.filter((item) => item.file !== "app/Application.cfc").map((item, index) => fact({ fact_id: `file-${index}`, kind: "FILE", file: item.file, expression: `source_file ${item.file}`, line: 10 + index })),
      ],
    };
    const indexes = buildProjectIndexes({ factBundle });
    const result = resolveLiteralPaths({ factBundle, indexes, rootGuard: createRootGuard(root) });
    assert.equal(result.complete, true);
    assert.equal(result.unresolved.length, 1);
    assert.equal(result.unresolved[0].reason, "AMBIGUOUS_PATH");
    assert.deepEqual(result.unresolved[0].candidates, ["app/orders.cfm", "app/orders.html"]);
    assert.deepEqual(result.resolutions.filter((item) => ["INCLUDES", "CUSTOM_TAG_CALL"].includes(item.relation_type)).map((item) => [item.relation_type, item.to_file]), [
      ["CUSTOM_TAG_CALL", "app/custom.cfm"],
      ["INCLUDES", "app/shared/header.cfm"],
    ]);
    assert.equal(result.resolutions.filter((item) => item.relation_type === "APPLICATION_GOVERNS").length, 5);
    assert.equal(result.resolutions.filter((item) => item.relation_type === "REQUEST_HOOK_APPLIES_TO").length, 5);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("keeps dynamic, external, missing, and unsafe paths unresolved", () => {
  const root = makeFixture();
  try {
    const sourceFiles = ["app/page.cfm", "app/orders.cfm"].map(sourceFile);
    const facts = [
      fact({ fact_id: "dynamic", kind: "DYNAMIC_REFERENCE", file: "app/page.cfm", expression: "url.target", attributes: { source_kind: "INCLUDE", dynamic: true } }),
      fact({ fact_id: "external", kind: "FETCH", file: "app/page.cfm", expression: "https://example.test/orders", attributes: { target: "https://example.test/orders" }, line: 2 }),
      fact({ fact_id: "missing", kind: "INCLUDE", file: "app/page.cfm", expression: "missing.cfm", attributes: { template: "missing.cfm" }, line: 3 }),
      fact({ fact_id: "unsafe", kind: "INCLUDE", file: "app/page.cfm", expression: "../secret.cfm", attributes: { template: "../secret.cfm" }, line: 4 }),
      ...sourceFiles.map((item, index) => fact({ fact_id: `file-${index}`, kind: "FILE", file: item.file, expression: `source_file ${item.file}`, line: 10 + index })),
    ];
    const factBundle = { source_files: sourceFiles, complete: true, facts };
    const indexes = buildProjectIndexes({ factBundle });
    const result = resolveLiteralPaths({ factBundle, indexes, rootGuard: createRootGuard(root) });
    assert.equal(result.complete, true);
    assert.deepEqual(result.unresolved.map((item) => item.reason), ["EXTERNAL_TARGET", "DYNAMIC_EXPRESSION", "PATH_NOT_FOUND", "OUTSIDE_ROOT"]);
    assert.equal(result.resolutions.length, 0);

    facts.push(fact({ fact_id: "deleted", kind: "INCLUDE", file: "app/page.cfm", expression: "orders.cfm", attributes: { template: "orders.cfm" }, line: 5 }));
    fs.rmSync(path.join(root, "app", "orders.cfm"));
    const staleFactBundle = { ...factBundle, facts };
    const staleResult = resolveLiteralPaths({ factBundle: staleFactBundle, indexes: buildProjectIndexes({ factBundle: staleFactBundle }), rootGuard: createRootGuard(root) });
    assert.equal(staleResult.resolutions.length, 0);
    assert.equal(staleResult.unresolved.some((item) => item.source_fact_id === "deleted" && item.reason === "PATH_NOT_FOUND"), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
