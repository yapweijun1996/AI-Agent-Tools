const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = path.join(__dirname, '../bin/ait.js');
const registry = require('../TOOL_REGISTRY.json');
const tool = registry.tools.find(item => item.id === 'agent-code-slice');

function fixture(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-review-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const root = path.join(home, '..local-install');
  const packageRoot = path.join(root, 'node_modules', tool.npm.name);
  fs.mkdirSync(packageRoot, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"name":"unrelated-package"}');
  const manifest = { name: tool.npm.name, version: tool.release_version, bin: { 'code-slice': 'cli.js' } };
  const writeManifest = value => fs.writeFileSync(path.join(packageRoot, 'package.json'), JSON.stringify(value));
  writeManifest(manifest);
  fs.writeFileSync(path.join(packageRoot, 'cli.js'), 'throw new Error("Doctor must not execute a tool");');
  const record = { id: tool.id, package: tool.npm.name, version: tool.release_version, root, bin: { name: 'code-slice', path: 'cli.js' } };
  const writeState = installed => fs.writeFileSync(path.join(home, 'installed.json'), JSON.stringify({ schema_version: 'ait-install-state/v1', installed }));
  const doctor = () => spawnSync(process.execPath, [cli, 'doctor', '--home', home, '--json'], { encoding: 'utf8', timeout: 3000 });
  return { record, manifest, packageRoot, writeManifest, writeState, doctor };
}

test('JSON argument failures retain their envelope and respect the dispatch boundary', () => {
  for (const args of [['list', '--json', '--unknown'], ['list', '--unknown', '--json'], ['list', '--json', '--home']]) {
    const result = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
    assert.equal(result.status, 2);
    assert.equal(JSON.parse(result.stdout).status, 'error');
  }
  const nativeJson = spawnSync(process.execPath, [cli, 'dispatch', tool.id, '--unknown', '--', '--json'], { encoding: 'utf8' });
  assert.equal(nativeJson.status, 2);
  assert.equal(nativeJson.stdout, '');
  assert.match(nativeJson.stderr, /Unknown option/);
});

test('malformed installation records fail closed before discovery', t => {
  const { record, writeState, doctor } = fixture(t);
  for (const entries of [[null], [{ ...record, id: undefined }], [{ id: tool.id, root: record.root }], [record, record], [{ ...record, bin: { ...record.bin, path: '../outside.js' } }]]) {
    writeState(entries);
    const result = doctor();
    assert.equal(result.status, 2, result.stdout);
    assert.equal(JSON.parse(result.stdout).meta.error, 'INVALID_STATE');
  }
});

test('doctor validates installed identity and executable without running it', t => {
  const { record, manifest, packageRoot, writeManifest, writeState, doctor } = fixture(t);
  writeState([record]);
  const valid = doctor();
  assert.equal(valid.status, 0, valid.stdout);
  assert.equal(JSON.parse(valid.stdout).ok, true);
  for (const value of [{ ...manifest, name: 'unrelated-package' }, { ...manifest, version: '0.0.0' }, { ...manifest, bin: { other: 'cli.js' } }]) {
    writeManifest(value);
    const result = doctor();
    assert.equal(result.status, 3);
    assert.equal(JSON.parse(result.stdout).ok, false);
  }
  writeManifest(manifest);
  fs.unlinkSync(path.join(packageRoot, 'cli.js'));
  assert.equal(doctor().status, 3);
});
