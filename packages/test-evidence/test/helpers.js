import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const bytes = value => Buffer.from(JSON.stringify(value));
export const counts = (status = 'passed', n = 1) => ({ tests: n, suites: 0, passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0, [status]: n });
export function fixture(status = 'passed') {
  const request = JSON.parse(readFileSync(new URL('../examples/pass-request.json', import.meta.url)));
  const evidence = { schemaVersion: '1.0.0', producer: request.runs[0].producer, summary: { success: status !== 'failed', counts: counts(status) } };
  return { request, artifacts: [{ id: 'capture-1', path: 'examples/pass.json', bytes: bytes(evidence) }], evidence };
}
export function bundle(f) { return { request: f.request, artifacts: f.artifacts }; }
export function update(f) { f.artifacts[0].bytes = bytes(f.evidence); return bundle(f); }
