import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { Ajv2020 } from 'ajv/dist/2020.js';
import { AngitError, ASSET_ROOT, MAX_JSON_BYTES } from './shared.js';
import type { JsonValue } from './shared.js';

function invalid(message = 'Input is not strict bounded JSON.'): never { throw new AngitError('INVALID_JSON', message, 2); }
function scalarString(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) invalid('Unpaired Unicode surrogate is not supported.');
    } else if (c >= 0xdc00 && c <= 0xdfff) invalid('Unpaired Unicode surrogate is not supported.');
  }
}
export function parseJson(bytes: Uint8Array, maxBytes = MAX_JSON_BYTES): JsonValue {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_JSON_BYTES) invalid('Invalid JSON byte limit.');
  return parseBoundedJson(bytes, maxBytes);
}
/** Internal control envelopes have overhead beyond the public 1 MiB input ceiling. */
export function parseFrameJson(bytes: Uint8Array): JsonValue {
  return parseBoundedJson(bytes, 2_097_152);
}
function parseBoundedJson(bytes: Uint8Array, maxBytes: number): JsonValue {
  if (bytes.byteLength > maxBytes) throw new AngitError('INPUT_LIMIT', 'Input exceeds its byte limit.', 2);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) invalid('JSON byte-order mark is not supported.');
  let text: string;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new AngitError('INVALID_ENCODING', 'Input is not valid UTF-8.', 2); }
  let i = 0;
  const space = (): void => { while (text[i] === ' ' || text[i] === '\t' || text[i] === '\r' || text[i] === '\n') i++; };
  const string = (): string => {
    if (text[i] !== '"') invalid();
    const start = i++;
    while (i < text.length) {
      const c = text[i++]!;
      if (c === '"') {
        let value: string;
        try { value = JSON.parse(text.slice(start, i)) as string; } catch { return invalid(); }
        scalarString(value);
        return value;
      }
      if (c.charCodeAt(0) < 0x20) invalid();
      if (c === '\\') {
        const escaped = text[i++];
        if (escaped === 'u') {
          for (let n = 0; n < 4; n++) if (!/[0-9a-fA-F]/.test(text[i++] ?? '')) invalid();
        } else if (escaped === undefined || !'"\\/bfnrt'.includes(escaped)) invalid();
      }
    }
    return invalid();
  };
  const value = (depth: number): JsonValue => {
    space();
    const c = text[i];
    if (c === '"') return string();
    if (c === '{') {
      if (depth >= 32) invalid('Input nesting exceeds 32 levels.');
      i++; space();
      const object = Object.create(null) as Record<string, JsonValue>;
      if (text[i] === '}') { i++; return object; }
      while (true) {
        space(); const key = string();
        if (Object.hasOwn(object, key)) invalid('Duplicate decoded JSON key.');
        space(); if (text[i++] !== ':') invalid();
        object[key] = value(depth + 1);
        space(); const delimiter = text[i++];
        if (delimiter === '}') return object;
        if (delimiter !== ',') invalid();
      }
    }
    if (c === '[') {
      if (depth >= 32) invalid('Input nesting exceeds 32 levels.');
      i++; space(); const array: JsonValue[] = [];
      if (text[i] === ']') { i++; return array; }
      while (true) {
        array.push(value(depth + 1)); space();
        const delimiter = text[i++];
        if (delimiter === ']') return array;
        if (delimiter !== ',') invalid();
      }
    }
    for (const [literal, result] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(literal, i)) { i += literal.length; return result; }
    }
    if (c === '-' || (c !== undefined && c >= '0' && c <= '9')) {
      const negative = c === '-'; if (negative) i++;
      const first = text[i];
      if (first === undefined || first < '0' || first > '9') invalid();
      let number = 0;
      if (first === '0') { i++; if ((text[i] ?? '') >= '0' && (text[i] ?? '') <= '9') invalid(); }
      else while (text[i] !== undefined && text[i]! >= '0' && text[i]! <= '9') {
        number = number * 10 + (text.charCodeAt(i++) - 48);
        if (!Number.isSafeInteger(number)) invalid('JSON integers must be safe integers.');
      }
      if (text[i] === '.' || text[i] === 'e' || text[i] === 'E') invalid('Floating-point JSON numbers are not supported.');
      return negative ? -number : number;
    }
    return invalid();
  };
  const result = value(0); space(); if (i !== text.length) invalid(); return result;
}

export function sha256(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
function compareUnicode(a: string, b: string): number {
  let i = 0, j = 0;
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!, y = b.codePointAt(j)!;
    if (x !== y) return x < y ? -1 : 1;
    i += x > 0xffff ? 2 : 1; j += y > 0xffff ? 2 : 1;
  }
  return i < a.length ? 1 : j < b.length ? -1 : 0;
}
export function canonical(input: unknown): string {
  const seen = new Set<object>();
  const encode = (value: unknown, depth: number): string => {
    if (typeof value === 'string') { scalarString(value); return JSON.stringify(value); }
    if (value === null || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number') { if (!Number.isSafeInteger(value)) invalid('Only safe integer values may be hashed.'); return JSON.stringify(value); }
    if (typeof value !== 'object' || value === null || depth >= 32 || seen.has(value)) invalid('Unsupported or cyclic JSON value.');
    seen.add(value);
    try {
      if (Array.isArray(value)) {
        const keys = Reflect.ownKeys(value);
        if (keys.length !== value.length + 1 || keys.some((key) => key !== 'length' && (typeof key !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length))) invalid();
        const items: string[] = [];
        for (let i = 0; i < value.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
          if (!descriptor || !('value' in descriptor)) invalid('JSON arrays must not contain holes or accessors.');
          items.push(encode(descriptor.value, depth + 1));
        }
        return '[' + items.join(',') + ']';
      }
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) invalid();
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key !== 'string')) invalid();
      const fields: string[] = [];
      for (const key of (keys as string[]).sort(compareUnicode)) {
        scalarString(key); const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
        if (!('value' in descriptor)) invalid('JSON objects must not contain accessors.');
        fields.push(JSON.stringify(key) + ':' + encode(descriptor.value, depth + 1));
      }
      return '{' + fields.join(',') + '}';
    } finally { seen.delete(value); }
  };
  return encode(input, 0);
}

function inputPath(path: string): string {
  if (typeof path !== 'string' || path.length === 0 || path.length > 4096 || /[\u0000-\u001f]/.test(path) || path.startsWith('\\\\') || /^[A-Za-z]:(?![\\/])/.test(path)) {
    throw new AngitError('UNSAFE_PATH', 'Input path is outside the supported local-file scope.', 2);
  }
  const absolute = resolve(path);
  if (absolute.slice(2).includes(':') || absolute.split(/[\\/]/).some((p) => /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(p.replace(/[ .]+$/g, '')))) {
    throw new AngitError('UNSAFE_PATH', 'Device and alternate-stream paths are not supported.', 2);
  }
  return absolute;
}
export function readJsonFile(path: string, maxBytes = MAX_JSON_BYTES): { value: JsonValue; bytes: Buffer; sha256: string } {
  const absolute = inputPath(path);
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_JSON_BYTES) invalid('Invalid file byte limit.');
  let fd: number | undefined;
  try {
    const before = lstatSync(absolute, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink()) throw new AngitError('UNSAFE_PATH', 'A regular non-symlink input is required.', 2);
    if (before.size > BigInt(maxBytes)) throw new AngitError('INPUT_LIMIT', 'Input exceeds its byte limit.', 2);
    fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
    const admitted = fstatSync(fd, { bigint: true });
    const same = (a: typeof before, b: typeof before): boolean => a.isFile() && b.isFile() && a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeNs === b.mtimeNs && a.ctimeNs === b.ctimeNs;
    if (!same(before, admitted)) throw new AngitError('INPUT_CHANGED', 'Input identity changed during capture.', 3);
    const buffer = Buffer.allocUnsafe(Number(admitted.size) + 1);
    let total = 0;
    while (total < buffer.length) {
      const count = readSync(fd, buffer, total, buffer.length - total, null);
      if (count === 0) break;
      total += count;
    }
    const after = fstatSync(fd, { bigint: true });
    const named = lstatSync(absolute, { bigint: true });
    if (total !== Number(admitted.size) || !same(admitted, after) || !same(after, named)) throw new AngitError('INPUT_CHANGED', 'Input changed during capture.', 3);
    const bytes = buffer.subarray(0, total);
    return { value: parseJson(bytes, maxBytes), bytes, sha256: sha256(bytes) };
  } catch (error) {
    if (error instanceof AngitError) throw error;
    throw new AngitError('INPUT_IO', 'Unable to capture the requested local input.', 2);
  } finally { if (fd !== undefined) closeSync(fd); }
}

export function readAsset(relativePath: string): Buffer {
  if (!/^[A-Za-z0-9_./-]+$/.test(relativePath) || relativePath.split('/').includes('..')) throw new AngitError('INTERNAL_ERROR', 'Invalid package asset path.', 6);
  const file = join(ASSET_ROOT, relativePath);
  let fd: number | undefined;
  try {
    fd = openSync(file, constants.O_RDONLY);
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > MAX_JSON_BYTES) throw new Error('Unsupported asset');
    const buffer = Buffer.allocUnsafe(stat.size + 1); let offset = 0;
    while (offset < buffer.length) { const n = readSync(fd, buffer, offset, buffer.length - offset, null); if (!n) break; offset += n; }
    if (offset !== stat.size) throw new Error('Asset changed');
    return buffer.subarray(0, offset);
  } catch { throw new AngitError('ASSET_UNAVAILABLE', 'Required package asset is missing or incomplete.', 6); }
  finally { if (fd !== undefined) closeSync(fd); }
}
let validator: Ajv2020 | undefined;
const schemaIds = new Map<string, string>();
function schemas(): Ajv2020 {
  if (validator) return validator;
  const ajv = new Ajv2020({ strict: true, allErrors: false, allowUnionTypes: true, validateFormats: false });
  const add = (directory: string): void => {
    for (const name of readdirSync(join(ASSET_ROOT, directory), { withFileTypes: true })) {
      const path = directory + '/' + name.name;
      if (name.isDirectory()) add(path);
      else if (name.isFile() && name.name.endsWith('.schema.json')) {
        const schema = parseJson(readAsset(path));
        if (schema === null || Array.isArray(schema) || typeof schema !== 'object' || typeof schema['$id'] !== 'string') throw new AngitError('ASSET_UNAVAILABLE', 'Invalid package schema.', 6);
        ajv.addSchema(schema, schema['$id']); schemaIds.set(path.replace(/^schemas\//, ''), schema['$id']);
      }
    }
  };
  add('schemas'); validator = ajv; return ajv;
}
export function validateSchema(name: string, value: unknown): void {
  // Reject direct-API accessors/cycles/non-JSON numbers before Ajv reads them.
  if (Buffer.byteLength(canonical(value)) > MAX_JSON_BYTES) throw new AngitError('INPUT_LIMIT', 'Value exceeds its JSON byte limit.', 2);
  const ajv = schemas(); const id = schemaIds.get(name.replace(/^schemas\//, ''));
  if (!id) throw new AngitError('ASSET_UNAVAILABLE', 'Requested schema is unavailable.', 6);
  const validate = ajv.getSchema(id);
  if (!validate) throw new AngitError('ASSET_UNAVAILABLE', 'Requested schema could not be loaded.', 6);
  if (!validate(value)) throw new AngitError('INVALID_INPUT', 'Input does not match the declared schema.', 2);
}
