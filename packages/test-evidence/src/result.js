import metadata from '../package.json' with { type: 'json' };

export const VERSION = metadata.version;
export const LIMITS = Object.freeze({
  max_request_bytes: 262144, max_artifact_bytes: 4194304, max_total_bytes: 8388608,
  max_checks: 256, max_runs: 256, max_records: 100000, max_cases: 20000,
  max_depth: 32, max_anomalies: 500, max_output_bytes: 262144,
});
const SCOPE = 'Explicit caller-selected test artifacts and declared source/environment identities; no execution or producer authentication';
const MESSAGES = Object.freeze({
  INVALID_INPUT: 'Input does not match the documented contract.',
  INVALID_ENCODING: 'Input is not strict UTF-8.',
  UNSAFE_PATH: 'Input violates the regular-file root boundary.',
  INPUT_IO: 'An explicit input could not be read.',
  INTERNAL_ERROR: 'Analysis could not complete.',
  UNSUPPORTED_INPUT: 'The requested evidence format or version is unsupported.',
  INCOMPLETE_CAPTURE: 'The capture lacks a complete supported final summary.',
  INSUFFICIENT_EVIDENCE: 'Required checks cannot be strictly accepted from this evidence.',
  RESOURCE_LIMIT: 'Input or output exceeds a fixed contract limit.',
  INPUT_CHANGED: 'An input changed during the bounded read.',
});
export function envelope(data) {
  return { schema_version: '1.0.0', tool: { id: 'agent-test-evidence', version: VERSION },
    status: 'ok', complete: true, data, errors: [], warnings: [], meta: { scope: SCOPE, limits: { ...LIMITS } } };
}
export function failure(code) {
  if (!Object.hasOwn(MESSAGES, code)) code = 'INTERNAL_ERROR';
  const status = ['UNSUPPORTED_INPUT', 'INCOMPLETE_CAPTURE', 'INSUFFICIENT_EVIDENCE', 'RESOURCE_LIMIT', 'INPUT_CHANGED'].includes(code) ? 'incomplete' : 'error';
  return { ...envelope(null), status, complete: false, errors: [{ code, message: MESSAGES[code] }] };
}
export function encodeResult(result) {
  let encoded;
  try { encoded = JSON.stringify(result); } catch { encoded = JSON.stringify(failure('INTERNAL_ERROR')); }
  if (typeof encoded !== 'string') encoded = JSON.stringify(failure('INTERNAL_ERROR'));
  if (Buffer.byteLength(encoded) + 1 > LIMITS.max_output_bytes) encoded = JSON.stringify(failure('RESOURCE_LIMIT'));
  return encoded;
}
export function bounded(result) { return JSON.parse(encodeResult(result)); }
export function exitCode(result) {
  if (result.status === 'ok') return 0;
  if (result.status === 'incomplete') return 3;
  return ({ INVALID_INPUT: 2, INVALID_ENCODING: 2, UNSAFE_PATH: 4 })[result.errors[0]?.code] ?? 1;
}
