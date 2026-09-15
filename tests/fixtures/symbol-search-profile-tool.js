#!/usr/bin/env node
'use strict';

const envelope = (status, data, diagnostics = []) => ({
  schemaVersion: '1',
  status,
  data,
  diagnostics,
  truncation: { truncated: false, reasons: [] },
  stats: {},
});

const fixtures = {
  capabilities: { exit: 0, value: envelope('complete', { matches: [], capabilities: { schemaVersion: '1', languages: { typescript: { operations: { capabilities: 'full', search: 'full' }, notes: [] } } } }) },
  complete: { exit: 0, value: envelope('complete', { matches: [] }) },
  partial: { exit: 0, value: { ...envelope('partial', { matches: [] }), truncation: { truncated: true, reasons: ['TIMEOUT'] } } },
  error: { exit: 1, value: envelope('error', { matches: [] }, [{ code: 'INVALID_ROOT', message: 'fixture', severity: 'error' }]) },
  invalid: { exit: 2, value: envelope('error', { matches: [] }, [{ code: 'INVALID_REQUEST', message: 'fixture', severity: 'error' }]) },
  malformed: { exit: 0, value: { schemaVersion: '1', status: 'complete' } },
  unknown: { exit: 0, value: envelope('unknown', { matches: [] }) },
};

const fixture = fixtures[process.argv[2] || 'complete'];
if (!fixture) process.exit(2);
process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exitCode = fixture.exit;
