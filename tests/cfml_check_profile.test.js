const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixturePath = path.join(__dirname, 'fixtures', 'cfml-check-profile-tool.js');

function runFixture(name) {
  const child = spawnSync(process.execPath, [fixturePath, name], { encoding: 'utf8' });
  return { exitCode: child.status, stdout: child.stdout };
}

function consume(exitCode, stdout, operation = 'check') {
  const value = JSON.parse(stdout);
  if (!value || value.schema_version !== '1.0.0' || !value.tool || value.tool.id !== 'agent-cfml-check' || !['ok', 'incomplete', 'error'].includes(value.status) || typeof value.complete !== 'boolean' || !Array.isArray(value.errors) || !Array.isArray(value.warnings) || !value.meta) throw new Error('native envelope is invalid');
  if (value.status === 'ok' && exitCode === 0 && value.complete && value.errors.length === 0 && value.data !== null) return { kind: operation === 'capabilities' ? 'capabilities' : 'complete', value };
  if (value.status === 'incomplete' && exitCode === 3 && !value.complete && value.data === null && value.errors.length > 0) return { kind: 'incomplete', value };
  if (value.status === 'error' && [1, 2, 4].includes(exitCode) && !value.complete && value.data === null && value.errors.length > 0) return { kind: 'error', value };
  throw new Error('native status and exit code disagree');
}

test('preserves capabilities, completed violations, incomplete, and error semantics', () => {
  assert.equal(consume(...Object.values(runFixture('capabilities')), 'capabilities').kind, 'capabilities');
  assert.equal(consume(...Object.values(runFixture('pass'))).kind, 'complete');
  assert.equal(consume(...Object.values(runFixture('violations'))).kind, 'complete');
  assert.equal(consume(...Object.values(runFixture('incomplete'))).kind, 'incomplete');
  assert.equal(consume(...Object.values(runFixture('error'))).kind, 'error');
});

test('rejects malformed and status/exit-mismatched envelopes', () => {
  assert.throws(() => consume(...Object.values(runFixture('malformed'))), /invalid/);
  assert.throws(() => consume(...Object.values(runFixture('mismatch'))), /disagree/);
});

module.exports = { consume, runFixture };
