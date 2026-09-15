#!/usr/bin/env node
'use strict';

const scenario = process.argv[2];

function envelope(status, complete, data, errors = [], warnings = []) {
  return {
    schema_version: '1.0.0',
    tool: { id: 'fixture-hub-tool', version: '0.1.0' },
    status,
    complete,
    data,
    errors,
    warnings,
    meta: {
      scope: 'One deterministic fixture scenario',
      limits: { max_input_bytes: 1024, max_output_bytes: 4096 },
    },
  };
}

const fixtures = {
  success: { exit: 0, value: envelope('ok', true, { checked: 1, findings: [] }) },
  findings: {
    exit: 0,
    value: envelope('ok', true, { checked: 1, findings: [{ code: 'STYLE_WARNING' }] }, [], [
      { code: 'NON_BLOCKING_FINDING', message: 'The completed check found a non-blocking finding.' },
    ]),
  },
  partial: {
    exit: 3,
    value: envelope('incomplete', false, null, [
      { code: 'INCOMPLETE_RESULT', message: 'Only part of the requested scope was analyzed.' },
    ], [{ code: 'PARTIAL_DATA_WITHHELD', message: 'Partial data is withheld by envelope version 1.' }]),
  },
  ambiguous: {
    exit: 3,
    value: envelope('incomplete', false, null, [
      { code: 'AMBIGUOUS_INPUT', message: 'The input matches more than one supported interpretation.' },
    ]),
  },
  unsupported: {
    exit: 3,
    value: envelope('incomplete', false, null, [
      { code: 'UNSUPPORTED_INPUT', message: 'The selected format is unsupported.' },
    ]),
  },
  limit: {
    exit: 3,
    value: envelope('incomplete', false, null, [
      { code: 'RESOURCE_LIMIT', message: 'The configured input limit was reached.' },
    ]),
  },
  invalid: {
    exit: 2,
    value: envelope('error', false, null, [
      { code: 'INVALID_INPUT', message: 'The requested input is invalid.' },
    ]),
  },
  internal: {
    exit: 1,
    value: envelope('error', false, null, [
      { code: 'INTERNAL_ERROR', message: 'The fixture simulated an internal failure.' },
    ]),
  },
  invalidPartialData: {
    exit: 3,
    value: envelope('incomplete', false, { partial: true }, [
      { code: 'INCOMPLETE_RESULT', message: 'This fixture intentionally violates the v1 data rule.' },
    ]),
  },
  mismatch: { exit: 3, value: envelope('ok', true, { checked: 1 }) },
  malformed: { exit: 0, raw: '{"schema_version":"1.0.0"' },
  missing: { exit: 0, raw: '' },
  native: {
    exit: 0,
    raw: JSON.stringify({ schemaVersion: '1.0.0', ok: true, result: { checked: 1 } }),
  },
};

const fixture = fixtures[scenario];
if (!fixture) process.exit(2);
if (fixture.raw !== undefined) process.stdout.write(fixture.raw);
else process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exit(fixture.exit);
