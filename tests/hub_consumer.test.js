const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixture = path.join(__dirname, 'fixtures', 'hub-contract-tool.js');
const statuses = new Set(['ok', 'incomplete', 'error']);
const exitCodes = new Set([0, 1, 2, 3, 4]);

function fail(message) {
  throw new Error(`INVALID_ENVELOPE: ${message}`);
}

function validateIssueList(value, field) {
  if (!Array.isArray(value)) fail(`${field} must be an array`);
  for (const issue of value) {
    if (!issue || typeof issue !== 'object' || typeof issue.code !== 'string' || typeof issue.message !== 'string') {
      fail(`${field} contains an invalid issue`);
    }
  }
}

function consume(exitCode, stdout) {
  if (!exitCodes.has(exitCode)) fail(`unsupported exit code: ${exitCode}`);
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    fail('stdout is not exactly one JSON document');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('envelope must be an object');
  if (value.schema_version !== '1.0.0') fail('unsupported schema version');
  if (!value.tool || typeof value.tool.id !== 'string' || typeof value.tool.version !== 'string') {
    fail('tool identity is missing');
  }
  if (!statuses.has(value.status) || typeof value.complete !== 'boolean') fail('status or complete is invalid');
  validateIssueList(value.errors, 'errors');
  validateIssueList(value.warnings, 'warnings');
  if (!value.meta || typeof value.meta.scope !== 'string' || !value.meta.limits || typeof value.meta.limits !== 'object') {
    fail('bounded meta is missing');
  }
  for (const limit of Object.values(value.meta.limits)) {
    if (!Number.isFinite(limit) || limit < 0) fail('limits must be finite non-negative numbers');
  }

  if (value.status === 'ok') {
    if (exitCode !== 0 || value.complete !== true || !value.data || typeof value.data !== 'object' || Array.isArray(value.data) || value.errors.length !== 0) {
      fail('ok requires exit 0, complete true, data, and no errors');
    }
  } else if (value.status === 'incomplete') {
    if (exitCode !== 3 || value.complete !== false || value.data !== null || value.errors.length === 0) {
      fail('incomplete requires exit 3, complete false, null data, and an error');
    }
  } else if (exitCode === 0 || exitCode === 3 || value.complete !== false || value.data !== null || value.errors.length === 0) {
    fail('error requires exit 1, 2, or 4, complete false, null data, and an error');
  }
  return value;
}

function runFixture(scenario) {
  const child = spawnSync(process.execPath, [fixture, scenario], { encoding: 'utf8' });
  assert.equal(child.error, undefined, child.error && child.error.message);
  return { exitCode: child.status, stdout: child.stdout };
}

test('accepts complete success even when the completed check reports findings', () => {
  for (const scenario of ['success', 'findings']) {
    const run = runFixture(scenario);
    const output = consume(run.exitCode, run.stdout);
    assert.equal(output.status, 'ok');
    assert.equal(output.complete, true);
  }
});

test('accepts bounded incomplete outcomes without exposing partial data', () => {
  for (const scenario of ['partial', 'ambiguous', 'unsupported', 'limit']) {
    const run = runFixture(scenario);
    const output = consume(run.exitCode, run.stdout);
    assert.equal(output.status, 'incomplete');
    assert.equal(output.complete, false);
    assert.equal(output.data, null);
  }
});

test('distinguishes invalid input and internal failure from incomplete analysis', () => {
  for (const scenario of ['invalid', 'internal']) {
    const run = runFixture(scenario);
    assert.equal(consume(run.exitCode, run.stdout).status, 'error');
  }
});

test('rejects partial data, exit/status mismatches, malformed output, and missing output', () => {
  for (const scenario of ['invalidPartialData', 'mismatch', 'malformed', 'missing', 'native']) {
    const run = runFixture(scenario);
    assert.throws(() => consume(run.exitCode, run.stdout), /INVALID_ENVELOPE/);
  }
});
