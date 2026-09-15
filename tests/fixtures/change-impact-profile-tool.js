#!/usr/bin/env node
'use strict';

const scenario = process.argv[2];

function success(analysisStatus, extra = {}) {
  return {
    schemaVersion: '0.1-draft',
    ok: true,
    operation: 'file-impact',
    target: { file: 'src/app.ts' },
    graph: { nodes: [], edges: [] },
    impact: { direct: [], transitive: [] },
    analysis: {
      status: analysisStatus,
      project: { configPath: 'tsconfig.json', files: ['src/app.ts'] },
      limits: {
        depth: 2,
        maxNodes: 100,
        maxEdges: 300,
        maxPathsPerTarget: 1,
        maxOutputBytes: 1048576,
        maxFiles: 10000,
        maxFileBytes: 2097152,
        maxTotalFileBytes: 67108864,
        maxDiagnostics: 1000,
      },
      includedFiles: 1,
      excludedFiles: 0,
      limitations: analysisStatus === 'partial' ? ['A dynamic module target was not resolved.'] : [],
      stopReasons: analysisStatus === 'partial' ? ['PROVIDER_OBSERVATION_LIMIT'] : [],
      returnedNodes: 0,
      returnedEdges: 0,
    },
    unresolved: analysisStatus === 'partial' ? [{ code: 'DYNAMIC_MODULE', file: 'src/app.ts' }] : [],
    warnings: [],
    ...extra,
  };
}

const fixtures = {
  capabilities: {
    exit: 0,
    value: {
      schemaVersion: '0.1-draft',
      ok: true,
      operation: 'capabilities',
      capabilities: { operations: ['capabilities', 'file-impact', 'symbol-impact', 'changed-impact'] },
      unresolved: [],
      warnings: [],
    },
  },
  complete: { exit: 0, value: success('complete') },
  partial: { exit: 0, value: success('partial') },
  invalid: {
    exit: 2,
    value: {
      schemaVersion: '0.1-draft',
      ok: false,
      error: { code: 'INVALID_ARGUMENT', message: 'Exactly one project configuration is required.' },
      warnings: [],
    },
  },
  failure: {
    exit: 1,
    value: {
      schemaVersion: '0.1-draft',
      ok: false,
      error: { code: 'OUTPUT_LIMIT_EXCEEDED', message: 'The serialized output exceeded the configured limit.' },
      warnings: [],
    },
  },
  mismatch: { exit: 2, value: success('partial') },
  unknownSchema: { exit: 0, value: { ...success('complete'), schemaVersion: '0.2-draft' } },
  malformed: { exit: 0, raw: '{"schemaVersion":"0.1-draft"' },
  missing: { exit: 0, raw: '' },
};

const fixture = fixtures[scenario];
if (!fixture) process.exit(2);
if (fixture.raw !== undefined) process.stdout.write(fixture.raw);
else process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exit(fixture.exit);
