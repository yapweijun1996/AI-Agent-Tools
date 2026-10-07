import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildProjectGraph, queryGraph } from '../src/index.js';
import { safeRelative, assertSafeQueryPath } from '../src/safety.js';

const cli = fileURLToPath(new URL('../bin/aptree.js', import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-path-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, '..cache'));
  await fs.writeFile(path.join(root, '..config.js'), 'export const config = 1;\n');
  await fs.writeFile(path.join(root, '..cache', 'a.js'), 'export const a = 1;\n');
  return root;
}

test('library scan accepts legal names beginning with two dots', async (t) => {
  const root = await fixture(t);
  const graph = await buildProjectGraph({ root });
  assert.ok(graph.graph.nodes.some((node) => node.path === '..config.js'));
  assert.ok(graph.graph.nodes.some((node) => node.path === '..cache/a.js'));
});

test('library queries preserve legal two-dot names and ordinary root paths', async (t) => {
  const root = await fixture(t);
  assert.equal(safeRelative(root, path.join(root, '..config.js')), '..config.js');
  assert.equal(assertSafeQueryPath(root, '..cache/a.js'), '..cache/a.js');
  const graph = { graph: { nodes: [{ id: 'file:config', kind: 'source', path: '..config.js' }], edges: [] } };
  assert.equal(queryGraph(graph, 'impact', { root, path: '..config.js' }).impacted[0]?.path, '..config.js');
  assert.equal(safeRelative(root, root), '.');
  assert.equal(assertSafeQueryPath(root, './ordinary.js'), 'ordinary.js');
});

test('CLI scans and queries legal two-dot names', async (t) => {
  const root = await fixture(t);
  const result = JSON.parse(execFileSync(process.execPath, [cli, 'impact', '--root', root, '--path', '..config.js'], { encoding: 'utf8' }));
  assert.deepEqual(result.impacted.map((node) => node.path), ['..config.js']);
});

test('genuine parent and absolute escapes remain rejected', async (t) => {
  const root = await fixture(t);
  for (const relative of ['..', '../outside.js', '..cache/../../outside.js']) {
    assert.throws(() => assertSafeQueryPath(root, relative), /outside root/);
    assert.throws(() => safeRelative(root, path.resolve(root, relative)), /escapes root/);
  }
  const outside = path.join(path.dirname(root), 'outside.js');
  assert.throws(() => assertSafeQueryPath(root, outside), /outside root/);
  assert.throws(() => safeRelative(root, outside), /escapes root/);
});
