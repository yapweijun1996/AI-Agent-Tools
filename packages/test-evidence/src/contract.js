import { InputError } from './input.js';
import request from '../schema/request.schema.json' with { type: 'json' };
import unified from '../schema/unified.schema.json' with { type: 'json' };
import nodeRecord from '../schema/node-record.schema.json' with { type: 'json' };

// This deliberately small validator implements only the keywords used by input
// schemas. Ajv independently checks these same contracts in development tests.
function matches(value, schema) {
  if (schema.oneOf) return schema.oneOf.filter(s => matches(value, s)).length === 1;
  if (Object.hasOwn(schema, 'const') && value !== schema.const) return false;
  if (schema.enum && !schema.enum.includes(value)) return false;
  if (schema.type === 'null' && value !== null) return false;
  if (schema.type === 'boolean' && typeof value !== 'boolean') return false;
  if (schema.type === 'string' && (typeof value !== 'string' ||
      value.length < (schema.minLength ?? 0) || value.length > (schema.maxLength ?? Infinity) ||
      (schema.pattern && !new RegExp(schema.pattern).test(value)))) return false;
  if (schema.type === 'integer' && (!Number.isSafeInteger(value) ||
      value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity))) return false;
  if (schema.type === 'array' && (!Array.isArray(value) || value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity) || !value.every(v => matches(v, schema.items)))) return false;
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
    if (schema.required.some(k => !Object.hasOwn(value, k))) return false;
    for (const key of Reflect.ownKeys(value)) {
      if (!Object.hasOwn(schema.properties, key) || !matches(value[key], schema.properties[key])) return false;
    }
  }
  return true;
}

export function validate(value, kind) {
  const schema = { request, unified, nodeRecord }[kind];
  if (!matches(value, schema)) throw new InputError('INVALID_INPUT');
}

export function checkCounts(counts) {
  const total = ['passed', 'failed', 'skipped', 'todo', 'cancelled'].reduce((n, key) => n + counts[key], 0);
  if (!Number.isSafeInteger(total) || total !== counts.tests) throw new InputError('INVALID_INPUT');
}
