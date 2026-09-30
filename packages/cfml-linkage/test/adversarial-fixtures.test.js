import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

import { resolveCfcLinks } from "../src/cfc-resolver.js";
import { extractFactBundle } from "../src/fact-extractor.js";
import { buildProjectIndexes } from "../src/project-index.js";
import { resolveLiteralPaths } from "../src/path-resolver.js";
import { createParserAdapter } from "../src/parser-adapter.js";
import { createRootGuard } from "../src/root-guard.js";
import { resolveScopeLinks } from "../src/scope-resolver.js";
import { createSnapshot } from "../src/snapshot.js";
import { createMixedStructuralScannerBackend } from "../src/web-scanner.js";

function analyzeFixture(fixtureRoot) {
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
  return { factBundle, parsedFiles, pathResolution, cfcResolution, scopeResolution };
}

function expectedJson(fixtureRoot, name) {
  return JSON.parse(fs.readFileSync(path.join(fixtureRoot, name), "utf8"));
}

test("keeps ambiguous components and path escapes unresolved in the negative fixture", () => {
  const fixtureRoot = path.resolve("fixtures", "negative", "ambiguity-and-out-of-root");
  const expected = expectedJson(fixtureRoot, "expected-negative-v0.1.json");
  assert.equal(expected.source_execution, false);
  const result = analyzeFixture(fixtureRoot);
  const actual = result.cfcResolution.unresolved.concat(result.pathResolution.unresolved)
    .map((item) => ({ expression: item.normalized_expression, relation_type: item.relation_type, reason: item.reason }))
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  const wanted = expected.cases[0].expected_unresolved.slice()
    .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  assert.deepEqual(actual, wanted);
  for (const item of result.cfcResolution.unresolved.filter((value) => value.reason === "AMBIGUOUS_COMPONENT")) assert.equal(item.candidates.length, 2);
  assert.equal(result.pathResolution.diagnostics.length, 0);
});

test("retains malformed and unsupported evidence without inventing facts", () => {
  const fixtureRoot = path.resolve("fixtures", "negative", "malformed-and-partial");
  const expected = expectedJson(fixtureRoot, "expected-malformed-v0.1.json");
  assert.equal(expected.source_execution, false);
  const result = analyzeFixture(fixtureRoot);
  for (const expectedCase of expected.cases) {
    const facts = result.factBundle.facts.filter((fact) => fact.file === expectedCase.input);
    if (expectedCase.expected_fact_kinds) assert.deepEqual([...new Set(facts.map((fact) => fact.kind))].sort(), expectedCase.expected_fact_kinds.slice().sort());
    for (const forbiddenKind of expectedCase.forbidden_fact_kinds ?? []) assert.equal(facts.some((fact) => fact.kind === forbiddenKind), false);
    const parsed = result.parsedFiles.find((item) => item.file === expectedCase.input);
    assert.ok(parsed);
    const diagnostics = parsed.diagnostics;
    for (const code of expectedCase.expected_diagnostic_codes ?? []) assert.equal(diagnostics.some((item) => item.code === code), true);
    if (typeof expectedCase.complete === "boolean") {
      assert.equal(result.factBundle.complete, expectedCase.complete);
    }
  }
});

test("filters syntax-like comments and strings while preserving include cycles", () => {
  const fixtureRoot = path.resolve("fixtures", "adversarial", "misleading-and-limits");
  const expected = expectedJson(fixtureRoot, "expected-misleading-v0.1.json");
  assert.equal(expected.source_execution, false);
  const result = analyzeFixture(fixtureRoot);
  for (const expectedCase of expected.cases) {
    const facts = result.factBundle.facts.filter((fact) => fact.file === expectedCase.input);
    const actual = facts
      .filter((fact) => fact.kind !== "FILE")
      .map((fact) => ({ kind: fact.kind, normalized_expression: fact.normalized_expression }))
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
    assert.deepEqual(actual, expectedCase.expected_facts.slice().sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))));
    for (const expression of expectedCase.forbidden_expressions) assert.equal(facts.some((fact) => fact.normalized_expression.includes(expression)), false);
  }
  assert.equal(result.scopeResolution.diagnostics.some((item) => item.code === expected.expected_scope_diagnostic), true);
  assert.equal(result.scopeResolution.complete, false);
});
