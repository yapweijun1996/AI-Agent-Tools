const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixture = path.join(__dirname, 'fixtures', 'change-impact-profile-tool.js');
const operations = new Set(['capabilities', 'file-impact', 'symbol-impact', 'changed-impact']);

function invalid(message) {
  throw new Error(`INVALID_CHANGE_IMPACT_PROTOCOL: ${message}`);
}

function consume(exitCode, stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    invalid('stdout is not exactly one JSON document');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('envelope must be an object');
  if (value.schemaVersion !== '0.1-draft' || typeof value.ok !== 'boolean' || (value.ok && !operations.has(value.operation))) {
    invalid('schema, ok, or operation is invalid');
  }
  if (!Array.isArray(value.warnings)) invalid('warnings must be an array');

  if (value.ok) {
    if (exitCode !== 0 || !Array.isArray(value.unresolved)) invalid('usable result requires exit 0 and unresolved observations');
    if (value.operation === 'capabilities') return { kind: 'capabilities', value };
    if (!value.analysis || !['complete', 'partial'].includes(value.analysis.status)) {
      invalid('analysis result requires a complete/partial status');
    }
    if (!Array.isArray(value.analysis.stopReasons)) invalid('partial evidence fields are missing');
    return { kind: value.analysis.status === 'partial' ? 'partial_success' : 'complete', value };
  }

  if (!Number.isInteger(exitCode) || ![1, 2].includes(exitCode) || !value.error || typeof value.error.code !== 'string') {
    invalid('error requires exit 1/2 and a stable error code');
  }
  return { kind: 'error', code: value.error.code, value };
}

function runFixture(scenario) {
  const child = spawnSync(process.execPath, [fixture, scenario], { encoding: 'utf8' });
  assert.equal(child.error, undefined, child.error && child.error.message);
  return { exitCode: child.status, stdout: child.stdout };
}

test('accepts capabilities and preserves complete/partial analyses as native success', () => {
  const capabilities = runFixture('capabilities');
  assert.equal(consume(capabilities.exitCode, capabilities.stdout).kind, 'capabilities');

  const complete = runFixture('complete');
  assert.equal(consume(complete.exitCode, complete.stdout).kind, 'complete');

  const partial = runFixture('partial');
  const result = consume(partial.exitCode, partial.stdout);
  assert.equal(result.kind, 'partial_success');
  assert.equal(result.value.ok, true);
  assert.equal(result.value.analysis.status, 'partial');
});

test('uses native error codes for invalid and operation failures', () => {
  const invalidResult = runFixture('invalid');
  assert.equal(consume(invalidResult.exitCode, invalidResult.stdout).code, 'INVALID_ARGUMENT');

  const failure = runFixture('failure');
  assert.equal(consume(failure.exitCode, failure.stdout).code, 'OUTPUT_LIMIT_EXCEEDED');
});

test('rejects malformed, unknown, and exit/status-mismatched output', () => {
  for (const scenario of ['mismatch', 'unknownSchema', 'malformed', 'missing']) {
    const run = runFixture(scenario);
    assert.throws(() => consume(run.exitCode, run.stdout), /INVALID_CHANGE_IMPACT_PROTOCOL/);
  }
});
