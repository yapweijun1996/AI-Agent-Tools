#!/usr/bin/env node
'use strict';

const fixtures = {
  capabilities: {
    exit: 0,
    value: {
      schemaVersion: '1',
      status: 'complete',
      data: { operations: ['capabilities', 'discover', 'plan', 'explain'] },
      diagnostics: [],
      truncation: { truncated: false, reasons: [] },
      stats: {},
    },
  },
  complete: {
    exit: 0,
    value: {
      schemaVersion: '1',
      status: 'complete',
      data: { minimum: [], recommended: [], release: [] },
      diagnostics: [],
      truncation: { truncated: false, reasons: [] },
      stats: { files: 1 },
    },
  },
  partial: {
    exit: 0,
    value: {
      schemaVersion: '1',
      status: 'partial',
      data: { minimum: [], recommended: [], release: [] },
      diagnostics: [{ code: 'RESOURCE_LIMIT', severity: 'warning', message: 'bounded' }],
      truncation: { truncated: true, reasons: ['RESOURCE_LIMIT'] },
      stats: { files: 10000 },
    },
  },
  error: {
    exit: 1,
    value: {
      schemaVersion: '1',
      status: 'error',
      data: {},
      diagnostics: [{ code: 'PATH_OUTSIDE_ROOT', severity: 'error', message: 'outside root' }],
      truncation: { truncated: false, reasons: [] },
      stats: {},
    },
  },
  invalid: {
    exit: 2,
    value: {
      schemaVersion: '1',
      status: 'error',
      data: {},
      diagnostics: [{ code: 'INVALID_REQUEST', severity: 'error', message: 'invalid request' }],
      truncation: { truncated: false, reasons: [] },
      stats: {},
    },
  },
  malformed: {
    exit: 0,
    value: { schemaVersion: '1', status: 'complete' },
  },
  unknown: {
    exit: 0,
    value: {
      schemaVersion: '1',
      status: 'unknown',
      data: {},
      diagnostics: [],
      truncation: { truncated: false, reasons: [] },
      stats: {},
    },
  },
};

const name = process.argv[2] || 'complete';
const fixture = fixtures[name];
if (!fixture) process.exit(2);
process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exitCode = fixture.exit;
