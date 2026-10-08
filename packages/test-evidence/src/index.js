import { createHash } from 'node:crypto';
import { InputError, parseJson, relativePath } from './input.js';
import { validate } from './contract.js';
import { decode, normalizeUnified, normalizeNodeCapture } from './normalize.js';
import { envelope, failure, bounded, LIMITS } from './result.js';
export { capabilities, summarizeEvidence, verifyEvidence, normalizeNodeCapture };
export { encodeResult, exitCode } from './result.js';

const zeroCounts = () => ({ tests: 0, suites: 0, passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0 });
const sameSource = (a, b) => a.commit === b.commit && a.dirty === b.dirty && a.worktreeSha256 === b.worktreeSha256;
const sameEnv = (a, b) => a.os === b.os && a.runtime === b.runtime && a.version === b.version;
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
function plainJson(value, depth = 0, ancestors = new Set(), budget = { bytes: 0 }) {
  if (depth > LIMITS.max_depth) throw new InputError('RESOURCE_LIMIT');
  const consume = size => {
    budget.bytes += size;
    if (budget.bytes > LIMITS.max_request_bytes) throw new InputError('RESOURCE_LIMIT');
  };
  if (typeof value === 'string' && Buffer.byteLength(value) > LIMITS.max_request_bytes) throw new InputError('RESOURCE_LIMIT');
  if (value === null || typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))) { consume(Buffer.byteLength(JSON.stringify(value))); return; }
  if (typeof value !== 'object' || ancestors.has(value) ||
      (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) throw new InputError('INVALID_INPUT');
  ancestors.add(value);
  consume(2);
  let index = 0;
  for (const key of Reflect.ownKeys(value)) {
    if (Array.isArray(value) && key === 'length') continue;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (typeof key !== 'string' || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) throw new InputError('INVALID_INPUT');
    if (Buffer.byteLength(key) > LIMITS.max_request_bytes) throw new InputError('RESOURCE_LIMIT');
    if (index++) consume(1);
    if (!Array.isArray(value)) consume(Buffer.byteLength(JSON.stringify(key)) + 1);
    plainJson(descriptor.value, depth + 1, ancestors, budget);
  }
  ancestors.delete(value);
}
function capabilities() {
  return envelope({ operations: ['summarize', 'verify'], formats: ['unified-json', 'node-jsonl'],
    requestVersion: '1.0.0', processExecution: false, sourceIdentity: 'caller-declared' });
}
function validateSource(source) {
  if (source.dirty !== Object.hasOwn(source, 'worktreeSha256')) throw new InputError('INVALID_INPUT');
}
export function validateRequest(request) {
  if (request === null || typeof request !== 'object') throw new InputError('INVALID_INPUT');
  if (request.schemaVersion !== undefined && request.schemaVersion !== '1.0.0') throw new InputError('UNSUPPORTED_INPUT');
  if (request.requiredChecks?.length > LIMITS.max_checks || request.runs?.length > LIMITS.max_runs) throw new InputError('RESOURCE_LIMIT');
  if (Array.isArray(request.runs) && request.runs.some(r => r?.artifact?.format && !['unified-json', 'node-jsonl'].includes(r.artifact.format))) throw new InputError('UNSUPPORTED_INPUT');
  validate(request, 'request'); validateSource(request.expectedSource);
  const checks = new Set(), runs = new Set(), ids = new Set(), artifacts = new Set();
  for (const check of request.requiredChecks) {
    if (checks.has(check.id)) throw new InputError('INVALID_INPUT');
    checks.add(check.id);
  }
  for (const run of request.runs) {
    validateSource(run.source); relativePath(run.artifact.path);
    if (!checks.has(run.checkId) || runs.has(run.checkId) || ids.has(run.id) || artifacts.has(run.artifact.id) ||
        (run.signal !== null && run.exitCode !== null)) throw new InputError('INVALID_INPUT');
    runs.add(run.checkId); ids.add(run.id); artifacts.add(run.artifact.id);
  }
}
function analyze(bundle, operation) {
  try {
    if (!bundle || typeof bundle !== 'object' || Reflect.ownKeys(bundle).some(k => !['request', 'artifacts'].includes(k))) throw new InputError('INVALID_INPUT');
    // Round-trip API objects through the strict parser to apply depth/byte limits
    // uniformly. API callers must supply plain JSON data without accessors.
    plainJson(bundle.request);
    const requestText = JSON.stringify(bundle.request);
    if (typeof requestText !== 'string') throw new InputError('INVALID_INPUT');
    if (Buffer.byteLength(requestText) > LIMITS.max_request_bytes) throw new InputError('RESOURCE_LIMIT');
    const request = parseJson(requestText, LIMITS.max_depth);
    validateRequest(request);
    const checks = new Map(request.requiredChecks.map(check => [check.id, check]));
    const runs = new Map(request.runs.map(run => [run.checkId, run]));
    const artifactIds = new Set(request.runs.map(run => run.artifact.id));
    if (!Array.isArray(bundle.artifacts) || bundle.artifacts.length !== request.runs.length) throw new InputError('INVALID_INPUT');
    let totalBytes = Buffer.byteLength(requestText), caseTotal = 0, anomalyTotal = 0;
    const artifacts = new Map();
    for (const artifact of bundle.artifacts) {
      if (!artifact || Reflect.ownKeys(artifact).some(k => !['id', 'path', 'bytes'].includes(k)) ||
          !(artifact.bytes instanceof Uint8Array) || !artifactIds.has(artifact.id) || artifacts.has(artifact.id)) throw new InputError('INVALID_INPUT');
      relativePath(artifact.path);
      totalBytes += artifact.bytes.byteLength;
      if (artifact.bytes.byteLength > LIMITS.max_artifact_bytes || totalBytes > LIMITS.max_total_bytes) throw new InputError('RESOURCE_LIMIT');
      artifacts.set(artifact.id, artifact);
    }
    const counts = zeroCounts();
    const results = [...checks.values()].sort((a, b) => order(a.id, b.id)).map(check => {
      const run = runs.get(check.id);
      if (!run) return { checkId: check.id, runId: null, state: 'not_run', applicable: false,
        reasons: ['not_run'], counts: null, evidence: null, anomalies: [] };
      const artifact = artifacts.get(run.artifact.id);
      if (!artifact || artifact.path !== run.artifact.path) throw new InputError('INVALID_INPUT');
      const normalized = run.artifact.format === 'unified-json' ? normalizeUnified(artifact.bytes) : normalizeNodeCapture(artifact.bytes);
      if (normalized.producer.id !== run.producer.id || normalized.producer.version !== run.producer.version) throw new InputError('INVALID_INPUT');
      caseTotal += normalized.cases.length;
      if (caseTotal > LIMITS.max_cases) throw new InputError('RESOURCE_LIMIT');
      const provenance = { artifactId: artifact.id, path: artifact.path,
        sha256: createHash('sha256').update(artifact.bytes).digest('hex') };
      const evidence = { ...provenance, ...(normalized.pointer ? { pointer: normalized.pointer } : { line: normalized.line }) };
      const reasons = [];
      if (!sameSource(request.expectedSource, run.source)) reasons.push('source_mismatch');
      if (!sameEnv(check.environment, run.environment) || (normalized.runtime &&
          (normalized.runtime.id !== run.environment.runtime || normalized.runtime.version !== run.environment.version))) reasons.push('environment_mismatch');
      const applicable = reasons.length === 0;
      if (!run.completed) reasons.push('unfinished');
      if (run.exitCode === null || run.signal !== null) reasons.push('process_unknown');
      const c = normalized.summary.counts;
      const explicitFailure = applicable && run.completed && (c.failed > 0 ||
        (c.cancelled === 0 && run.signal === null && (!normalized.summary.success || (run.exitCode !== null && run.exitCode !== 0))));
      if (explicitFailure) reasons.push('failed');
      if (c.tests === 0) reasons.push('zero_tests');
      for (const key of ['skipped', 'todo', 'cancelled']) if (c[key]) reasons.push(key);
      const state = explicitFailure ? 'failed' : reasons.length ? 'unknown' : 'passed';
      if (applicable) for (const key of Object.keys(counts)) {
        counts[key] += c[key];
        if (!Number.isSafeInteger(counts[key])) throw new InputError('INVALID_INPUT');
      }
      const anomalies = normalized.cases.filter(item => item.status !== 'passed').map(item => ({
        caseId: item.id, status: item.status, evidence: { ...provenance,
          ...(item.pointer ? { pointer: item.pointer } : { line: item.line }) },
      })).sort((a, b) => order(a.evidence.pointer ?? '', b.evidence.pointer ?? '') || (a.evidence.line ?? 0) - (b.evidence.line ?? 0));
      anomalyTotal += anomalies.length;
      if (anomalyTotal > LIMITS.max_anomalies) throw new InputError('RESOURCE_LIMIT');
      return { checkId: check.id, runId: run.id, state, applicable, reasons, counts: c, evidence, anomalies };
    });
    const verdict = results.some(r => r.state === 'failed') ? 'fail' : results.every(r => r.state === 'passed') ? 'pass' : 'unknown';
    if (operation === 'verify' && verdict === 'unknown') return failure('INSUFFICIENT_EVIDENCE');
    return bounded(envelope({ operation, verdict, counts, countUnit: 'test-executions', checks: results }));
  } catch (error) { return failure(error instanceof InputError ? error.code : 'INTERNAL_ERROR'); }
}
function summarizeEvidence(bundle) { return analyze(bundle, 'summarize'); }
function verifyEvidence(bundle) { return analyze(bundle, 'verify'); }
