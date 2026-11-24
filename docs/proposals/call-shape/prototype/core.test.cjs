'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript'); // Trusted test dependency, never resolved from the inspected root.
const { inspectProgram } = require('./core.cjs');
const { inspectProject } = require('./project.cjs');
const fixtures = path.join(__dirname, '../fixtures');
const { cases } = require('../fixtures/cases.json');
const expected = require('../fixtures/expected.json');
let temp, prepared;

before(() => {
  assert.equal(ts.version, '5.8.2');
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'call-shape-core-'));
  prepared = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', path.join(fixtures, 'prepare.py')], {
    encoding: 'utf8', env: { ...process.env, TMP: temp, TEMP: temp, TMPDIR: temp },
  }).trim();
});
after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });

// Test-only disk host for owned synthetic inputs. Not a product project loader.
function load(root) {
  const configPath = path.join(root, 'tsconfig.json');
  const { config, error } = ts.readConfigFile(configPath, ts.sys.readFile);
  assert.ok(!error);
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, root, undefined, configPath);
  assert.equal(parsed.errors.length, 0);
  return ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options, projectReferences: parsed.projectReferences });
}

function requestFor(root, selector, argument = 1) {
  const [, file, line, column] = /^(.*):(\d+):(\d+)$/.exec(selector);
  return { root, project: 'tsconfig.json',
    declaration: { path: file, line: Number(line), column: Number(column) }, field: 'tenantId', argument };
}

for (const c of cases) for (const mode of ['core', 'project']) test(`${mode} golden data/refusal: ${c.id}`, () => {
  const root = path.join(prepared, c.id, 'root');
  const request = requestFor(root, c.declaration, c.argument);
  const golden = expected[c.expected];
  const result = mode === 'core' ? inspectProgram(ts, load(root), request) : inspectProject(ts, request);
  assert.deepEqual(result, { data: golden.data, errorCode: golden.errorCodes[0] ?? null });
});

function example(text) {
  const root = fs.mkdtempSync(path.join(temp, 'additional-'));
  fs.writeFileSync(path.join(root, 'sample.ts'), text);
  fs.writeFileSync(path.join(root, 'tsconfig.json'), JSON.stringify({ files: ['sample.ts'],
    compilerOptions: { noEmit: true, types: [], lib: ['es5'] } }));
  const program = load(root);
  return (selector = 'sample.ts:1:10') => inspectProgram(ts, program, requestFor(root, selector));
}

test('classifies written keys, including optional, generic and nested calls, despite argument type errors', () => {
  const run = example(`function f<T>(x: { tenantId: string }): void {}
(f)?.<string>(({ get tenantId() { return 1; } } as any)!);
f(({ tenantId() {} } satisfies object));
f(<any>{ "tenant\\u0049d": undefined });
f(f({}));`);
  const { data, errorCode } = run();
  assert.equal(errorCode, null);
  assert.deepEqual(data.calls.map(c => [c.line, c.column, c.reason]), [
    [2, 2, 'explicit_key'], [3, 1, 'explicit_key'], [4, 1, 'explicit_key'],
    [5, 1, 'not_object_literal'], [5, 3, 'literal_without_key'],
  ]);
});

test('only a declaration name is selectable; columns cannot spill into the next line', () => {
  const run = example('function f() {}\nf();\nclass Box { method() {} }');
  for (const pos of ['1:1', '1:11', '1:999', '2:1', '99:1']) {
    assert.deepEqual(run(`sample.ts:${pos}`), { data: null, errorCode: 'INVALID_INPUT' });
  }
  assert.deepEqual(run('sample.ts:3:13'), { data: null, errorCode: 'UNSUPPORTED_SCOPE' });
});

test('unresolved import cannot silently remove an eligible identifier call', () => {
  const run = example("function f() {}\nimport { nope } from './absent';\nf(); nope();");
  assert.deepEqual(run(), { data: null, errorCode: 'RESOLUTION_INCOMPLETE' });
});

test('parse recovery cannot produce a successful empty inventory', () => {
  const run = example('function f() {}\nf({');
  assert.deepEqual(run(), { data: null, errorCode: 'RESOLUTION_INCOMPLETE' });
});
