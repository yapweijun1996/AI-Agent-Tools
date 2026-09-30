import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import test from "node:test";
import { copyTypeScriptFixture, createEngine, findDefinition, removeDirectory, searchSymbols, snapshotFiles, temporaryDirectory, tryCreateSymlink, writeSource } from "./helpers";

test("no-config projects use the documented fixed fallback", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/main.ts", "export function fallbackSymbol(): string { return 'ok'; }\n");
    const result = searchSymbols({ root, symbol: "fallbackSymbol" });
    assert.equal(result.status, "complete");
    assert.equal(result.stats.project, "fallback");
    assert.equal(result.data.matches[0]?.path, "src/main.ts");
  } finally {
    removeDirectory(root);
  }
});

test("multiple configs fail deterministically instead of selecting the first", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/main.ts", "export const visible = 1;\n");
    writeSource(root, "tsconfig.json", '{"compilerOptions":{"noEmit":true},"include":["src/**/*.ts"]}\n');
    writeSource(root, "tsconfig.alt.json", '{"compilerOptions":{"noEmit":true},"include":["src/**/*.ts"]}\n');
    const result = searchSymbols({ root, symbol: "visible" });
    assert.equal(result.status, "error");
    assert.ok(result.diagnostics.some((item) => item.message.includes("Multiple TypeScript project configurations")));
    const multiple = result.diagnostics.find((item) => item.details?.reason === "multiple-project-configs");
    assert.deepEqual(multiple?.details?.projects, ["tsconfig.alt.json", "tsconfig.json"]);
    assert.match(multiple?.message ?? "", /pass project explicitly/);
  } finally {
    removeDirectory(root);
  }
});

test("configured path aliases resolve through the selected TypeScript project", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/lib.ts", "export function aliased(): string { return 'aliased'; }\n");
    writeSource(root, "src/use.ts", "import { aliased } from '@lib/lib'; export const value = aliased();\n");
    writeSource(root, "tsconfig.json", JSON.stringify({
      compilerOptions: { module: "CommonJS", moduleResolution: "Node", target: "ES2022", baseUrl: ".", paths: { "@lib/*": ["src/*"] }, strict: true, noEmit: true },
      include: ["src/**/*.ts"]
    }));
    const result = findDefinition({ root, symbol: "aliased", include: ["src/**/*.ts"], from: { path: "src/use.ts", line: 1, column: 9 } });
    assert.equal(result.status, "complete");
    assert.equal(result.data.matches[0]?.path, "src/lib.ts");
  } finally {
    removeDirectory(root);
  }
});

test("an explicit project resolves ambiguity and stays inside the root", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/main.ts", "export const selected = 1;\n");
    writeSource(root, "tsconfig.json", '{"compilerOptions":{"noEmit":true},"include":["src/**/*.ts"]}\n');
    writeSource(root, "tsconfig.alt.json", '{"compilerOptions":{"noEmit":true},"include":["src/**/*.ts"]}\n');
    const result = searchSymbols({ root, symbol: "selected", project: "tsconfig.json" });
    assert.equal(result.status, "complete");
    assert.equal(result.stats.project, "tsconfig.json");
    assert.equal(result.data.matches[0]?.path, "src/main.ts");
    const definition = findDefinition({ root, symbol: "selected", project: "tsconfig.json" });
    assert.equal(definition.status, "complete");
  } finally {
    removeDirectory(root);
  }
});

test("invalid project selectors remain bounded and deterministic", () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  try {
    writeSource(root, "src/main.ts", "export const selected = 1;\n");
    writeSource(root, "tsconfig.json", '{"compilerOptions":{"noEmit":true},"include":["src/**/*.ts"]}\n');
    writeSource(root, "project.json", "{}\n");
    writeSource(outside, "tsconfig.json", '{"compilerOptions":{"noEmit":true}}\n');
    const cases = [
      { project: "project.json", code: "INVALID_REQUEST" },
      { project: "missing.json", code: "INVALID_REQUEST" },
      { project: join("..", basename(outside), "tsconfig.json"), code: "PATH_OUTSIDE_ROOT" }
    ] as const;
    for (const item of cases) {
      const result = searchSymbols({ root, symbol: "selected", project: item.project });
      assert.equal(result.status, "error");
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === item.code));
    }
    const link = join(root, "tsconfig.link.json");
    if (tryCreateSymlink(join(root, "tsconfig.json"), link)) {
      const result = searchSymbols({ root, symbol: "selected", project: "tsconfig.link.json" });
      assert.equal(result.status, "error");
      assert.ok(result.diagnostics.some((diagnostic) => diagnostic.code === "INVALID_REQUEST"));
    }
  } finally {
    removeDirectory(root);
    removeDirectory(outside);
  }
});

test("project references are explicit and do not escape the selected project", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/main.ts", "export const selectedProject = 1;\n");
    writeSource(root, "tsconfig.json", JSON.stringify({
      compilerOptions: { module: "CommonJS", target: "ES2022", noEmit: true },
      include: ["src/**/*.ts"],
      references: [{ path: "packages/other" }]
    }));
    const result = searchSymbols({ root, symbol: "selectedProject" });
    assert.equal(result.status, "partial");
    assert.ok(result.diagnostics.some((item) => item.code === "SEMANTIC_RESOLUTION_UNAVAILABLE"));
    assert.equal(result.data.matches[0]?.path, "src/main.ts");
  } finally {
    removeDirectory(root);
  }
});

test("outside-root project files are sanitized and produce partial evidence", () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  try {
    const outsideFile = join(outside, "outside.ts");
    writeSource(root, "src/main.ts", "export const selected = 1;\n");
    writeSource(root, "tsconfig.json", JSON.stringify({
      compilerOptions: { module: "CommonJS", target: "ES2022", noEmit: true },
      files: ["src/main.ts", relative(root, outsideFile)]
    }));
    writeSource(outside, "outside.ts", "export const outside = 1;\n");

    const result = searchSymbols({ root, symbol: "selected" });
    assert.equal(result.status, "partial");
    const outsideDiagnostics = result.diagnostics.filter((item) => item.code === "PATH_OUTSIDE_ROOT");
    assert.ok(outsideDiagnostics.length >= 1);
    assert.ok(outsideDiagnostics.every((item) => item.path === "tsconfig.json"));
    assert.ok(outsideDiagnostics.every((item) => !item.message.includes(outside)));
    assert.ok(outsideDiagnostics.every((item) => !item.path?.startsWith("/")));
  } finally {
    removeDirectory(root);
    removeDirectory(outside);
  }
});

test("gitignore, include, exclude, and secret precedence are deterministic", () => {
  const root = temporaryDirectory();
  try {
    writeFileSync(join(root, ".gitignore"), "ignored.ts\nignored-dir/\n!negated.ts\n", "utf8");
    writeSource(root, "main.ts", "export const mainSymbol = 1;\n");
    writeSource(root, "ignored.ts", "export const ignoredSymbol = 1;\n");
    writeSource(root, "negated.ts", "export const negatedSymbol = 1;\n");
    writeSource(root, "ignored-dir/nested.ts", "export const nestedIgnoredSymbol = 1;\n");
    writeSource(root, "secrets.ts", "export const secretSymbol = 1;\n");

    assert.equal(searchSymbols({ root, symbol: "ignoredSymbol" }).data.matches.length, 0);
    assert.equal(searchSymbols({ root, symbol: "nestedIgnoredSymbol" }).data.matches.length, 0);
    assert.equal(searchSymbols({ root, symbol: "negatedSymbol" }).data.matches.length, 1);
    assert.equal(searchSymbols({ root, symbol: "secretSymbol" }).data.matches.length, 0);

    assert.equal(searchSymbols({ root, symbol: "ignoredSymbol", include: ["ignored.ts"] }).data.matches.length, 1);
    assert.equal(searchSymbols({ root, symbol: "ignoredSymbol", include: ["ignored.ts"], exclude: ["ignored.ts"] }).data.matches.length, 0);
  } finally {
    removeDirectory(root);
  }
});

test("nested include globs reach matching generated paths without widening discovery", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "generated/deep/target.ts", "export const generatedTarget = 1;\n");
    writeSource(root, "ordinary/deep/target.ts", "export const ordinaryTarget = 1;\n");
    writeSource(root, "ignored/deep/target.ts", "export const ignoredTarget = 1;\n");
    writeFileSync(join(root, ".gitignore"), "ignored/\n", "utf8");

    const generated = searchSymbols({ root, symbol: "generatedTarget", include: ["generated/**/*.ts"] });
    assert.equal(generated.status, "complete");
    assert.equal(generated.data.matches[0]?.path, "generated/deep/target.ts");
    assert.equal(searchSymbols({ root, symbol: "ordinaryTarget", include: ["generated/**/*.ts"] }).data.matches.length, 0);
    assert.equal(searchSymbols({ root, symbol: "ignoredTarget" }).data.matches.length, 0);
    const explicitlyIncluded = searchSymbols({ root, symbol: "ignoredTarget", include: ["ignored/**/*.ts"] });
    assert.equal(explicitlyIncluded.data.matches[0]?.path, "ignored/deep/target.ts");
  } finally {
    removeDirectory(root);
  }
});

test("adversarial include globs stay fast and cannot bypass timeout", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/ordinary.ts", "export const ordinary = 1;\n");
    const adversarial = `${"**/".repeat(42)}not-a-real-file.ts`;
    assert.ok(adversarial.length > 140);

    const fastStart = Date.now();
    const fast = searchSymbols({ root, symbol: "ordinary", include: [adversarial] });
    assert.ok(Date.now() - fastStart < 2_000);
    assert.equal(fast.status, "complete");
    assert.equal(fast.data.matches.length, 0);

    const timeoutStart = Date.now();
    const timed = createEngine({ limits: { timeoutMs: 0 } }).execute({ operation: "search", root, symbol: "ordinary", include: [adversarial] });
    assert.ok(Date.now() - timeoutStart < 2_000);
    assert.equal(timed.status, "partial");
    assert.ok(timed.truncation.reasons.includes("TIMEOUT"));
  } finally {
    removeDirectory(root);
  }
});

test("external package files remain outside repository results", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "src/main.ts", "import { externalOnly } from 'external-package'; export const local = externalOnly;\n");
    writeSource(root, "node_modules/external-package/index.ts", "export const externalOnly = 1; export const packageOnly = 2;\n");
    const result = searchSymbols({ root, symbol: "externalOnly" });
    assert.ok(result.data.matches.length >= 1);
    assert.ok(result.data.matches.every((match) => !match.path.startsWith("node_modules/")));
    const includedPackage = searchSymbols({ root, symbol: "packageOnly", include: ["node_modules/**/*.ts"] });
    assert.equal(includedPackage.data.matches.length, 0);
    assert.ok(includedPackage.data.matches.every((match) => !match.path.startsWith("node_modules/")));
  } finally {
    removeDirectory(root);
  }
});

test("outside-root paths and external symlinks are rejected", () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  try {
    writeSource(root, "inside.ts", "export const inside = 1;\n");
    writeSource(outside, "outside.ts", "export const outside = 1;\n");
    const outsideResult = searchSymbols({ root, symbol: "outside", include: ["../outside.ts"] });
    assert.equal(outsideResult.data.matches.length, 0);
    const explicit = createEngine().execute({ operation: "symbols", root, path: join("..", outside.split("/").at(-1)!, "outside.ts") });
    assert.equal(explicit.status, "error");
    assert.ok(explicit.diagnostics.some((item) => item.code === "PATH_OUTSIDE_ROOT" || item.code === "INVALID_REQUEST"));

    const link = join(root, "external.ts");
    if (tryCreateSymlink(join(outside, "outside.ts"), link)) {
      const linkResult = createEngine().execute({ operation: "symbols", root, path: "external.ts" });
      assert.equal(linkResult.status, "error");
      assert.ok(linkResult.diagnostics.some((item) => item.code === "PATH_OUTSIDE_ROOT"));
    }
  } finally {
    removeDirectory(root);
    removeDirectory(outside);
  }
});

test("directory symlinks are never followed and searches do not execute source", () => {
  const root = temporaryDirectory();
  const outside = temporaryDirectory();
  try {
    writeSource(root, "safe.ts", "export const safe = 1;\n");
    writeSource(outside, "outside.ts", "globalThis.__agentSymbolSearchExecuted = true; export const externalOnly = 1;\n");
    const link = join(root, "linked-dir");
    if (tryCreateSymlink(outside, link, "dir")) {
      const result = searchSymbols({ root, symbol: "externalOnly" });
      assert.equal(result.data.matches.length, 0);
      assert.equal((globalThis as Record<string, unknown>).__agentSymbolSearchExecuted, undefined);
    }
  } finally {
    removeDirectory(root);
    removeDirectory(outside);
  }
});

test("malformed source remains usable with an explicit parse diagnostic", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "valid.ts", "export const validSymbol = 1;\n");
    writeSource(root, "broken.ts", "export function broken( {\n");
    const result = searchSymbols({ root, symbol: "validSymbol" });
    assert.equal(result.status, "partial");
    assert.equal(result.data.matches[0]?.name, "validSymbol");
    assert.ok(result.diagnostics.some((item) => item.code === "PARSE_ERROR"));
  } finally {
    removeDirectory(root);
  }
});

test("file and byte budgets return partial results with explicit reasons", () => {
  const root = copyTypeScriptFixture();
  try {
    const fileLimited = createEngine({ limits: { maxFiles: 1 } }).execute({ operation: "search", root, symbol: "resolveConfig" });
    assert.equal(fileLimited.status, "partial");
    assert.ok(fileLimited.truncation.reasons.includes("MAX_FILES_REACHED"));

    const byteLimited = createEngine({ limits: { maxParsedBytes: 1, maxSingleFileBytes: 10_000_000 } }).execute({ operation: "search", root, symbol: "resolveConfig" });
    assert.equal(byteLimited.status, "partial");
    assert.ok(byteLimited.truncation.reasons.includes("MAX_BYTES_REACHED"));

    const sizeLimited = createEngine({ limits: { maxSingleFileBytes: 10 } }).execute({ operation: "search", root, symbol: "resolveConfig" });
    assert.equal(sizeLimited.status, "partial");
    assert.ok(sizeLimited.truncation.reasons.includes("MAX_BYTES_REACHED"));
  } finally {
    removeDirectory(root);
  }
});

test("cooperative timeout is surfaced as partial evidence", () => {
  const root = copyTypeScriptFixture();
  try {
    const result = createEngine({ limits: { timeoutMs: 0 } }).execute({ operation: "search", root, symbol: "resolveConfig" });
    assert.equal(result.status, "partial");
    assert.ok(result.truncation.reasons.includes("TIMEOUT"));
    assert.ok(result.diagnostics.some((item) => item.code === "TIMEOUT"));
  } finally {
    removeDirectory(root);
  }
});

test("searches are read-only", () => {
  const root = copyTypeScriptFixture();
  try {
    const before = snapshotFiles(root);
    searchSymbols({ root, symbol: "resolveConfig" });
    const after = snapshotFiles(root);
    assert.equal(after, before);
  } finally {
    removeDirectory(root);
  }
});
