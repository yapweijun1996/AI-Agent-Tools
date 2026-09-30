import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolveRoot, safeRelative } from './safety.js';
import { readGitChanges } from './git.js';
import { discoverStaticEvidence } from './evidence.js';

const PACKAGE_JSON_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'package.json');
const TOOL_VERSION = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')).version;

export const DEFAULT_IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', '.next', '.cache']);
const TEXT_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml', '.txt', '.html', '.css']);
const TEST_RE = /(^|\/)(test|tests|__tests__)\/|\.((test|spec))\.[cm]?[jt]sx?$/i;
const DOC_RE = /(^|\/)(README|GOAL|DESIGN|SPEC|EPIC|ROADMAP|TASK|PROGRESS|AGENTS|CHANGELOG|LICENSE)(\.md)?$/i;

function stableId(kind, relPath, extra = '') {
  const h = crypto.createHash('sha256').update(`${kind}:${relPath}:${extra}`).digest('hex').slice(0, 16);
  return `${kind}:${h}`;
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

async function walk(root, options, dir = root, out = []) {
  if (out.length >= options.maxFiles) return out;
  const entries = await fs.readdir(dir, { withFileTypes: true });
  entries.sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (out.length >= options.maxFiles) break;
    const absolute = path.join(dir, entry.name);
    const rel = safeRelative(root, absolute);
    if (entry.isDirectory()) {
      if (DEFAULT_IGNORE_DIRS.has(entry.name) || options.ignore?.includes(rel)) continue;
      await walk(root, options, absolute, out);
      continue;
    }
    if (!entry.isFile()) continue;
    out.push({ absolute, rel });
  }
  return out;
}

function classify(rel) {
  if (TEST_RE.test(rel)) return 'test';
  if (DOC_RE.test(rel) || rel.startsWith('docs/')) return 'doc';
  if (rel === 'package.json') return 'manifest';
  if (rel.startsWith('src/') || rel.startsWith('bin/')) return 'source';
  return 'asset';
}

function languageFor(rel) {
  const ext = path.extname(rel).toLowerCase();
  return { '.js': 'javascript', '.mjs': 'javascript', '.cjs': 'javascript', '.ts': 'typescript', '.tsx': 'typescript', '.jsx': 'javascript', '.json': 'json', '.md': 'markdown', '.yml': 'yaml', '.yaml': 'yaml' }[ext] || 'unknown';
}

function extractJsImports(source) {
  const imports = [];
  const patterns = [/(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?["']([^"']+)["']/g, /import\s*\(\s*["']([^"']+)["']\s*\)/g, /require\s*\(\s*["']([^"']+)["']\s*\)/g];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1]?.startsWith('.')) imports.push(match[1]);
    }
  }
  return [...new Set(imports)].sort();
}

function resolveLocalImport(fromRel, specifier, byPath) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), specifier));
  const candidates = [base, `${base}.js`, `${base}.mjs`, `${base}.cjs`, `${base}.ts`, `${base}.tsx`, `${base}.jsx`, path.posix.join(base, 'index.js'), path.posix.join(base, 'index.ts'), path.posix.join(base, 'index.tsx')];
  return candidates.find((candidate) => byPath.has(candidate));
}

async function nodeForFile(root, file, options) {
  const stat = await fs.stat(file.absolute);
  const ext = path.extname(file.rel).toLowerCase();
  const isText = TEXT_EXTENSIONS.has(ext) && stat.size <= options.maxBytesPerFile;
  let digest = null;
  let lines = null;
  let source = null;
  if (isText) {
    const buffer = await fs.readFile(file.absolute);
    source = buffer.toString('utf8');
    digest = sha256(buffer);
    lines = source.split('\n').length;
  }
  const kind = classify(file.rel);
  const node = {
    id: stableId('file', file.rel),
    plane: kind === 'doc' ? 'architecture' : kind === 'test' ? 'evidence' : 'code',
    kind,
    path: file.rel,
    language: languageFor(file.rel),
    bytes: stat.size,
    lines,
    digest,
    provenance: { source: 'filesystem', path: file.rel },
    freshness: { scannedAt: options.scannedAt }
  };
  const imports = source && ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx'].includes(ext) ? extractJsImports(source) : [];
  return { node, imports };
}

function edgesFor(nodes, importRefs = new Map()) {
  const edges = [];
  const byPath = new Map(nodes.map((n) => [n.path, n]));
  for (const node of nodes) {
    for (const specifier of importRefs.get(node.path) || []) {
      const targetPath = resolveLocalImport(node.path, specifier, byPath);
      const target = targetPath ? byPath.get(targetPath) : null;
      if (target) edges.push({ from: node.id, to: target.id, kind: 'imports', specifier, provenance: { source: 'js-static-import', path: node.path } });
    }
    if (node.kind === 'test') {
      const candidate = node.path
        .replace(/^test\//, 'src/')
        .replace(/^tests\//, 'src/')
        .replace(/\.spec\./, '.')
        .replace(/\.test\./, '.');
      const target = byPath.get(candidate) || [...byPath.values()].find((n) => n.kind === 'source' && path.basename(candidate) === path.basename(n.path));
      if (target) edges.push({ from: node.id, to: target.id, kind: 'tests', provenance: { source: 'filename-heuristic' } });
    }
    if (node.kind === 'doc') {
      edges.push({ from: node.id, to: 'workspace:root', kind: 'describes', provenance: { source: 'doc-location' } });
    }
  }
  return edges.sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`));
}

export async function buildProjectGraph(input = {}) {
  const root = resolveRoot(input.root || '.', input.cwd || process.cwd());
  const options = {
    maxFiles: Number(input.maxFiles || 1000),
    maxBytesPerFile: Number(input.maxBytesPerFile || 256000),
    ignore: input.ignore || [],
    scannedAt: input.scannedAt || new Date(0).toISOString()
  };
  const files = await walk(root, options);
  const fileNodes = [];
  const importRefs = new Map();
  for (const file of files.sort((a, b) => a.rel.localeCompare(b.rel))) {
    const { node, imports } = await nodeForFile(root, file, options);
    fileNodes.push(node);
    if (imports.length) importRefs.set(node.path, imports);
  }
  const staticEvidence = await discoverStaticEvidence(root, files, fileNodes, options);
  const nodes = [{ id: 'workspace:root', plane: 'workspace', kind: 'workspace', path: '.', provenance: { source: 'filesystem', path: '.' }, freshness: { scannedAt: options.scannedAt } }, ...fileNodes, ...staticEvidence.nodes];
  const change = await readGitChanges(root, nodes, options);
  const envelope = {
    schema: 'aptree.graph.v1',
    meta: {
      tool: 'aptree',
      version: TOOL_VERSION,
      root: path.basename(root),
      generatedAt: options.scannedAt,
      deterministic: true,
      truncated: files.length >= options.maxFiles
    },
    graph: { nodes, edges: [...edgesFor(nodes, importRefs), ...staticEvidence.edges].sort((a, b) => `${a.from}:${a.to}:${a.kind}`.localeCompare(`${b.from}:${b.to}:${b.kind}`)) },
    change
  };
  return envelope;
}
