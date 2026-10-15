import test from 'node:test';
import assert from 'node:assert/strict';
import { executionFixture, eventually, success, add, show } from './execution-fixture.mjs';

test('live brokered work occupies a free run slot without waiting for an unrelated writer to exit', { timeout: 1800000 }, async () => {
  const f = executionFixture({ modes: ['idle', 'commit'], parallel: 2 });
  const controller = new AbortController();
  let running;
  try {
    await success(f, f.initArgs); await add(f, 'tsk_existing', 'idle');
    running = f.command(['run', '--parallel', '2', '--until', 'stopped', '--idempotency-key', 'live-free-slot', '--json'],
      { signal: controller.signal });
    await eventually(() => f.started('idle'), roots => roots.length === 1);
    const spec = f.task('tsk_late', [], { runtimeProfileId: 'profile_commit', title: 'New independent approved work' });
    const added = await f.external(['task', 'add', '--file', f.save('late.json', spec), '--idempotency-key', 'late-free-slot', '--json']);
    assert.equal(added.result?.ok, true, added.output + added.errors);
    await eventually(() => f.observeTask('tsk_late'), state => state.attempts.length === 1,
      { timeoutMs: 60000, label: 'new independent work admitted into the already free parallel slot' });
    const admitted = await show(f, 'tsk_late');
    assert.notEqual(admitted.task.status, 'cancelled');
    const existing = await show(f, 'tsk_existing');
    assert.equal(existing.attempts[0].status, 'running');
    assert.equal(existing.attempts[0].ended_at_ms, null);
    controller.abort();
    const result = await running;
    assert.equal(result.result?.ok, true, result.output + result.errors);
    const ended = await show(f, 'tsk_existing');
    assert.equal(ended.attempts[0].terminationProof.kind, 'writer_tree_terminated');
    assert.notEqual(ended.attempts[0].ended_at_ms, null);
    assert.equal((await success(f, ['status', '--json'])).data.recoveryRequired, false);
  } finally {
    controller.abort();
    if (running) await running;
    await f.cleanup();
  }
});
