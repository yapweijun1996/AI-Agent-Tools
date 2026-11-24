'use strict';

const { before, after, test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { cases } = require('../fixtures/cases.json');
const expected = require('../fixtures/expected.json');
const { render } = require('./cli.cjs');
const cli = path.join(__dirname, 'cli.cjs');
const compiler = require.resolve('typescript'); // Test host, never the child project's search path.
const maxBytes = 1024 * 1024;
let temp, prepared;

before(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), 'call-shape-cli-'));
  prepared = execFileSync(process.platform === 'win32' ? 'python' : 'python3', ['-B', path.join(__dirname, '../fixtures/prepare.py')], {
    encoding: 'utf8', env: { ...process.env, TMP: temp, TEMP: temp, TMPDIR: temp },
  }).trim();
});
after(() => { if (temp) fs.rmSync(temp, { recursive: true, force: true }); });

function invoke(args, cwd = temp, entry = compiler) {
  const child = spawnSync(process.execPath, [cli, ...args], { cwd, timeout: 20_000, maxBuffer: 2 * maxBytes,
    env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', CALL_SHAPE_TYPESCRIPT: entry }, stdio: ['ignore', 'pipe', 'pipe'] });
  assert.ifError(child.error);
  assert.equal(child.signal, null);
  assert.equal(child.stderr.toString(), '');
  assert.ok(child.stdout.length > 0 && child.stdout.length <= maxBytes);
  // Preserve a BOM so it cannot silently pass the JSON framing check.
  return { code: child.status, text: new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(child.stdout) };
}

function envelope(child) {
  const out = JSON.parse(child.text);
  assert.equal(child.text, JSON.stringify(out) + '\n');
  assert.deepEqual(Object.keys(out).sort(), ['complete', 'data', 'errors', 'meta', 'schema_version', 'status', 'tool', 'warnings']);
  assert.equal(out.schema_version, '1.0.0');
  assert.deepEqual(out.tool, { id: 'agent-call-shape', version: 'unpackaged' });
  assert.match(out.meta.scope, /direct identifier calls/i);
  assert.deepEqual(out.meta.limits, { max_directory_entries: 50000, max_observed_paths: 50000, max_config_files: 128,
    max_files: 10000, max_file_bytes: 2097152, max_input_bytes: 67108864, max_depth: 128, max_matching_calls: 5000,
    max_output_bytes: maxBytes, max_processing_ms: 10000 });
  assert.deepEqual(out.warnings, []);
  assert.equal(out.complete, child.code === 0);
  assert.equal(out.status, child.code === 0 ? 'ok' : child.code === 3 ? 'incomplete' : 'error');
  if (child.code === 0) assert.deepEqual(out.errors, []);
  else {
    assert.equal(out.data, null);
    assert.equal(out.errors.length, 1);
    assert.match(out.errors[0].message, /^[A-Za-z ,.-]{1,120}$/);
    assert.ok(Buffer.byteLength(child.text) < 2048);
  }
  return out;
}

function caseArgs(id) {
  return JSON.parse(fs.readFileSync(path.join(prepared, id, 'argv.json'), 'utf8'));
}
for (const c of cases) test(`CLI process golden: ${c.id}`, () => {
  const child = invoke(caseArgs(c.id), path.join(prepared, c.id, 'root'));
  const golden = expected[c.expected];
  assert.equal(child.code, golden.exitCode);
  const out = envelope(child);
  assert.deepEqual({ status: out.status, complete: out.complete, data: out.data, errorCodes: out.errors.map(e => e.code) },
    { status: golden.status, complete: golden.complete, data: golden.data, errorCodes: golden.errorCodes });
});

function refusal(child, code, errorCode) {
  assert.equal(child.code, code);
  assert.equal(envelope(child).errors[0].code, errorCode);
}
test('standalone help and version do not require a configured compiler or project', () => {
  const result = invoke(['--help'], temp, '');
  assert.equal(result.code, 0);
  assert.match(result.text, /inspect --root/);
  assert.deepEqual(invoke(['--version'], temp, ''), { code: 0, text: 'agent-call-shape unpackaged\n' });
});
test('JSON is also the default; a relative root is resolved from the caller', () => {
  const args = caseArgs('binding').filter(a => a !== '--json');
  args[args.indexOf('--root') + 1] = 'binding/root';
  assert.deepEqual(envelope(invoke(args, prepared)).data, expected.binding.data);
});
test('malformed invocations get exit 2 without project access or flag echo', () => {
  const args = caseArgs('binding');
  const set = (flag, val) => args.with(args.indexOf(flag) + 1, val);
  for (const invalid of [[], ['--help', '--json'], ['other'], [...args, 'private-value'], [...args, '--extra'],
    [...args, '--json'], [...args, '--root', 'other'], args.slice(0, -1), args.slice(0, -2), set('--field', '--json'),
    set('--field', '__proto__'), set('--field', 'nested.key'), set('--argument', '1e0'), set('--argument', '0'),
    set('--argument', '9007199254740992'), set('--declaration', 'orders.ts:1'), set('--declaration', 'orders.ts:0:1')]) {
    refusal(invoke(invalid, temp, ''), 2, 'INVALID_INPUT');
  }
});
test('compiler setup and input I/O failures do not expose paths or fall back to project modules', () => {
  const args = caseArgs('binding');
  const root = path.join(prepared, 'binding/root');
  const local = path.join(root, 'node_modules/typescript/lib/typescript.js');
  fs.mkdirSync(path.dirname(local), { recursive: true });
  fs.writeFileSync(local, 'process.exitCode = 99; process.stdout.write("unexpected module load");');
  refusal(invoke(args, root, ''), 1, 'INTERNAL_ERROR');
  refusal(invoke(args, root, local), 4, 'UNSAFE_PATH');
  refusal(invoke(args, root, './node_modules/typescript/lib/typescript.js'), 1, 'INTERNAL_ERROR');
  refusal(invoke(args.with(args.indexOf('--root') + 1, 'absent-root'), root), 1, 'INPUT_IO');
});
test('stdout cap includes the entire UTF-8 envelope and exactly one LF', () => {
  const output = data => render({ data, errorCode: null });
  const budget = maxBytes - Buffer.byteLength(output({ value: '' }).text);
  const value = '🚀'.repeat(Math.floor(budget / 4)) + 'a'.repeat(budget % 4);
  const exact = output({ value });
  assert.equal(exact.exitCode, 0);
  assert.equal(Buffer.byteLength(exact.text), maxBytes);
  const over = { value: value + 'x' };
  assert.ok(Buffer.byteLength(JSON.stringify(over)) < maxBytes);
  const result = output(over);
  refusal({ code: result.exitCode, text: result.text }, 3, 'RESOURCE_LIMIT');
});
