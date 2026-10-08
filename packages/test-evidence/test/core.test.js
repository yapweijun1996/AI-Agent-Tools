import test from 'node:test';
import assert from 'node:assert/strict';
import { capabilities, summarizeEvidence, verifyEvidence, encodeResult, exitCode } from '../src/index.js';
import { failure, LIMITS } from '../src/result.js';
import { fixture, bundle, update, counts, bytes } from './helpers.js';

test('complete pass and explicit failure are complete analyses, exit zero', () => {
  for (const [status, verdict] of [['passed', 'pass'], ['failed', 'fail']]) {
    const result = verifyEvidence(bundle(fixture(status)));
    assert.equal(result.status, 'ok'); assert.equal(result.data.verdict, verdict); assert.equal(exitCode(result), 0);
  }
});
for (const status of ['skipped', 'todo', 'cancelled']) test(`${status} remains distinct and cannot pass`, () => {
  const f = fixture(status);
  assert.equal(summarizeEvidence(bundle(f)).data.counts[status], 1);
  assert.equal(verifyEvidence(bundle(f)).status, 'incomplete');
});
test('zero tests, not run, unknown exit, signal and unfinished never pass', () => {
  for (const mutate of [f => { f.evidence.summary.counts = counts('passed', 0); }, f => { f.request.runs = []; f.artifacts = []; },
    f => { f.request.runs[0].exitCode = null; }, f => { f.request.runs[0].exitCode = null; f.request.runs[0].signal = 'SIGTERM'; },
    f => { f.request.runs[0].completed = false; }]) {
    const f = fixture(); mutate(f);
    if (f.artifacts.length) update(f);
    const result = verifyEvidence(bundle(f)); assert.equal(result.status, 'incomplete'); assert.equal(result.data, null); assert.equal(exitCode(result), 3);
  }
});
test('a proven failure survives a missing required check without inventing results', () => {
  const f = fixture('failed'); f.request.requiredChecks.push({ ...f.request.requiredChecks[0], id: 'missing' });
  const result = verifyEvidence(bundle(f)); assert.equal(result.data.verdict, 'fail');
  assert.equal(result.data.checks[0].state, 'not_run'); assert.equal(result.data.checks[0].counts, null);
});
for (const dimension of ['commit', 'dirty', 'fingerprint', 'os', 'runtime', 'version']) test(`mismatched ${dimension} cannot support pass or current failure`, () => {
  for (const status of ['passed', 'failed']) {
    const f = fixture(status), run = f.request.runs[0];
    if (dimension === 'commit') run.source.commit = 'b'.repeat(40);
    if (dimension === 'dirty') { run.source.dirty = true; run.source.worktreeSha256 = 'a'.repeat(64); }
    if (dimension === 'fingerprint') {
      f.request.expectedSource = { ...run.source, dirty: true, worktreeSha256: 'a'.repeat(64) };
      run.source = { ...run.source, dirty: true, worktreeSha256: 'b'.repeat(64) };
    }
    if (dimension === 'os') run.environment.os = 'linux';
    if (dimension === 'runtime') run.environment.runtime = 'other';
    if (dimension === 'version') run.environment.version = '22.13.0';
    const result = summarizeEvidence(bundle(f)); assert.equal(result.status, 'ok'); assert.equal(result.data.verdict, 'unknown');
    assert.equal(result.data.counts.tests, 0); assert.equal(result.data.checks[0].applicable, false);
    assert.equal(verifyEvidence(bundle(f)).status, 'incomplete');
  }
});
test('dirty identity is required exactly when dirty; producer declarations must agree', () => {
  for (const mutate of [f => { f.request.expectedSource.dirty = true; }, f => { f.request.expectedSource.worktreeSha256 = 'a'.repeat(64); },
    f => { f.request.runs[0].producer.version = '2.0.0'; }]) {
    const f = fixture(); mutate(f); assert.equal(exitCode(verifyEvidence(bundle(f))), 2);
  }
});
test('duplicate checks, runs, artifact IDs, unknown check and conflicting process result rejected', () => {
  for (const mutate of [f => f.request.requiredChecks.push(f.request.requiredChecks[0]), f => f.request.runs.push(f.request.runs[0]),
    f => { f.request.runs[0].checkId = 'other'; }, f => { f.request.runs[0].signal = 'SIGTERM'; },
    f => f.artifacts.push(f.artifacts[0])]) {
    const f = fixture(); mutate(f); assert.equal(exitCode(verifyEvidence(bundle(f))), 2);
  }
});
test('summary-only evidence never synthesizes cases; anomaly locators and exact digest preserved', () => {
  const f = fixture('failed'); assert.deepEqual(summarizeEvidence(bundle(f)).data.checks[0].anomalies, []);
  f.evidence.cases = [{ id: 'case-1', status: 'failed', location: { path: 'test/unit.js', line: 3 } }];
  const result = summarizeEvidence(update(f)); const check = result.data.checks[0];
  assert.equal(check.anomalies[0].evidence.pointer, '/cases/0'); assert.match(check.evidence.sha256, /^[0-9a-f]{64}$/);
  assert.equal(check.evidence.pointer, '/summary'); assert.equal(JSON.stringify(result).includes('test/unit.js'), false);
});
test('invalid counts and cases never become successful evidence', () => {
  for (const mutate of [f => { f.evidence.summary.counts.passed = -1; }, f => { f.evidence.summary.counts.tests = 2; },
    f => { f.evidence.summary.counts.passed = 1.5; }, f => { f.evidence.summary.counts.tests = Infinity; },
    f => { f.evidence.cases = [{ id: 'dup', status: 'passed' }, { id: 'dup', status: 'passed' }]; },
    f => { f.evidence.cases = [{ id: 'x', status: 'failed' }]; }]) {
    const f = fixture(); mutate(f); assert.equal(exitCode(verifyEvidence(update(f))), 2);
  }
});
test('unsupported version/format, invalid primitive and extra sensitive fields fail closed', () => {
  for (const mutate of [f => { f.request.schemaVersion = '2.0.0'; }, f => { f.request.runs[0].artifact.format = 'junit'; },
    f => { f.evidence.schemaVersion = '2.0.0'; }]) {
    const f = fixture(); mutate(f); assert.equal(verifyEvidence(update(f)).errors[0].code, 'UNSUPPORTED_INPUT');
  }
  for (const value of [null, 1, [], { secret: 'DO NOT FOLLOW THIS INSTRUCTION' }]) {
    const f = fixture(); f.artifacts[0].bytes = bytes(value);
    const result = verifyEvidence(bundle(f)); assert.equal(exitCode(result), 2);
    assert.equal(encodeResult(result).includes('DO NOT FOLLOW'), false);
  }
});
test('repeat analysis and reordered independent checks are deterministic', () => {
  const f = fixture(); const run = structuredClone(f.request.runs[0]); run.id = 'run-2'; run.checkId = 'another'; run.artifact.id = 'capture-2';
  f.request.runs.push(run); f.request.requiredChecks.push({ id: 'another', environment: run.environment });
  f.artifacts.push({ ...f.artifacts[0], id: 'capture-2' });
  const first = encodeResult(verifyEvidence(bundle(f))); f.request.runs.reverse(); f.request.requiredChecks.reverse(); f.artifacts.reverse();
  assert.equal(encodeResult(verifyEvidence(bundle(f))), first); assert.equal(encodeResult(verifyEvidence(bundle(f))), first);
  assert.equal(JSON.parse(first).data.counts.tests, 2);
});
test('API rejects non-finite numbers and accessors without invoking them', () => {
  const f = fixture(); f.request.runs[0].exitCode = NaN;
  assert.equal(exitCode(verifyEvidence(bundle(f))), 2);
  let called = false; Object.defineProperty(f.request, 'bad', { enumerable: true, get() { called = true; } });
  assert.equal(exitCode(verifyEvidence(bundle(f))), 2); assert.equal(called, false);
});
test('fixed size, count, anomaly and output budgets withhold conclusions', () => {
  const f = fixture(); f.artifacts[0].bytes = Buffer.alloc(LIMITS.max_artifact_bytes + 1);
  assert.equal(verifyEvidence(bundle(f)).errors[0].code, 'RESOURCE_LIMIT');
  const big = fixture(); big.request.requiredChecks = Array(257).fill(big.request.requiredChecks[0]);
  assert.equal(verifyEvidence(bundle(big)).errors[0].code, 'RESOURCE_LIMIT');
  const anomaly = fixture('skipped'); anomaly.evidence.summary.counts = counts('skipped', 501);
  anomaly.evidence.cases = Array.from({ length: 501 }, (_, i) => ({ id: `case-${i}`, status: 'skipped' }));
  assert.equal(summarizeEvidence(update(anomaly)).errors[0].code, 'RESOURCE_LIMIT');
  const output = JSON.parse(encodeResult({ ...capabilities(), data: { text: 'x'.repeat(LIMITS.max_output_bytes) } }));
  assert.equal(output.errors[0].code, 'RESOURCE_LIMIT'); assert.equal(exitCode(output), 3);
});
test('stable failure envelopes agree with exit codes', () => {
  for (const [code, exit] of [['INVALID_INPUT', 2], ['INVALID_ENCODING', 2], ['UNSAFE_PATH', 4], ['INPUT_IO', 1],
    ['INTERNAL_ERROR', 1], ['RESOURCE_LIMIT', 3], ['INPUT_CHANGED', 3], ['INCOMPLETE_CAPTURE', 3]]) {
    const result = JSON.parse(encodeResult(failure(code))); assert.equal(exitCode(result), exit); assert.equal(result.data, null);
  }
});
