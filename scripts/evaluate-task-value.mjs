// Opt-in development experiment; not a tool adapter or agent execution runtime.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = dirname(dirname(fileURLToPath(import.meta.url)));
const manifestPath = join(repo, 'docs/evaluation/tasks.json');
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes);
assert.equal(manifest.schemaVersion, '1.0.0');
assert.equal(manifest.repetitions, 3);
const major = Number(process.versions.node.split('.')[0]);
assert.ok(major === 24 || (major === 22 && Number(process.versions.node.split('.')[1]) >= 13), 'Use supported Node 22.13+ or 24');
const env = { ...process.env, FORCE_COLOR: '0', NODE_DISABLE_COLORS: '1' };
delete env.NODE_TEST_CONTEXT;
delete env.NO_COLOR;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const slash = value => value.split(sep).join('/');
function git(args) {
  const result = spawnSync('git', args, { cwd: repo, env, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(result.error, undefined, 'Git unavailable');
  assert.equal(result.status, 0, 'Frozen Git history unavailable');
  return result.stdout;
}
const toolFolders = Object.keys(manifest.toolVersions).map(folder => `packages/${folder}`);
assert.equal(git(['diff', '--no-ext-diff', '--no-textconv', manifest.sourceCommit, '--', ...toolFolders]).length, 0, 'Selected tool source differs from frozen commit');
assert.equal(git(['ls-files', '--others', '--exclude-standard', '--', ...toolFolders]).length, 0, 'Selected tools contain untracked source');
const require = createRequire(join(repo, 'packages/test-evidence/package.json'));
const Ajv = require('ajv/dist/2020.js').default;
const ajv = new Ajv({ strict: false });
const schemaFiles = {
  slice: 'packages/code-slice/schemas/code-slice-result-v1.schema.json',
  scope: 'packages/test-scope/schemas/result.schema.json',
  patch: 'packages/patch-guard/schema/result.schema.json',
  evidence: 'packages/test-evidence/schema/result.schema.json',
};
const validators = Object.fromEntries(Object.entries(schemaFiles).map(([name, path]) => [name, ajv.compile(JSON.parse(readFileSync(join(repo, path))))]));
const clis = {
  slice: join(repo, 'packages/code-slice/dist/cli/index.js'),
  scope: join(repo, 'packages/test-scope/dist/cli.js'),
  patch: join(repo, 'packages/patch-guard/src/cli.js'),
  evidence: join(repo, 'packages/test-evidence/src/cli.js'),
};
const outputParent = join(repo, '.cache/task-value-evaluation');
mkdirSync(outputParent, { recursive: true });
const output = mkdtempSync(join(outputParent, 'run-'));
const work = mkdtempSync(join(outputParent, 'fixtures # '));
const snapshot = join(work, 'test-evidence');
mkdirSync(snapshot);
let sequence = 0;
const observations = [];
function invoke(label, command, args, cwd = work) {
  const started = performance.now();
  const run = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024 });
  const elapsedMs = performance.now() - started;
  assert.equal(run.error, undefined, `${label}: process unavailable or exceeded limit`);
  assert.equal(run.signal, null, `${label}: process interrupted`);
  const id = `${String(++sequence).padStart(3, '0')}-${label}`;
  writeFileSync(join(output, `${id}.stdout`), run.stdout);
  writeFileSync(join(output, `${id}.stderr`), run.stderr);
  const record = { id, command: [command, ...args], cwd, exitCode: run.status, elapsedMs,
    stdoutBytes: Buffer.byteLength(run.stdout), stderrBytes: Buffer.byteLength(run.stderr),
    stdoutSha256: hash(run.stdout), stderrSha256: hash(run.stderr) };
  observations.push(record);
  return { ...run, record };
}
function cli(key, label, args, cwd = work) { return invoke(label, process.execPath, [clis[key], ...args], cwd); }
function envelope(run, key) {
  assert.ok(run.stdout.endsWith('\n'), 'Missing JSON framing');
  const value = JSON.parse(run.stdout);
  assert.ok(validators[key](value), `${key} output schema mismatch: ${JSON.stringify(validators[key].errors)}`);
  return value;
}
function readBaseline(label, path) {
  return invoke(label, process.execPath, ['-e', 'process.stdout.write(require("node:fs").readFileSync(process.argv[1]));', path]);
}
function fingerprint(dir) {
  const h = createHash('sha256');
  function visit(current, prefix = '') {
    for (const item of readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name < b.name ? -1 : 1)) {
      const path = prefix + item.name;
      if (item.isDirectory()) visit(join(current, item.name), path + '/');
      else { assert.ok(item.isFile(), 'Unexpected link or nonregular fixture'); h.update(path); h.update('\0'); h.update(readFileSync(join(current, item.name))); h.update('\0'); }
    }
  }
  visit(dir);
  return h.digest('hex');
}
const observedSource = new Map();
function sourceUnchanged() {
  for (const item of manifest.files) {
    const bytes = readFileSync(join(repo, item.path));
    // Git stores LF; an existing Windows worktree may retain CRLF. Admit that
    // checkout conversion only, then bind subsequent checks to actual bytes.
    assert.equal(hash(bytes.toString('utf8').replace(/\r\n/g, '\n')), item.sha256, `Source differs from Git: ${item.path}`);
    const actual = hash(bytes);
    if (observedSource.has(item.path)) assert.equal(actual, observedSource.get(item.path), `Source changed during evaluation: ${item.path}`);
    else observedSource.set(item.path, actual);
  }
}
function worktreeSourceDigest() {
  const h = createHash('sha256');
  for (const item of manifest.files) { h.update(item.path); h.update('\0'); h.update(readFileSync(join(repo, item.path))); h.update('\0'); }
  return h.digest('hex');
}
function median(values) { return [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)]; }
function paired(id, arms) {
  const samples = Object.fromEntries(Object.keys(arms).map(name => [name, []]));
  for (let repetition = 0; repetition < manifest.repetitions; repetition++) {
    const names = Object.keys(arms);
    if (repetition % 2) names.reverse();
    for (const name of names) {
      const result = arms[name](`${id}-${name}-${repetition + 1}`);
      samples[name].push({ ...result.run.record, ...result.facts });
    }
  }
  for (const [name, values] of Object.entries(samples)) {
    if (name === 'tool') assert.ok(values.every(v => v.stdoutSha256 === values[0].stdoutSha256 && v.stderrSha256 === values[0].stderrSha256), 'Repeated tool output changed');
  }
  return { id, arms: Object.fromEntries(Object.entries(samples).map(([name, values]) => [name, {
    evidenceAdequate: true, samples: values, medianElapsedMs: median(values.map(v => v.elapsedMs)),
    stdoutBytes: values[0].stdoutBytes, stderrBytes: values[0].stderrBytes,
    workflowMedianElapsedMs: median(values.map(v => v.combinedElapsedMs ?? v.elapsedMs)),
    workflowStdoutBytes: values[0].combinedStdoutBytes ?? values[0].stdoutBytes,
    callsPerRepetition: values[0].summaryCommand ? 2 : 1,
    stdoutByteStable: values.every(v => v.stdoutSha256 === values[0].stdoutSha256),
    stderrByteStable: values.every(v => v.stderrSha256 === values[0].stderrSha256),
  }])) };
}

try {
  sourceUnchanged();
  const versions = {};
  for (const folder of Object.keys(manifest.toolVersions)) {
    const pkg = JSON.parse(readFileSync(join(repo, `packages/${folder}/package.json`)));
    assert.equal(pkg.version, manifest.toolVersions[folder]);
    const runtimeDir = ['code-slice', 'test-scope'].includes(folder) ? 'dist' : 'src';
    versions[folder] = { name: pkg.name, version: pkg.version,
      packageLockSha256: hash(readFileSync(join(repo, `packages/${folder}/package-lock.json`))),
      runtimeSha256: fingerprint(join(repo, `packages/${folder}/${runtimeDir}`)) };
  }
  for (const item of manifest.files) {
    const bytes = git(['show', `${manifest.sourceCommit}:${item.path}`]);
    assert.equal(bytes.length, item.bytes); assert.equal(hash(bytes), item.sha256);
    const destination = join(snapshot, item.path.slice('packages/test-evidence/'.length));
    mkdirSync(dirname(destination), { recursive: true }); writeFileSync(destination, bytes);
  }
  const patch = git(['diff', '--no-ext-diff', '--no-textconv', `${manifest.patchCommit}^`, manifest.patchCommit, '--', ...manifest.patchPaths]);
  assert.equal(hash(patch), manifest.patchSha256);
  writeFileSync(join(work, 'review.diff'), patch);
  const policy = { schema_version: '1.0.0', allowed_paths: ['bin/'], protected_paths: ['bin/install-all.js'] };
  writeFileSync(join(work, 'policy.json'), jsonBytes(policy));
  const fixtureHash = fingerprint(work);
  const discovery = [
    cli('slice', 'discovery-slice', ['capabilities', '--json']),
    cli('scope', 'discovery-scope', ['capabilities', '--root', snapshot]),
    cli('patch', 'discovery-patch', ['capabilities', '--json']),
    cli('evidence', 'discovery-evidence', ['capabilities', '--json']),
  ];
  discovery.forEach((run, index) => { assert.equal(run.status, 0); envelope(run, ['slice', 'scope', 'patch', 'evidence'][index]); });
  const rgVersion = invoke('discovery-rg', 'rg', ['--version']); assert.equal(rgVersion.status, 0);

  const sourcePath = join(snapshot, 'src/index.js');
  const fullSource = readFileSync(sourcePath, 'utf8');
  const task = manifest.tasks[0];
  const exactSource = fullSource.split('\n').slice(task.startLine - 1, task.endLine).join('\n');
  assert.ok(exactSource.startsWith('function analyze(bundle, operation) {'));
  assert.ok(exactSource.includes("verdict === 'unknown'"));
  const tasks = [];
  tasks.push(paired('source-navigation', {
    fullRead(label) {
      const run = readBaseline(label, sourcePath); assert.equal(run.status, 0); assert.ok(run.stdout.includes(exactSource));
      return { run, facts: { returnedSourceBytes: Buffer.byteLength(run.stdout), returnedSourceLines: fullSource.trimEnd().split('\n').length } };
    },
    boundedRg(label) {
      const run = invoke(label, 'rg', ['-n', '-A', String(task.endLine - task.startLine), '^function analyze\\(', 'src/index.js'], snapshot);
      assert.equal(run.status, 0); assert.equal(run.stdout.trimEnd().split('\n').map(line => line.replace(/^\d+[:-]/, '')).join('\n'), exactSource);
      return { run, facts: { returnedSourceBytes: Buffer.byteLength(exactSource), returnedSourceLines: 70, oracleAssistedRange: true } };
    },
    tool(label) {
      const run = cli('slice', label, ['symbol', 'src/index.js', 'analyze', '--root', snapshot, '--json'], snapshot);
      assert.equal(run.status, 0); const value = envelope(run, 'slice'); assert.equal(value.ok, true); assert.equal(value.result.code, exactSource);
      return { run, facts: { returnedSourceBytes: Buffer.byteLength(value.result.code), returnedSourceLines: 70 } };
    },
  }));
  const missingSymbol = cli('slice', 'control-missing-symbol', ['symbol', 'src/index.js', 'absentEvaluationSymbol', '--root', snapshot, '--json'], snapshot);
  assert.notEqual(missingSymbol.status, 0); assert.equal(envelope(missingSymbol, 'slice').error.code, 'SYMBOL_NOT_FOUND');
  assert.equal(fullSource.split('\n').find(line => line.startsWith('function analyze(')).includes(exactSource), false);

  const requiredTests = manifest.tasks[1].requiredTests;
  tasks.push(paired('test-selection', {
    baseline(label) {
      const run = invoke(label, 'rg', ['-n', '-F', '--glob', '*.test.js', "from '../src/index.js'", 'test'], snapshot);
      assert.equal(run.status, 0);
      const selected = run.stdout.trim().split('\n').map(line => slash(line.slice(0, line.indexOf(':')))).sort();
      assert.deepEqual(selected, requiredTests);
      return { run, facts: { selectedTests: selected, scopeClaim: 'direct static imports only; no execution' } };
    },
    tool(label) {
      const run = cli('scope', label, ['plan', '--root', snapshot, '--changed', 'src/index.js'], snapshot);
      assert.equal(run.status, 0); const value = envelope(run, 'scope');
      assert.notEqual(value.status, 'error'); assert.equal(value.truncation.truncated, false);
      const minimum = value.data.plan.minimum.tests.map(t => t.path).sort();
      assert.deepEqual(minimum, requiredTests);
      const recommended = value.data.plan.recommended.tests.map(t => t.path).sort();
      const commands = [...value.data.plan.minimum.commands, ...value.data.plan.recommended.commands];
      assert.ok(commands.every(c => c.executed === false));
      return { run, facts: { status: value.status, selectedTests: minimum, recommendedTests: recommended,
        extraRecommendedPaths: recommended.filter(path => !requiredTests.includes(path)), stats: value.stats,
        diagnostics: value.diagnostics.map(d => d.code), scopeClaim: 'static candidates; no execution' } };
    },
  }));
  assert.equal(requiredTests.some(path => path.endsWith('/index.test.js')), false, 'Basename shortcut unexpectedly adequate');

  const protectedPath = manifest.tasks[2].protectedPath;
  tasks.push(paired('patch-review', {
    fullRead(label) {
      const run = readBaseline(label, join(work, 'review.diff')); assert.equal(run.status, 0);
      const paths = [...run.stdout.matchAll(/^diff --git a\/(\S+) b\/\1$/gm)].map(match => match[1]);
      assert.deepEqual(paths, manifest.patchPaths); assert.ok(paths.includes(protectedPath));
      return { run, facts: { changedPaths: paths, protectedPaths: [protectedPath], verdict: 'violations', scopeClaim: 'supplied two-file diff only' } };
    },
    changedPaths(label) {
      const run = invoke(label, 'git', ['diff', '--no-ext-diff', '--no-textconv', '--name-only', `${manifest.patchCommit}^`, manifest.patchCommit, '--', ...manifest.patchPaths], repo);
      assert.equal(run.status, 0); assert.deepEqual(run.stdout.trim().split('\n'), manifest.patchPaths);
      return { run, facts: { changedPaths: manifest.patchPaths, protectedPaths: [protectedPath], verdict: 'violations', scopeClaim: 'path policy only; content uninspected' } };
    },
    tool(label) {
      const run = cli('patch', label, ['check', '--root', work, '--diff', 'review.diff', '--policy', 'policy.json', '--json']);
      assert.equal(run.status, 0); const value = envelope(run, 'patch'); assert.equal(value.status, 'ok');
      assert.equal(value.data.verdict, 'violations');
      assert.ok(value.data.findings.some(f => f.rule_id === 'PROTECTED_PATH' && f.path === protectedPath));
      return { run, facts: { verdict: value.data.verdict, findings: value.data.findings, scopeClaim: 'explicit policy; no patch application' } };
    },
  }));
  const cleanPatch = git(['diff', '--no-ext-diff', '--no-textconv', `${manifest.patchCommit}^`, manifest.patchCommit, '--', 'bin/ait.js']);
  writeFileSync(join(work, 'clean.diff'), cleanPatch);
  const clean = cli('patch', 'control-clean-patch', ['check', '--root', work, '--diff', 'clean.diff', '--policy', 'policy.json', '--json']);
  assert.equal(clean.status, 0); assert.equal(envelope(clean, 'patch').data.verdict, 'pass');
  writeFileSync(join(work, 'truncated.diff'), patch.subarray(0, patch.lastIndexOf(Buffer.from('\n')) - 20));
  const truncated = cli('patch', 'control-truncated-patch', ['check', '--root', work, '--diff', 'truncated.diff', '--policy', 'policy.json', '--json']);
  assert.equal(truncated.status, 3); assert.equal(envelope(truncated, 'patch').data, null);
  rmSync(join(work, 'clean.diff')); rmSync(join(work, 'truncated.diff'));
  assert.equal(fingerprint(work), fixtureHash, 'Analysis modified frozen inputs');

  const actualRoot = join(repo, 'packages/test-evidence');
  const tests = requiredTests.map(path => join(actualRoot, path));
  const tapPath = join(work, 'native.tap');
  const capturePath = join(work, 'capture.jsonl');
  const native = invoke('shared-native-collection', process.execPath, ['--test', '--test-reporter=tap', `--test-reporter-destination=${tapPath}`,
    `--test-reporter=${pathToFileURL(join(actualRoot, 'src/node-reporter.js')).href}`, `--test-reporter-destination=${capturePath}`, ...tests], actualRoot);
  assert.equal(native.status, 0, 'Native suite failed'); sourceUnchanged();
  const tap = readFileSync(tapPath, 'utf8');
  const fields = { tests: 'tests', suites: 'suites', passed: 'pass', failed: 'fail', skipped: 'skipped', todo: 'todo', cancelled: 'cancelled' };
  const counts = Object.fromEntries(Object.entries(fields).map(([key, label]) => {
    const matches = [...tap.matchAll(new RegExp(`^# ${label} (\\d+)$`, 'gm'))];
    assert.equal(matches.length, 1, `Missing/ambiguous native ${label}`); return [key, Number(matches[0][1])];
  }));
  const raw = readFileSync(capturePath);
  const records = raw.toString('utf8').trimEnd().split('\n').map(line => JSON.parse(line));
  const summaryRecord = records.find(record => record.type === 'summary');
  assert.ok(summaryRecord, 'No global reporter summary'); assert.deepEqual(summaryRecord.counts, counts);
  const source = { commit: manifest.sourceCommit, dirty: true, worktreeSha256: worktreeSourceDigest() };
  const environment = { os: { win32: 'windows', darwin: 'macos', linux: 'linux' }[process.platform], runtime: 'node', version: process.versions.node };
  const producer = records[0].reporter;
  const request = { schemaVersion: '1.0.0', expectedSource: source, requiredChecks: [{ id: 'test-evidence-native', environment }],
    runs: [{ id: 'native-1', checkId: 'test-evidence-native', source: { ...source }, environment: { ...environment }, producer,
      exitCode: native.status, signal: native.signal, completed: true, artifact: { id: 'native-capture', path: 'capture.jsonl', format: 'node-jsonl' } }] };
  writeFileSync(join(work, 'request.json'), jsonBytes(request));
  writeFileSync(join(work, 'native-counts.json'), jsonBytes(counts));
  const beforeEvidence = fingerprint(work);
  // Independent reference for this one known capture: native TAP counts, not
  // the tool's normalizer or verdict. It is not a general evidence parser.
  const baselineScript = `const fs=require('node:fs');const r=JSON.parse(fs.readFileSync(process.argv[1]));const c=JSON.parse(fs.readFileSync(process.argv[2]));const x=r.runs[0];const q=r.requiredChecks[0];const matched=JSON.stringify(r.expectedSource)===JSON.stringify(x.source)&&JSON.stringify(q.environment)===JSON.stringify(x.environment);const known=x.completed&&x.exitCode!==null&&x.signal===null;const verdict=matched&&known&&c.failed>0?'fail':matched&&known&&x.exitCode===0&&c.tests>0&&!c.failed&&!c.skipped&&!c.todo&&!c.cancelled?'pass':'unknown';console.log(JSON.stringify({verdict,counts:c,sourceMatched:matched,processKnown:known}));`;
  const expectedVerdict = counts.failed ? 'fail' : counts.tests && !counts.skipped && !counts.todo && !counts.cancelled ? 'pass' : 'unknown';
  tasks.push(paired('test-acceptance', {
    baseline(label) {
      const run = invoke(label, process.execPath, ['-e', baselineScript, join(work, 'request.json'), join(work, 'native-counts.json')]);
      assert.equal(run.status, 0); const value = JSON.parse(run.stdout); assert.equal(value.verdict, expectedVerdict); assert.deepEqual(value.counts, counts);
      return { run, facts: { verdict: value.verdict, counts, scopeClaim: 'fixture-only independent TAP and declared binding inspection' } };
    },
    tool(label) {
      const summarized = cli('evidence', label + '-summarize', ['summarize', '--root', work, '--input', 'request.json', '--json']);
      assert.equal(summarized.status, 0); const summary = envelope(summarized, 'evidence'); assert.deepEqual(summary.data.counts, counts);
      const run = cli('evidence', label, ['verify', '--root', work, '--input', 'request.json', '--json']);
      const value = envelope(run, 'evidence');
      assert.equal(run.status, expectedVerdict === 'unknown' ? 3 : 0);
      assert.equal(value.status, expectedVerdict === 'unknown' ? 'incomplete' : 'ok');
      assert.equal(value.data?.verdict ?? 'unknown', expectedVerdict);
      return { run, facts: { verdict: expectedVerdict, counts, summaryCommand: summarized.record,
        combinedElapsedMs: summarized.record.elapsedMs + run.record.elapsedMs,
        combinedStdoutBytes: summarized.record.stdoutBytes + run.record.stdoutBytes, scopeClaim: 'producer declarations checked, not authenticated' } };
    },
  }));
  assert.equal(fingerprint(work), beforeEvidence, 'Evidence analysis modified its inputs');

  const controls = [];
  const runControl = (id, changed, expected, artifact = raw) => {
    writeFileSync(join(work, 'control.json'), jsonBytes(changed)); writeFileSync(join(work, 'control-capture.jsonl'), artifact);
    for (const run of changed.runs) if (run.artifact.format === 'node-jsonl') run.artifact.path = 'control-capture.jsonl';
    writeFileSync(join(work, 'control.json'), jsonBytes(changed));
    const run = cli('evidence', 'control-' + id, ['verify', '--root', work, '--input', 'control.json', '--json']);
    const value = envelope(run, 'evidence');
    assert.equal(run.status, expected === 'unknown' ? 3 : 0); assert.equal(value.data?.verdict ?? 'unknown', expected);
    assert.equal(value.status, expected === 'unknown' ? 'incomplete' : 'ok');
    if (id === 'truncated-capture') assert.equal(value.errors[0].code, 'INCOMPLETE_CAPTURE');
    controls.push({ id, expected, observed: value.data?.verdict ?? 'unknown', exitCode: run.status, errorCode: value.errors[0]?.code ?? null });
  };
  const clone = () => JSON.parse(JSON.stringify(request));
  // Synthetic acceptance controls have real identities but explicitly fabricated
  // summary counts. They never count as executions of those outcomes.
  const unifiedCounts = status => ({ tests: 1, suites: 0, passed: 0, failed: 0, skipped: 0, todo: 0, cancelled: 0, [status]: 1 });
  for (const status of ['passed', 'failed', 'skipped']) {
    const changed = clone(); changed.runs[0].artifact = { id: 'native-capture', path: 'control-unified.json', format: 'unified-json' };
    changed.runs[0].producer = { id: 'evaluation-control', version: '1.0.0' };
    changed.runs[0].exitCode = status === 'failed' ? 1 : 0;
    writeFileSync(join(work, 'control-unified.json'), jsonBytes({ schemaVersion: '1.0.0', producer: changed.runs[0].producer,
      summary: { success: status !== 'failed', counts: unifiedCounts(status) } }));
    runControl('synthetic-' + status, changed, { passed: 'pass', failed: 'fail', skipped: 'unknown' }[status]);
    if (status === 'passed') {
      const stale = structuredClone(changed); stale.expectedSource.commit = '0'.repeat(40); runControl('synthetic-stale-source', stale, 'unknown');
      const missing = structuredClone(changed); missing.requiredChecks.push({ id: 'missing', environment }); runControl('synthetic-missing-check', missing, 'unknown');
      const unknownProcess = structuredClone(changed); unknownProcess.runs[0].exitCode = null; runControl('synthetic-unknown-process', unknownProcess, 'unknown');
      const wrongEnvironment = structuredClone(changed); wrongEnvironment.requiredChecks[0].environment.version = '0.0.0'; runControl('synthetic-environment-mismatch', wrongEnvironment, 'unknown');
    }
    if (status === 'failed') { changed.requiredChecks.push({ id: 'missing', environment }); runControl('synthetic-failure-with-missing', changed, 'fail'); }
  }
  runControl('truncated-capture', clone(), 'unknown', raw.subarray(0, raw.length - 12));
  const report = { schemaVersion: '1.0.0', suiteId: manifest.suiteId, protocolSha256: hash(readFileSync(join(repo, 'docs/evaluation/PROTOCOL.md'))),
    manifestSha256: hash(manifestBytes), sourceCommit: manifest.sourceCommit, harnessSha256: hash(readFileSync(fileURLToPath(import.meta.url))),
    environment: { ...environment, executable: process.execPath, rg: rgVersion.stdout.split('\n')[0] }, tools: versions,
    collection: { command: native.record, counts, tapBytes: Buffer.byteLength(tap), captureBytes: raw.length, captureSha256: hash(raw),
      fingerprintScope: '43 frozen Test Evidence package files; caller-declared identity, not producer authentication' },
    fixtureBytes: manifest.files.reduce((total, file) => total + file.bytes, 0) + patch.length + jsonBytes(policy).length,
    observedSourceHashes: Object.fromEntries(observedSource),
    tasks, controls, shortcutDiagnostics: [
      { id: 'signature-only', evidenceAdequate: false }, { id: 'basename-only', evidenceAdequate: false },
      { id: 'patch-exit-only', claimedVerdict: 'pass', expectedVerdict: 'violations', correct: false },
      { id: 'native-exit-only', claimedVerdict: 'pass', expectedVerdict, correct: expectedVerdict === 'pass' },
      { id: 'stale-native-exit-only', claimedVerdict: 'pass', expectedVerdict: 'unknown', correct: false },
    ], observations, limitations: [
      'Scripted evidence replay; no independent agent trials, error-rate or token savings measurement.',
      'One repository, four selected tasks, one platform/runtime; no significance or productivity claim.',
      'Built runtime hashes recorded; timing excludes discovery and shared collection unless explicitly combined.',
      'Bytes are returned CLI output, not filesystem-read tracing; oracle-assisted rg range is disclosed.',
      'Test Scope recommended fixture/helper paths are candidates requiring review; no commands were auto-executed.',
    ] };
  sourceUnchanged();
  writeFileSync(join(output, 'measurements.json'), jsonBytes(report));
  // Keep sanitized source-independent process evidence; remove temporary inputs.
  writeFileSync(join(output, 'native.tap'), tap); writeFileSync(join(output, 'capture.jsonl'), raw);
  writeFileSync(join(output, 'request.json'), jsonBytes(request));
  console.log(JSON.stringify({ status: 'ok', output: slash(relative(repo, output)), tasks: tasks.length, controls: controls.length, nativeCounts: counts }));
} finally {
  const resolvedWork = resolve(work), resolvedParent = resolve(outputParent) + sep;
  assert.ok(resolvedWork.startsWith(resolvedParent), 'Cleanup escaped evaluation directory');
  rmSync(resolvedWork, { recursive: true, force: true });
}
