// Explicit opt-in development collector. The distributed analyzer never executes
// tests or Git. This script records caller-owned process/source declarations.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { summarizeEvidence, verifyEvidence, normalizeNodeCapture, encodeResult } from '../src/index.js';
const root = fileURLToPath(new URL('../', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const env = { ...process.env }; delete env.NODE_TEST_CONTEXT;
const temp = mkdtempSync(join(tmpdir(), 'ait-test-evidence pilot # '));
try {
  const commit = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' });
  assert.equal(commit.status, 0);
  // Fingerprint is explicitly scoped to tracked/untracked package source files;
  // no claim of a full-repository worktree identity follows.
  function sourceDigest() {
    const hash = createHash('sha256');
    function fingerprint(dir, prefix = '') {
      for (const item of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
        if (item.name === 'node_modules') continue;
        const rel = prefix + item.name;
        if (item.isDirectory()) fingerprint(join(dir, item.name), rel + '/');
        else if (item.isFile()) { hash.update(rel); hash.update('\0'); hash.update(readFileSync(join(dir, item.name))); hash.update('\0'); }
        else throw new Error('Unsupported pilot source entry');
      }
    }
    fingerprint(root);
    return hash.digest('hex');
  }
  const source = { commit: commit.stdout.trim(), dirty: true, worktreeSha256: sourceDigest() };
  const capture = spawnSync(process.execPath, ['--test', '--test-reporter', new URL('../src/node-reporter.js', import.meta.url).href,
    ...readdirSync(join(root, 'test')).filter(name => name.endsWith('.test.js')).sort().map(name => join(root, 'test', name))],
    { cwd: root, env, encoding: 'utf8', timeout: 60000, maxBuffer: 5 * 1024 * 1024 });
  assert.equal(capture.error, undefined); assert.equal(capture.status, 0, capture.stderr);
  const raw = Buffer.from(capture.stdout), normalized = normalizeNodeCapture(raw);
  const environment = { os: { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform], runtime: 'node', version: process.versions.node };
  const request = { schemaVersion: '1.0.0', expectedSource: source, requiredChecks: [{ id: 'test-evidence-native', environment }],
    runs: [{ id: 'pilot', checkId: 'test-evidence-native', source, environment, producer: normalized.producer,
      exitCode: capture.status, signal: capture.signal, completed: true, artifact: { id: 'pilot-capture', path: 'capture.jsonl', format: 'node-jsonl' } }] };
  const bundle = { request, artifacts: [{ id: 'pilot-capture', path: 'capture.jsonl', bytes: raw }] };
  const summary = summarizeEvidence(bundle), verified = verifyEvidence(bundle);
  assert.equal(summary.status, 'ok'); assert.deepEqual(summary.data.counts, { ...normalized.summary.counts });
  assert.equal(verified.status, normalized.summary.counts.skipped ? 'incomplete' : 'ok');
  assert.equal(sourceDigest(), source.worktreeSha256, 'Pilot source changed while tests ran');
  writeFileSync(join(temp, 'capture.jsonl'), raw); writeFileSync(join(temp, 'request.json'), JSON.stringify(request, null, 2) + '\n');
  console.log(encodeResult(summary)); console.log(encodeResult(verified));
  console.log('Pilot native summary agrees; source identity is caller-declared and package-scoped; temporary capture removed');
} finally { rmSync(temp, { recursive: true, force: true }); }
