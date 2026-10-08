import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import Ajv from 'ajv/dist/2020.js';
import { capabilities, summarizeEvidence, verifyEvidence, normalizeNodeCapture } from '../src/index.js';
import { failure } from '../src/result.js';
import { fixture, bundle, update } from './helpers.js';
const ajv = new Ajv({ strict: true, allErrors: true });
export const validators = Object.fromEntries(['request', 'unified', 'node-record', 'result'].map(name => [name,
  ajv.compile(JSON.parse(readFileSync(new URL(`../schema/${name}.schema.json`, import.meta.url))))]));
test('distributed schemas validate fixtures, output variants and every safe failure envelope', () => {
  assert.equal(validators.result(capabilities()), true, ajv.errorsText(validators.result.errors));
  for (const status of ['passed', 'failed', 'skipped', 'todo', 'cancelled']) {
    const f = fixture(status);
    assert.equal(validators.request(f.request), true, ajv.errorsText(validators.request.errors));
    assert.equal(validators.unified(f.evidence), true, ajv.errorsText(validators.unified.errors));
    for (const operation of [summarizeEvidence, verifyEvidence])
      assert.equal(validators.result(operation(bundle(f))), true, ajv.errorsText(validators.result.errors));
  }
  for (const code of ['INVALID_INPUT', 'INVALID_ENCODING', 'UNSAFE_PATH', 'INPUT_IO', 'INTERNAL_ERROR',
    'UNSUPPORTED_INPUT', 'INCOMPLETE_CAPTURE', 'INSUFFICIENT_EVIDENCE', 'RESOURCE_LIMIT', 'INPUT_CHANGED'])
    assert.equal(validators.result(failure(code)), true, ajv.errorsText(validators.result.errors));
  const f = fixture('failed'); f.evidence.cases = [{ id: 'case-1', status: 'failed' }];
  assert.equal(validators.result(summarizeEvidence(update(f))), true, ajv.errorsText(validators.result.errors));
  const invalid = { ...capabilities(), status: 'incomplete' };
  assert.equal(validators.result(invalid), false);
  const frozen = readFileSync(new URL('../examples/node-pass.jsonl', import.meta.url));
  for (const line of frozen.toString('utf8').trimEnd().split('\n'))
    assert.equal(validators['node-record'](JSON.parse(line)), true, ajv.errorsText(validators['node-record'].errors));
  assert.equal(normalizeNodeCapture(frozen).summary.counts.passed, 1);
  assert.throws(() => normalizeNodeCapture(readFileSync(new URL('../examples/truncated.jsonl', import.meta.url))), { code: 'INCOMPLETE_CAPTURE' });
});
