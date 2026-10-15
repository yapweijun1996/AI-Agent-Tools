import test from 'node:test';
import assert from 'node:assert/strict';
import { WorktreeBroker } from '../dist/core/worktrees.js';
import { executionFixture, success, add, show, eventually } from './execution-fixture.mjs';

// A long capture is valid bounded Git work, not permission to keep another
// already-created native process suspended until its execution budget expires.
test('independent suspended start is durable and resumes while another submission capture waits', { timeout: 3600000 }, async () => {
  const f = executionFixture({ modes: ['commit'], parallel: 2 });
  const controller = new AbortController();
  const original = WorktreeBroker.prototype.capture;
  const reached = Promise.withResolvers(), release = Promise.withResolvers();
  let running, intercepted = false, primary;
  try {
    const project = (await success(f, f.initArgs)).data;
    await add(f, 'tsk_a'); await add(f, 'tsk_b');
    WorktreeBroker.prototype.capture = async function (...args) {
      if (this.repo.projectId === project.projectId && !intercepted) {
        intercepted = true; reached.resolve(args[0].attemptId); await release.promise;
      }
      return original.apply(this, args);
    };
    running = f.command(['run', '--parallel', '2', '--until', 'idle', '--idempotency-key', 'capture-start-boundary', '--json'], { signal: controller.signal });
    const capturedAttempt = await reached.promise;
    await eventually(() => f.started('commit'), roots => roots.length === 2,
      { label: 'second actual native root resumes before first capture is released' });
    const states = [await show(f, 'tsk_a'), await show(f, 'tsk_b')];
    const independent = states.flatMap(state => state.attempts).find(attempt => attempt.id !== capturedAttempt);
    assert.ok(independent);
    assert.equal(independent.status, 'running');
    assert.equal(Number.isSafeInteger(independent.started_at_ms), true);
    assert.equal(independent.ended_at_ms, null);
    release.resolve();
    const result = await running;
    assert.equal(result.result?.ok, true, result.output + result.errors);
    for (const taskId of ['tsk_a', 'tsk_b']) {
      const state = await show(f, taskId);
      assert.equal(state.task.status, 'submitted');
      assert.equal(state.task.completionOpId, null);
      assert.equal(state.attempts[0].terminationProof.kind, 'writer_tree_terminated');
    }
    assert.equal(f.git(['rev-parse', 'HEAD']), f.oid);
  } catch (error) { primary = error; throw error; }
  finally {
    release.resolve(); WorktreeBroker.prototype.capture = original; controller.abort();
    const failures = [];
    try { if (running) await running; } catch (error) { failures.push(error); }
    try { await f.cleanup(); } catch (error) { failures.push(error); }
    if (failures.length) throw new AggregateError(primary ? [primary, ...failures] : failures, 'Owned capture/start regression cleanup failed', { cause: primary });
  }
});
