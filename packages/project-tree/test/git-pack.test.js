import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildProjectGraph, queryGraph } from '../src/index.js';

function git(args, cwd) {
  execFileSync('git', args, { cwd, stdio: 'pipe' });
}

async function packedFixture() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-packed-'));
  git(['init', '--quiet'], dir);
  git(['config', 'user.email', 'a@example.test'], dir);
  git(['config', 'user.name', 'A'], dir);
  await fs.mkdir(path.join(dir, 'src'));
  await fs.writeFile(path.join(dir, 'src', 'util.js'), 'export const ok = true;\n');
  await fs.writeFile(path.join(dir, 'same.js'), 'same\n');
  await fs.writeFile(path.join(dir, 'changed.js'), 'before\n');
  await fs.writeFile(path.join(dir, 'removed.js'), 'gone\n');
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'initial'], dir);
  // Force every object into a packfile with no loose objects left, the real shape of a fresh `git clone`.
  git(['repack', '-a', '-d'], dir);
  const objectsDir = await fs.readdir(path.join(dir, '.git', 'objects'));
  assert.equal(
    objectsDir.some((entry) => /^[0-9a-f]{2}$/.test(entry)),
    false,
    'expected no loose object subdirectories after repack'
  );
  assert.ok(await fs.readdir(path.join(dir, '.git', 'objects', 'pack')).then((files) => files.some((f) => f.endsWith('.pack'))));
  await fs.writeFile(path.join(dir, 'changed.js'), 'after\n');
  await fs.rm(path.join(dir, 'removed.js'));
  await fs.writeFile(path.join(dir, 'extra.js'), 'new\n');
  return dir;
}

test('changed query resolves Git HEAD from a fully packed repository (post git gc / fresh clone shape)', async () => {
  const root = await packedFixture();
  const graph = await buildProjectGraph({ root, scannedAt: '1970-01-01T00:00:00.000Z' });
  const result = queryGraph(graph, 'changed', { root });
  assert.equal(result.adapter.available, true, `expected packed HEAD to resolve; note: ${result.adapter.note}`);
  assert.deepEqual(result.changed.map((c) => [c.path, c.status]).sort(), [
    ['changed.js', 'modified'],
    ['extra.js', 'untracked'],
    ['removed.js', 'deleted']
  ]);
});

test('changed query resolves packed objects behind OFS_DELTA/REF_DELTA chains', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-delta-'));
  git(['init', '--quiet'], dir);
  git(['config', 'user.email', 'a@example.test'], dir);
  git(['config', 'user.name', 'A'], dir);
  const big = 'line\n'.repeat(2000);
  await fs.writeFile(path.join(dir, 'big.txt'), big);
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'v1'], dir);
  await fs.writeFile(path.join(dir, 'big.txt'), `${big}extra tail line\n`);
  git(['add', '-A'], dir);
  git(['commit', '--quiet', '-m', 'v2'], dir);
  git(['repack', '-a', '-d'], dir);
  const graph = await buildProjectGraph({ root: dir, scannedAt: '1970-01-01T00:00:00.000Z' });
  const result = queryGraph(graph, 'changed', { root: dir });
  assert.equal(result.adapter.available, true);
  assert.deepEqual(result.changed, []);
});
