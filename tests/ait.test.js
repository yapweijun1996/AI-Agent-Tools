const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const ait = require('../bin/ait.js');

const registryPath = path.join(__dirname, '..', 'TOOL_REGISTRY.json');

function captureStdout(callback) {
  const original = process.stdout.write;
  let output = '';
  process.stdout.write = (chunk) => {
    output += String(chunk);
    return true;
  };
  try {
    return { value: callback(), output };
  } finally {
    process.stdout.write = original;
  }
}

test('parses explicit install and dispatch approval flags', () => {
  const options = ait.parseArgs([
    'install',
    'agent-code-slice',
    '--from-path',
    './fixture-package',
    '--allow-experimental',
    '--json',
  ]);
  assert.equal(options.command, 'install');
  assert.equal(options.positionals[0], 'agent-code-slice');
  assert.equal(options.fromPath, './fixture-package');
  assert.equal(options.allowExperimental, true);
  assert.equal(options.json, true);

  const dispatch = ait.parseArgs(['dispatch', 'agent-code-slice', '--allow-execution', '--', '--help']);
  assert.equal(dispatch.allowExecution, true);
  assert.deepEqual(dispatch.passthrough, ['--help']);
});

test('validates the current registry and keeps installability explicit', () => {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  assert.equal(ait.validateRegistry(registry), registry);
  assert.equal(registry.tools.length, 14);
  const codeSlice = registry.tools.find((tool) => tool.id === 'agent-code-slice');
  const resultStore = registry.tools.find((tool) => tool.id === 'agent-result-store');
  assert.equal(Boolean(codeSlice.npm && codeSlice.release_version), true);
  assert.equal(resultStore.npm, null);
});

test('normalizes executable declarations without choosing an unsafe default', () => {
  assert.deepEqual(ait.packageBin({ bin: 'cli.js' }, '@scope/example'), {
    name: 'example',
    path: 'cli.js',
  });
  assert.deepEqual(ait.packageBin({ bin: { zeta: 'z.js', alpha: 'a.js' } }, 'example'), {
    name: 'alpha',
    path: 'a.js',
  });
  assert.throws(() => ait.packageBin({}, 'example'), /declares no executable/);
});

test('rejects registry package names that could escape the install root', () => {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const copy = structuredClone(registry);
  copy.tools[0].npm = { name: '../outside' };
  assert.throws(() => ait.validateRegistry(copy), /npm identity is invalid/);
});

test('list reads a local registry snapshot and does not write the home', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-list-'));
  const captured = captureStdout(() => ait.main([
    'list',
    '--json',
    '--registry',
    registryPath,
    '--home',
    home,
  ]));
  assert.equal(captured.value, 0);
  const output = JSON.parse(captured.output);
  assert.equal(output.protocol, 'ait-result/v1');
  assert.equal(output.ok, true);
  assert.equal(output.data.tools.length, 14);
  assert.equal(fs.existsSync(path.join(home, 'installed.json')), false);
});

test('planned tools fail closed before any installation side effect', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-install-'));
  const captured = captureStdout(() => ait.main([
    'install',
    'agent-result-store',
    '--json',
    '--registry',
    registryPath,
    '--home',
    home,
  ]));
  assert.equal(captured.value, 4);
  const output = JSON.parse(captured.output);
  assert.equal(output.ok, false);
  assert.equal(output.meta.error, 'LIFECYCLE_BLOCKED');
  assert.equal(fs.existsSync(path.join(home, 'installed.json')), false);
});

test('dispatch requires a separate explicit execution approval', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-dispatch-'));
  const captured = captureStdout(() => ait.main([
    'dispatch',
    'agent-code-slice',
    '--json',
    '--home',
    home,
  ]));
  assert.equal(captured.value, 4);
  const output = JSON.parse(captured.output);
  assert.equal(output.ok, false);
  assert.equal(output.meta.error, 'EXECUTION_REQUIRES_APPROVAL');
});
