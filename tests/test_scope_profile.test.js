const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixturePath = path.join(__dirname, 'fixtures', 'scope-profile-tool.js');

function runFixture(name) {
  const child = spawnSync(process.execPath, [fixturePath, name], { encoding: 'utf8' });
  return { exitCode: child.status, stdout: child.stdout };
}

function consume(exitCode, stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    throw new Error('native stdout is not JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('native result is not an object');
  if (value.schemaVersion !== '1' || !['complete', 'partial', 'error'].includes(value.status)) throw new Error('native status is unknown');
  if (!value.data || typeof value.data !== 'object' || !Array.isArray(value.diagnostics) || !value.truncation || typeof value.truncation.truncated !== 'boolean' || !Array.isArray(value.truncation.reasons) || !value.stats || typeof value.stats !== 'object') {
    throw new Error('native result shape is incomplete');
  }
  if (value.status === 'complete' && exitCode === 0) return { kind: 'complete', value };
  if (value.status === 'partial' && exitCode === 0) return { kind: 'partial', value };
  if (value.status === 'error' && [1, 2].includes(exitCode)) return { kind: 'error', value };
  throw new Error('native status and exit code disagree');
}

test('preserves complete, partial, and error native semantics', () => {
  assert.equal(consume(...Object.values(runFixture('complete'))).kind, 'complete');
  assert.equal(consume(...Object.values(runFixture('partial'))).kind, 'partial');
  assert.equal(consume(...Object.values(runFixture('error'))).kind, 'error');
  assert.equal(consume(...Object.values(runFixture('invalid'))).kind, 'error');
});

test('rejects malformed, unknown, and status/exit-mismatched results', () => {
  assert.throws(() => consume(...Object.values(runFixture('malformed'))), /incomplete/);
  assert.throws(() => consume(...Object.values(runFixture('unknown'))), /unknown/);
  const complete = runFixture('complete');
  assert.throws(() => consume(1, complete.stdout), /disagree/);
});

module.exports = { consume, runFixture };
