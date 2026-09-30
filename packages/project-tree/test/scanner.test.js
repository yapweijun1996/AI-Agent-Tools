import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { buildProjectGraph, queryGraph } from '../src/index.js';

async function writeLooseObject(root, type, body) {
  const header = Buffer.from(`${type} ${body.length}\0`);
  const store = Buffer.concat([header, body]);
  const oid = crypto.createHash('sha1').update(store).digest('hex');
  const objectDir = path.join(root, '.git', 'objects', oid.slice(0, 2));
  await fs.mkdir(objectDir, { recursive: true });
  await fs.writeFile(path.join(objectDir, oid.slice(2)), zlib.deflateSync(store));
  return oid;
}

async function makeHeadCommit(root, files) {
  await fs.mkdir(path.join(root, '.git', 'objects'), { recursive: true });
  await fs.mkdir(path.join(root, '.git', 'refs', 'heads'), { recursive: true });
  const entries = [];
  for (const [name, content] of Object.entries(files).sort(([a], [b]) => a.localeCompare(b))) {
    const oid = await writeLooseObject(root, 'blob', Buffer.from(content));
    entries.push(Buffer.concat([Buffer.from(`100644 ${name}\0`), Buffer.from(oid, 'hex')]));
  }
  const tree = await writeLooseObject(root, 'tree', Buffer.concat(entries));
  const commit = await writeLooseObject(root, 'commit', Buffer.from(`tree ${tree}\nauthor A <a@example.test> 0 +0000\ncommitter A <a@example.test> 0 +0000\n\ninitial\n`));
  await fs.writeFile(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
  await fs.writeFile(path.join(root, '.git', 'refs', 'heads', 'main'), `${commit}\n`);
  return commit;
}

async function fixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-'));
  await fs.mkdir(path.join(dir, 'src'));
  await fs.mkdir(path.join(dir, 'test'));
  await fs.writeFile(path.join(dir, 'src', 'util.js'), 'export const ok = true;\n');
  await fs.writeFile(path.join(dir, 'src', 'index.js'), 'import { ok } from "./util.js";\nexport { ok };\n');
  await fs.writeFile(path.join(dir, 'test', 'index.test.js'), 'import test from "node:test";\nimport "../src/index.js";\n');
  await fs.writeFile(path.join(dir, 'GOAL.md'), '# Goal\n');
  return dir;
}

test('buildProjectGraph emits deterministic envelope and stable paths', async () => {
  const root = await fixture();
  const a = await buildProjectGraph({ root, scannedAt: '1970-01-01T00:00:00.000Z' });
  const b = await buildProjectGraph({ root, scannedAt: '1970-01-01T00:00:00.000Z' });
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  assert.equal(a.schema, 'aptree.graph.v1');
  assert.ok(a.graph.nodes.find((n) => n.path === 'src/index.js'));
  assert.ok(a.graph.nodes.find((n) => n.kind === 'test'));
});

test('buildProjectGraph extracts deterministic local JS import edges', async () => {
  const root = await fixture();
  const graph = await buildProjectGraph({ root });
  const byPath = new Map(graph.graph.nodes.map((n) => [n.path, n]));
  assert.ok(graph.graph.edges.find((edge) => edge.kind === 'imports' && edge.from === byPath.get('src/index.js').id && edge.to === byPath.get('src/util.js').id && edge.specifier === './util.js'));
  assert.ok(graph.graph.edges.find((edge) => edge.kind === 'imports' && edge.from === byPath.get('test/index.test.js').id && edge.to === byPath.get('src/index.js').id));
});

test('path-scoped impact and tests-for follow reverse import/test edges', async () => {
  const root = await fixture();
  const graph = await buildProjectGraph({ root });
  const impact = queryGraph(graph, 'impact', { root, path: 'src/util.js' });
  assert.deepEqual(
    impact.impacted.map((n) => n.path),
    ['src/index.js', 'src/util.js', 'test/index.test.js']
  );
  const tests = queryGraph(graph, 'tests-for', { root, path: 'src/util.js' });
  assert.deepEqual(
    tests.tests.map((n) => n.path),
    ['test/index.test.js']
  );
});

test('queryGraph returns evidence and rejects escaping paths', async () => {
  const root = await fixture();
  const graph = await buildProjectGraph({ root });
  const evidence = queryGraph(graph, 'evidence', { root });
  assert.ok(evidence.evidence.find((n) => n.kind === 'test' && n.path === 'test/index.test.js'));
  assert.throws(() => queryGraph(graph, 'impact', { root, path: '../outside' }), /outside root/);
});

test('changed query uses read-only Git HEAD objects without executing git', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-git-'));
  await fs.writeFile(path.join(root, 'same.js'), 'same\n');
  await fs.writeFile(path.join(root, 'changed.js'), 'after\n');
  await fs.writeFile(path.join(root, 'extra.js'), 'new\n');
  const commit = await makeHeadCommit(root, {
    'same.js': 'same\n',
    'changed.js': 'before\n',
    'removed.js': 'gone\n'
  });
  const graph = await buildProjectGraph({ root, scannedAt: '1970-01-01T00:00:00.000Z' });
  const result = queryGraph(graph, 'changed', { root });
  assert.equal(result.adapter.available, true);
  assert.equal(result.adapter.base.commit, commit);
  assert.deepEqual(
    result.changed.map((c) => [c.path, c.status]),
    [
      ['changed.js', 'modified'],
      ['removed.js', 'deleted'],
      ['extra.js', 'untracked']
    ]
  );
});
