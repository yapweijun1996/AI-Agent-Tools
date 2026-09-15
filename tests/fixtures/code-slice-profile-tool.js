#!/usr/bin/env node
'use strict';

const scenario = process.argv[2];

function success(operation, result, warnings = []) {
  return {
    schemaVersion: '1.0',
    ok: true,
    operation,
    result,
    warnings,
    meta: { engine: 'fixture', parserMs: 1 },
  };
}

function failure(schemaVersion, operation, code, message) {
  return {
    schemaVersion,
    ok: false,
    operation,
    error: { code, message, recoverable: true },
    warnings: [],
  };
}

const fixtures = {
  success: {
    exit: 0,
    value: success('symbol', {
      kind: 'function',
      name: 'calculateTotal',
      range: { startLine: 1, endLine: 3 },
      code: 'function calculateTotal() {}',
    }),
  },
  outlineTruncated: {
    exit: 0,
    value: success('outline', {
      symbols: [{ kind: 'function', name: 'calculateTotal' }],
      page: { total: 201, returned: 200, offset: 0, limit: 200, truncated: true, hasMore: true, nextOffset: 200 },
    }, [{ code: 'OUTLINE_TRUNCATED', message: 'More symbols remain on the next page.' }]),
  },
  cliError: {
    exit: 2,
    value: failure('1.1', 'cli', 'INVALID_ARGUMENT', 'Unknown flag: --bad-flag'),
  },
  operationError: {
    exit: 7,
    value: failure('1.0', 'symbol', 'SYMBOL_AMBIGUOUS', 'The selector matched multiple symbols.'),
  },
  mismatch: {
    exit: 7,
    value: success('symbol', { kind: 'function', name: 'calculateTotal' }),
  },
  unknownSchema: {
    exit: 0,
    value: { ...success('symbol', { kind: 'function', name: 'calculateTotal' }), schemaVersion: '2.0' },
  },
  malformed: { exit: 0, raw: '{"schemaVersion":"1.0"' },
  missing: { exit: 0, raw: '' },
};

const fixture = fixtures[scenario];
if (!fixture) process.exit(2);
if (fixture.raw !== undefined) process.stdout.write(fixture.raw);
else process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exit(fixture.exit);
