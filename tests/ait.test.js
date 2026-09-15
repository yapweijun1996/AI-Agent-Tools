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

  const dispatch = ait.parseArgs(['dispatch', 'agent-code-slice', '--allow-execution', '--profile-index', './profiles.json', '--', '--help']);
  assert.equal(dispatch.allowExecution, true);
  assert.equal(dispatch.profileIndex, './profiles.json');
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

test('published package includes the default registry snapshot', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.equal(packageJson.files.includes('TOOL_REGISTRY.json'), true);
  assert.equal(packageJson.files.includes('docs/profiles/PROFILE_INDEX.json'), true);
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

test('validates exact profile catalog entries and rejects duplicate matches', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', 'profiles', 'PROFILE_INDEX.json'), 'utf8'));
  assert.equal(ait.validateProfileCatalog(catalog), catalog);
  const duplicate = structuredClone(catalog);
  duplicate.profiles.push(structuredClone(duplicate.profiles[0]));
  assert.throws(() => ait.validateProfileCatalog(duplicate), /Duplicate profile id/);
  const unsafePath = structuredClone(catalog);
  unsafePath.profiles[0].document = '../outside.md';
  assert.throws(() => ait.validateProfileCatalog(unsafePath), /Invalid profile document/);
  assert.equal(ait.selectProfile(
    { id: 'agent-code-slice' },
    { package: 'agent-code-slice', version: '0.2.0', bin: { name: 'code-slice' } },
    catalog,
  ).profile_id, 'hub-consumer/agent-code-slice@0.1');
  assert.equal(ait.selectProfile(
    { id: 'agent-project-profile' },
    { package: 'agent-project-profile', version: '0.1.1', bin: { name: 'agent-project-profile' } },
    catalog,
  ), null);
  assert.equal(ait.selectProfile(
    { id: 'agent-cfml-check' },
    { package: 'agent-cfml-check', version: '0.1.1', bin: { name: 'agent-cfml-check' } },
    catalog,
  ).profile_id, 'hub-consumer/agent-cfml-check@0.1');
  assert.equal(ait.selectProfile(
    { id: 'agent-symbol-search' },
    { package: 'agent-symbol-search', version: '0.1.2', bin: { name: 'agent-symbol-search' } },
    catalog,
  ).profile_id, 'hub-consumer/agent-symbol-search@0.1');
  const testScopeProfile = catalog.profiles.find((profile) => profile.tool_id === 'agent-test-scope');
  assert.deepEqual(ait.validateNativeProfile(testScopeProfile, JSON.stringify({
    schemaVersion: '1',
    status: 'partial',
    data: {},
    diagnostics: [],
    truncation: { truncated: true, reasons: ['RESOURCE_LIMIT'] },
    stats: {},
  }), 0), { passed: true, classification: 'partial' });
  const changeImpactProfile = catalog.profiles.find((profile) => profile.tool_id === 'agent-change-impact');
  assert.deepEqual(ait.validateNativeProfile(changeImpactProfile, JSON.stringify({
    schemaVersion: '0.1-draft',
    ok: true,
    operation: 'capabilities',
    unresolved: [],
    warnings: [],
  }), 0), { passed: true, classification: 'capabilities' });
  const projectProfile = catalog.profiles.find((profile) => profile.tool_id === 'agent-project-profile');
  assert.deepEqual(ait.validateNativeProfile(projectProfile, JSON.stringify({
    schemaVersion: '1.0',
    status: 'partial',
    coverage: { status: 'partial' },
    warnings: [],
  }), 2), { passed: true, classification: 'partial' });
  const cfmlProfile = catalog.profiles.find((profile) => profile.tool_id === 'agent-cfml-check');
  assert.deepEqual(ait.validateNativeProfile(cfmlProfile, JSON.stringify({
    schema_version: '1.0.0',
    tool: { id: 'agent-cfml-check', version: '0.1.1' },
    status: 'incomplete',
    complete: false,
    data: null,
    errors: [{ code: 'UNSUPPORTED_SYNTAX', message: 'fixture' }],
    warnings: [],
    meta: { scope: 'fixture', limits: {} },
  }), 3, ['check']), { passed: true, classification: 'incomplete' });
  const symbolProfile = catalog.profiles.find((profile) => profile.tool_id === 'agent-symbol-search');
  assert.deepEqual(ait.validateNativeProfile(symbolProfile, JSON.stringify({
    schemaVersion: '1',
    status: 'complete',
    data: { matches: [] },
    diagnostics: [],
    truncation: { truncated: false, reasons: [] },
    stats: {},
  }), 0, ['capabilities']), { passed: true, classification: 'capabilities' });
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

test('dispatch applies the exact native profile without rewriting its payload', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ait-profile-'));
  const packagePath = path.join(root, 'package');
  const home = path.join(root, 'home');
  fs.mkdirSync(packagePath, { recursive: true });
  fs.writeFileSync(path.join(packagePath, 'package.json'), JSON.stringify({
    name: 'agent-code-slice',
    version: '0.2.0',
    bin: { 'code-slice': 'cli.js' },
  }));
  fs.writeFileSync(path.join(packagePath, 'cli.js'), [
    '#!/usr/bin/env node',
    'console.log(JSON.stringify({schemaVersion:"1.0",ok:true,operation:"symbol",result:{fixture:true},warnings:[],meta:{}}))',
  ].join('\n'));
  try {
    const install = captureStdout(() => ait.main([
      'install', 'agent-code-slice', '--from-path', packagePath, '--allow-experimental', '--json',
      '--registry', registryPath, '--home', home,
    ]));
    assert.equal(install.value, 0);
    const dispatch = captureStdout(() => ait.main([
      'dispatch', 'agent-code-slice', '--allow-execution', '--json',
      '--registry', registryPath, '--home', home, '--', '--fixture',
    ]));
    assert.equal(dispatch.value, 0);
    const output = JSON.parse(dispatch.output);
    assert.equal(output.ok, true);
    assert.equal(output.data.result.fixture, true);
    assert.deepEqual(output.meta.profile, {
      id: 'hub-consumer/agent-code-slice@0.1',
      protocol: 'code-slice-native-v1',
      classification: 'complete',
      validation: 'passed',
      message: null,
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
