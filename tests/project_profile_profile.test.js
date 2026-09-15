const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixture = path.join(__dirname, 'fixtures', 'project-profile-profile-tool.js');
const statuses = new Set(['complete', 'partial', 'unsupported', 'error']);

function invalid(message) {
  throw new Error(`INVALID_PROJECT_PROFILE_PROTOCOL: ${message}`);
}

function validateWarnings(value) {
  if (!Array.isArray(value)) invalid('warnings must be an array');
  for (const warning of value) {
    if (!warning || typeof warning !== 'object' || typeof warning.code !== 'string' || typeof warning.severity !== 'string') {
      invalid('warning shape is invalid');
    }
  }
}

function consume(exitCode, stdout, { strict = false } = {}) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    invalid('stdout is not exactly one JSON document');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('profile must be an object');
  if (value.schemaVersion !== '1.0' || !/^\d+\.\d+\.\d+$/.test(value.toolVersion) || !statuses.has(value.status)) {
    invalid('schema, tool version, or status is invalid');
  }
  if (!value.project || value.project.root !== '.' || !value.coverage || !['complete', 'partial'].includes(value.coverage.status)) {
    invalid('project root or coverage is invalid');
  }
  if (!value.commands || !Array.isArray(value.commands.test) || value.commands.test.some((command) => command.execution !== 'not_run')) {
    invalid('declared commands must remain not_run');
  }
  validateWarnings(value.warnings);

  if (value.status === 'complete') {
    if (exitCode === 0 && value.coverage.status === 'complete') return { kind: 'complete', value };
    if (strict && exitCode === 2 && value.warnings.some((warning) => ['warning', 'error'].includes(warning.severity))) {
      return { kind: 'strict_rejected', value };
    }
    invalid('complete profile requires exit 0 unless strict policy rejects diagnostics');
  }
  if (value.status === 'partial') {
    if (exitCode !== 2 || value.coverage.status !== 'partial') invalid('partial profile requires exit 2 and partial coverage');
    return { kind: 'partial', value };
  }
  if (value.status === 'unsupported') {
    if (exitCode !== 2) invalid('unsupported profile requires exit 2');
    return { kind: 'unsupported', value };
  }
  if (exitCode !== 1) invalid('error profile requires exit 1');
  return { kind: 'error', value };
}

function runFixture(scenario) {
  const child = spawnSync(process.execPath, [fixture, scenario], { encoding: 'utf8' });
  assert.equal(child.error, undefined, child.error && child.error.message);
  return { exitCode: child.status, stdout: child.stdout };
}

test('distinguishes complete, partial, and unsupported project profiles', () => {
  for (const [scenario, expected] of [['complete', 'complete'], ['partial', 'partial'], ['unsupported', 'unsupported']]) {
    const run = runFixture(scenario);
    assert.equal(consume(run.exitCode, run.stdout).kind, expected);
  }
});

test('preserves fatal error status and strict-mode policy separately', () => {
  const error = runFixture('error');
  assert.equal(consume(error.exitCode, error.stdout).kind, 'error');

  const strict = runFixture('strictRejected');
  assert.equal(consume(strict.exitCode, strict.stdout, { strict: true }).kind, 'strict_rejected');
  assert.throws(() => consume(strict.exitCode, strict.stdout), /INVALID_PROJECT_PROFILE_PROTOCOL/);
});

test('rejects malformed, unknown, and status/coverage-mismatched profiles', () => {
  for (const scenario of ['mismatch', 'unknownSchema', 'missingCoverage', 'malformed', 'missing']) {
    const run = runFixture(scenario);
    assert.throws(() => consume(run.exitCode, run.stdout), /INVALID_PROJECT_PROFILE_PROTOCOL/);
  }
});
