import assert from "node:assert/strict";
import test from "node:test";
import { SymbolSearchEngine, validateCapabilities, validateRequest, validateResult } from "../src";
import { execute, findDefinition, findImplementations, findReferences, fixtureRoot, getCapabilities, listSymbols, searchSymbols } from "./helpers";

test("public request schemas accept every V1 operation", () => {
  const requests = [
    { operation: "capabilities", root: fixtureRoot },
    { operation: "search", root: fixtureRoot, symbol: "resolveConfig" },
    { operation: "search", root: fixtureRoot, symbol: "resolveConfig", project: "tsconfig.json" },
    { operation: "definition", root: fixtureRoot, symbol: "resolveConfig" },
    { operation: "references", root: fixtureRoot, symbol: "resolveConfig" },
    { operation: "implementations", root: fixtureRoot, symbol: "StorageAdapter" },
    { operation: "symbols", root: fixtureRoot, path: "src/config.ts" }
  ];
  for (const request of requests) {
    const outcome = validateRequest(request);
    assert.equal(outcome.valid, true, outcome.errors.join("; "));
  }
});

test("invalid public requests are rejected before repository access", () => {
  for (const request of [
    { operation: "search", root: fixtureRoot, symbol: "x", limit: 0 },
    { operation: "search", root: fixtureRoot, symbol: "x", match: "fuzzy" },
    { operation: "search", root: fixtureRoot, symbol: "x", project: "tsconfig.json", unexpected: true },
    { operation: "unknown", root: fixtureRoot },
    { operation: "symbols", root: fixtureRoot, path: "src/a.ts", from: {} }
  ]) {
    const result = execute(request as never);
    assert.equal(result.status, "error");
    assert.ok(result.diagnostics.some((item) => item.code === "INVALID_REQUEST"));
    assert.equal(validateResult(result).valid, true);
  }
});

test("product defaults keep the five-second search budget", () => {
  assert.equal(new SymbolSearchEngine().getLimits().timeoutMs, 5_000);
  assert.equal(createTestEngine().getLimits().timeoutMs, 30_000);
});

function createTestEngine() {
  return new SymbolSearchEngine({ limits: { timeoutMs: 30_000 } });
}

test("result and capability envelopes validate against maintained schemas", () => {
  const result = searchSymbols({ root: fixtureRoot, symbol: "resolveConfig" });
  assert.equal(validateResult(result).valid, true);
  const capabilities = execute({ operation: "capabilities", root: fixtureRoot });
  assert.equal(capabilities.status, "complete");
  assert.equal(getCapabilities({ root: fixtureRoot }).status, "complete");
  assert.ok(capabilities.data.capabilities);
  assert.equal(validateCapabilities(capabilities.data.capabilities!).valid, true);
});

test("library operation wrappers share the canonical operation contract", () => {
  assert.equal(searchSymbols({ root: fixtureRoot, symbol: "resolveConfig" }).data.matches.length, 3);
  const projectSearch = searchSymbols({ root: process.cwd(), symbol: "SymbolSearchEngine", project: "tsconfig.json" });
  assert.equal(projectSearch.status, "complete");
  assert.equal(projectSearch.stats.project, "tsconfig.json");
  assert.ok(projectSearch.data.matches.some((match) => match.name === "SymbolSearchEngine"));
  assert.ok(findDefinition({ root: fixtureRoot, symbol: "FileAdapter" }).data.matches.length);
  assert.ok(findReferences({ root: fixtureRoot, symbol: "resolveConfig" }).data.matches.length);
  assert.ok(findImplementations({ root: fixtureRoot, symbol: "StorageAdapter" }).data.matches.length);
  assert.ok(listSymbols({ root: fixtureRoot, path: "src/config.ts" }).data.matches.length);
});
