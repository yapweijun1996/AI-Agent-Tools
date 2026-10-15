import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { mkdtempSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { main } from '../dist/cli.js';

async function capture(args, options = {}) {
  let output = '', errors = '';
  const stdout = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
  const stderr = new Writable({ write(chunk, encoding, done) { errors += chunk.toString(); done(); } });
  const exit = await main(args, { stdout, stderr, interactive: false, ...options });
  return { exit, output, errors };
}
test('unavailable execution paths and invalid flags cannot initialize storage', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'angit cli ')), stateRoot = join(dir, 'must-not-exist');
  try {
    const options = { cwd: dir, coreOptions: { stateRoot } };
    for (const args of [['worker', 'start', '--json'], ['integrate', 'apply', '--json'], ['snapshot', 'restore', '--json']]) {
      const result = await capture(args, options); const envelope = JSON.parse(result.output);
      assert.equal(result.exit, 3); assert.equal(envelope.ok, false); assert.equal(envelope.error.code, 'STAGE_SCOPE_UNAVAILABLE');
      assert.equal(existsSync(stateRoot), false);
    }
    for (const args of [['status', '--json=true'], ['status', '--limit', '1e2', '--json'], ['status', '--repo', '.', '--repo', '.', '--json'], ['status', '--state-root', stateRoot, '--json'], ['status', '--request-id', 'bad\nvalue', '--json']]) {
      const result = await capture(args, options); const envelope = JSON.parse(result.output);
      assert.equal(result.exit, 2); assert.equal(envelope.ok, false); assert.match(envelope.requestId, /^[a-z][a-z0-9_-]{1,63}$/);
      assert.equal(existsSync(stateRoot), false);
    }
  } finally { rmSync(dir, { recursive: true }); }
});
test('follow initialization errors never contaminate the event-only stdout stream', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'angit cursor '));
  try {
    const bad = join(dir, 'bad.json'); writeFileSync(bad, '{"projectId":');
    const result = await capture(['status', '--follow', '--format', 'ndjson', '--cursor-file', bad], { cwd: dir });
    assert.equal(result.exit, 2); assert.equal(result.output, '');
    assert.equal(JSON.parse(result.errors).error.code, 'INVALID_JSON');
  } finally { rmSync(dir, { recursive: true }); }
});
test('small asynchronous output failure is observed before success returns', async () => {
  let writes = 0, errors = '';
  const stdout = new Writable({ write(chunk, encoding, done) { writes++; setImmediate(() => done(Object.assign(new Error('Consumer closed pipe'), { code: 'EPIPE' }))); } });
  // Retain an independent observer so a broken implementation fails an assertion rather than crashing the test host.
  stdout.on('error', () => {});
  const stderr = new Writable({ write(chunk, encoding, done) { errors += chunk.toString(); done(); } });
  const exit = await main(['--version'], { stdout, stderr });
  await nextTurn();
  assert.notEqual(exit, 0); assert.equal(writes, 1);
  assert.equal(JSON.parse(errors).error.code, 'OUTPUT_STREAM_FAILED');
});
