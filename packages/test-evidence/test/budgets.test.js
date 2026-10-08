import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeEvidence, verifyEvidence, normalizeNodeCapture } from '../src/index.js';
import { LIMITS } from '../src/result.js';
import { fixture, bundle, update, counts, bytes } from './helpers.js';
import { createHash } from 'node:crypto';
import reporter from '../src/node-reporter.js';

test('actual input-byte digest changes for whitespace and BOM without changing counts', () => {
  const f = fixture();
  for (const raw of [bytes(f.evidence), Buffer.from('\uFEFF' + JSON.stringify(f.evidence, null, 2) + '\n')]) {
    f.artifacts[0].bytes = raw; const result = verifyEvidence(bundle(f));
    assert.equal(result.data.verdict, 'pass');
    assert.equal(result.data.checks[0].evidence.sha256, createHash('sha256').update(raw).digest('hex'));
  }
});
test('total artifact budget and request byte budget are enforced before successful analysis', () => {
  const f = fixture();
  for (let i = 2; i <= 3; i++) {
    const run = structuredClone(f.request.runs[0]); run.id = `run-${i}`; run.checkId = `check-${i}`; run.artifact.id = `capture-${i}`;
    f.request.requiredChecks.push({ id: run.checkId, environment: run.environment }); f.request.runs.push(run);
    f.artifacts.push({ id: run.artifact.id, path: run.artifact.path, bytes: Buffer.alloc(3 * 1024 * 1024) });
  }
  f.artifacts[0].bytes = Buffer.alloc(3 * 1024 * 1024);
  assert.equal(verifyEvidence(bundle(f)).errors[0].code, 'RESOURCE_LIMIT');
  const request = fixture(); request.request.arbitrary = 'x'.repeat(LIMITS.max_request_bytes);
  assert.equal(verifyEvidence(bundle(request)).errors[0].code, 'RESOURCE_LIMIT');
});
test('case and JSON depth caps withhold conclusions', () => {
  const f = fixture(); f.evidence.cases = Array.from({ length: LIMITS.max_cases + 1 }, (_, i) => ({ id: `c-${i}`, status: 'passed' }));
  f.evidence.summary.counts = counts('passed', LIMITS.max_cases + 1);
  assert.equal(verifyEvidence(update(f)).errors[0].code, 'RESOURCE_LIMIT');
  f.artifacts[0].bytes = Buffer.from('['.repeat(34) + '0' + ']'.repeat(34));
  assert.equal(verifyEvidence(bundle(f)).errors[0].code, 'RESOURCE_LIMIT');
});
test('real output cap withholds a large otherwise complete anomaly report', () => {
  const f = fixture('failed'); f.evidence.summary.counts = counts('failed', 500);
  f.evidence.cases = Array.from({ length: 500 }, (_, i) => ({ id: `c-${i}`, status: 'failed' }));
  f.request.runs[0].artifact.path = 'x'.repeat(1000) + '.json'; f.artifacts[0].path = f.request.runs[0].artifact.path;
  const result = summarizeEvidence(update(f)); assert.equal(result.errors[0].code, 'RESOURCE_LIMIT'); assert.equal(result.data, null);
});
test('record cap and contradictory capture outcomes are rejected', () => {
  assert.throws(() => normalizeNodeCapture(Buffer.from('{"type":"end"}\n'.repeat(LIMITS.max_records + 1))), { code: 'RESOURCE_LIMIT' });
  const header = { type: 'header', schemaVersion: '1.0.0', reporter: { id: 'agent-test-evidence', version: '0.1.0' }, runtime: { id: 'node', version: '24.0.0' } };
  const records = [header, { type: 'case', id: 'x', status: 'failed' }, { type: 'summary', success: true, counts: counts() }, { type: 'end' }];
  assert.throws(() => normalizeNodeCapture(Buffer.from(records.map(v => JSON.stringify(v)).join('\n') + '\n')), { code: 'INVALID_INPUT' });
});
test('analysis leaves supplied request and artifact bytes unchanged', () => {
  const f = fixture(), request = JSON.stringify(f.request), raw = Buffer.from(f.artifacts[0].bytes);
  summarizeEvidence(bundle(f)); verifyEvidence(bundle(f));
  assert.equal(JSON.stringify(f.request), request); assert.deepEqual(f.artifacts[0].bytes, raw);
});
test('reporter ignores routine messages and rejects unknown meaningful structures without raw echo', async () => {
  const events = [{ type: 'test:stdout', data: { message: 'SECRET' } }, { type: 'test:pass', data: { name: 'SECRET', details: { type: 'future' } } }];
  let text = ''; for await (const line of reporter((async function* () { yield* events; })())) text += line;
  assert.equal(text.includes('SECRET'), false); assert.match(text, /unsupported/);
});
