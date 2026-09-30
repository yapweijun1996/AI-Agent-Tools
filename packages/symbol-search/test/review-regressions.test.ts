import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import test from "node:test";
import * as ts from "typescript";
import { DEFAULT_LIMITS, findDefinition as rawDefinition, findReferences as rawReferences, findImplementations as rawImplementations, getCapabilities as rawCapabilities, searchSymbols as rawSearch, listSymbols as rawSymbols } from "../src";
import { buildProject } from "../src/core/project";
import { readBoundedText } from "../src/core/bounded-reader";
import { canonicalizeRoot } from "../src/core/paths";
import { discoverFiles } from "../src/core/discovery";
import { findDefinition, findReferences, listSymbols, removeDirectory, searchSymbols, temporaryDirectory, tryCreateSymlink, writeSource } from "./helpers";

test("compiler standard libraries use the canonical installation path", (context) => {
  const parent = temporaryDirectory();
  const root = join(parent, "repo");
  const compilerPath = ts.sys.getExecutingFilePath();
  const alias = join(parent, "compiler-alias");
  try {
    if (!tryCreateSymlink(dirname(compilerPath), alias, "dir")) {
      context.skip("Directory symlinks are unavailable");
      return;
    }
    context.mock.method(ts.sys, "getExecutingFilePath", () => join(alias, basename(compilerPath)));
    writeSource(root, "tsconfig.json", JSON.stringify({ compilerOptions: { types: [] }, files: ["main.ts"] }));
    writeSource(root, "main.ts", "export const visible: Array<string> = [];\n");
    const project = buildProject(root, { limits: { ...DEFAULT_LIMITS, timeoutMs: 30_000 } });
    assert.ok(project.program?.getSourceFiles().some(file => file.fileName.endsWith("lib.es5.d.ts")));
    assert.deepEqual(project.diagnostics, []);
    assert.equal(searchSymbols({ root, symbol: "visible" }).status, "complete");
  } finally {
    context.mock.restoreAll();
    removeDirectory(parent);
  }
});

test("compiler imports cannot read excluded, secret, symlink, or outside-root sources", () => {
  const parent = temporaryDirectory();
  const root = join(parent, "repo");
  try {
    writeSource(parent, "outside.ts", "export const outside = 1;\n");
    writeSource(root, "tsconfig.json", JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: ["main.ts"] }));
    writeSource(root, "main.ts", 'import "../outside"; import "./secrets.local"; import "./ignored"; import "./excluded"; import "./linked"; export const visible = 1;\n');
    writeSource(root, "secrets.local.ts", "export const secret = 1;\n" + " ".repeat(2048));
    writeSource(root, "ignored.ts", "export const ignored = 1;\n");
    writeSource(root, "excluded.ts", "export const excluded = 1;\n");
    writeSource(root, ".gitignore", "ignored.ts\n");
    tryCreateSymlink(join(parent, "outside.ts"), join(root, "linked.ts"));
    const limits = { ...DEFAULT_LIMITS, timeoutMs: 30_000, maxSingleFileBytes: 512, maxParsedBytes: 1024 };
    const context = buildProject(root, { project: "tsconfig.json", exclude: ["excluded.ts"], limits });
    assert.deepEqual(context.program?.getSourceFiles().map(file => realpathSync(file.fileName)), [join(realpathSync(root), "main.ts")]);
    const result = searchSymbols({ root, symbol: "visible", project: "tsconfig.json", exclude: ["excluded.ts"] });
    assert.equal(result.status, "partial");
    assert.equal(result.data.matches[0]?.name, "visible");
    assert.ok(result.diagnostics.some(item => item.code === "PATH_OUTSIDE_ROOT"));
    assert.ok(!JSON.stringify(result.diagnostics).includes(parent));
  } finally {
    removeDirectory(parent);
  }
});

test("compiler dependencies obey file and byte limits without becoming result matches", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "tsconfig.json", JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: ["main.ts"] }));
    writeSource(root, "main.ts", 'import { value } from "dep"; export const local = value;\n');
    writeSource(root, "node_modules/dep/index.d.ts", "export declare const value: number;\n" + " ".repeat(2048));
    const base = { ...DEFAULT_LIMITS, timeoutMs: 30_000 };
    for (const limits of [{ ...base, maxSingleFileBytes: 512 }, { ...base, maxParsedBytes: 512 }, { ...base, maxFiles: 2 }]) {
      const context = buildProject(root, { project: "tsconfig.json", limits });
      assert.ok(!context.program?.getSourceFiles().some(file => file.fileName.includes("node_modules/dep")));
      assert.equal(context.truncation.truncated, true);
      assert.ok(context.truncation.reasons.some(reason => reason === "MAX_BYTES_REACHED" || reason === "MAX_FILES_REACHED"));
    }
    const context = buildProject(root, { project: "tsconfig.json", limits: base });
    assert.ok(context.program?.getSourceFiles().some(file => file.fileName.includes("node_modules/dep")));
    assert.deepEqual(context.sourceFiles.map(file => realpathSync(file.fileName)), [join(realpathSync(root), "main.ts")]);
    const expectedBytes = ["tsconfig.json", "main.ts", "node_modules/dep/index.d.ts"].reduce((total, file) => total + readFileSync(join(root, file)).length, 0);
    assert.equal(context.stats.compilerBytesRead, expectedBytes);
    assert.equal(context.stats.compilerFilesRead, 3);
  } finally {
    removeDirectory(root);
  }
});

test("nested gitignore rules are relative and preserve negation and include precedence", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, ".gitignore", "blocked.ts\n");
    writeSource(root, "src/.gitignore", "ignored.ts\n!blocked.ts\n/root-only.ts\n");
    for (const file of ["src/ignored.ts", "other/ignored.ts", "src/blocked.ts", "src/root-only.ts", "src/deep/root-only.ts"]) {
      writeSource(root, file, "export const target = 1;\n");
    }
    assert.deepEqual(searchSymbols({ root, symbol: "target" }).data.matches.map(match => match.path).sort(), ["other/ignored.ts", "src/blocked.ts", "src/deep/root-only.ts"]);
    assert.equal(searchSymbols({ root, symbol: "target", include: ["src/ignored.ts"] }).data.matches.length, 1);
    assert.equal(searchSymbols({ root, symbol: "target", include: ["src/ignored.ts"], exclude: ["src/ignored.ts"] }).data.matches.length, 0);
  } finally {
    removeDirectory(root);
  }
});

test("instance methods normalize transient symbols and literal element-access references", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "main.ts", 'export class Store<T> {\n  save(value: T) {}\n}\nclass Child extends Store<string> {}\nconst store = new Child();\nstore.save("value");\nstore["save"]("value");\nconst unrelated = "save";\n');
    const references = findReferences({ root, symbol: "Store.save" });
    assert.equal(references.status, "complete");
    assert.deepEqual(references.data.matches.map(match => match.range.start.line).sort(), [6, 7]);
    for (const line of [6, 7]) {
      const from = { path: "main.ts", line, column: 7 };
      const definition = findDefinition({ root, symbol: "save", from });
      assert.equal(definition.status, "complete");
      assert.deepEqual(definition.data.matches.map(match => match.qualifiedName), ["Store.save"]);
      assert.deepEqual(findReferences({ root, symbol: "save", from }).data.matches, references.data.matches);
    }
  } finally {
    removeDirectory(root);
  }
});

test("constructor positions resolve the keyword, parameter type, and body independently", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "main.ts", "export function helper() {}\nexport class Service {}\nexport class Consumer {\n  constructor(dependency: Service) {\n    helper();\n  }\n}\n");
    for (const [line, column, name] of [[4, 3, "Consumer.constructor"], [4, 26, "Service"], [5, 5, "helper"]] as const) {
      const result = findDefinition({ root, symbol: "ignored", from: { path: "main.ts", line, column } });
      assert.equal(result.status, "complete");
      assert.deepEqual(result.data.matches.map(match => match.qualifiedName), [name]);
    }
    assert.deepEqual(findReferences({ root, symbol: "helper", from: { path: "main.ts", line: 5, column: 5 } }).data.matches.map(match => match.range.start.line), [5]);
  } finally {
    removeDirectory(root);
  }
});

test("native TypeScript module and declaration extensions work with NodeNext", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "tsconfig.json", JSON.stringify({ compilerOptions: { module: "NodeNext", moduleResolution: "NodeNext", types: [] }, include: ["*.mts", "*.cts"] }));
    for (const [file, source] of Object.entries({
      "main.mts": "export const esm = 1;\n",
      "common.cts": "export const cjs = 2;\n",
      "types.d.mts": "export declare const esmType: number;\n",
      "types.d.cts": "export declare const cjsType: number;\n"
    })) {
      writeSource(root, file, source);
    }
    const config = ts.readConfigFile(join(root, "tsconfig.json"), ts.sys.readFile);
    const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
    assert.equal(parsed.fileNames.length, 4);
    assert.equal(searchSymbols({ root, symbol: "esm" }).data.matches[0]?.path, "main.mts");
    for (const path of ["main.mts", "common.cts", "types.d.mts", "types.d.cts"]) {
      const result = listSymbols({ root, path });
      assert.equal(result.status, "complete");
      assert.equal(result.data.matches.length, 1);
    }
  } finally {
    removeDirectory(root);
  }
});

test("operation-specific helpers reject conflicting operations before repository access", () => {
  const request = { root: "missing-root", symbol: "helper", operation: "references" as const };
  // @ts-expect-error The definition helper must reject other operation types.
  const invalidDefinition = rawDefinition(request);
  // @ts-expect-error Runtime validation must also protect JavaScript callers.
  const invalidReferences = rawReferences({ ...request, operation: "definition" });
  // @ts-expect-error The implementation helper must reject other operation types.
  const invalidImplementations = rawImplementations(request);
  // @ts-expect-error Search must reject semantic operations too.
  const invalidSearch = rawSearch(request);
  // @ts-expect-error Symbols must reject a conflicting operation before reading the root.
  const invalidSymbols = rawSymbols({ root: "missing-root", path: "main.ts", operation: "definition" });
  // @ts-expect-error Capabilities must not silently discard a conflicting operation.
  const invalidCapabilities = rawCapabilities({ root: "missing-root", operation: "search" });
  for (const result of [invalidDefinition, invalidReferences, invalidImplementations, invalidSearch, invalidSymbols, invalidCapabilities]) {
    assert.equal(result.status, "error");
    assert.deepEqual(result.diagnostics.map(item => item.code), ["INVALID_REQUEST"]);
  }
});

test("configuration inheritance shares the compiler read policy and budget", () => {
  const parent = temporaryDirectory();
  const root = join(parent, "repo");
  try {
    writeSource(root, "main.ts", "export const configured = 1;\n");
    writeSource(root, "base.json", JSON.stringify({ compilerOptions: { noLib: true, types: [] }, files: ["main.ts"] }));
    writeSource(root, "tsconfig.json", JSON.stringify({ extends: "./base.json" }));
    const limits = { ...DEFAULT_LIMITS, timeoutMs: 30_000 };
    const valid = buildProject(root, { project: "tsconfig.json", limits });
    assert.equal(valid.diagnostics.length, 0);
    assert.equal(valid.stats.compilerFilesRead, 3);
    writeSource(parent, "outside.json", JSON.stringify({ compilerOptions: { noLib: true, types: [] } }));
    writeSource(root, "tsconfig.json", JSON.stringify({ extends: "../outside.json", files: ["main.ts"] }));
    const denied = searchSymbols({ root, project: "tsconfig.json", symbol: "configured" });
    assert.equal(denied.status, "partial");
    assert.ok(denied.diagnostics.some(item => item.code === "PATH_OUTSIDE_ROOT"));
    assert.ok(!JSON.stringify(denied.diagnostics).includes(parent));
    writeSource(root, "tsconfig.json", " ".repeat(2048) + "{}");
    const oversized = buildProject(root, { project: "tsconfig.json", limits: { ...limits, maxSingleFileBytes: 512 } });
    assert.ok(oversized.truncation.reasons.includes("MAX_BYTES_REACHED"));
  } finally {
    removeDirectory(parent);
  }
});

test("bounded readers and nested ignore files fail safely at their limits", () => {
  const root = temporaryDirectory();
  try {
    writeSource(root, "main.ts", "export const target = 1;\n");
    assert.equal(readBoundedText(join(root, "main.ts"), 512).bytes, 25);
    assert.deepEqual(readBoundedText(join(root, "main.ts"), 1), { reason: "size", bytes: 0 });
    assert.deepEqual(readBoundedText(join(root, "missing"), 512), { reason: "unavailable", bytes: 0 });
    assert.deepEqual(readBoundedText(root, 512), { reason: "unavailable", bytes: 0 });
    writeSource(root, ".gitignore", "# root\n");
    writeSource(root, "src/.gitignore", "# nested\n");
    const canonical = canonicalizeRoot(root);
    assert.ok("value" in canonical);
    for (const limits of [{ ...DEFAULT_LIMITS, maxFiles: 1 }, { ...DEFAULT_LIMITS, maxParsedBytes: 10 }, { ...DEFAULT_LIMITS, maxSingleFileBytes: 2 }]) {
      const result = discoverFiles(canonical.value, { extensions: [".ts"], limits });
      assert.equal(result.truncation.truncated, true);
    }
    writeSource(root, "src/hidden.ts", "export const hidden = 1;\n");
    writeSource(root, "rules.txt", "hidden.ts\n");
    if (tryCreateSymlink(join(root, "rules.txt"), join(root, "linked-rules"))) {
      assert.deepEqual(readBoundedText(join(root, "linked-rules"), 512), { reason: "unavailable", bytes: 0 });
    }
  } finally {
    removeDirectory(root);
  }
});
