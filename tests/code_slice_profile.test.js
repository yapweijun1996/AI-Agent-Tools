const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');

const fixture = path.join(__dirname, 'fixtures', 'code-slice-profile-tool.js');
const schemaVersions = new Set(['1.0', '1.1']);

function invalid(message) {
  throw new Error(`INVALID_CODE_SLICE_PROTOCOL: ${message}`);
}

function validateWarnings(value) {
  if (!Array.isArray(value)) invalid('warnings must be an array');
  for (const warning of value) {
    if (!warning || typeof warning !== 'object' || typeof warning.code !== 'string' || typeof warning.message !== 'string') {
      invalid('warning shape is invalid');
    }
  }
}

function consume(exitCode, stdout) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    invalid('stdout is not exactly one JSON document');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid('envelope must be an object');
  if (!schemaVersions.has(value.schemaVersion) || typeof value.ok !== 'boolean' || typeof value.operation !== 'string') {
    invalid('schema version, ok, or operation is invalid');
  }
  validateWarnings(value.warnings);
  if (value.schemaVersion === '1.1' && (value.operation !== 'cli' || value.ok !== false)) {
    invalid('v1.1 is reserved for CLI usage errors');
  }
  if (value.schemaVersion === '1.0' && value.operation === 'cli') {
    invalid('CLI usage errors must use v1.1');
  }

  if (value.ok) {
    if (exitCode !== 0 || !value.result || typeof value.result !== 'object' || Array.isArray(value.result)) {
      invalid('native success requires exit 0 and a result object');
    }
    const hasMore = value.result.page && value.result.page.hasMore === true;
    const truncated = value.warnings.some((warning) => warning.code === 'OUTLINE_TRUNCATED');
    return { kind: hasMore || truncated ? 'bounded_success' : 'complete', value };
  }

  if (exitCode === 0 || typeof value.error !== 'object' || !value.error || typeof value.error.code !== 'string') {
    invalid('native failure requires a nonzero exit and stable error code');
  }
  return { kind: 'error', code: value.error.code, value };
}

function runFixture(scenario) {
  const child = spawnSync(process.execPath, [fixture, scenario], { encoding: 'utf8' });
  assert.equal(child.error, undefined, child.error && child.error.message);
  return { exitCode: child.status, stdout: child.stdout };
}

test('accepts complete and bounded-success native Code Slice results', () => {
  const complete = runFixture('success');
  assert.equal(consume(complete.exitCode, complete.stdout).kind, 'complete');

  const bounded = runFixture('outlineTruncated');
  assert.equal(consume(bounded.exitCode, bounded.stdout).kind, 'bounded_success');
});

test('uses native error codes as the semantic authority', () => {
  const cliError = runFixture('cliError');
  const cliResult = consume(cliError.exitCode, cliError.stdout);
  assert.equal(cliResult.kind, 'error');
  assert.equal(cliResult.code, 'INVALID_ARGUMENT');

  const operationError = runFixture('operationError');
  const operationResult = consume(operationError.exitCode, operationError.stdout);
  assert.equal(operationResult.kind, 'error');
  assert.equal(operationResult.code, 'SYMBOL_AMBIGUOUS');
});

test('rejects malformed, unknown, and exit/status-mismatched native output', () => {
  for (const scenario of ['mismatch', 'unknownSchema', 'malformed', 'missing']) {
    const run = runFixture(scenario);
    assert.throws(() => consume(run.exitCode, run.stdout), /INVALID_CODE_SLICE_PROTOCOL/);
  }
});
