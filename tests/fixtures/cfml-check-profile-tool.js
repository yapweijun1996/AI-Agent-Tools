#!/usr/bin/env node
'use strict';

const base = (status, complete, data, errors = []) => ({
  schema_version: '1.0.0',
  tool: { id: 'agent-cfml-check', version: '0.1.1' },
  status,
  complete,
  data,
  errors,
  warnings: [],
  meta: { scope: 'fixture', limits: {} },
});

const fixtures = {
  capabilities: { exit: 0, value: base('ok', true, { profile: 'cfml-structure-v1', operations: ['capabilities', 'check'], extensions: ['.cfm', '.cfc'], supported_tags: {}, limits: {}, exclusions: [] }) },
  pass: { exit: 0, value: base('ok', true, { profile: 'cfml-structure-v1', source: {}, verdict: 'pass', checks: [], exclusions: [], findings: [] }) },
  violations: { exit: 0, value: base('ok', true, { profile: 'cfml-structure-v1', source: {}, verdict: 'violations', checks: [], exclusions: [], findings: [{ code: 'MISMATCHED_CLOSE', message: 'fixture', location: {}, related_open: null }] }) },
  incomplete: { exit: 3, value: base('incomplete', false, null, [{ code: 'UNSUPPORTED_SYNTAX', message: 'fixture' }]) },
  error: { exit: 2, value: base('error', false, null, [{ code: 'INVALID_ARGUMENT', message: 'fixture' }]) },
  malformed: { exit: 0, value: { schema_version: '1.0.0', status: 'ok' } },
  mismatch: { exit: 0, value: base('incomplete', false, null, [{ code: 'UNSUPPORTED_SYNTAX', message: 'fixture' }]) },
};

const fixture = fixtures[process.argv[2] || 'pass'];
if (!fixture) process.exit(2);
process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exitCode = fixture.exit;
