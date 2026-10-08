import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { normalizeNodeCapture, verifyEvidence, summarizeEvidence } from '../src/index.js';
import reporter from '../src/node-reporter.js';
import { fixture, bundle, counts } from './helpers.js';
const reporterPath = new URL('../src/node-reporter.js', import.meta.url).href;
const os = { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform];
export function capture(name, extra = []) {
  const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
  return spawnSync(process.execPath, ['--test', ...extra, '--test-reporter', reporterPath,
    fileURLToPath(new URL(`fixtures/${name}.mjs`, import.meta.url))], { env, encoding: 'utf8', timeout: 20000, maxBuffer: 5 * 1024 * 1024 });
}
function capturedBundle(c) {
  const f = fixture(); f.request.runs[0].artifact.format = 'node-jsonl';
  f.artifacts[0].bytes = Buffer.from(c.stdout);
  f.request.runs[0].producer = { id: 'agent-test-evidence', version: '0.1.0' };
  f.request.requiredChecks[0].environment = { os, runtime: 'node', version: process.versions.node };
  f.request.runs[0].environment = { ...f.request.requiredChecks[0].environment };
  f.request.runs[0].exitCode = c.status; f.request.runs[0].signal = c.signal;
  return bundle(f);
}
test('real nested/concurrent tests and suites use final global summary exactly once', () => {
  const c = capture('pass'); assert.equal(c.status, 0, c.stderr);
  const normalized = normalizeNodeCapture(Buffer.from(c.stdout));
  assert.deepEqual({ ...normalized.summary.counts }, { tests: 4, suites: 1, passed: 4, failed: 0, skipped: 0, todo: 0, cancelled: 0 });
  assert.equal(new Set(normalized.cases.map(c => c.id)).size, normalized.cases.length);
  const result = verifyEvidence(capturedBundle(c)); assert.equal(result.status, 'ok'); assert.equal(result.data.verdict, 'pass');
  assert.equal(result.data.counts.tests, 4);
});
test('real skip/todo capture redacts arbitrary display and log fields', () => {
  const c = capture('skip'); assert.equal(c.status, 0);
  assert.equal(c.stdout.includes('RAW SECRET'), false); assert.equal(c.stdout.includes('private reason'), false);
  const result = summarizeEvidence(capturedBundle(c)); assert.equal(result.data.counts.skipped, 1); assert.equal(result.data.counts.todo, 1);
  assert.equal(verifyEvidence(capturedBundle(c)).status, 'incomplete');
});
test('real test failure and file-load failure are analyzed without error bodies', () => {
  for (const name of ['fail', 'load-fail']) {
    const c = capture(name); assert.equal(c.status, 1); assert.equal(c.stdout.includes('RAW SECRET'), false);
    const result = verifyEvidence(capturedBundle(c)); assert.equal(result.status, 'ok', c.stdout); assert.equal(result.data.verdict, 'fail');
  }
});
test('real cancellation cannot become pass', () => {
  const c = capture('cancel'); const result = verifyEvidence(capturedBundle(c));
  assert.notEqual(result.data?.verdict, 'pass');
  assert.ok(normalizeNodeCapture(Buffer.from(c.stdout)).summary.counts.cancelled > 0);
  assert.equal(result.status, 'incomplete');
  assert.equal(normalizeNodeCapture(Buffer.from(c.stdout)).cases.every(item => item.status === 'cancelled'), true);
});
test('real coverage process failure is not mistaken for passing tests', () => {
  const c = capture('coverage', ['--experimental-test-coverage', '--test-coverage-lines=100']);
  assert.equal(c.status, 1, c.stderr);
  const result = verifyEvidence(capturedBundle(c)); assert.equal(result.status, 'ok', c.stdout); assert.equal(result.data.verdict, 'fail');
});
test('capture runtime must agree with declared runtime', () => {
  const b = capturedBundle(capture('pass')); b.request.runs[0].environment.version = '24.0.0'; b.request.requiredChecks[0].environment.version = '24.0.0';
  assert.equal(verifyEvidence(b).status, 'incomplete');
});
test('truncated captures, missing final summary, duplicate final and watch are rejected', async () => {
  const c = capture('pass'), lines = c.stdout.trimEnd().split('\n');
  for (const text of [c.stdout.slice(0, -1), lines.filter(l => !l.includes('"type":"summary"')).join('\n') + '\n', lines.slice(0, -1).join('\n') + '\n'])
    assert.throws(() => normalizeNodeCapture(Buffer.from(text)), { code: 'INCOMPLETE_CAPTURE' });
  const duplicate = [...lines.slice(0, -1), lines.find(l => l.includes('"type":"summary"')), lines.at(-1)].join('\n') + '\n';
  assert.throws(() => normalizeNodeCapture(Buffer.from(duplicate)), { code: 'INVALID_INPUT' });
  const source = (async function* () { yield { type: 'test:watch:drained', data: {} }; })();
  let out = ''; for await (const line of reporter(source)) out += line;
  assert.throws(() => normalizeNodeCapture(Buffer.from(out)), { code: 'UNSUPPORTED_INPUT' });
});
test('single-file summaries ignored; unsupported count/status structures never guessed', async () => {
  async function collect(events) {
    let text = ''; for await (const line of reporter((async function* () { yield* events; })())) text += line;
    return Buffer.from(text);
  }
  const summary = { counts: counts(), success: true };
  const raw = await collect([{ type: 'test:summary', data: { ...summary, file: '/private/file' } }, { type: 'test:summary', data: summary }]);
  assert.equal(normalizeNodeCapture(raw).summary.counts.tests, 1);
  for (const event of [{ type: 'test:pass', data: { details: { type: 'future' } } }, { type: 'test:summary', data: { counts: {}, success: true } },
    { type: 'test:future-counter', data: {} },
    { type: 'test:fail', data: { details: { type: 'test', error: { failureType: 'future-failure' } } } }]) {
    const output = await collect([event]);
    assert.throws(() => normalizeNodeCapture(output), { code: 'UNSUPPORTED_INPUT' });
  }
});
