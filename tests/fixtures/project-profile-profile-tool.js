#!/usr/bin/env node
'use strict';

const scenario = process.argv[2];

const emptyCommands = {
  build: [],
  test: [],
  lint: [],
  typecheck: [],
  dev: [],
  start: [],
  format: [],
};

const emptyCoverageCategories = {
  repository: 'complete',
  ecosystems: 'complete',
  packageManager: 'complete',
  runtimes: 'complete',
  workspace: 'not_applicable',
  commands: 'complete',
  scripts: 'complete',
  entrypoints: 'complete',
  configs: 'complete',
  instructions: 'complete',
  ci: 'complete',
};

function profile(status, coverageStatus, warnings = []) {
  return {
    schemaVersion: '1.0',
    toolVersion: '0.1.2',
    status,
    project: {
      root: '.',
      name: 'fixture-project',
      kind: 'single-package',
      repository: { kind: 'unknown', evidence: [] },
      evidence: [],
    },
    ecosystems: [],
    packageManager: {
      name: null,
      version: null,
      confidence: 'unknown',
      invocationAvailable: false,
      evidence: [],
    },
    runtimes: [],
    workspace: {
      enabled: false,
      manager: null,
      declarations: [],
      packages: [],
      total: null,
      returned: 0,
      truncated: false,
    },
    commands: {
      ...emptyCommands,
      test: [{
        cwd: '.',
        script: 'test',
        argv: null,
        source: 'package.json#/scripts/test',
        confidence: 'confirmed',
        declaredByProject: true,
        execution: 'not_run',
        evidence: [],
      }],
    },
    scripts: [{ cwd: '.', names: ['test'], evidence: [] }],
    entrypoints: [],
    configs: [],
    instructions: [],
    ci: [],
    evidence: [],
    warnings,
    coverage: {
      status: coverageStatus,
      strategies: ['root-sentinels'],
      budgets: {
        workspacePackages: 100,
        directoryDepth: 12,
        directoryEntries: 10000,
        metadataFiles: 1000,
        metadataFileBytes: 262144,
        metadataTotalBytes: 8388608,
        outputBytes: 1048576,
        sourceStringBytes: 4096,
      },
      usage: { directoryEntries: 1, metadataFiles: 0, metadataBytes: 0 },
      categories: coverageStatus === 'partial'
        ? { ...emptyCoverageCategories, packageManager: 'partial', commands: 'partial' }
        : emptyCoverageCategories,
      truncated: {
        workspace: false,
        output: false,
        directoryEntries: false,
        metadataFiles: false,
        metadataBytes: false,
        depth: false,
      },
    },
  };
}

const fixtures = {
  complete: { exit: 0, value: profile('complete', 'complete') },
  partial: {
    exit: 2,
    value: profile('partial', 'partial', [{
      code: 'PACKAGE_MANAGER_CONFLICT',
      severity: 'warning',
      message: 'Manager evidence conflicts.',
      path: '.',
      evidence: [],
    }]),
  },
  unsupported: {
    exit: 2,
    value: profile('unsupported', 'complete', [{
      code: 'UNSUPPORTED_ECOSYSTEM',
      severity: 'warning',
      message: 'Only a sentinel-supported ecosystem was detected.',
      path: 'pyproject.toml',
      evidence: [],
    }]),
  },
  error: {
    exit: 1,
    value: profile('error', 'partial', [{
      code: 'ROOT_UNREADABLE',
      severity: 'error',
      message: 'The selected root is not readable.',
      path: null,
      evidence: [],
    }]),
  },
  strictRejected: {
    exit: 2,
    value: profile('complete', 'complete', [{
      code: 'NO_TEST_COMMAND',
      severity: 'warning',
      message: 'No exact test script was declared.',
      path: 'package.json',
      evidence: [],
    }]),
  },
  mismatch: { exit: 0, value: profile('partial', 'partial') },
  unknownSchema: { exit: 0, value: { ...profile('complete', 'complete'), schemaVersion: '2.0' } },
  missingCoverage: {
    exit: 0,
    value: (() => {
      const value = profile('complete', 'complete');
      delete value.coverage;
      return value;
    })(),
  },
  malformed: { exit: 0, raw: '{"schemaVersion":"1.0"' },
  missing: { exit: 0, raw: '' },
};

const fixture = fixtures[scenario];
if (!fixture) process.exit(2);
if (fixture.raw !== undefined) process.stdout.write(fixture.raw);
else process.stdout.write(`${JSON.stringify(fixture.value)}\n`);
process.exit(fixture.exit);
