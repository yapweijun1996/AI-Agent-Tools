import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import {
  createEngine as createSourceEngine,
  execute as executeSource,
  findDefinition as findDefinitionSource,
  findImplementations as findImplementationsSource,
  findReferences as findReferencesSource,
  getCapabilities as getCapabilitiesSource,
  listSymbols as listSymbolsSource,
  searchSymbols as searchSymbolsSource
} from "../src";
import type { EngineOptions } from "../src";

export const fixtureRoot = resolve(process.cwd(), "test/fixtures/typescript");
export const TEST_ENGINE_OPTIONS: EngineOptions = { limits: { timeoutMs: 30_000 } };

export function temporaryDirectory(prefix = "agent-symbol-search-test-"): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

export function copyTypeScriptFixture(prefix = "agent-symbol-search-fixture-"): string {
  const directory = temporaryDirectory(prefix);
  cpSync(fixtureRoot, directory, { recursive: true });
  return directory;
}

export function removeDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true });
}

export function writeSource(root: string, relativePath: string, content: string): void {
  const path = join(root, relativePath);
  mkdirSync(resolve(path, ".."), { recursive: true });
  writeFileSync(path, content, "utf8");
}

export function snapshotFiles(root: string): string {
  const entries: string[] = [];
  const visit = (directory: string): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true }).sort((left, right) => left.name < right.name ? -1 : left.name > right.name ? 1 : 0)) {
      const path = join(directory, entry.name);
      const relative = path.slice(root.length + 1).replaceAll("\\", "/");
      if (entry.isDirectory()) {
        visit(path);
      } else if (entry.isFile()) {
        entries.push(`${relative}:${createHash("sha256").update(readFileSync(path)).digest("hex")}`);
      } else if (entry.isSymbolicLink()) {
        entries.push(`${relative}:symlink`);
      }
    }
  };
  visit(root);
  return entries.join("\n");
}

export function tryCreateSymlink(target: string, linkPath: string, type: "file" | "dir" = "file"): boolean {
  try {
    symlinkSync(target, linkPath, type);
    return true;
  } catch {
    return false;
  }
}

export function readJsonOutput(output: string): unknown {
  return JSON.parse(output);
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function createEngine(options: EngineOptions = {}): ReturnType<typeof createSourceEngine> {
  return createSourceEngine({
    ...options,
    limits: { ...TEST_ENGINE_OPTIONS.limits, ...options.limits }
  });
}

export function execute(...args: Parameters<typeof executeSource>): ReturnType<typeof executeSource> {
  return executeSource(args[0], TEST_ENGINE_OPTIONS);
}

export function getCapabilities(...args: Parameters<typeof getCapabilitiesSource>): ReturnType<typeof getCapabilitiesSource> {
  return getCapabilitiesSource(args[0], TEST_ENGINE_OPTIONS);
}

export function searchSymbols(...args: Parameters<typeof searchSymbolsSource>): ReturnType<typeof searchSymbolsSource> {
  return searchSymbolsSource(args[0], TEST_ENGINE_OPTIONS);
}

export function findDefinition(...args: Parameters<typeof findDefinitionSource>): ReturnType<typeof findDefinitionSource> {
  return findDefinitionSource(args[0], TEST_ENGINE_OPTIONS);
}

export function findReferences(...args: Parameters<typeof findReferencesSource>): ReturnType<typeof findReferencesSource> {
  return findReferencesSource(args[0], TEST_ENGINE_OPTIONS);
}

export function findImplementations(...args: Parameters<typeof findImplementationsSource>): ReturnType<typeof findImplementationsSource> {
  return findImplementationsSource(args[0], TEST_ENGINE_OPTIONS);
}

export function listSymbols(...args: Parameters<typeof listSymbolsSource>): ReturnType<typeof listSymbolsSource> {
  return listSymbolsSource(args[0], TEST_ENGINE_OPTIONS);
}
