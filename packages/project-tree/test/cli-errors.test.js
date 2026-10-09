import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const cli = fileURLToPath(new URL('../bin/aptree.js', import.meta.url));

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'aptree-cli space #'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, 'index.js'), 'export const value = 1;\n');
  return root;
}

function invoke(root, args) {
  return spawnSync(process.execPath, [cli, ...args], { cwd: root, encoding: 'utf8', timeout: 30_000 });
}

function assertFailure(result, status, code, root) {
  assert.equal(result.status, status, result.stderr);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.deepEqual(payload, {
    schema: 'aptree.error.v1',
    error: {
      code,
      message: code === 'INVALID_COMMAND' ? 'Unknown project graph command.' : 'Unable to complete the project query; check the root, path and scan options.'
    }
  });
  assert.ok(Buffer.byteLength(result.stdout) < 256);
  assert.equal(result.stdout.includes(root), false);
  assert.equal(result.stdout.includes('Error:'), false);
}

test('CLI emits one bounded JSON error for parent and absolute path escapes', async (t) => {
  const root = await fixture(t);
  for (const target of ['../outside.js', path.join(path.dirname(root), 'outside.js')]) {
    assertFailure(invoke(root, ['impact', '--root', root, '--path', target]), 1, 'CLI_ERROR', root);
  }
});

test('CLI emits JSON for unknown commands and options while preserving exit codes', async (t) => {
  const root = await fixture(t);
  assertFailure(invoke(root, ['unknown-command']), 2, 'INVALID_COMMAND', root);
  assertFailure(invoke(root, ['context', '--unknown-option']), 1, 'CLI_ERROR', root);
});

test('CLI emits JSON for scan failures and honors pretty errors', async (t) => {
  const root = await fixture(t);
  const result = invoke(root, ['context', '--root', 'absent-root', '--pretty']);
  assertFailure(result, 1, 'CLI_ERROR', root);
  assert.ok(result.stdout.includes('\n  "error"'));
});

test('successful CLI graph output and textual usage remain compatible', async (t) => {
  const root = await fixture(t);
  const graph = invoke(root, ['context', '--root', root]);
  assert.equal(graph.status, 0, graph.stderr);
  assert.equal(JSON.parse(graph.stdout).schema, 'aptree.graph.v1');
  for (const args of [[], ['--help'], ['-h'], ['context', '--help']]) {
    const help = invoke(root, args);
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /^aptree <command>/);
  }
});
