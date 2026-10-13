const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { spawn, spawnSync } = require('node:child_process');

const cli = path.join(__dirname, '..', 'bin', 'ait.js');
const registry = path.join(__dirname, '..', 'TOOL_REGISTRY.json');
const outputLimit = 1_048_576;

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ait-boundary-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  return { root, home, registry };
}

function invoke(context, args) {
  const child = spawnSync(process.execPath, [cli, ...args, '--home', context.home, '--registry', context.registry, '--json'], {
    encoding: 'utf8', maxBuffer: 4 * outputLimit, timeout: 120_000, shell: false,
  });
  assert.equal(child.error, undefined, child.error && child.error.message);
  return { ...child, output: JSON.parse(child.stdout) };
}

function writeState(context, records) {
  fs.writeFileSync(path.join(context.home, 'installed.json'), JSON.stringify({
    schema_version: 'ait-install-state/v1', installed: records,
  }));
}

function installedFixture(context, script, binPath = 'cli.js') {
  const root = path.join(context.home, 'packages', 'agent-code-slice', '0.2.0');
  const packageRoot = path.join(root, 'node_modules', 'agent-code-slice');
  fs.mkdirSync(packageRoot, { recursive: true });
  const manifest = { name: 'agent-code-slice', version: '0.2.0', bin: { 'code-slice': binPath } };
  fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(manifest));
  const executable = path.join(packageRoot, binPath);
  fs.writeFileSync(executable, script, { mode: 0o755 });
  const record = { id: 'agent-code-slice', package: manifest.name, version: manifest.version, root, bin: { name: 'code-slice', path: binPath } };
  writeState(context, [record]);
  return { root, packageRoot, executable, record, manifest };
}

test('doctor verifies the actual package and executable without executing or mutating state', (t) => {
  const context = fixture(t);
  const marker = path.join(context.root, 'executed');
  const installed = installedFixture(context, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran');`);
  const stateBefore = fs.readFileSync(path.join(context.home, 'installed.json'));
  const healthy = invoke(context, ['doctor']);
  assert.equal(healthy.status, 0);
  assert.equal(healthy.output.ok, true);
  assert.equal(fs.existsSync(marker), false);
  assert.deepEqual(fs.readFileSync(path.join(context.home, 'installed.json')), stateBefore);

  // A consumer installation manifest alone is not an installed tool.
  fs.writeFileSync(path.join(installed.root, 'package.json'), '{"private":true}');
  fs.rmSync(installed.packageRoot, { recursive: true });
  const missing = invoke(context, ['doctor']);
  assert.equal(missing.status, 3);
  assert.equal(missing.output.ok, false);
  assert.equal(missing.output.data.issues[0].code, 'INSTALLATION_MISSING');
});

test('doctor reports malformed records, duplicate records and registry mismatches as issues', (t) => {
  const context = fixture(t);
  const installed = installedFixture(context, 'throw new Error("doctor must not execute");');
  const cases = [
    [null, 'INVALID_STATE'],
    [{ ...installed.record, bin: null }, 'INVALID_STATE'],
    [{ ...installed.record, root: 42 }, 'INVALID_STATE'],
    [{ ...installed.record, package: '../outside' }, 'INVALID_STATE'],
    [{ ...installed.record, package: 'another-package' }, 'PACKAGE_IDENTITY_MISMATCH'],
    [{ ...installed.record, version: '0.0.1' }, 'PACKAGE_IDENTITY_MISMATCH'],
    [{ ...installed.record, id: 'unknown-tool' }, 'NOT_IN_REGISTRY'],
  ];
  for (const [record, code] of cases) {
    writeState(context, [record]);
    const child = invoke(context, ['doctor']);
    assert.equal(child.status, 3);
    assert.equal(child.output.ok, false);
    assert.equal(child.output.data.issues[0].code, code);
  }
  writeState(context, [installed.record, installed.record]);
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'INVALID_STATE');
  for (const malformed of ['null', '{', '{"schema_version":"wrong","installed":[]}']) {
    fs.writeFileSync(path.join(context.home, 'installed.json'), malformed);
    const child = invoke(context, ['doctor']);
    assert.equal(child.status, 3);
    assert.equal(child.output.status, 'incomplete');
    assert.equal(child.output.data.issues.length, 1);
  }
});

test('doctor rejects changed package identities and missing or nonregular executables', (t) => {
  const context = fixture(t);
  const installed = installedFixture(context, 'throw new Error("doctor must not execute");');
  for (const mutation of [{ name: 'other-package' }, { version: '0.0.1' }]) {
    fs.writeFileSync(path.join(installed.packageRoot, 'package.json'), JSON.stringify({ ...installed.manifest, ...mutation }));
    assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'PACKAGE_IDENTITY_MISMATCH');
  }
  fs.writeFileSync(path.join(installed.packageRoot, 'package.json'), JSON.stringify({ ...installed.manifest, bin: { 'code-slice': 'other.js' } }));
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'BIN_MISMATCH');
  fs.writeFileSync(path.join(installed.packageRoot, 'package.json'), JSON.stringify(installed.manifest));
  fs.unlinkSync(installed.executable);
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'BIN_MISSING');
  fs.mkdirSync(installed.executable);
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'BIN_MISSING');
});

test('doctor reports escaped roots, packages and declared executable paths without execution', (t) => {
  const context = fixture(t);
  const installed = installedFixture(context, 'throw new Error("doctor must not execute");');
  writeState(context, [{ ...installed.record, root: context.root }]);
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'PATH_ESCAPE');
  writeState(context, [installed.record]);
  const escapedBin = { name: 'code-slice', path: '../../../outside.js' };
  fs.writeFileSync(path.join(installed.packageRoot, 'package.json'), JSON.stringify({ ...installed.manifest, bin: { 'code-slice': escapedBin.path } }));
  writeState(context, [{ ...installed.record, bin: escapedBin }]);
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'PATH_ESCAPE');
  fs.writeFileSync(path.join(installed.packageRoot, 'package.json'), JSON.stringify(installed.manifest));
  writeState(context, [installed.record]);
  const outside = path.join(context.root, 'outside-package');
  fs.renameSync(installed.packageRoot, outside);
  fs.symlinkSync(outside, installed.packageRoot, process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(invoke(context, ['doctor']).output.data.issues[0].code, 'PATH_ESCAPE');
});

test('real oversized dispatch retains bounded evidence and the actual child status and signal', (t) => {
  const context = fixture(t);
  const script = [
    'const fs = require("node:fs");',
    'fs.writeSync(2, "oversized child evidence\\n");',
    'fs.writeSync(1, JSON.stringify({schemaVersion:"1.0",ok:true,operation:"symbol",result:{fixture:true},warnings:[]}) + "\\n");',
    'const chunk = Buffer.alloc(65536, 32);',
    'for (let i = 0; i < 80; i++) fs.writeSync(1, chunk);',
  ].join('\n');
  const installed = installedFixture(context, script);
  const native = spawnSync(process.execPath, [installed.executable], { maxBuffer: outputLimit, timeout: 30_000 });
  assert.equal(native.error && native.error.code, 'ENOBUFS');
  const child = invoke(context, ['dispatch', 'agent-code-slice', '--allow-execution']);
  const output = child.output;
  assert.equal(child.status, 1);
  assert.equal(output.ok, false);
  assert.equal(output.meta.error, 'EXECUTION_OUTPUT_LIMIT');
  assert.equal(output.meta.output_truncated, true);
  assert.equal(output.meta.exit_code, native.status);
  assert.equal(output.meta.native_exit, native.status);
  assert.equal(output.meta.signal, native.signal || null);
  assert.match(output.meta.native_stdout, /"fixture":true/);
  assert.equal(output.meta.native_stderr, 'oversized child evidence\n');
  assert.ok(Buffer.byteLength(output.meta.native_stdout) + Buffer.byteLength(output.meta.native_stderr) <= outputLimit);
  assert.deepEqual(output.data, { stdout: output.meta.native_stdout, stderr: output.meta.native_stderr });
  // Even a retained prefix containing valid JSON plus whitespace is incomplete.
  assert.equal(output.meta.profile.validation, 'failed');
  assert.equal(output.meta.profile.classification, 'protocol_error');
});

test('normal native failures retain payload, streams, exit status and native profile classification', (t) => {
  const context = fixture(t);
  const payload = { schemaVersion: '1.0', ok: false, operation: 'symbol', error: { code: 'FIXTURE_FAILURE', message: 'native failure' }, warnings: [] };
  const stdout = `${JSON.stringify(payload)}\n`;
  installedFixture(context, `process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write('native stderr\\n'); process.exitCode = 2;`);
  const child = invoke(context, ['dispatch', 'agent-code-slice', '--allow-execution']);
  assert.equal(child.status, 2);
  assert.equal(child.output.ok, false);
  assert.deepEqual(child.output.data, payload);
  assert.equal(child.output.meta.native_stdout, stdout);
  assert.equal(child.output.meta.native_stderr, 'native stderr\n');
  assert.equal(child.output.meta.exit_code, 2);
  assert.equal(child.output.meta.native_exit, 2);
  assert.equal(child.output.meta.signal, null);
  assert.equal(child.output.meta.profile.classification, 'error');
  assert.equal(child.output.meta.profile.validation, 'passed');
  assert.equal(child.output.meta.error, undefined);
});

test('oversized invalid UTF-8 output remains byte-bounded after text decoding', (t) => {
  const context = fixture(t);
  installedFixture(context, [
    'const fs = require("node:fs");',
    'fs.writeSync(2, "invalid UTF-8 evidence\\n");',
    'const chunk = Buffer.alloc(65536, 255);',
    'for (let i = 0; i < 80; i++) fs.writeSync(1, chunk);',
  ].join('\n'));
  const child = invoke(context, ['dispatch', 'agent-code-slice', '--allow-execution']);
  assert.equal(child.status, 1);
  assert.equal(child.output.meta.error, 'EXECUTION_OUTPUT_LIMIT');
  assert.equal(child.output.meta.native_stderr, 'invalid UTF-8 evidence\n');
  assert.match(child.output.meta.native_stdout, /\uFFFD/);
  assert.ok(Buffer.byteLength(child.output.meta.native_stdout) + Buffer.byteLength(child.output.meta.native_stderr) <= outputLimit);
});

test('small non-JSON native output preserves UTF-8 replacement and native failure semantics', (t) => {
  const context = fixture(t);
  installedFixture(context, 'require("node:fs").writeSync(1, Buffer.from([255])); process.exitCode = 7;');
  context.profileIndex = path.join(context.root, 'empty-profiles.json');
  fs.writeFileSync(context.profileIndex, JSON.stringify({ schema_version: '1.0.0', profiles: [] }));
  const child = invoke(context, ['dispatch', 'agent-code-slice', '--allow-execution', '--profile-index', context.profileIndex]);
  assert.equal(child.status, 7);
  assert.deepEqual(child.output.data, { stdout: '\uFFFD', stderr: '' });
  assert.equal(child.output.meta.native_exit, 7);
  assert.equal(child.output.meta.error, undefined);
});

test('a real executable startup error remains distinct from resource limits and native failure', (t) => {
  const context = fixture(t);
  const bin = process.platform === 'win32' ? 'invalid.exe' : 'invalid-command';
  installedFixture(context, '#!/ait-missing-interpreter\n', bin);
  const child = invoke(context, ['dispatch', 'agent-code-slice', '--allow-execution']);
  assert.equal(child.status, 1);
  assert.equal(child.output.meta.error, 'EXECUTION_START_FAILED');
  assert.equal(child.output.data, null);
  assert.equal(child.output.meta.native_exit, undefined);
});

function localPackages(context, ids) {
  const tools = ids.map((id) => ({
    id, name: id, description: 'Local CLI boundary fixture', status: 'Experimental',
    npm: { name: id }, release_version: '1.0.0',
  }));
  context.registry = path.join(context.root, 'registry.json');
  fs.writeFileSync(context.registry, JSON.stringify({ tools }));
  return tools.map((tool) => {
    const source = path.join(context.root, tool.id);
    fs.mkdirSync(source);
    fs.writeFileSync(path.join(source, 'package.json'), JSON.stringify({
      name: tool.id, version: tool.release_version, bin: { [tool.id]: 'cli.js' },
      scripts: { postinstall: 'node forbidden.js' },
    }));
    fs.writeFileSync(path.join(source, 'forbidden.js'), 'throw new Error("Lifecycle scripts must not run");');
    fs.writeFileSync(path.join(source, 'cli.js'), `#!/usr/bin/env node\nconsole.log(JSON.stringify({tool:${JSON.stringify(tool.id)}}));\n`, { mode: 0o755 });
    return { tool, source, args: ['install', tool.id, '--allow-experimental', '--from-path', source] };
  });
}

function startCli(context, args) {
  const child = spawn(process.execPath, [cli, ...args, '--home', context.home, '--registry', context.registry, '--json'], {
    stdio: ['ignore', 'pipe', 'pipe'], shell: false, timeout: 120_000,
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (status, signal) => resolve({ status, signal, stdout, stderr }));
  });
  return { child, done };
}

async function waitUntil(predicate) {
  const deadline = Date.now() + 30_000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, 'CLI did not reach the expected installation boundary');
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

test('simultaneous independent local CLI installs merge state under contention without losing records', async (t) => {
  const context = fixture(t);
  const packages = localPackages(context, ['ait-fixture-one', 'ait-fixture-two']);
  const stateLock = path.join(context.home, '.installed-state.lock');
  fs.writeFileSync(stateLock, 'externally held', { flag: 'wx' });
  const runs = packages.map((entry) => startCli(context, entry.args));
  try {
    await waitUntil(() => packages.every(({ tool }) => fs.existsSync(path.join(context.home, 'packages', tool.id, tool.release_version, 'node_modules', tool.id, 'package.json'))));
    assert.equal(fs.existsSync(path.join(context.home, 'installed.json')), false, 'State must not be saved while another writer owns the lock');
    assert.equal(fs.readFileSync(stateLock, 'utf8'), 'externally held');
    fs.unlinkSync(stateLock);
    const results = await Promise.all(runs.map((run) => run.done));
    for (const child of results) {
      assert.equal(child.status, 0, child.stdout + child.stderr);
      assert.equal(JSON.parse(child.stdout).ok, true);
    }
    const records = JSON.parse(fs.readFileSync(path.join(context.home, 'installed.json'), 'utf8')).installed;
    assert.deepEqual(records.map((record) => record.id).sort(), packages.map(({ tool }) => tool.id).sort());
    assert.ok(records.every((record) => record.execution_approved === false));
    for (const { tool } of packages) {
      assert.equal(fs.existsSync(path.join(context.home, `.install-${tool.id}.lock`)), false);
      const dispatched = invoke(context, ['dispatch', tool.id, '--allow-execution']);
      assert.equal(dispatched.status, 0);
      assert.equal(dispatched.output.data.tool, tool.id);
    }
    assert.equal(fs.existsSync(stateLock), false);
    assert.equal(invoke(context, ['doctor']).output.ok, true);
  } finally {
    for (const run of runs) if (run.child.exitCode === null) run.child.kill();
    await Promise.allSettled(runs.map((run) => run.done));
  }
});

test('same-tool lock contention fails closed before target side effects and never removes the other lock', (t) => {
  const context = fixture(t);
  const [entry] = localPackages(context, ['ait-fixture-lock']);
  const lock = path.join(context.home, `.install-${entry.tool.id}.lock`);
  fs.writeFileSync(lock, 'owned by another installation', { flag: 'wx' });
  const child = invoke(context, entry.args);
  assert.equal(child.status, 4);
  assert.equal(child.output.meta.error, 'INSTALL_LOCK_BUSY');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'owned by another installation');
  assert.equal(fs.existsSync(path.join(context.home, 'packages')), false);
  assert.equal(fs.existsSync(path.join(context.home, 'installed.json')), false);
});

test('state-lock contention has a bounded failure and releases the tool lock without deleting the held state lock', (t) => {
  const context = fixture(t);
  const [entry] = localPackages(context, ['ait-fixture-state-lock']);
  const lock = path.join(context.home, '.installed-state.lock');
  fs.writeFileSync(lock, 'held; never delete as stale', { flag: 'wx' });
  const child = invoke(context, entry.args);
  assert.equal(child.status, 4);
  assert.equal(child.output.meta.error, 'INSTALL_LOCK_BUSY');
  assert.equal(fs.readFileSync(lock, 'utf8'), 'held; never delete as stale');
  assert.equal(fs.existsSync(path.join(context.home, `.install-${entry.tool.id}.lock`)), false);
  assert.equal(fs.existsSync(path.join(context.home, 'installed.json')), false);
  fs.unlinkSync(lock);
  const retry = invoke(context, entry.args);
  assert.equal(retry.status, 0, retry.stdout + retry.stderr);
  assert.equal(invoke(context, ['doctor']).output.ok, true);
});

test('package identity and state errors reliably release owned locks for subsequent public CLI installs', (t) => {
  const context = fixture(t);
  const [entry] = localPackages(context, ['ait-fixture-error-release']);
  const manifestPath = path.join(entry.source, 'package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  fs.writeFileSync(manifestPath, JSON.stringify({ ...manifest, version: '0.0.1' }));
  const failed = invoke(context, entry.args);
  assert.equal(failed.status, 4);
  assert.equal(failed.output.meta.error, 'PACKAGE_VERSION_MISMATCH');
  assert.equal(fs.existsSync(path.join(context.home, `.install-${entry.tool.id}.lock`)), false);
  assert.equal(fs.existsSync(path.join(context.home, '.installed-state.lock')), false);
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  fs.rmSync(path.join(context.home, 'packages', entry.tool.id), { recursive: true });
  fs.writeFileSync(path.join(context.home, 'installed.json'), 'null');
  const badState = invoke(context, entry.args);
  assert.equal(badState.status, 2);
  assert.equal(badState.output.meta.error, 'INVALID_STATE');
  assert.equal(fs.existsSync(path.join(context.home, `.install-${entry.tool.id}.lock`)), false);
  assert.equal(fs.existsSync(path.join(context.home, '.installed-state.lock')), false);
  fs.unlinkSync(path.join(context.home, 'installed.json'));
  const succeeded = invoke(context, entry.args);
  assert.equal(succeeded.status, 0, succeeded.stdout + succeeded.stderr);
  assert.equal(invoke(context, ['doctor']).output.ok, true);
});
