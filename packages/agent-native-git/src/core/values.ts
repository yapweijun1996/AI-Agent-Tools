import { AngitError } from '../shared.js';
import { canonical, parseJson } from '../json.js';

export function object(value: unknown, name: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new AngitError('STATE_INVALID', `${name} must be an object`);
  return value as Record<string, unknown>;
}
export function text(value: unknown, name: string): string {
  if (typeof value !== 'string') throw new AngitError('STATE_INVALID', `${name} must be a string`);
  return value;
}
export function integer(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new AngitError('STATE_INVALID', `${name} must be a nonnegative safe integer`);
  return value;
}
export function strings(value: unknown, name: string): string[] {
  if (!Array.isArray(value)) throw new AngitError('STATE_INVALID', `${name} must be an array`);
  return value.map((item: unknown) => text(item, name));
}
export function jsonObject(value: string, name: string): Record<string, unknown> { return object(parseJson(Buffer.from(value)), name); }
export function advance(value: number, name: string): number {
  if (value >= Number.MAX_SAFE_INTEGER) throw new AngitError('COUNTER_EXHAUSTED', `${name} is exhausted`);
  return value + 1;
}
export function bounded(value: unknown, fallback: number): number { return value === undefined ? fallback : integer(value, 'limit'); }
export function selector(value: string): string {
  if (!value || value !== value.normalize('NFC') || /[\\:*?\[\]"<>|\u0000-\u001f\u007f-\u009f]/u.test(value) || value.startsWith('/') || value.includes('//')) throw new AngitError('POLICY_DENIED', 'Invalid exact relative path selector');
  const parts = value.replace(/\/$/u, '').split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || part.toLowerCase() === '.git' && parts[0]?.toLowerCase() !== '.git' || /[. ]$/u.test(part) || /^(?:con|prn|aux|nul|clock\$|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/iu.test(part))) throw new AngitError('POLICY_DENIED', 'Unsupported path selector');
  return value;
}
export function covers(parent: string, child: string): boolean {
  return parent === child || parent.endsWith('/') && child.startsWith(parent);
}
export function intersects(a: string, b: string): boolean {
  const left = a.toLowerCase(), right = b.toLowerCase();
  return covers(left, right) || covers(right, left) || left.replace(/\/$/u, '') === right.replace(/\/$/u, '');
}
export function semanticOptions(options: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(options)) if (!['format', 'follow', 'waitMs', 'deadlineMs'].includes(key)) result[key] = value;
  return result;
}
export function encodedBytes(value: unknown): number { return Buffer.byteLength(canonical(value)); }
