import { dirname, extname, join, resolve } from "node:path";
import type { Diagnostic, Evidence, ResourceLimits } from "../types.js";
import type { DiscoveryResult, DiscoveredFile } from "./discovery.js";
import { isSupportedSource } from "./paths.js";

export interface ImportEdge {
  source: string;
  target: string;
  specifier: string;
  kind: "esm" | "commonjs";
}

export interface ImportGraph {
  edges: ImportEdge[];
  bySource: Map<string, ImportEdge[]>;
  diagnostics: Diagnostic[];
  timedOut: boolean;
}

function evidence(type: Evidence["type"], confidence: Evidence["confidence"], source: string, target: string, details?: Record<string, unknown>): Evidence {
  return { type, confidence, source, target, ...(details ? { details } : {}) };
}

function localModuleCandidates(absoluteBase: string): string[] {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ".mts", ".cts", ".mjs", ".cjs"];
  const suppliedExtension = extname(absoluteBase);
  const withoutExtension = suppliedExtension ? absoluteBase.slice(0, -suppliedExtension.length) : absoluteBase;
  const bases = suppliedExtension && [".js", ".jsx", ".mjs", ".cjs"].includes(suppliedExtension.toLowerCase()) ? [withoutExtension, absoluteBase] : [absoluteBase, withoutExtension];
  return [...new Set(bases.flatMap(base => [base, ...extensions.map(extension => `${base}${extension}`), ...extensions.map(extension => join(base, `index${extension}`))]))];
}

function resolveLocal(discovery: DiscoveryResult, source: DiscoveredFile, specifier: string): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const absoluteBase = resolve(dirname(source.absolutePath), specifier);
  const candidates = localModuleCandidates(absoluteBase);
  const byAbsolute = new Map(discovery.sourceFiles.map(file => [file.absolutePath, file.relativePath]));
  for (const candidate of candidates) {
    const relativePath = byAbsolute.get(candidate);
    if (relativePath) return relativePath;
  }
  return undefined;
}

function staticSpecifiers(text: string): Array<{ specifier: string; kind: ImportEdge["kind"] }> {
  const result: Array<{ specifier: string; kind: ImportEdge["kind"] }> = [];
  const esm = /(?:^|[;\n])\s*(?:import\s+(?:[\s\S]*?\s+from\s+)?|export\s+[\s\S]*?\s+from\s+)["']([^"']+)["']/gm;
  for (const match of text.matchAll(esm)) {
    if (match[1]) result.push({ specifier: match[1], kind: "esm" });
  }
  const requirePattern = /\brequire\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of text.matchAll(requirePattern)) {
    if (match[1]) result.push({ specifier: match[1], kind: "commonjs" });
  }
  return result;
}

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|\s)\/\/.*$/gm, "$1");
}

export function buildImportGraph(discovery: DiscoveryResult, limits: ResourceLimits, deadline = Number.POSITIVE_INFINITY): ImportGraph {
  const edges: ImportEdge[] = [];
  const bySource = new Map<string, ImportEdge[]>();
  const diagnostics: Diagnostic[] = [];
  let timedOut = false;
  for (const source of discovery.sourceFiles) {
    if (Date.now() >= deadline) {
      timedOut = true;
      diagnostics.push({ code: "TIMEOUT", message: "Static import analysis reached its cooperative deadline", severity: "warning" });
      break;
    }
    const text = stripComments(discovery.readFile(source.relativePath) ?? "");
    if (/\bimport\s*\(/.test(text) || /\brequire\(\s*[^"'\s]/.test(text)) {
      diagnostics.push({ code: "IMPORT_RESOLUTION_PARTIAL", message: "Dynamic module loading was not resolved as static reachability", severity: "warning", path: source.relativePath });
    }
    const sourceEdges: ImportEdge[] = [];
    for (const item of staticSpecifiers(text)) {
      const target = resolveLocal(discovery, source, item.specifier);
      if (!target) {
        if (item.specifier.startsWith(".")) {
          diagnostics.push({ code: "IMPORT_RESOLUTION_PARTIAL", message: "A local static import could not be resolved within discovered repository files", severity: "warning", path: source.relativePath, details: { specifier: item.specifier } });
        }
        continue;
      }
      const edge: ImportEdge = { source: source.relativePath, target, specifier: item.specifier, kind: item.kind };
      sourceEdges.push(edge);
      edges.push(edge);
    }
    if (sourceEdges.length > 0) bySource.set(source.relativePath, sourceEdges);
    if (edges.length >= limits.maxTestCandidates * 4) {
      diagnostics.push({ code: "RESOURCE_LIMIT", message: "Static import edge limit was reached", severity: "warning", details: { maxEdges: limits.maxTestCandidates * 4 } });
      break;
    }
  }
  return { edges, bySource, diagnostics, timedOut };
}

export function importEvidence(edge: ImportEdge, transitive: boolean): Evidence {
  return evidence(transitive ? "static-module-reachability" : "direct-import", transitive ? "strong" : "confirmed", edge.source, edge.target, { specifier: edge.specifier, kind: edge.kind });
}

export function reachableTestPaths(graph: ImportGraph, testPath: string, targetPath: string, deadline = Number.POSITIVE_INFINITY): Array<{ path: string[]; edges: ImportEdge[] }> {
  const queue: Array<{ current: string; path: string[]; edges: ImportEdge[] }> = [{ current: testPath, path: [testPath], edges: [] }];
  const visited = new Set<string>([testPath]);
  while (queue.length > 0 && Date.now() < deadline) {
    const item = queue.shift()!;
    for (const edge of graph.bySource.get(item.current) ?? []) {
      const nextPath = [...item.path, edge.target];
      const nextEdges = [...item.edges, edge];
      if (edge.target === targetPath) return [{ path: nextPath, edges: nextEdges }];
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        queue.push({ current: edge.target, path: nextPath, edges: nextEdges });
      }
    }
  }
  return [];
}

export function hasSupportedSourceExtension(path: string): boolean {
  return isSupportedSource(path);
}
