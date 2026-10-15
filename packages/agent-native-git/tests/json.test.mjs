import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonical, parseJson, readJsonFile, sha256 } from '../dist/json.js';

const bytes = (text) => Buffer.from(text, 'utf8');
test('strict JSON rejects ambiguous keys, invalid UTF8 and unrepresentable numbers', () => {
  for (const input of ['{"a":1,"\\u0061":2}', '{"x":{"b":0,"b":1}}', '9007199254740992', '1.0', '1e0', '["\\ud800"]', '["\\udc00"]', '\ufeff{}', '{} false', '{"x":undefined}']) {
    assert.throws(() => parseJson(bytes(input)), (error) => error.code === 'INVALID_JSON', input);
  }
  assert.throws(() => parseJson(Uint8Array.from([0x22, 0xc0, 0xaf, 0x22])), (error) => error.exitCode === 2);
  assert.throws(() => parseJson(bytes('{"x":1}'), 6), (error) => error.code === 'INPUT_LIMIT');
  assert.throws(() => parseJson(bytes('['.repeat(33) + '0' + ']'.repeat(33))), (error) => error.code === 'INVALID_JSON');
  assert.throws(() => parseJson(bytes('"' + 'x'.repeat(1_048_576) + '"')), (error) => error.code === 'INPUT_LIMIT');
  const parsed = parseJson(bytes('{"__proto__":{"polluted":true},"valid":-9007199254740991,"unicode":"\\ud834\\udd1e"}'));
  assert.equal(Object.getPrototypeOf(parsed), null);
  assert.equal(parsed.__proto__.polluted, true);
  assert.equal({}.polluted, undefined);
  assert.equal(parsed.valid, -9007199254740991);
  assert.equal(parsed.unicode, '𝄞');
});
test('semantic hashes ignore object order but preserve arrays and Unicode codepoint order', () => {
  const a = { '\u{10000}': 2, '\ue000': 1, nested: { z: false, a: null } };
  const b = { nested: { a: null, z: false }, '\ue000': 1, '\u{10000}': 2 };
  assert.equal(sha256(canonical(a)), sha256(canonical(b)));
  assert.ok(canonical(a).indexOf('') < canonical(a).indexOf('𐀀'));
  assert.notEqual(sha256(canonical([1, 2])), sha256(canonical([2, 1])));
  let invoked = false;
  const accessor = Object.defineProperty({}, 'value', { get() { invoked = true; return 1; }, enumerable: true });
  assert.throws(() => canonical(accessor), (error) => error.code === 'INVALID_JSON');
  assert.equal(invoked, false);
  const sparse = []; sparse.length = 1;
  const extra = [1]; Object.defineProperty(extra, '00', { value: 1 });
  const cycle = {}; cycle.self = cycle;
  for (const value of [sparse, extra, cycle, new Date(), { x: undefined }, { x: Symbol('x') }, ['\ud800']]) assert.throws(() => canonical(value), (error) => error.code === 'INVALID_JSON');
});
test('file input admits exact bounded bytes and denies alternate streams and devices', () => {
  const dir = mkdtempSync(join(tmpdir(), 'angit json '));
  try {
    const file = join(dir, 'spec.json'); const payload = bytes('{"x":123}'); writeFileSync(file, payload);
    const result = readJsonFile(file, payload.length);
    assert.equal(result.value.x, 123); assert.equal(result.sha256, sha256(payload));
    assert.throws(() => readJsonFile(file, payload.length - 1), (error) => error.code === 'INPUT_LIMIT');
    for (const path of [file + ':alternate', 'C:relative.json', '\\\\server\\share\\spec.json', 'C:/NUL.json']) assert.throws(() => readJsonFile(path), (error) => error.code === 'UNSAFE_PATH');
  } finally { rmSync(dir, { recursive: true }); }
});
