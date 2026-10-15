import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Writable } from 'node:stream';
import { createHash } from 'node:crypto';
import { Core } from '../dist/core.js';
import { fixture } from './stage1-fixture.mjs';

async function success(f, args, options) {
  const observed = await f.command(args, options);
  assert.equal(observed.exit, 0, observed.output + observed.errors);
  assert.equal(observed.result?.ok, true, observed.output);
  return observed.result;
}
async function add(f, spec, key = spec.taskId) {
  const file = f.save(spec.taskId + '.json', spec);
  return success(f, ['task', 'add', '--file', file, '--idempotency-key', key, '--json']);
}

test('init preserves dirty checkout/index/owner refs and creates only an unverified private baseline', async () => {
  const f = fixture();
  try {
    writeFileSync(join(f.repo, 'src/index.ts'), 'export const ownerDirty = 2;\n');
    writeFileSync(join(f.repo, 'untracked.txt'), 'Owner untracked data\n');
    const index = readFileSync(join(f.repo, '.git/index'));
    const head = f.git(['rev-parse', 'HEAD']), checkout = f.git(['status', '--porcelain=v1']);
    const initialized = await success(f, f.initArgs);
    assert.equal(initialized.data.baselineOid, f.oid); assert.equal(initialized.data.verification, 'unverified');
    assert.equal(f.git(['rev-parse', initialized.data.baselineRef]), f.oid);
    assert.equal(f.git(['rev-parse', initialized.data.integrationRef]), f.oid);
    assert.equal(f.git(['rev-parse', 'HEAD']), head); assert.equal(f.git(['rev-parse', 'refs/heads/main']), head);
    assert.equal(f.git(['status', '--porcelain=v1']), checkout); assert.deepEqual(readFileSync(join(f.repo, '.git/index')), index);
    const replay = await success(f, [...f.initArgs, '--request-id', 'req_replay']);
    assert.deepEqual(replay.data, initialized.data); assert.equal(replay.meta.coordinatorEpoch, initialized.meta.coordinatorEpoch);
    const before = await success(f, ['status', '--json']);
    for (const args of [['doctor', '--deep', '--json'], ['task', 'list', '--json'], ['worktree', 'list', '--json'], ['snapshot', 'list', '--json']]) await success(f, args);
    const snapshots = await success(f, ['snapshot', 'list', '--include-unverified', '--json']);
    assert.deepEqual(snapshots.data.items.map(item => [item.kind, item.verification, item.commitOid]), [['baseline', 'unverified', f.oid]]);
    const after = await success(f, ['status', '--json']);
    assert.equal(after.meta.coordinatorEpoch, before.meta.coordinatorEpoch); assert.deepEqual(after.data.cursor, before.data.cursor);
    const alias = join(f.base, 'repository alias'); symlinkSync(f.repo, alias, 'junction');
    const aliasStatus = await success(f, ['status', '--repo', alias, '--json']);
    assert.equal(aliasStatus.data.projectId, initialized.data.projectId); assert.deepEqual(aliasStatus.data.cursor, after.data.cursor);
  } finally { f.cleanup(); }
});

test('immutable DAG intent, advisory messages, idempotency and queued cancellation persist atomically', async () => {
  const f = fixture();
  try {
    await success(f, f.initArgs);
    const first = f.task('tsk_first'); const created = await add(f, first, 'create-first');
    assert.equal(created.data.status, 'queued'); assert.equal(created.data.executionEligibility.execution, 'disabled');
    assert.equal(created.data.executionEligibility.availableInStage1, false);
    const beforeReplay = await success(f, ['status', '--json']);
    const replay = await add(f, { ...first, title: first.title }, 'create-first');
    assert.deepEqual(replay.data, created.data);
    assert.equal((await success(f, ['status', '--json'])).data.highWatermark, beforeReplay.data.highWatermark);
    const changedFile = f.save('changed.json', { ...first, instructions: 'Different immutable intent' });
    const conflict = await f.command(['task', 'add', '--file', changedFile, '--idempotency-key', 'create-first', '--json']);
    assert.equal(conflict.result.error.code, 'IDEMPOTENCY_CONFLICT');
    const second = await add(f, f.task('tsk_second', ['tsk_first'])); assert.equal(second.data.status, 'blocked');
    const message = { schemaVersion: 'angit-message-input/v1', taskId: 'tsk_first', kind: 'contract.updated', summary: 'Advisory only; this cannot complete the task.', relatedTaskIds: ['tsk_second'], artifactIds: [], commitOid: f.oid };
    const messageFile = f.save('message.json', message);
    const posted = await success(f, ['task', 'message', '--file', messageFile, '--idempotency-key', 'post-message', '--json']);
    assert.equal(posted.data.advisory, true);
    const shown = await success(f, ['task', 'show', 'tsk_first', '--history', '--json']);
    assert.deepEqual(shown.data.task.spec, first); assert.equal(shown.data.task.status, 'queued'); assert.equal(shown.data.task.completionOpId, null);
    assert.equal(shown.data.messages[0].message.summary, message.summary);
    assert.deepEqual((await success(f, ['task', 'show', 'tsk_second', '--json'])).data.dependencies, ['tsk_first']);
    const cancelled = await success(f, ['task', 'cancel', 'tsk_first', '--reason', 'Owner cancelled queued work', '--wait-ms', '1', '--idempotency-key', 'cancel-first', '--json']);
    assert.equal(cancelled.data.status, 'cancelled'); assert.equal(cancelled.data.terminal, true);
    const cancelledReplay = await success(f, ['task', 'cancel', 'tsk_first', '--reason', 'Owner cancelled queued work', '--wait-ms', '20', '--idempotency-key', 'cancel-first', '--json']);
    assert.deepEqual(cancelledReplay.data, cancelled.data);
    const terminal = await success(f, ['task', 'show', 'tsk_first', '--json']);
    assert.deepEqual(terminal.data.task.spec, first); assert.equal(terminal.data.task.status, 'cancelled'); assert.deepEqual(terminal.data.attempts, []);
  } finally { f.cleanup(); }
});

test('owner scope, protected paths, required checks, dependencies and contract pins cannot be weakened', async () => {
  const f = fixture();
  try {
    await success(f, f.initArgs); const before = await success(f, ['status', '--json']);
    for (const [spec, expected] of [
      [f.task('tsk_protected', [], { scopePaths: ['protected/config.ts'] }), 'POLICY_DENIED'],
      [f.task('tsk_outside', [], { scopePaths: ['other/'] }), 'POLICY_DENIED'],
      [f.task('tsk_checks', [], { requiredChecks: ['check_other'] }), 'POLICY_DENIED'],
      [f.task('tsk_cycle', ['tsk_cycle']), 'DEPENDENCY_CYCLE'],
      [f.task('tsk_missing', ['tsk_absent']), 'CROSS_PROJECT_DEPENDENCY'],
      [f.task('tsk_pin_bad', [], { contractRefs: [{ path: 'src/index.ts', commitOid: f.oid, sha256: '0'.repeat(64) }] }), 'CONTRACT_HASH_MISMATCH'],
    ]) {
      const file = f.save(spec.taskId + '.json', spec);
      const rejected = await f.command(['task', 'add', '--file', file, '--idempotency-key', spec.taskId, '--json']);
      assert.equal(rejected.result?.ok, false, rejected.output); assert.equal(rejected.result?.error.code, expected, rejected.output);
      if (expected === 'POLICY_DENIED') assert.equal(rejected.exit, 4);
    }
    const after = await success(f, ['status', '--json']);
    assert.deepEqual(after.data.counts, before.data.counts); assert.equal(after.data.highWatermark, before.data.highWatermark);
    const hash = createHash('sha256').update(readFileSync(join(f.repo, 'src/index.ts'))).digest('hex');
    await add(f, f.task('tsk_pinned', [], { contractRefs: [{ path: 'src/index.ts', commitOid: f.oid, sha256: hash }] }));
  } finally { f.cleanup(); }
});

test('full history cursors bind replay; read/follow never invent events or mutate the authority epoch', async () => {
  const f = fixture();
  try {
    await success(f, f.initArgs);
    const snapshot = await success(f, ['status', '--json']);
    const cursorFile = f.save('cursor.json', snapshot.data.cursor);
    await add(f, f.task('tsk_events'));
    const replay = await success(f, ['status', '--cursor-file', cursorFile, '--limit', '1', '--json']);
    assert.deepEqual(replay.data.replay.map(event => [event.type, event.entityId]), [['task.created', 'tsk_events']]);
    assert.equal(replay.data.cursor.snapshotHighWatermark, snapshot.data.cursor.snapshotHighWatermark);
    const badCursor = f.save('wrong-history.json', { ...snapshot.data.cursor, historyIdentity: 'a'.repeat(64) });
    const rejected = await f.command(['status', '--cursor-file', badCursor, '--json']);
    assert.equal(rejected.result.error.code, 'CURSOR_HISTORY_MISMATCH');
    const controller = new AbortController(); let frames = '';
    const stdout = new Writable({ highWaterMark: 1, write(chunk, encoding, done) { frames += chunk.toString(); setTimeout(() => { done(); controller.abort(); }, 20); } });
    const followed = await f.command(['status', '--follow', '--format', 'ndjson', '--cursor-file', cursorFile], { stdout, signal: controller.signal });
    assert.equal(followed.exit, 0); assert.equal(followed.errors, '');
    const events = frames.trim().split('\n').map(line => JSON.parse(line));
    assert.deepEqual(events.map(event => [event.schemaVersion, event.eventId, event.entityId]), [['angit-event/v1', replay.data.replay[0].eventId, 'tsk_events']]);
    const after = await success(f, ['status', '--json']); assert.equal(after.meta.coordinatorEpoch, replay.meta.coordinatorEpoch);
  } finally { f.cleanup(); }
});

test('lifetime guard contention denies new writers while readonly inspection remains available', async () => {
  const f = fixture();
  try {
    const init = await success(f, f.initArgs), projectId = init.data.projectId;
    const guard = new DatabaseSync(join(f.stateRoot, 'projects', projectId, 'guard.sqlite'));
    try {
      guard.exec('BEGIN EXCLUSIVE');
      const before = await success(f, ['status', '--json']);
      const spec = f.task('tsk_busy'), file = f.save('busy.json', spec);
      const denied = await f.command(['task', 'add', '--file', file, '--idempotency-key', 'busy-task', '--json']);
      assert.equal(denied.result.error.code, 'COORDINATOR_ALREADY_RUNNING');
      const after = await success(f, ['status', '--json']);
      assert.equal(after.meta.coordinatorEpoch, before.meta.coordinatorEpoch); assert.deepEqual(after.data.counts, before.data.counts);
    } finally { if (guard.isTransaction) guard.exec('ROLLBACK'); guard.close(); }
    await add(f, f.task('tsk_busy'), 'busy-task');
  } finally { f.cleanup(); }
});

test('predictable init byte-budget failure and dangling symbolic managed refs preserve every owner ref', async () => {
  for (const scenario of ['budget', 'symbolic']) {
    const f = fixture({ maxJsonBytes: scenario === 'budget' ? 1024 : 1048576 });
    try {
      const projectId = new Core({ stateRoot: f.stateRoot }).resolveProjectId(f.repo);
      const baseline = `refs/angit/${projectId}/baseline`, integration = `refs/angit/${projectId}/integration`;
      const ownerRef = 'refs/heads/must-not-be-created';
      if (scenario === 'symbolic') f.git(['symbolic-ref', baseline, ownerRef]);
      const result = await f.command(f.initArgs); assert.notEqual(result.exit, 0, result.output);
      assert.equal(result.result.error.code, scenario === 'budget' ? 'OUTPUT_LIMIT' : 'RECOVERY_REQUIRED', result.output);
      assert.equal(f.git(['for-each-ref', '--format=%(refname)', 'refs/heads/']), 'refs/heads/main');
      assert.equal(f.git(['rev-parse', 'HEAD']), f.oid);
      assert.equal(f.git(['for-each-ref', '--format=%(refname)', integration]), '');
      if (scenario === 'symbolic') assert.equal(f.git(['symbolic-ref', baseline]), ownerRef);
      else assert.equal(f.git(['for-each-ref', '--format=%(refname)', baseline]), '');
    } finally { f.cleanup(); }
  }
});
