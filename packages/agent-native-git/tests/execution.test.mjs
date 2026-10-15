import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { Writable } from 'node:stream';
import { startBroker, callBroker, startSupervision, readTerminationReceipt } from '../dist/execution-native.js';
import { createNativePlatform } from '../dist/platform.js';
import { ApprovedGit } from '../dist/core/git.js';
import { executionFixture, ROOT, hash, eventually, success, add, startArgs, show, worktrees, observationExists } from './execution-fixture.mjs';

const options = { concurrency: false, timeout: 3600000 };
const proof = attempt => {
  assert.ok(attempt.terminationProof, 'Terminal attempt must retain full writer-tree termination evidence.');
  assert.match(attempt.terminationProof.receiptHash, /^[0-9a-f]{64}$/u);
  assert.equal(attempt.terminationProof.kind, 'writer_tree_terminated');
};
async function initialized(f) { return (await success(f, f.initArgs)).data; }
async function externalSuccess(f, args) {
  const result = await f.external(args);
  assert.equal(result.exit, 0, result.output + result.errors);
  assert.equal(result.result?.ok, true, result.output);
  return result.result;
}
async function active(f, taskId) {
  await eventually(() => f.observeTask(taskId), state => state.attempts.some(attempt => attempt.status === 'running'), { label: 'durably running owned attempt' });
  return show(f, taskId);
}
async function cleanupOwned(f, primary, finish) {
  const failures = [];
  try { await finish?.(); } catch (error) { failures.push(error); }
  try { await f.cleanup(); } catch (error) { failures.push(error); }
  if (!failures.length) return;
  if (primary) throw new AggregateError([primary, ...failures],
    'Primary test failure: ' + primary.message + '; owned cleanup also failed', { cause: primary });
  if (failures.length === 1) throw failures[0];
  throw new AggregateError(failures, 'Owned foreground and fixture cleanup failed');
}
function ownerSnapshot(f) {
  return { head: f.git(['rev-parse', 'HEAD']), main: f.git(['rev-parse', 'refs/heads/main']),
    status: f.git(['status', '--porcelain=v1']), index: readFileSync(join(f.repo, '.git/index')),
    source: readFileSync(join(f.repo, 'src/index.ts')), protected: readFileSync(join(f.repo, 'protected/config.ts')) };
}
function unchanged(f, before) { assert.deepEqual(ownerSnapshot(f), before, 'Managed execution must not mutate the owner checkout/index/refs.'); }

test('clean actual native result is pinned create-only, never completion or integration, and replay cannot relaunch', options, async () => {
  const f = executionFixture();
  try {
    await initialized(f);
    const immutable = await add(f, 'tsk_clean');
    writeFileSync(join(f.repo, 'src/index.ts'), 'export const ownerDirty = 7;\n');
    writeFileSync(join(f.repo, 'owner-untracked.txt'), 'Owner data retained\n');
    writeFileSync(join(f.repo, '.git/info/exclude'), 'owner-ignored.txt\n');
    writeFileSync(join(f.repo, 'owner-ignored.txt'), 'Ignored owner data retained\n');
    const before = ownerSnapshot(f), result = await success(f, startArgs('tsk_clean', 'commit'));
    assert.equal(result.data.status, 'submitted'); assert.equal(result.data.providerCompatibility, 'unknown');
    assert.equal(result.data.workspacePreserved, true);
    const state = await show(f, 'tsk_clean'), attempt = state.attempts[0];
    assert.equal(state.task.status, 'submitted'); assert.equal(state.task.completionOpId, null);
    assert.deepEqual(state.task.spec, immutable); assert.equal(state.attempts.length, 1); proof(attempt);
    assert.equal(attempt.submissionOid, result.data.submissionOid);
    assert.equal(f.git(['rev-parse', attempt.submissionRef]), attempt.submissionOid);
    assert.equal(f.git(['rev-parse', attempt.submissionOid + '^{tree}']), attempt.submissionTreeOid);
    assert.equal(f.git(['show', attempt.submissionOid + ':src/index.ts']), 'export const fixtureResult = 2;');
    assert.equal(f.git(['diff', '--name-only', f.oid, attempt.submissionOid]), 'src/index.ts');
    const tree = (await worktrees(f)).find(item => item.attempt_id === attempt.id);
    assert.ok(tree); assert.ok(existsSync(tree.canonical_path));
    assert.equal(f.git(['-C', tree.canonical_path, 'status', '--porcelain=v1']), '');
    const launches = f.started('commit').length;
    const replay = await success(f, [...startArgs('tsk_clean', 'commit'), '--request-id', 'req_replay_clean']);
    assert.deepEqual(replay.data, result.data); assert.equal(f.started('commit').length, launches);
    assert.equal((await show(f, 'tsk_clean')).attempts.length, 1);
    const conflict = await f.command([...startArgs('tsk_clean', 'commit'), '--retry']);
    assert.equal(conflict.result?.error.code, 'IDEMPOTENCY_CONFLICT', conflict.output);
    assert.equal((await show(f, 'tsk_clean')).attempts.length, 1);
    assert.equal((await success(f, ['status', '--json'])).data.integrationOid, f.oid);
    assert.deepEqual((await success(f, ['snapshot', 'list', '--json'])).data.items, []);
    unchanged(f, before);
    assert.equal(readFileSync(join(f.repo, 'owner-ignored.txt'), 'utf8'), 'Ignored owner data retained\n');
  } finally { await f.cleanup(); }
});

for (const mode of ['dirty', 'untracked', 'outscope', 'nonzero']) {
  test(`actual native ${mode} preserves its managed output and never publishes a submission`, options, async () => {
    const f = executionFixture({ modes: [mode] });
    try {
      await initialized(f); await add(f, 'tsk_rejected', mode); const before = ownerSnapshot(f);
      const result = await f.command(startArgs('tsk_rejected', mode));
      assert.ok(result.result, result.output + result.errors);
      const state = await show(f, 'tsk_rejected'), attempt = state.attempts[0];
      assert.equal(state.attempts.length, 1); assert.equal(attempt.status, 'failed'); proof(attempt);
      assert.notEqual(attempt.ended_at_ms, null); assert.equal(attempt.submissionOid, null);
      assert.equal(attempt.submissionRef, null); assert.equal(state.task.status, 'needs_review');
      const tree = (await worktrees(f)).find(item => item.attempt_id === attempt.id);
      assert.ok(tree && existsSync(tree.canonical_path));
      if (mode === 'dirty') assert.equal(readFileSync(join(tree.canonical_path, 'src/index.ts'), 'utf8'), 'export const dirtyFixture = 3;\n');
      if (mode === 'untracked') assert.equal(readFileSync(join(tree.canonical_path, 'src/untracked.txt'), 'utf8'), 'Inert untracked output\n');
      if (mode === 'outscope') assert.equal(f.git(['-C', tree.canonical_path, 'show', 'HEAD:protected/config.ts']), 'export const protectedValue = 2;');
      const refs = f.git(['for-each-ref', '--format=%(refname)', 'refs/angit/']);
      assert.ok(!refs.split('\n').some(ref => /\/submissions\//u.test(ref)));
      unchanged(f, before);
    } finally { await f.cleanup(); }
  });
}

test('retry requires a fresh explicit semantic request and creates a new immutable attempt', options, async () => {
  const f = executionFixture({ modes: ['retry-once'] });
  try {
    await initialized(f); const spec = await add(f, 'tsk_retry', 'retry-once');
    const first = await f.command(startArgs('tsk_retry', 'retry-once', 'first-attempt'));
    assert.ok(first.result);
    const failed = await show(f, 'tsk_retry'); assert.equal(failed.attempts[0].status, 'failed'); proof(failed.attempts[0]);
    const denied = await f.command(startArgs('tsk_retry', 'retry-once', 'not-an-explicit-retry'));
    assert.equal(denied.result?.ok, false, denied.output);
    assert.equal((await show(f, 'tsk_retry')).attempts.length, 1);
    assert.equal(f.started('retry-once').length, 1);
    const retried = await success(f, [...startArgs('tsk_retry', 'retry-once', 'second-attempt'), '--retry']);
    assert.equal(retried.data.status, 'submitted');
    const final = await show(f, 'tsk_retry'); assert.equal(final.attempts.length, 2);
    assert.deepEqual(final.task.spec, spec);
    assert.notEqual(final.attempts[0].id, final.attempts[1].id);
    assert.deepEqual(final.attempts[0], failed.attempts[0]);
    assert.equal(final.attempts[1].number, 2); proof(final.attempts[1]);
    assert.equal(final.task.completionOpId, null);
  } finally { await f.cleanup(); }
});

for (const cancellation of [false, true]) {
  test(`separate real consumer ${cancellation ? 'cancels task' : 'stops attempt'} through authenticated broker and kills the owned descendants`, options, async () => {
    const f = executionFixture({ modes: ['root-descendant'] });
    try {
      await initialized(f); await add(f, 'tsk_stop', 'root-descendant'); const before = ownerSnapshot(f);
      const running = f.launch(startArgs('tsk_stop', 'root-descendant'));
      const current = await active(f, 'tsk_stop'), attempt = current.attempts[0];
      const roots = await eventually(() => f.started('root-descendant'), roots => roots.length === 1, { label: 'native root start' });
      const root = roots[0];
      const childPid = await eventually(() => {
        const file = join(root.directory, root.prefix + '.child');
        return existsSync(file) ? Number(readFileSync(file, 'utf8')) : null;
      }, value => Number.isInteger(value) && value > 0, { label: 'owned descendant ready' });
      const replay = await f.external(startArgs('tsk_stop', 'root-descendant'));
      assert.equal(replay.result?.error.code, 'RECOVERY_REQUIRED', replay.output);
      const conflict = await f.external([...startArgs('tsk_stop', 'root-descendant'), '--retry']);
      assert.equal(conflict.result?.error.code, 'IDEMPOTENCY_CONFLICT', conflict.output);
      assert.equal((await show(f, 'tsk_stop')).attempts.length, 1); assert.equal(f.started('root-descendant').length, 1);
      const stop = cancellation ? ['task', 'cancel', 'tsk_stop', '--reason', 'Owner cancels before capture'] :
        ['agent', 'stop', attempt.id, '--reason', 'Owner stops exact attempt'];
      const acknowledged = await externalSuccess(f, [...stop, '--wait-ms', '5000', '--idempotency-key', 'separate-stop', '--json']);
      if (!cancellation) {
        assert.equal(typeof acknowledged.data.waitTimedOut, 'boolean');
        if (acknowledged.data.waitTimedOut) {
          assert.equal(acknowledged.data.terminationProof, null);
          assert.equal(acknowledged.data.alreadyTerminated, false);
        } else {
          assert.equal(acknowledged.data.alreadyTerminated, true);
          proof(acknowledged.data);
        }
      }
      const result = await running.wait(); assert.equal(result.result?.ok, true, result.output + result.errors);
      const final = await show(f, 'tsk_stop'), ended = final.attempts[0]; proof(ended);
      assert.notEqual(ended.ended_at_ms, null); assert.equal(ended.submissionRef, null);
      assert.equal(ended.status, 'cancelled');
      if (cancellation) assert.equal(final.task.status, 'cancelled');
      const heartbeat = join(root.directory, 'child-' + childPid + '.heartbeat');
      const retained = readFileSync(heartbeat, 'utf8'); await delay(200);
      assert.equal(readFileSync(heartbeat, 'utf8'), retained, 'Descendant must stop writing after termination proof.');
      assert.ok((await worktrees(f)).some(item => item.attempt_id === ended.id)); unchanged(f, before);
      if (!cancellation) {
        const replayed = await externalSuccess(f, [...stop, '--idempotency-key', 'separate-stop', '--json']);
        assert.equal(replayed.data.stopOperationId, acknowledged.data.stopOperationId);
        assert.equal(replayed.data.attemptId, ended.id);
        const conflictAfterClose = await f.external(['agent', 'stop', ended.id, '--reason', 'Different immutable reason',
          '--idempotency-key', 'separate-stop', '--json']);
        assert.equal(conflictAfterClose.result?.error.code, 'IDEMPOTENCY_CONFLICT', conflictAfterClose.output);
        assert.equal((await show(f, 'tsk_stop')).attempts.length, 1);
        assert.equal(f.started('root-descendant').length, 1);
      }
    } finally { await f.cleanup(); }
  });
}

test('cancellation accepted before capture prevents submission even for a clean approved native commit', options, async () => {
  const f = executionFixture({ modes: ['commit-idle'] });
  try {
    await initialized(f); await add(f, 'tsk_cancel_capture', 'commit-idle');
    const running = f.launch(startArgs('tsk_cancel_capture', 'commit-idle'));
    const current = await active(f, 'tsk_cancel_capture');
    const roots = await eventually(() => f.started('commit-idle'), roots => roots.length === 1);
    await eventually(() => observationExists(f, 'commit-idle', roots[0], 'committed'), Boolean);
    const tree = (await worktrees(f)).find(item => item.attempt_id === current.attempts[0].id);
    assert.equal(f.git(['-C', tree.canonical_path, 'status', '--porcelain=v1']), '');
    assert.notEqual(f.git(['-C', tree.canonical_path, 'rev-parse', 'HEAD']), f.oid);
    await externalSuccess(f, ['task', 'cancel', 'tsk_cancel_capture', '--reason', 'Cancel valid result before capture',
      '--wait-ms', '5000', '--idempotency-key', 'cancel-before-capture', '--json']);
    const result = await running.wait(); assert.equal(result.result?.ok, true, result.output + result.errors);
    const state = await show(f, 'tsk_cancel_capture'); assert.equal(state.task.status, 'cancelled');
    assert.equal(state.attempts[0].status, 'cancelled'); assert.equal(state.attempts[0].submissionRef, null);
    assert.equal(state.attempts[0].submissionOid, null); proof(state.attempts[0]);
    assert.equal(f.git(['-C', tree.canonical_path, 'show', 'HEAD:src/index.ts']), 'export const fixtureResult = 2;');
  } finally { await f.cleanup(); }
});

test('root exit while a descendant lives does not free a bounded run slot or allow duplicate admission', options, async () => {
  const f = executionFixture({ modes: ['descendant-tail', 'commit'], parallel: 1 });
  let failure;
  try {
    await initialized(f); await add(f, 'tsk_a_tail', 'descendant-tail'); await add(f, 'tsk_b_next');
    const running = f.launch(['run', '--parallel', '1', '--until', 'idle', '--idempotency-key', 'run-tail', '--json']);
    const current = await active(f, 'tsk_a_tail'), attempt = current.attempts[0];
    const roots = await eventually(() => f.started('descendant-tail'), roots => roots.length === 1);
    const childPid = await eventually(() => {
      const file = join(roots[0].directory, roots[0].prefix + '.child');
      return existsSync(file) ? Number(readFileSync(file, 'utf8')) : 0;
    }, value => Number.isInteger(value) && value > 0, { label: 'tail descendant ready' });
    await eventually(() => existsSync(join(roots[0].directory, 'child-' + childPid + '.parent-exited')), Boolean,
      { label: 'descendant confirms actual retained root process exit' });
    await delay(200);
    assert.equal(running.settled, false); assert.equal(f.started('commit').length, 0);
    assert.equal((await show(f, 'tsk_b_next')).attempts.length, 0);
    const replay = await f.external(startArgs('tsk_a_tail', 'descendant-tail', 'other-owner-start'));
    assert.equal(replay.result?.ok, false, replay.output); assert.equal(f.started('descendant-tail').length, 1);
    await externalSuccess(f, ['agent', 'stop', attempt.id, '--reason', 'Tail must terminate before slot reuse', '--wait-ms', '5000', '--idempotency-key', 'tail-stop', '--json']);
    const result = await running.wait(); assert.equal(result.result?.ok, true, result.output + result.errors);
    proof((await show(f, 'tsk_a_tail')).attempts[0]);
    assert.equal((await show(f, 'tsk_b_next')).attempts[0].status, 'submitted');
  } catch (error) { failure = error; throw error; }
  finally { await cleanupOwned(f, failure); }
});

test('foreground run admits bounded independent work but not a submitted dependency or implicit integration', options, async () => {
  const f = executionFixture({ modes: ['delayed-commit'], parallel: 2 });
  let failure;
  try {
    await initialized(f); await add(f, 'tsk_a', 'delayed-commit'); await add(f, 'tsk_b', 'delayed-commit');
    await add(f, 'tsk_c', 'delayed-commit'); await add(f, 'tsk_dep', 'delayed-commit', ['tsk_a']);
    const before = ownerSnapshot(f);
    const running = f.launch(['run', '--parallel', '2', '--until', 'idle', '--idempotency-key', 'bounded-run', '--json']);
    await eventually(() => f.runningCount(), count => count === 2,
      { label: 'two independent native roots running concurrently' });
    const initial = (await Promise.all(['tsk_a', 'tsk_b', 'tsk_c'].map(id => show(f, id)))).flatMap(state => state.attempts);
    assert.equal(initial.filter(attempt => attempt.status === 'running').length, 2);
    assert.equal((await show(f, 'tsk_dep')).attempts.length, 0);
    const roots = await eventually(() => f.started('delayed-commit'),
      roots => roots.length === 2 && roots.every(root => observationExists(f, 'delayed-commit', root, 'waiting')),
      { label: 'two actual gated native roots' });
    for (const root of roots) writeFileSync(join(root.directory, root.prefix + '.release'), 'Owned fixture release\n');
    const next = await eventually(() => f.started('delayed-commit'), roots => roots.length === 3,
      { label: 'third attempt admitted only after a slot is released' });
    for (const root of next) writeFileSync(join(root.directory, root.prefix + '.release'), 'Owned fixture release\n');
    const result = await running.wait(); assert.equal(result.result?.ok, true, result.output + result.errors);
    for (const id of ['tsk_a', 'tsk_b', 'tsk_c']) {
      const state = await show(f, id); assert.equal(state.task.status, 'submitted');
      assert.equal(state.task.completionOpId, null); assert.equal(state.attempts.length, 1); proof(state.attempts[0]);
    }
    const dependency = await show(f, 'tsk_dep'); assert.equal(dependency.task.status, 'blocked'); assert.deepEqual(dependency.attempts, []);
    const status = (await success(f, ['status', '--json'])).data; assert.equal(status.integrationOid, f.oid); assert.equal(status.counts.completed, 0);
    unchanged(f, before);
  } catch (error) { failure = error; throw error; }
  finally { await cleanupOwned(f, failure); }
});

test('auto-integrate and absent explicit process budget are denied before worktree or process effects', options, async () => {
  for (const missingBudget of [false, true]) {
    const f = executionFixture({ maxProcesses: missingBudget ? null : 4 });
    try {
      await initialized(f); await add(f, 'tsk_denied'); const before = ownerSnapshot(f);
      const args = missingBudget ? startArgs('tsk_denied', 'commit') :
        ['run', '--auto-integrate', '--until', 'idle', '--idempotency-key', 'unsupported-integration', '--json'];
      const denied = await f.command(args); assert.equal(denied.result?.ok, false, denied.output);
      assert.equal((await show(f, 'tsk_denied')).attempts.length, 0);
      assert.deepEqual(await worktrees(f), []); assert.equal(f.started('commit').length, 0); unchanged(f, before);
    } finally { await f.cleanup(); }
  }
});
test('pre-aborted foreground admission creates no attempt, worktree or executable side effect', options, async () => {
  const f = executionFixture();
  try {
    await initialized(f); await add(f, 'tsk_interrupted');
    const controller = new AbortController(); controller.abort();
    const result = await f.command(startArgs('tsk_interrupted', 'commit'), { signal: controller.signal });
    assert.notEqual(result.exit, 0);
    assert.equal((await show(f, 'tsk_interrupted')).task.status, 'queued');
    assert.deepEqual((await show(f, 'tsk_interrupted')).attempts, []);
    assert.deepEqual(await worktrees(f), []); assert.equal(f.started('commit').length, 0);
  } finally { await f.cleanup(); }
});
test('interruption releases final foreground output backpressure without replaying a committed result', options, async () => {
  const f = executionFixture();
  let release;
  const controller = new AbortController(), chunks = [];
  const observed = Promise.withResolvers();
  const stdout = new Writable({ highWaterMark: 1, write(chunk, _encoding, done) {
    chunks.push(chunk.toString()); release = done; observed.resolve();
  } });
  try {
    await initialized(f);
    const running = f.command(['run', '--until', 'idle', '--idempotency-key', 'backpressure', '--json'],
      { stdout, signal: controller.signal });
    await bounded(observed.promise, 'final foreground output', 60000);
    const delivered = JSON.parse(chunks.join(''));
    assert.equal(delivered.ok, true);
    controller.abort();
    await bounded(running, 'interrupted blocked consumer', 2000);
    assert.equal(chunks.length, 1, 'Do not append an error envelope or retry a partial foreground result.');
    const replay = await success(f, ['run', '--until', 'idle', '--idempotency-key', 'backpressure', '--json']);
    assert.deepEqual(replay.data, delivered.data);
    assert.equal((await success(f, ['status', '--json'])).data.recoveryRequired, false);
  } finally { release?.(); stdout.destroy(); await f.cleanup(); }
});
test('retained physical execution artifacts block new admission at the owner quota without deleting evidence', options, async () => {
  const f = executionFixture();
  try {
    f.policy.limits.maxStoredBytes = 4 * 1024 * 1024;
    writeFileSync(f.policyFile, JSON.stringify(f.policy));
    const project = await initialized(f); await add(f, 'tsk_quota');
    const directory = createNativePlatform(ROOT).preparePrivateDirectory(join(f.stateRoot, 'projects', project.projectId, 'artifacts')).canonicalPath;
    const retained = join(directory, 'owner-retained.bin'), bytes = Buffer.alloc(f.policy.limits.maxStoredBytes, 0x61);
    writeFileSync(retained, bytes);
    const denied = await f.command(startArgs('tsk_quota', 'commit'));
    assert.equal(denied.result?.error.code, 'STORAGE_LIMIT_REACHED', denied.output);
    assert.equal(hash(readFileSync(retained)), hash(bytes));
    assert.deepEqual((await show(f, 'tsk_quota')).attempts, []);
    assert.deepEqual(await worktrees(f), []); assert.equal(f.started('commit').length, 0);
  } finally { await f.cleanup(); }
});




function nativeSpec(f, mode, changes = {}) {
  const authority = { projectId: 'prj_native_fixture', authorityIncarnation: 'a'.repeat(64), coordinatorEpoch: 1,
    resourceKey: 'task:tsk_native', fencingToken: 1, ownerId: 'owner_fixture' };
  const artifactDirectory = join(f.privateRoot, 'native artifacts ' + mode);
  // The public platform, not a JS mock, establishes the private artifact directory.
  createNativePlatform(ROOT).preparePrivateDirectory(artifactDirectory);
  return { executable: f.executable, executableHash: f.executableHash, args: [mode, f.observations.get(mode)], cwd: f.repo,
    environment: { SystemRoot: process.env.SystemRoot }, input: '{"schemaVersion":"angit-fixture-task/v1","instructions":"not a shell"}',
    supervisorId: 'sup_native_fixture', launchIdentity: 'b'.repeat(64), authority, artifactDirectory,
    budget: { timeoutMs: 5000, maxOutputBytes: 8192, maxProcesses: 4, heartbeatMs: 1000, stopTimeoutMs: 2000 }, ...changes };
}
async function bounded(promise, label, timeoutMs = 10000) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Timed out: ' + label)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
async function finishNative(handle) {
  if (!handle) return;
  await handle.stop('op_cleanup').catch(() => {});
  // Unknown native outcomes retain their directory; never silently delete a live writer.
  await bounded(handle.completion, 'owned native cleanup', 7000);
}
function artifacts(receipt) {
  assert.equal(receipt.writerTreeTerminated, true);
  for (const stream of [receipt.stdout, receipt.stderr]) {
    const bytes = readFileSync(stream.path); assert.equal(bytes.length, stream.bytes); assert.equal(hash(bytes), stream.sha256);
  }
  assert.ok(existsSync(receipt.receiptPath)); assert.match(receipt.terminationReceiptHash, /^[0-9a-f]{64}$/u);
}

test('actual native suspended start awaits durable callback before fixture code, then stop has exact full-tree proof', options, async () => {
  const f = executionFixture({ modes: ['idle'] });
  let handle, pulse, release;
  try {
    let observed;
    const approved = new Promise(resolve => { release = resolve; });
    handle = await bounded(startSupervision(ROOT, await nativeSpec(f, 'idle'), { async started(receipt) { observed = receipt; await approved; } }), 'suspended native start');
    pulse = setInterval(() => { void handle.pulse().catch(() => {}); }, 100);
    assert.ok(observed); assert.equal(f.started('idle').length, 0);
    await delay(100); assert.equal(f.started('idle').length, 0, 'Provider code cannot run while the durable start callback is blocked.');
    release(); await handle.resume();
    await eventually(() => f.started('idle'), roots => roots.length === 1);
    await handle.stop('op_native_stop'); const receipt = await bounded(handle.completion, 'exact native stop');
    assert.equal(receipt.reason, 'stop'); assert.equal(receipt.stopOperationId, 'op_native_stop');
    assert.deepEqual(receipt.process, observed); artifacts(receipt);
  } finally { release?.(); clearInterval(pulse); await finishNative(handle); await f.cleanup(); }
});

test('authenticated resume refreshes native heartbeat after durable start work without periodic pulses', options, async () => {
  const f = executionFixture({ modes: ['idle'] });
  let handle;
  try {
    const budget = { timeoutMs: 5000, maxOutputBytes: 8192, maxProcesses: 4, heartbeatMs: 2000, stopTimeoutMs: 2000 };
    handle = await startSupervision(ROOT, await nativeSpec(f, 'idle', { budget }), {
      async started() { await delay(1200); },
    });
    await eventually(() => f.started('idle'), roots => roots.length === 1,
      { timeoutMs: 1500, label: 'actual resumed native root after durable start delay' });
    await delay(1100);
    await handle.stop('op_resume_heartbeat');
    const receipt = await bounded(handle.completion, 'fresh resume heartbeat stop');
    assert.equal(receipt.reason, 'stop');
    assert.equal(receipt.stopOperationId, 'op_resume_heartbeat');
    artifacts(receipt);
  } finally { await finishNative(handle); await f.cleanup(); }
});

for (const [mode, reason] of [['stdout-overflow', 'output_limit'], ['stderr-overflow', 'output_limit'], ['idle', 'timeout']]) {
  test(`actual native ${mode} is bounded and retains byte-exact artifacts and termination proof`, options, async () => {
    const f = executionFixture({ modes: [mode] });
    let handle, pulse;
    try {
      const budget = { timeoutMs: mode === 'idle' ? 700 : 5000, maxOutputBytes: 8192, maxProcesses: 4, heartbeatMs: 1000, stopTimeoutMs: 2000 };
      handle = await startSupervision(ROOT, await nativeSpec(f, mode, { budget }), { async started() {} });
      pulse = setInterval(() => { void handle.pulse().catch(() => {}); }, 100);
      const receipt = await bounded(handle.completion, 'native bounded ' + mode); assert.equal(receipt.reason, reason); artifacts(receipt);
      assert.ok(receipt.stdout.bytes + receipt.stderr.bytes <= budget.maxOutputBytes);
      if (mode !== 'idle') assert.ok((mode === 'stdout-overflow' ? receipt.stdout : receipt.stderr).bytes > 0);
    } finally { clearInterval(pulse); await finishNative(handle); await f.cleanup(); }
  });
}

test('actual native heartbeat loss terminates owned root and descendants without a PID-only selector', options, async () => {
  const f = executionFixture({ modes: ['root-descendant'] });
  let handle;
  try {
    const budget = { timeoutMs: 5000, maxOutputBytes: 8192, maxProcesses: 4, heartbeatMs: 1200, stopTimeoutMs: 2000 };
    handle = await startSupervision(ROOT, await nativeSpec(f, 'root-descendant', { budget }), { async started() {} });
    const receipt = await bounded(handle.completion, 'native heartbeat failure');
    assert.equal(receipt.reason, 'heartbeat'); artifacts(receipt);
    const roots = f.started('root-descendant'); assert.equal(roots.length, 1);
    const childPid = Number(readFileSync(join(roots[0].directory, roots[0].prefix + '.child'), 'utf8'));
    const heartbeat = join(roots[0].directory, 'child-' + childPid + '.heartbeat');
    const value = readFileSync(heartbeat, 'utf8'); await delay(150); assert.equal(readFileSync(heartbeat, 'utf8'), value);
  } finally { await finishNative(handle); await f.cleanup(); }
});

test('real parent loss and missing native receipt preserve unknown ownership until exact restored EOF recovery', { ...options, timeout: 1800000 }, async () => {
  const f = executionFixture({ modes: ['root-descendant'] });
  let retainedPath, originalPath, failure;
  try {
    await initialized(f); await add(f, 'tsk_parent_loss', 'root-descendant');
    const running = f.launch(startArgs('tsk_parent_loss', 'root-descendant'));
    const current = await active(f, 'tsk_parent_loss'), original = current.attempts[0];
    const roots = await eventually(() => f.started('root-descendant'), roots => roots.length === 1);
    await eventually(() => existsSync(join(roots[0].directory, roots[0].prefix + '.child')), Boolean);
    assert.equal(running.child.kill(), true); await running.waitForExit(10000);
    const prior = await show(f, 'tsk_parent_loss'); assert.equal(prior.attempts.length, 1);
    assert.equal(prior.attempts[0].id, original.id); assert.equal(prior.attempts[0].ended_at_ms, null);
    const denied = await f.command([...startArgs('tsk_parent_loss', 'root-descendant', 'unsafe-retry'), '--retry']);
    assert.equal(denied.result?.ok, false, denied.output); assert.equal(f.started('root-descendant').length, 1);
    originalPath = original.receiptPath;
    assert.equal(typeof originalPath, 'string', 'Public attempt must expose its exact owned receipt locator.');
    const receipt = await eventually(() => {
      if (!existsSync(originalPath)) return null;
      try { return JSON.parse(readFileSync(originalPath, 'utf8')); } catch { return null; }
    }, receipt => receipt?.writerTreeTerminated === true && receipt.process.startIdentity === original.processIdentity.startIdentity,
    { timeoutMs: 60000, label: 'durable exact parent channel-loss native receipt' });
    assert.ok(['parent_eof', 'control_loss'].includes(receipt.reason));
    await running.wait(10000);
    retainedPath = originalPath + '.owned-test-retained';
    renameSync(originalPath, retainedPath);
    const unknown = await f.command(['run', '--recover', '--until', 'idle', '--idempotency-key', 'recover-missing-proof', '--json']);
    assert.ok(unknown.result, unknown.output + unknown.errors);
    const orphaned = await show(f, 'tsk_parent_loss');
    assert.equal(orphaned.attempts.length, 1); assert.equal(orphaned.attempts[0].id, original.id);
    assert.equal(orphaned.attempts[0].status, 'orphaned'); assert.equal(orphaned.attempts[0].ended_at_ms, null);
    assert.equal(orphaned.attempts[0].terminationProof, null); assert.equal(orphaned.attempts[0].submissionRef, null);
    assert.ok((await worktrees(f)).some(item => item.attempt_id === original.id));
    assert.equal((await success(f, ['status', '--json'])).data.recoveryRequired, true);
    const stillDenied = await f.command([...startArgs('tsk_parent_loss', 'root-descendant', 'unknown-retry'), '--retry']);
    assert.equal(stillDenied.result?.ok, false, stillDenied.output); assert.equal(f.started('root-descendant').length, 1);
    renameSync(retainedPath, originalPath); retainedPath = undefined;
    const recovery = await f.command(['run', '--recover', '--until', 'idle', '--idempotency-key', 'recover-restored-proof', '--json']);
    assert.ok(recovery.result, recovery.output + recovery.errors);
    const final = await show(f, 'tsk_parent_loss'); assert.equal(final.attempts.length, 1); assert.equal(final.attempts[0].id, original.id);
    proof(final.attempts[0]); assert.notEqual(final.attempts[0].ended_at_ms, null); assert.equal(final.attempts[0].submissionRef, null);
    assert.equal(f.started('root-descendant').length, 1); assert.ok((await worktrees(f)).some(item => item.attempt_id === original.id));
  } catch (error) { failure = error; throw error; }
  finally {
    await cleanupOwned(f, failure, async () => {
      if (retainedPath && existsSync(retainedPath)) {
        renameSync(retainedPath, originalPath);
        await f.command(['run', '--recover', '--until', 'idle', '--idempotency-key', 'cleanup-restored-proof', '--json']);
      }
    });
  }
});

test('native receipt consumer rejects altered output and wrong launch binding without repeating a spawn', options, async () => {
  const f = executionFixture({ modes: ['idle'] });
  let handle, pulse, originalBytes, artifactPath;
  try {
    const spec = await nativeSpec(f, 'idle');
    let started;
    handle = await startSupervision(ROOT, spec, { async started(receipt) { started = receipt; } });
    pulse = setInterval(() => { void handle.pulse().catch(() => {}); }, 100);
    await eventually(() => f.started('idle'), roots => roots.length === 1);
    await handle.stop('op_receipt_boundary');
    const receipt = await bounded(handle.completion, 'native retained receipt');
    const restored = await readTerminationReceipt(ROOT, receipt.receiptPath, spec, started);
    assert.deepEqual(restored, receipt);
    await assert.rejects(readTerminationReceipt(ROOT, receipt.receiptPath, { ...spec, launchIdentity: 'c'.repeat(64) }, started),
      error => error.code === 'NATIVE_EXECUTION_UNKNOWN' && error.exitCode === 3);
    artifactPath = receipt.stdout.path; originalBytes = readFileSync(artifactPath);
    writeFileSync(artifactPath, Buffer.from('altered owned artifact'));
    await assert.rejects(readTerminationReceipt(ROOT, receipt.receiptPath, spec, started),
      error => error.code === 'NATIVE_EXECUTION_UNKNOWN' && error.exitCode === 3);
    writeFileSync(artifactPath, originalBytes); originalBytes = undefined;
    assert.deepEqual(await readTerminationReceipt(ROOT, receipt.receiptPath, spec, started), receipt);
    assert.equal(f.started('idle').length, 1);
  } finally {
    if (originalBytes !== undefined) writeFileSync(artifactPath, originalBytes);
    clearInterval(pulse); await finishNative(handle); await f.cleanup();
  }
});

test('rejected durable-start callback terminates the suspended owned job before any fixture code', options, async () => {
  const f = executionFixture({ modes: ['idle'] });
  let handle;
  try {
    handle = await startSupervision(ROOT, await nativeSpec(f, 'idle'), { async started() { throw new Error('Owned test persistence refusal'); } });
    const receipt = await bounded(handle.completion, 'native failed start handshake');
    assert.equal(receipt.reason, 'start_callback_failure'); artifacts(receipt);
    assert.equal(f.started('idle').length, 0);
  } finally { await finishNative(handle); await f.cleanup(); }
});
test('native broker rejects a real restricted token and an invalid scope before mutation admission', options, async () => {
  const f = executionFixture({ modes: ['idle'] });
  let broker, admitted = 0;
  try {
    const descriptor = { pipeName: 'angit-fixture-' + randomBytes(16).toString('hex'),
      scopeHandle: randomBytes(32).toString('hex'), ownerSid: createNativePlatform(ROOT).ownerContext().sid,
      projectId: 'prj_native_fixture', authorityIncarnation: 'a'.repeat(64), coordinatorEpoch: 1 };
    broker = await startBroker(ROOT, descriptor, async () => { admitted++; throw new Error('Unapproved native challenge reached mutation admission.'); });
    const restricted = spawnSync(f.executable, ['restricted-pipe', descriptor.pipeName],
      { cwd: ROOT, env: { SystemRoot: process.env.SystemRoot }, shell: false, encoding: 'utf8', timeout: 10000 });
    assert.equal(restricted.status, 0, restricted.stdout + restricted.stderr);
    assert.deepEqual(JSON.parse(restricted.stdout), { accessDenied: true, win32Error: 5, restrictedSid: 'S-1-1-0' });
    await assert.rejects(callBroker(ROOT, { ...descriptor, scopeHandle: '0'.repeat(64) }, { command: 'task cancel' }),
      error => error.code === 'BROKER_REQUEST_DENIED' && error.exitCode === 4);
    assert.equal(admitted, 0, 'Neither a denied native token nor an invalid scope may enter the mutation handler.');
  } finally { await broker?.close(); await f.cleanup(); }
});


test('until-stopped foreground admission accepts live brokered metadata and stops only on owner interruption', options, async () => {
  const f = executionFixture();
  const controller = new AbortController();
  let running, failure, settled = false;
  try {
    const project = await initialized(f);
    running = f.command(['run', '--parallel', '1', '--until', 'stopped', '--idempotency-key', 'live-admission', '--json'],
      { signal: controller.signal }).then(result => { settled = true; return result; });
    await eventually(() => existsSync(join(f.stateRoot, 'projects', project.projectId, 'control.json')), Boolean,
      { label: 'owner-private scope published after actual broker readiness' });
    const spec = f.task('tsk_live_admission', [], { runtimeProfileId: 'profile_commit',
      instructions: '世'.repeat(12000), acceptance: Array.from({ length: 20 }, (_, i) => i + ' ' + '界'.repeat(900)) });
    const file = f.save('live-admission.json', spec);
    await eventually(() => f.external(['task', 'add', '--file', file, '--idempotency-key', 'late-add', '--json']),
      result => result.result?.ok === true, { label: 'live authenticated metadata admission' });
    await eventually(() => f.observeTask('tsk_live_admission'), state => state.task.status === 'submitted',
      { label: 'foreground admission after initial quiescence' });
    const submitted = await show(f, 'tsk_live_admission');
    assert.deepEqual(submitted.task.spec, spec); assert.equal(submitted.attempts.length, 1); proof(submitted.attempts[0]);
    assert.equal(submitted.task.completionOpId, null); assert.equal(settled, false);
    controller.abort();
    const result = await bounded(running, 'orderly foreground owner interruption');
    assert.equal(result.result?.ok, true, result.output + result.errors);
    assert.equal(result.result.data.stopped, true);
    assert.equal((await success(f, ['status', '--json'])).data.recoveryRequired, false);
  } catch (error) { failure = error; throw error; }
  finally {
    controller.abort();
    // An observation timeout is not foreground completion. Drain our own session before the next test.
    await cleanupOwned(f, failure, async () => { if (running) await running; });
  }
});

for (const change of ['cancellation', 'advisory']) {
  test(`brokered ${change} during queued admission does not stop unrelated owned work`, { ...options, timeout: 1800000 }, async () => {
    const f = executionFixture({ modes: ['idle', 'commit'], parallel: 2 });
    const controller = new AbortController();
    const originalBase = ApprovedGit.prototype.base;
    const reached = Promise.withResolvers(), gate = Promise.withResolvers();
    let running, failure, gateUsed = false, settled = false;
    try {
      const project = await initialized(f);
      await add(f, 'tsk_a_unrelated', 'idle');
      running = f.command(['run', '--parallel', '2', '--until', 'stopped', '--idempotency-key', 'admission-race', '--json'],
        { signal: controller.signal }).then(result => { settled = true; return result; });
      await active(f, 'tsk_a_unrelated');
      await eventually(() => f.started('idle'), roots => roots.length === 1);
      // First finish unrelated provisioning. Otherwise its base inspection can consume the gate.
      // Delay only this project's next real admission inspection, never replace the Git result.
      ApprovedGit.prototype.base = async function (...args) {
        const result = await originalBase.apply(this, args);
        if (this.repository.projectId === project.projectId && !gateUsed) {
          gateUsed = true;
          reached.resolve(); await gate.promise;
        }
        return result;
      };
      const spec = f.task('tsk_b_changed', [], { runtimeProfileId: 'profile_commit' });
      await externalSuccess(f, ['task', 'add', '--file', f.save('queued-change.json', spec),
        '--idempotency-key', 'add-tsk_b_changed', '--json']);
      await bounded(reached.promise, 'selected queued pre-effect Git inspection', 600000);
      if (change === 'cancellation') {
        await externalSuccess(f, ['task', 'cancel', 'tsk_b_changed', '--reason', 'Cancel selected queued candidate',
          '--idempotency-key', 'change-selected', '--json']);
      } else {
        const file = f.save('advisory.json', { schemaVersion: 'angit-message-input/v1', taskId: 'tsk_b_changed',
          kind: 'contract.updated', summary: 'Advisory only; immutable requirements remain unchanged.',
          relatedTaskIds: [], artifactIds: [], commitOid: f.oid });
        await externalSuccess(f, ['task', 'message', '--file', file, '--idempotency-key', 'change-selected', '--json']);
      }
      gate.resolve();
      await delay(200);
      const unrelated = await show(f, 'tsk_a_unrelated');
      assert.equal(unrelated.attempts[0].status, 'running');
      assert.equal(unrelated.attempts[0].ended_at_ms, null);
      assert.equal(settled, false);
      const changed = await show(f, 'tsk_b_changed');
      if (change === 'cancellation') {
        assert.equal(changed.task.status, 'cancelled'); assert.equal(changed.attempts.length, 0);
        assert.equal(f.started('commit').length, 0);
      } else {
        await eventually(() => f.observeTask('tsk_b_changed'), state => state.attempts.length === 1);
        const refreshed = await show(f, 'tsk_b_changed');
        assert.notEqual(refreshed.task.status, 'cancelled');
        assert.equal((await show(f, 'tsk_a_unrelated')).attempts[0].status, 'running');
      }
      controller.abort();
      const result = await running; assert.equal(result.result?.ok, true, result.output + result.errors);
      proof((await show(f, 'tsk_a_unrelated')).attempts[0]);
    } catch (error) { failure = error; throw error; }
    finally {
      gate.resolve(); ApprovedGit.prototype.base = originalBase; controller.abort();
      await cleanupOwned(f, failure, async () => { if (running) await running; });
    }
  });
}
