import { InputError, parseJson, relativePath } from './input.js';
import { validate, checkCounts } from './contract.js';
import { LIMITS } from './result.js';

export function decode(bytes) {
  if (!(bytes instanceof Uint8Array)) throw new InputError('INVALID_INPUT');
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
  catch { throw new InputError('INVALID_ENCODING'); }
  return text.startsWith('\uFEFF') ? text.slice(1) : text;
}
export function normalizeUnified(bytes) {
  const value = parseJson(decode(bytes), LIMITS.max_depth);
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new InputError('INVALID_INPUT');
  if (value.schemaVersion !== undefined && value.schemaVersion !== '1.0.0') throw new InputError('UNSUPPORTED_INPUT');
  if (value.cases?.length > LIMITS.max_cases) throw new InputError('RESOURCE_LIMIT');
  validate(value, 'unified'); checkCounts(value.summary.counts);
  const ids = new Set();
  const caseCounts = { passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0 };
  const cases = (value.cases ?? []).map((item, index) => {
    if (ids.has(item.id)) throw new InputError('INVALID_INPUT');
    ids.add(item.id); caseCounts[item.status]++;
    if (item.location) relativePath(item.location.path);
    return { id: item.id, status: item.status, pointer: `/cases/${index}` };
  });
  if (Object.keys(caseCounts).some(k => caseCounts[k] > value.summary.counts[k])) throw new InputError('INVALID_INPUT');
  if (value.summary.success && value.summary.counts.failed > 0) throw new InputError('INVALID_INPUT');
  return { producer: value.producer, summary: value.summary, cases, pointer: '/summary' };
}

// Input is actual capture bytes, not a reserialized object. EOF is a framing
// check only; process termination remains caller-supplied and independent.
export function normalizeNodeCapture(capture) {
  if (!(capture instanceof Uint8Array)) throw new InputError('INVALID_INPUT');
  if (capture.byteLength > LIMITS.max_artifact_bytes) throw new InputError('RESOURCE_LIMIT');
  const text = decode(capture);
  if (!text.endsWith('\n')) throw new InputError('INCOMPLETE_CAPTURE');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length > LIMITS.max_records) throw new InputError('RESOURCE_LIMIT');
  let header, summary, summaryLine, ended = false;
  const cases = [], ids = new Set();
  for (let index = 0; index < lines.length; index++) {
    const record = parseJson(lines[index], LIMITS.max_depth);
    if (record === null || typeof record !== 'object' || Array.isArray(record)) throw new InputError('INVALID_INPUT');
    if (record.schemaVersion !== undefined && record.schemaVersion !== '1.0.0') throw new InputError('UNSUPPORTED_INPUT');
    if (!['header', 'case', 'summary', 'end', 'unsupported'].includes(record.type)) throw new InputError('UNSUPPORTED_INPUT');
    validate(record, 'nodeRecord');
    if (record.type === 'unsupported') throw new InputError('UNSUPPORTED_INPUT');
    if (ended) throw new InputError('INVALID_INPUT');
    if (index === 0) {
      if (record.type !== 'header') throw new InputError('INCOMPLETE_CAPTURE');
      header = record; continue;
    }
    if (record.type === 'header') throw new InputError('INVALID_INPUT');
    if (record.type === 'summary') {
      if (summary) throw new InputError('INVALID_INPUT');
      checkCounts(record.counts);
      if (record.success && record.counts.failed > 0) throw new InputError('INVALID_INPUT');
      summary = { success: record.success, counts: record.counts }; summaryLine = index + 1;
    } else if (record.type === 'case') {
      if (summary || ids.has(record.id)) throw new InputError('INVALID_INPUT');
      ids.add(record.id); cases.push({ id: record.id, status: record.status, line: index + 1 });
      if (cases.length > LIMITS.max_cases) throw new InputError('RESOURCE_LIMIT');
    } else if (record.type === 'end') ended = true;
  }
  if (!header || !summary || !ended) throw new InputError('INCOMPLETE_CAPTURE');
  const observed = { passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0 };
  for (const item of cases) observed[item.status]++;
  if (Object.keys(observed).some(k => observed[k] > summary.counts[k])) throw new InputError('INVALID_INPUT');
  return { producer: header.reporter, runtime: header.runtime, summary, cases, line: summaryLine };
}
