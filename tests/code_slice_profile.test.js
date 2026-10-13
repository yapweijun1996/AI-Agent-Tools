const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { validateNativeProfile } = require('../bin/ait.js');

const fixture = path.join(__dirname, 'fixtures', 'code-slice-profile-tool.js');
const profile = { protocol: 'code-slice-native-v1' };

function runFixture(scenario) {
  const child = spawnSync(process.execPath, [fixture, scenario], { encoding: 'utf8' });
  assert.equal(child.error, undefined, child.error && child.error.message);
  return { exitCode: child.status, stdout: child.stdout };
}

test('accepts complete and bounded-success native Code Slice results', () => {
  const complete = runFixture('success');
  assert.deepEqual(validateNativeProfile(profile, complete.stdout, complete.exitCode), { passed: true, classification: 'complete' });

  const bounded = runFixture('outlineTruncated');
  assert.deepEqual(validateNativeProfile(profile, bounded.stdout, bounded.exitCode), { passed: true, classification: 'bounded_success' });
});

test('accepts native CLI and operation errors without interpreting the numeric exit as completeness', () => {
  for (const scenario of ['cliError', 'operationError']) {
    const native = runFixture(scenario);
    assert.deepEqual(validateNativeProfile(profile, native.stdout, native.exitCode), { passed: true, classification: 'error' });
  }
});

test('rejects malformed, unknown, and exit/status-mismatched native output', () => {
  for (const scenario of ['mismatch', 'unknownSchema', 'malformed', 'missing']) {
    const run = runFixture(scenario);
    const result = validateNativeProfile(profile, run.stdout, run.exitCode);
    assert.equal(result.passed, false);
    assert.equal(result.classification, 'protocol_error');
  }
});

test('rejects malformed native success fields through the production validator', () => {
  const success = { schemaVersion: '1.0', ok: true, operation: 'outline', warnings: [], result: {} };
  const missingOperation = { ...success };
  delete missingOperation.operation;
  for (const [name, value] of [
    ['missing operation', missingOperation],
    ['non-string operation', { ...success, operation: 1 }],
    ['missing result', { schemaVersion: '1.0', ok: true, operation: 'outline', warnings: [] }],
    ['array result', { ...success, result: [] }],
    ['null result', { ...success, result: null }],
    ['non-array warnings', { ...success, warnings: {} }],
    ['null warning', { ...success, warnings: [null] }],
    ['array warning', { ...success, warnings: [[]] }],
    ['missing warning code', { ...success, warnings: [{ message: 'advisory' }] }],
    ['non-string warning message', { ...success, warnings: [{ code: 'ADVISORY', message: 1 }] }],
    ['v1.1 core success', { ...success, schemaVersion: '1.1' }],
    ['v1.0 CLI success', { ...success, operation: 'cli' }],
  ]) {
    const result = validateNativeProfile(profile, JSON.stringify(value), 0);
    assert.equal(result.passed, false, name);
    assert.equal(result.classification, 'protocol_error', name);
  }
});

test('preserves independent pagination signals, advisory additions and native capabilities', () => {
  const success = { schemaVersion: '1.0', ok: true, operation: 'outline', warnings: [], result: {} };
  for (const [value, classification] of [
    [{ ...success, result: { page: { hasMore: true } } }, 'bounded_success'],
    [{ ...success, warnings: [{ code: 'OUTLINE_TRUNCATED', message: 'More symbols remain.' }] }, 'bounded_success'],
    [{ ...success, warnings: [{ code: 'ADVISORY', message: 'Additional evidence.', details: {} }], extra: {} }, 'complete'],
    [{ schemaVersion: '1.0', ok: true, operation: 'capabilities', warnings: [] }, 'complete'],
  ]) {
    assert.deepEqual(validateNativeProfile(profile, JSON.stringify(value), 0), { passed: true, classification });
  }
});

test('rejects native error envelopes with missing codes, successful exits or incompatible versions', () => {
  const failure = { schemaVersion: '1.1', ok: false, operation: 'cli', warnings: [], error: { code: 'INVALID_ARGUMENT' } };
  for (const [value, exitCode] of [
    [failure, 0],
    [{ ...failure, error: {} }, 2],
    [{ ...failure, schemaVersion: '1.0' }, 2],
    [{ ...failure, operation: 'outline' }, 2],
    [{ ...failure, warnings: [null] }, 2],
  ]) {
    const result = validateNativeProfile(profile, JSON.stringify(value), exitCode);
    assert.equal(result.passed, false);
    assert.equal(result.classification, 'protocol_error');
  }
});
