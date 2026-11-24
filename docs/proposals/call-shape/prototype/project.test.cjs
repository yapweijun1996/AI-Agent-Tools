'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const ts = require('typescript');
const { inspectProject } = require('./project.cjs');

const options = { lib: ['es5'], types: [], strict: true, moduleResolution: 'node' };
const config = { compilerOptions: options, files: ['orders.ts'] };
function setup(t, settings = config) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'call-shape-loader-'));
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const root = path.join(parent, 'root');
  const write = (name, value) => {
    const p = path.join(root, name);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, typeof value === 'object' && !Buffer.isBuffer(value) ? JSON.stringify(value) : value);
  };
  write('tsconfig.json', settings);
  write('orders.ts', 'export function f(options: object) {}\nf({});\n');
  const inspect = (extra = {}, compiler = ts) => inspectProject(compiler, { root, project: 'tsconfig.json',
    declaration: { path: 'orders.ts', line: 1, column: 17 }, field: 'tenantId', argument: 1, ...extra });
  return { root, write, inspect };
}
const denied = code => ({ data: null, errorCode: code });

test('loads nested JSONC extends, include/exclude, path aliases and in-root dependency declarations without system host I/O', t => {
  const { root, write, inspect } = setup(t, { extends: './config/base.json', include: ['**/*.ts'], exclude: ['ignored', 'node_modules'] });
  write('config/base.json', '{ // base options\n "compilerOptions": {"strict": true, "moduleResolution": "node", "baseUrl":"..", "paths":{"@order":["orders.ts"]}, "lib":["es5"], "types":[]} }');
  write('src/calls.ts', "import { f as save } from '@order'; import { config } from 'fixture-dep'; save({tenantId: config()});");
  write('node_modules/fixture-dep/package.json', { types: 'types/index.d.ts' });
  write('node_modules/fixture-dep/types/index.d.ts', 'export declare function config(): string;');
  write('ignored/broken.ts', 'not valid {');
  for (const method of ['readFile','readDirectory','fileExists','directoryExists','getDirectories','realpath','writeFile','createDirectory']) {
    t.mock.method(ts.sys, method, () => assert.fail(`Unexpected system host operation: ${method}`));
  }
  const result = inspect();
  assert.equal(result.errorCode, null);
  assert.deepEqual(result.data.counts, { present: 1, missing: 1, unknown: 0 });
  assert.deepEqual(result.data.calls.map(x => x.path), ['orders.ts', 'src/calls.ts']);
  assert.ok(!fs.existsSync(path.join(root, 'orders.js')));
  for (const method of ['readFile','readDirectory','fileExists','directoryExists','getDirectories','realpath','writeFile','createDirectory']) {
    assert.equal(ts.sys[method].mock.callCount(), 0, method);
  }
});

test('uses the trusted compiler default libraries even without explicit lib or types', t => {
  const { inspect } = setup(t, { files: ['orders.ts'] });
  assert.deepEqual(inspect().data?.counts, { present: 0, missing: 1, unknown: 0 });
});

test('external config, include base, listed file, import and ancestor type package cannot supply project evidence', t => {
  const { root, write, inspect } = setup(t);
  write('../outside/base.json', config);
  write('../outside/sibling.ts', 'export const a = 1;');
  write('../node_modules/@types/outside/index.d.ts', 'declare const a: number;');
  const probes = [];
  for (const name of ['openSync','opendirSync','lstatSync','statSync']) {
    const original = fs[name];
    t.mock.method(fs, name, function(p, ...args) {
      const candidate = typeof p === 'string' && path.resolve(p);
      if (candidate && [path.resolve(root, '../outside'), path.resolve(root, '../node_modules')].some(d => candidate === d || candidate.startsWith(d + path.sep))) probes.push(name);
      return original.call(this, p, ...args);
    });
  }
  for (const cfg of [{ extends: '../outside/base.json' }, { files: ['orders.ts', '../outside/sibling.ts'] },
    { include: ['*.ts', '../outside/**/*.ts'] }, { compilerOptions: { types: ['outside'] }, files: ['orders.ts'] }]) {
    write('tsconfig.json', cfg);
    assert.deepEqual(inspect(), denied('RESOLUTION_INCOMPLETE'), JSON.stringify(cfg));
  }
  write('tsconfig.json', config);
  write('orders.ts', "export function f() {}\nimport '../outside/sibling';\nf();");
  assert.deepEqual(inspect(), denied('RESOLUTION_INCOMPLETE'));
  assert.deepEqual(probes, []);
});

for (const [title, settings, reason] of [
  ['missing root file', { files: ['orders.ts', 'absent.ts'] }, 'RESOLUTION_INCOMPLETE'],
  ['project references', { ...config, references: [{path: './other'}] }, 'UNSUPPORTED_SCOPE'],
  ['mixed JavaScript', { ...config, compilerOptions: {allowJs: true} }, 'UNSUPPORTED_SCOPE'],
  ['compiler plugins', { ...config, compilerOptions: {plugins: [{name: 'not-loaded'}]} }, 'UNSUPPORTED_SCOPE'],
  ['malformed config', '{ "files": [', 'INVALID_INPUT'],
]) test(`withholds results: ${title}`, t => assert.deepEqual(setup(t, settings).inspect(), denied(reason)));

test('missing side-effect import and triple-slash reference withhold otherwise usable rows', t => {
  const { write, inspect } = setup(t);
  write('orders.ts', "export function f() {}\nimport './missing';\nf();");
  assert.deepEqual(inspect(), denied('RESOLUTION_INCOMPLETE'));
  write('orders.ts', '/// <reference path="missing.d.ts" />\nexport function f() {}\nf();');
  assert.deepEqual(inspect({declaration: {path:'orders.ts',line:2,column:17}}), denied('RESOLUTION_INCOMPLETE'));
});

test('refuses a linked directory in imports, inherited config and enumeration', t => {
  const { root, write, inspect } = setup(t);
  write('../owned/base.json', config);
  write('../owned/dep.ts', 'export function g() {}');
  fs.symlinkSync(path.resolve(root, '../owned'), path.join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  write('orders.ts', "export function f() {}\nimport './linked/dep';");
  assert.deepEqual(inspect(), denied('UNSAFE_PATH'));
  write('tsconfig.json', { extends:'./linked/base.json' });
  assert.deepEqual(inspect(), denied('UNSAFE_PATH'));
  write('tsconfig.json', {include:['**/*.ts']});
  assert.deepEqual(inspect(), denied('UNSAFE_PATH'));
});

test('source and configuration share UTF-8 and per-file bounds', t => {
  const { write, inspect } = setup(t);
  write('orders.ts', Buffer.from([0xff]));
  assert.deepEqual(inspect(), denied('INVALID_INPUT'));
  write('orders.ts', Buffer.alloc(2_097_153, 32));
  assert.deepEqual(inspect(), denied('RESOURCE_LIMIT'));
  write('tsconfig.json', Buffer.alloc(2_097_153, 32));
  assert.deepEqual(inspect(), denied('RESOURCE_LIMIT'));
});

test('invalid dependency metadata is not silently treated as an index fallback', t => {
  const { write, inspect } = setup(t);
  write('orders.ts', "export function f() {}\nimport 'fixture-dep';");
  write('node_modules/fixture-dep/package.json', '{');
  write('node_modules/fixture-dep/index.d.ts', 'export declare const value: string;');
  assert.deepEqual(inspect(), denied('INVALID_INPUT'));
});

test('a change after program construction invalidates the complete inventory', t => {
  const { root, inspect } = setup(t);
  const compiler = Object.create(ts, { createProgram: { value(opts) {
    const program = ts.createProgram(opts);
    fs.appendFileSync(path.join(root, 'orders.ts'), '\nf({tenantId: 1});\n');
    return program;
  } } });
  assert.deepEqual(inspect({}, compiler), denied('INPUT_CHANGED'));
});
