import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import test from "node:test";
import { main } from "../src/cli";
import { fixtureRoot, TEST_ENGINE_OPTIONS } from "./helpers";
import { SymbolSearchEngine } from "../src";

const cli = resolve(process.cwd(), "dist/cli.js");

function runCli(...args: string[]) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: process.cwd(), encoding: "utf8" });
}

function runMain(...args: string[]): { status: number; stdout: string; stderr: string } {
  let stdout = "";
  let stderr = "";
  const status = main(args, new SymbolSearchEngine(TEST_ENGINE_OPTIONS), {
    stdout: { write: (chunk: string): boolean => { stdout += chunk; return true; } },
    stderr: { write: (chunk: string): boolean => { stderr += chunk; return true; } }
  });
  return { status, stdout, stderr };
}

test("CLI keeps JSON on stdout and human diagnostics on stderr", () => {
  const result = runCli("definition", "--root", fixtureRoot, "--symbol", "FileAdapter");
  assert.equal(result.status, 0, result.stderr);
  const json = JSON.parse(result.stdout);
  assert.equal(json.status, "complete");
  assert.equal(json.data.matches[0].name, "FileAdapter");
  assert.equal(result.stderr, "");

  const ambiguous = runCli("definition", "--root", fixtureRoot, "--symbol", "resolveConfig");
  assert.equal(ambiguous.status, 0);
  assert.equal(JSON.parse(ambiguous.stdout).status, "complete");
  assert.match(ambiguous.stderr, /AMBIGUOUS_SYMBOL/);
});

test("CLI reports invalid requests with valid JSON and a non-zero exit", () => {
  const result = runCli("search", "--root", "/definitely/not/a/repository", "--symbol", "anything");
  assert.notEqual(result.status, 0);
  const json = JSON.parse(result.stdout);
  assert.equal(json.status, "error");
  assert.ok(json.diagnostics.some((item: { code: string }) => item.code === "INVALID_ROOT"));
  assert.match(result.stderr, /INVALID_ROOT/);

  const malformed = runCli("search", "--root", fixtureRoot, "--symbol", "anything", "--unknown", "value");
  assert.equal(malformed.status, 2);
  assert.equal(JSON.parse(malformed.stdout).status, "error");
  assert.match(malformed.stderr, /INVALID_REQUEST/);
});

test("CLI main accepts injected streams and project-scoped recovery commands", () => {
  const help = runMain("--help");
  assert.equal(help.status, 0);
  assert.match(help.stdout, /Usage: agent-symbol-search/);
  assert.equal(help.stderr, "");

  const ambiguous = runMain("search", "--root", ".", "--symbol", "SymbolSearchEngine");
  assert.equal(ambiguous.status, 1);
  const ambiguousJson = JSON.parse(ambiguous.stdout);
  assert.equal(ambiguousJson.status, "error");
  assert.match(ambiguousJson.diagnostics[0].message, /tsconfig.json/);
  assert.match(ambiguousJson.diagnostics[0].message, /tsconfig.test.json/);

  const projectSearch = runMain("search", "--root", ".", "--project", "tsconfig.json", "--symbol", "SymbolSearchEngine");
  assert.equal(projectSearch.status, 0, projectSearch.stderr);
  assert.equal(JSON.parse(projectSearch.stdout).status, "complete");
  assert.equal(projectSearch.stderr, "");

  const missing = runMain("search", "--root", fixtureRoot, "--symbol", "doesNotExist");
  assert.equal(missing.status, 0);
  assert.equal(JSON.parse(missing.stdout).status, "complete");
  assert.match(missing.stderr, /SYMBOL_NOT_FOUND/);

  const malformed = runMain("search", "--root", fixtureRoot, "--symbol", "anything", "--unknown", "value");
  assert.equal(malformed.status, 2);
  assert.equal(JSON.parse(malformed.stdout).status, "error");
  assert.match(malformed.stderr, /INVALID_REQUEST/);
});
