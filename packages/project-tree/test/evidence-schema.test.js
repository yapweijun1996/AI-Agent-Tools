import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildProjectGraph, queryGraph } from '../src/index.js';

async function makePackageFixture(extra = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-evidence-'));
  await fs.mkdir(path.join(dir, 'src'));
  await fs.mkdir(path.join(dir, 'test'));
  await fs.writeFile(path.join(dir, 'src', 'index.js'), 'export const value = 1;\n');
  await fs.writeFile(path.join(dir, 'test', 'index.test.js'), 'import test from "node:test";\nimport "../src/index.js";\n');
  await fs.writeFile(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'fixture',
        version: '1.0.0',
        type: 'module',
        packageManager: 'npm@10.0.0',
        engines: { node: '>=18' },
        scripts: { test: 'node --test', postinstall: 'node should-not-run.js' },
        dependencies: { leftpad: '1.0.0' },
        devDependencies: { jest: '29.0.0' },
        ...extra.packageJson
      },
      null,
      2
    )
  );
  for (const [rel, content] of Object.entries(extra.files || {})) {
    await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
    await fs.writeFile(path.join(dir, rel), content);
  }
  return dir;
}

function byKind(graph, kind) {
  return graph.graph.nodes.filter((node) => node.kind === kind);
}

test('package evidence extracts inert package metadata, dependencies, explicit manager, and lockfiles', async () => {
  const root = await makePackageFixture({ files: { 'package-lock.json': '{"lockfileVersion":3}\n' } });
  const graph = await buildProjectGraph({ root, scannedAt: '1970-01-01T00:00:00.000Z' });
  const pkg = byKind(graph, 'package')[0];
  assert.equal(pkg.status, 'ok');
  assert.equal(pkg.metadata.name, 'fixture');
  assert.equal(pkg.metadata.scripts.postinstall, 'node should-not-run.js');
  assert.deepEqual(pkg.metadata.dependencies.dependencies, { leftpad: '1.0.0' });
  const manager = byKind(graph, 'package-manager')[0];
  assert.equal(manager.status, 'ok');
  assert.deepEqual(manager.managers, ['npm']);
  assert.ok(manager.signals.find((signal) => signal.source === 'packageManager' && signal.raw === 'npm@10.0.0'));
  assert.ok(byKind(graph, 'package-lock').find((node) => node.path === 'package-lock.json' && node.manager === 'npm'));
});

test('package manager conflicts and malformed package.json are deterministic evidence, not scan failures', async () => {
  const conflictRoot = await makePackageFixture({ files: { 'pnpm-lock.yaml': 'lockfileVersion: 9\n', 'yarn.lock': '# yarn\n' } });
  const a = await buildProjectGraph({ root: conflictRoot, scannedAt: '1970-01-01T00:00:00.000Z' });
  const b = await buildProjectGraph({ root: conflictRoot, scannedAt: '1970-01-01T00:00:00.000Z' });
  assert.equal(JSON.stringify(byKind(a, 'package-manager')), JSON.stringify(byKind(b, 'package-manager')));
  assert.equal(byKind(a, 'package-manager')[0].status, 'conflict');
  assert.deepEqual(byKind(a, 'package-manager')[0].managers, ['npm', 'pnpm', 'yarn']);

  const malformedRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-bad-package-'));
  await fs.writeFile(path.join(malformedRoot, 'package.json'), '{ not json');
  const malformed = await buildProjectGraph({ root: malformedRoot });
  assert.equal(byKind(malformed, 'package')[0].status, 'malformed');
});

test('test framework evidence is static-signal backed and tests-for import links remain compatible', async () => {
  const root = await makePackageFixture({ files: { 'vitest.config.js': 'export default {};\n', 'test/vitest.spec.js': 'import { test } from "vitest";\nimport "../src/index.js";\n' } });
  const graph = await buildProjectGraph({ root });
  const frameworks = byKind(graph, 'test-framework');
  assert.ok(frameworks.find((node) => node.name === 'node:test' && node.signals.some((signal) => signal.source === 'test-import')));
  assert.ok(frameworks.find((node) => node.name === 'jest' && node.signals.some((signal) => signal.source === 'package-declaration')));
  assert.ok(frameworks.find((node) => node.name === 'vitest' && node.signals.some((signal) => signal.source === 'config-file')));
  const testsFor = queryGraph(graph, 'tests-for', { root, path: 'src/index.js' });
  assert.deepEqual(
    testsFor.tests.map((node) => node.path),
    ['test/index.test.js', 'test/vitest.spec.js']
  );
});

test('static package and test evidence never executes target scripts or tools', async () => {
  const root = await makePackageFixture({ packageJson: { scripts: { test: 'node -e "require(\\"fs\\").writeFileSync(\\"executed\\", \\"bad\\")"' } } });
  await fs.writeFile(path.join(root, 'should-not-run.js'), 'require("fs").writeFileSync("executed", "bad");\n');
  await buildProjectGraph({ root });
  await assert.rejects(fs.stat(path.join(root, 'executed')));
});

function resolveRef(schema, ref) {
  if (!ref.startsWith('#/$defs/')) throw new Error(`unsupported ref ${ref}`);
  return schema.$defs[ref.slice('#/$defs/'.length)];
}

function validate(schema, value, node = schema) {
  if (node.$ref) return validate(schema, value, resolveRef(schema, node.$ref));
  if (node.oneOf) return node.oneOf.filter((child) => validate(schema, value, child).valid).length === 1 ? { valid: true, errors: [] } : { valid: false, errors: ['oneOf mismatch'] };
  const types = Array.isArray(node.type) ? node.type : node.type ? [node.type] : [];
  if (types.length) {
    const ok = types.some((type) => (type === 'array' ? Array.isArray(value) : type === 'object' ? value && typeof value === 'object' && !Array.isArray(value) : type === 'null' ? value === null : typeof value === type));
    if (!ok) return { valid: false, errors: [`type ${types.join('|')} mismatch`] };
  }
  if (Object.hasOwn(node, 'const') && value !== node.const) return { valid: false, errors: ['const mismatch'] };
  if (node.enum && !node.enum.includes(value)) return { valid: false, errors: ['enum mismatch'] };
  if (node.required) {
    for (const key of node.required) if (!Object.hasOwn(value, key)) return { valid: false, errors: [`missing ${key}`] };
  }
  if (node.properties && value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(node.properties)) {
      if (Object.hasOwn(value, key)) {
        const result = validate(schema, value[key], child);
        if (!result.valid) return result;
      }
    }
  }
  if (node.items && Array.isArray(value)) {
    for (const item of value) {
      const result = validate(schema, item, node.items);
      if (!result.valid) return result;
    }
  }
  return { valid: true, errors: [] };
}

test('published JSON schema validates current public envelopes and rejects incompatible shapes', async () => {
  const schema = JSON.parse(await fs.readFile(new URL('../schemas/aptree.schema.v1.json', import.meta.url), 'utf8'));
  const root = await makePackageFixture();
  const graph = await buildProjectGraph({ root, scannedAt: '1970-01-01T00:00:00.000Z' });
  for (const envelope of [queryGraph(graph, 'context', { root }), queryGraph(graph, 'evidence', { root }), queryGraph(graph, 'tests-for', { root, path: 'src/index.js' }), queryGraph(graph, 'impact', { root, path: 'src/index.js' }), queryGraph(graph, 'changed', { root }), queryGraph(graph, 'goals', { root }), queryGraph(graph, 'progress', { root }), queryGraph(graph, 'path-to-done', { root })]) {
    assert.deepEqual(validate(schema, envelope), { valid: true, errors: [] });
  }
  const earliestPromisedV1Graph = {
    schema: 'aptree.graph.v1',
    meta: { tool: 'aptree', version: '0.1.0', root: 'fixture', generatedAt: '1970-01-01T00:00:00.000Z', deterministic: true, truncated: false },
    graph: { nodes: [{ id: 'workspace:root', plane: 'workspace', kind: 'workspace', path: '.', provenance: { source: 'filesystem', path: '.' }, freshness: { scannedAt: '1970-01-01T00:00:00.000Z' } }], edges: [] }
  };
  assert.equal(validate(schema, earliestPromisedV1Graph).valid, true);
  assert.equal(validate(schema, { schema: 'aptree.graph.v1', graph: { nodes: [], edges: [] } }).valid, false);
  assert.equal(validate(schema, { schema: 'aptree.query.v1', query: { command: 'unknown' } }).valid, false);
  const additive = { ...queryGraph(graph, 'evidence', { root }), futureOptionalField: { ignored: true } };
  assert.equal(validate(schema, additive).valid, true);
});
