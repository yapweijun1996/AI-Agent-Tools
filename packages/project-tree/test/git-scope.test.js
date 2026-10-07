import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildProjectGraph, readGitChanges } from '../src/index.js';

async function fixture(t, files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-scope-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  for (const [relative, body] of Object.entries(files)) {
    const absolute = path.join(root, relative);
    await fs.mkdir(path.dirname(absolute), { recursive: true });
    await fs.writeFile(absolute, body);
  }
  const git = (args) => execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' });
  git(['init', '--quiet']);
  git(['add', '-A']);
  git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.test', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'initial']);
  assert.equal(git(['status', '--porcelain']), '');
  return { root, git };
}

test('clean tracked default/custom ignored directories do not become deletions', async (t) => {
  const { root } = await fixture(t, {
    'dist/generated.js': 'same\n',
    'src/a.js': 'same\n',
    'vendor/a.js': 'same\n',
  });
  const graph = await buildProjectGraph({ root, ignore: ['vendor'] });
  assert.deepEqual(graph.change.changed, []);
  assert.equal(graph.change.truncated, false);
  assert.equal(graph.meta.truncated, false);
  const direct = await readGitChanges(root, graph.graph.nodes);
  assert.equal(direct.changed.some((entry) => entry.path.startsWith('dist/')), false);
});

test('ignored files remain excluded while genuine in-scope changes are reported', async (t) => {
  const { root } = await fixture(t, {
    'dist/generated.js': 'same\n',
    'vendor/a.js': 'same\n',
    'src/modified.js': 'before\n',
    'src/deleted.js': 'gone\n',
  });
  await fs.rm(path.join(root, 'dist'), { recursive: true });
  await fs.rm(path.join(root, 'vendor'), { recursive: true });
  await fs.rm(path.join(root, 'src/deleted.js'));
  await fs.writeFile(path.join(root, 'src/modified.js'), 'after\n');
  await fs.writeFile(path.join(root, 'src/new.js'), 'new\n');
  const graph = await buildProjectGraph({ root, ignore: ['vendor'] });
  assert.deepEqual(graph.change.changed.map((entry) => [entry.path, entry.status]).sort(), [
    ['src/deleted.js', 'deleted'], ['src/modified.js', 'modified'], ['src/new.js', 'untracked'],
  ]);
});

test('a capped scan does not prove that existing unscanned tracked files were deleted', async (t) => {
  const { root } = await fixture(t, { 'a.js': 'same\n', 'b.js': 'same\n', 'c.js': 'same\n' });
  const graph = await buildProjectGraph({ root, maxFiles: 1 });
  const change = await readGitChanges(root, graph.graph.nodes, { maxFiles: 5 });
  assert.deepEqual(change.changed, []);
  assert.equal(change.truncated, true);
});

test('a capped HEAD inventory cannot prove that later scanned files are untracked', async (t) => {
  const { root } = await fixture(t, { 'a.js': 'same\n', 'b.js': 'same\n', 'c.js': 'same\n' });
  const graph = await buildProjectGraph({ root });
  const laterNodes = graph.graph.nodes.filter((node) => node.path === 'c.js');
  const change = await readGitChanges(root, laterNodes, { maxFiles: 1, maxChanges: 1 });
  assert.deepEqual(change.changed, []);
  assert.equal(change.truncated, true);
});

test('synthetic package evidence does not replace the captured manifest file', async (t) => {
  const { root } = await fixture(t, { 'package.json': '{"name":"fixture","scripts":{"test":"node --test"}}\n' });
  await fs.writeFile(path.join(root, 'package.json'), '{"name":"fixture","scripts":{"test":"different"}}\n');
  const graph = await buildProjectGraph({ root });
  assert.deepEqual(graph.change.changed.map((entry) => [entry.path, entry.status]), [['package.json', 'modified']]);
});
