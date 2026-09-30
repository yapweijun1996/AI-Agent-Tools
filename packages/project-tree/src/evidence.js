import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const JS_EXTENSIONS = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx']);
const PACKAGE_REL = 'package.json';

const LOCKFILE_SIGNALS = [
  { path: 'package-lock.json', manager: 'npm', kind: 'lockfile' },
  { path: 'npm-shrinkwrap.json', manager: 'npm', kind: 'lockfile' },
  { path: 'pnpm-lock.yaml', manager: 'pnpm', kind: 'lockfile' },
  { path: 'pnpm-workspace.yaml', manager: 'pnpm', kind: 'workspace' },
  { path: 'yarn.lock', manager: 'yarn', kind: 'lockfile' },
  { path: '.yarnrc.yml', manager: 'yarn', kind: 'config' },
  { path: 'bun.lock', manager: 'bun', kind: 'lockfile' },
  { path: 'bun.lockb', manager: 'bun', kind: 'lockfile' }
];

const TEST_FRAMEWORKS = [
  { name: 'node:test', packages: [], imports: ['node:test'], configs: [], script: /node\s+--test|\bnode:test\b/ },
  { name: 'jest', packages: ['jest', '@jest/globals'], imports: ['jest', '@jest/globals'], configs: ['jest.config.js', 'jest.config.mjs', 'jest.config.cjs', 'jest.config.ts'], script: /\bjest\b/ },
  { name: 'vitest', packages: ['vitest'], imports: ['vitest'], configs: ['vitest.config.js', 'vitest.config.mjs', 'vitest.config.ts'], script: /\bvitest\b/ },
  { name: 'mocha', packages: ['mocha'], imports: ['mocha'], configs: ['.mocharc.json', '.mocharc.js', '.mocharc.cjs', '.mocharc.yml', '.mocharc.yaml'], script: /\bmocha\b/ },
  { name: 'ava', packages: ['ava'], imports: ['ava'], configs: ['ava.config.js', 'ava.config.mjs', 'ava.config.cjs'], script: /\bava\b/ },
  { name: 'tap', packages: ['tap', 'node-tap'], imports: ['tap'], configs: ['tap.config.js'], script: /\btap\b/ }
];

function stableId(kind, relPath, extra = '') {
  const h = crypto.createHash('sha256').update(`${kind}:${relPath}:${extra}`).digest('hex').slice(0, 16);
  return `${kind}:${h}`;
}

async function readTextIfExists(root, rel, maxBytes) {
  const absolute = path.join(root, rel);
  const stat = await fs.stat(absolute).catch(() => null);
  if (!stat?.isFile() || stat.size > maxBytes) return null;
  return fs.readFile(absolute, 'utf8').catch(() => null);
}

function evidenceNode(kind, pathValue, scannedAt, data = {}) {
  return {
    id: stableId(kind, pathValue || '.', data.name || ''),
    plane: 'evidence',
    kind,
    path: pathValue,
    ...data,
    provenance: data.provenance || { source: 'static-evidence', path: pathValue },
    freshness: { scannedAt }
  };
}

function depsFromPackage(pkg) {
  const out = {};
  for (const key of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    if (pkg && typeof pkg[key] === 'object' && !Array.isArray(pkg[key])) out[key] = Object.fromEntries(Object.entries(pkg[key]).sort(([a], [b]) => a.localeCompare(b)));
  }
  return out;
}

function parsePackageManager(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const match = value.trim().match(/^(@[^/]+\/[^@]+|[^@\s]+)(?:@(.+))?$/);
  if (!match) return { raw: value, manager: null, malformed: true };
  return { raw: value, manager: match[1], version: match[2] || null };
}

function collectPackageSignals(pkgNode, filePaths) {
  const signals = [];
  const explicit = parsePackageManager(pkgNode?.packageManager);
  if (explicit) signals.push({ source: 'packageManager', manager: explicit.manager, version: explicit.version, raw: explicit.raw, malformed: explicit.malformed || undefined, path: PACKAGE_REL });
  for (const signal of LOCKFILE_SIGNALS) {
    if (filePaths.has(signal.path)) signals.push({ source: signal.kind, manager: signal.manager, path: signal.path });
  }
  return signals.sort((a, b) => `${a.manager || ''}:${a.source}:${a.path}`.localeCompare(`${b.manager || ''}:${b.source}:${b.path}`));
}

function frameworkSignalMap() {
  return new Map(TEST_FRAMEWORKS.map((framework) => [framework.name, []]));
}

function addFrameworkSignal(signals, name, signal) {
  if (!signals.has(name)) signals.set(name, []);
  signals.get(name).push(signal);
}

function importMatches(source, specifier) {
  const escaped = specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(?:from\\s+|import\\s*\\(\\s*|require\\s*\\(\\s*)["']${escaped}["']`).test(source) || new RegExp(`import\\s+["']${escaped}["']`).test(source);
}

export async function discoverStaticEvidence(root, files, fileNodes, options = {}) {
  const scannedAt = options.scannedAt;
  const maxBytes = options.maxBytesPerFile || 256000;
  const filePaths = new Set(files.map((file) => file.rel));
  const nodes = [];
  const edges = [];
  let parsedPackage = null;
  let packageNodeId = null;

  if (filePaths.has(PACKAGE_REL)) {
    const text = await readTextIfExists(root, PACKAGE_REL, maxBytes);
    if (text === null) {
      nodes.push(evidenceNode('package', PACKAGE_REL, scannedAt, { status: 'unreadable', metadata: {}, provenance: { source: 'package-json', path: PACKAGE_REL } }));
    } else {
      try {
        parsedPackage = JSON.parse(text);
        const metadata = {
          name: typeof parsedPackage.name === 'string' ? parsedPackage.name : undefined,
          version: typeof parsedPackage.version === 'string' ? parsedPackage.version : undefined,
          type: typeof parsedPackage.type === 'string' ? parsedPackage.type : undefined,
          packageManager: typeof parsedPackage.packageManager === 'string' ? parsedPackage.packageManager : undefined,
          engines: typeof parsedPackage.engines === 'object' && !Array.isArray(parsedPackage.engines) ? Object.fromEntries(Object.entries(parsedPackage.engines).sort(([a], [b]) => a.localeCompare(b))) : undefined,
          workspaces: parsedPackage.workspaces,
          scripts: typeof parsedPackage.scripts === 'object' && !Array.isArray(parsedPackage.scripts) ? Object.fromEntries(Object.entries(parsedPackage.scripts).sort(([a], [b]) => a.localeCompare(b))) : undefined,
          dependencies: depsFromPackage(parsedPackage)
        };
        const pkgNode = evidenceNode('package', PACKAGE_REL, scannedAt, { status: 'ok', metadata, packageManager: metadata.packageManager, provenance: { source: 'package-json', path: PACKAGE_REL } });
        packageNodeId = pkgNode.id;
        nodes.push(pkgNode);
      } catch {
        nodes.push(evidenceNode('package', PACKAGE_REL, scannedAt, { status: 'malformed', error: 'Invalid JSON', metadata: {}, provenance: { source: 'package-json', path: PACKAGE_REL } }));
      }
    }
  }

  for (const signal of LOCKFILE_SIGNALS) {
    if (filePaths.has(signal.path)) nodes.push(evidenceNode('package-lock', signal.path, scannedAt, { manager: signal.manager, evidenceKind: signal.kind, provenance: { source: 'package-manager-file', path: signal.path } }));
  }

  const packageSignals = collectPackageSignals(parsedPackage, filePaths);
  if (packageSignals.length) {
    const managers = [...new Set(packageSignals.map((s) => s.manager).filter(Boolean))].sort();
    nodes.push(
      evidenceNode('package-manager', PACKAGE_REL, scannedAt, {
        managers,
        signals: packageSignals,
        conflict: managers.length > 1,
        status: managers.length > 1 ? 'conflict' : 'ok',
        provenance: { source: 'package-manager-static-signals', path: PACKAGE_REL }
      })
    );
  }

  const frameworkSignals = frameworkSignalMap();
  const allDeps = parsedPackage ? Object.assign({}, ...Object.values(depsFromPackage(parsedPackage))) : {};
  for (const framework of TEST_FRAMEWORKS) {
    for (const packageName of framework.packages) {
      if (Object.hasOwn(allDeps, packageName)) addFrameworkSignal(frameworkSignals, framework.name, { source: 'package-declaration', package: packageName, path: PACKAGE_REL });
    }
    if (parsedPackage?.scripts && typeof parsedPackage.scripts === 'object') {
      for (const [scriptName, scriptText] of Object.entries(parsedPackage.scripts).sort(([a], [b]) => a.localeCompare(b))) {
        if (typeof scriptText === 'string' && framework.script.test(scriptText)) addFrameworkSignal(frameworkSignals, framework.name, { source: 'package-script', script: scriptName, path: PACKAGE_REL });
      }
    }
    for (const configPath of framework.configs) {
      if (filePaths.has(configPath)) addFrameworkSignal(frameworkSignals, framework.name, { source: 'config-file', path: configPath });
    }
  }

  for (const node of fileNodes.filter((n) => n.kind === 'test' && JS_EXTENSIONS.has(path.extname(n.path).toLowerCase()))) {
    const source = await readTextIfExists(root, node.path, maxBytes);
    if (!source) continue;
    for (const framework of TEST_FRAMEWORKS) {
      for (const specifier of framework.imports) {
        if (importMatches(source, specifier)) addFrameworkSignal(frameworkSignals, framework.name, { source: 'test-import', specifier, path: node.path });
      }
    }
  }

  for (const [name, signals] of [...frameworkSignals.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (!signals.length) continue;
    const sortedSignals = signals.sort((a, b) => `${a.source}:${a.path || ''}:${a.package || a.specifier || a.script || ''}`.localeCompare(`${b.source}:${b.path || ''}:${b.package || b.specifier || b.script || ''}`));
    nodes.push(evidenceNode('test-framework', '.', scannedAt, { name, signals: sortedSignals, status: 'evidence-backed', provenance: { source: 'test-framework-static-signals', path: sortedSignals[0]?.path || '.' } }));
  }

  if (packageNodeId) edges.push({ from: packageNodeId, to: 'workspace:root', kind: 'describes', provenance: { source: 'package-json', path: PACKAGE_REL } });
  return { nodes: nodes.sort((a, b) => `${a.kind}:${a.path}:${a.name || ''}`.localeCompare(`${b.kind}:${b.path}:${b.name || ''}`)), edges };
}
