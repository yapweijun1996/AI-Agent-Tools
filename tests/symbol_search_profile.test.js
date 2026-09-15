const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixturePath = path.join(__dirname, 'fixtures', 'symbol-search-profile-tool.js');

function runFixture(name) {
  const child = spawnSync(process.execPath, [fixturePath, name], { encoding: 'utf8' });
  return { exitCode: child.status, stdout: child.stdout };
}

function consume(exitCode, stdout, operation = 'search') {
  const value = JSON.parse(stdout);
  if (!value || value.schemaVersion !== '1' || !['complete', 'partial', 'error'].includes(value.status) || !value.data || !Array.isArray(value.data.matches) || !Array.isArray(value.diagnostics) || !value.truncation || typeof value.truncation.truncated !== 'boolean' || !Array.isArray(value.truncation.reasons) || !value.stats) throw new Error('native envelope is invalid');
  if (value.status === 'complete' && exitCode === 0) return { kind: operation === 'capabilities' ? 'capabilities' : 'complete', value };
  if (value.status === 'partial' && exitCode === 0) return { kind: 'partial', value };
  if (value.status === 'error' && [1, 2].includes(exitCode)) return { kind: 'error', value };
  throw new Error('native status and exit code disagree');
}

test('preserves capabilities, complete, partial, and error native semantics', () => {
  assert.equal(consume(...Object.values(runFixture('capabilities')), 'capabilities').kind, 'capabilities');
  assert.equal(consume(...Object.values(runFixture('complete'))).kind, 'complete');
  assert.equal(consume(...Object.values(runFixture('partial'))).kind, 'partial');
  assert.equal(consume(...Object.values(runFixture('error'))).kind, 'error');
  assert.equal(consume(...Object.values(runFixture('invalid'))).kind, 'error');
});

test('rejects malformed and unknown status envelopes', () => {
  assert.throws(() => consume(...Object.values(runFixture('malformed'))), /invalid/);
  assert.throws(() => consume(...Object.values(runFixture('unknown'))), /invalid/);
  const complete = runFixture('complete');
  assert.throws(() => consume(1, complete.stdout), /disagree/);
});

module.exports = { consume, runFixture };
