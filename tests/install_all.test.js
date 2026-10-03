const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AitError, parseArgs, main } = require('../bin/ait.js');
const { installAll, findNpmCli, REPOSITORY } = require('../bin/install-all.js');

const supportedNode = /^(?:22|24)\./.test(process.versions.node);
function write(root, name, content) {
  const filename = path.join(root, name);
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  fs.writeFileSync(filename, content);
}
function git(root, args) {
  const child = spawnSync('git', ['-c', 'core.autocrlf=false', '-c', 'core.hooksPath=' + root, ...args], { cwd: root, encoding: 'utf8' });
  assert.equal(child.status, 0, child.stderr);
  return child.stdout.trim();
}
function fixture() {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ait-install-all-')));
  const source = path.join(root, 'checkout');
  fs.mkdirSync(source);
  const repository = { type: 'git', url: `git+${REPOSITORY}.git` };
  write(source, 'package.json', JSON.stringify({ name: 'ai-agent-tools', version: '0.1.1', repository, bin: { ait: 'bin/ait.js' }, files: ['bin/ait.js', 'README.md', 'LICENSE'], scripts: { prepack: 'node forbidden.js' } }));
  write(source, 'package-lock.json', JSON.stringify({ name: 'ai-agent-tools', version: '0.1.1', lockfileVersion: 3, packages: { '': { name: 'ai-agent-tools', version: '0.1.1' } } }));
  write(source, 'bin/ait.js', '#!/usr/bin/env node\nconsole.log("fixture-ait");\n');
  write(source, 'README.md', '# Fixture\n');
  write(source, 'LICENSE', 'Fixture license\n');
  write(source, 'forbidden.js', 'throw new Error("root prepack must not run");');
  const manifest = {
    name: 'ait-install-fixture', version: '0.1.0', private: true, type: 'commonjs',
    repository: { ...repository, directory: 'packages/fixture' },
    bin: { 'fixture-tool': 'dist/cli.js' }, files: ['dist', 'package.json'],
    scripts: { build: 'node build.js', prebuild: 'node forbidden.js', postbuild: 'node forbidden.js', preinstall: 'node forbidden.js', postinstall: 'node forbidden.js' },
  };
  write(source, 'packages/fixture/package.json', JSON.stringify(manifest));
  write(source, 'packages/fixture/package-lock.json', JSON.stringify({ name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true, packages: { '': { name: manifest.name, version: manifest.version, bin: manifest.bin } } }));
  write(source, 'packages/fixture/build.js', 'const fs=require("fs");fs.mkdirSync("dist",{recursive:true});fs.writeFileSync("dist/cli.js", "#!/usr/bin/env node\\nconsole.log(JSON.stringify({args:process.argv.slice(2),built:true}));\\n");');
  write(source, 'packages/fixture/forbidden.js', 'throw new Error("lifecycle hooks must not run");');
  git(source, ['init', '--quiet']);
  git(source, ['add', '.']);
  git(source, ['-c', 'user.name=Install Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture source']);
  return { root, source, prefix: path.join(root, 'installed'), cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}
function options(source, prefix, extras = []) {
  return parseArgs(['install-all', '--from-path', source, '--prefix', prefix, '--allow-build', '--allow-experimental', '--json', ...extras]);
}
function capture(callback) {
  const original = process.stdout.write;
  let text = '';
  process.stdout.write = (value) => { text += String(value); return true; };
  try { return { exit: callback(), value: JSON.parse(text) }; }
  finally { process.stdout.write = original; }
}

test('install-all parses explicit source, isolated prefix and build approval', () => {
  const opts = parseArgs(['install-all', '--github', REPOSITORY, '--ref', 'main', '--prefix', './tools', '--allow-build', '--allow-experimental']);
  assert.equal(opts.github, REPOSITORY);
  assert.equal(opts.ref, 'main');
  assert.equal(opts.prefix, './tools');
  assert.equal(opts.allowBuild, true);
});

test('install-all denies missing approvals/source and preserves existing prefixes', () => {
  const f = fixture();
  try {
    for (const flag of ['--allow-build', '--allow-experimental']) {
      const opts = options(f.source, f.prefix);
      opts[flag === '--allow-build' ? 'allowBuild' : 'allowExperimental'] = false;
      assert.throws(() => installAll(opts, { AitError }), /requires/);
      assert.equal(fs.existsSync(f.prefix), false);
    }
    const missing = options(f.source, f.prefix); missing.fromPath = null;
    assert.throws(() => installAll(missing, { AitError }), /exactly one/);
    fs.mkdirSync(f.prefix); write(f.prefix, 'personal-marker', 'preserve');
    assert.throws(() => installAll(options(f.source, f.prefix), { AitError }), /already exists/);
    assert.equal(fs.readFileSync(path.join(f.prefix, 'personal-marker'), 'utf8'), 'preserve');
  } finally { f.cleanup(); }
});

test('install-all rejects arbitrary repositories/ref injection and unrelated options before side effects', () => {
  const f = fixture();
  try {
    const remote = options(f.source, f.prefix); remote.fromPath = null; remote.github = 'https://github.com/other/repo';
    assert.throws(() => installAll(remote, { AitError }), /only accepts/);
    remote.github = REPOSITORY; remote.ref = '--upload-pack=bad';
    assert.throws(() => installAll(remote, { AitError }), /Invalid Git/);
    const local = options(f.source, f.prefix); local.home = '/unrelated';
    assert.throws(() => installAll(local, { AitError }), /only accepts explicit source/);
    assert.equal(fs.existsSync(f.prefix), false);
  } finally { f.cleanup(); }
});

test('install-all builds and installs a copied source fixture without lifecycle hooks or source writes', { skip: !supportedNode }, () => {
  const f = fixture();
  try {
    write(f.source, 'unrelated-private.txt', 'do not include');
    write(f.source, 'packages/fixture/authorized-new-source.txt', 'explicit source addition');
    const result = installAll(options(f.source, f.prefix), { AitError });
    assert.equal(result.packages, 2);
    assert.deepEqual(result.bins, ['ait', 'fixture-tool']);
    assert.equal(result.source.kind, 'local_worktree');
    assert.equal(result.source.workspaceDirty, true);
    assert.match(result.source.commit, /^[a-f0-9]{40}$/);
    assert.match(result.source.snapshotSha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(f.source, 'packages/fixture/dist')), false);
    assert.equal(fs.existsSync(path.join(f.source, 'packages/fixture/node_modules')), false);
    assert.equal(fs.existsSync(path.join(f.prefix, '.work')), false);
    const receipt = JSON.parse(fs.readFileSync(result.receipt));
    assert.equal(receipt.configurationChanged, false);
    assert.equal(receipt.lifecycleScriptsExecuted, false);
    assert.equal(receipt.packageBuildScriptsExecuted, true);
    assert.equal(receipt.nativeOptionalCapabilitiesVerified, false);
    assert.equal(receipt.packages[1].private, true);
    assert.match(receipt.packages[1].integrity, /^sha512-/);
    assert.match(receipt.packages[1].installLockSha256, /^[a-f0-9]{64}$/);
    assert.match(receipt.packages[1].runtimeLockSha256, /^[a-f0-9]{64}$/);
    assert.equal(fs.existsSync(path.join(f.source, 'packages/fixture/npm-shrinkwrap.json')), false);
    const node = receipt.nodeExecutable;
    const cli = path.join(f.prefix, 'packages/fixture/node_modules/ait-install-fixture/dist/cli.js');
    const executed = spawnSync(node, [cli, 'two words', '$literal'], { encoding: 'utf8', shell: false });
    assert.equal(executed.status, 0, executed.stderr);
    assert.deepEqual(JSON.parse(executed.stdout), { args: ['two words', '$literal'], built: true });
    if (process.platform !== 'win32') {
      const launcher = spawnSync(path.join(result.pathDirectory, 'fixture-tool'), ['two words', '$literal'], { encoding: 'utf8', shell: false });
      assert.equal(launcher.status, 0, launcher.stderr);
      assert.deepEqual(JSON.parse(launcher.stdout), { args: ['two words', '$literal'], built: true });
    } else assert.match(fs.readFileSync(path.join(result.pathDirectory, 'fixture-tool.cmd'), 'utf8'), /runtime\\node\.exe/);
  } finally { f.cleanup(); }
});

test('install-all packs the source lock as shrinkwrap and keeps an older transitive range resolution offline', { skip: !supportedNode }, () => {
  const f = fixture();
  try {
    const artifacts = path.join(f.root, 'dependency-artifacts'); fs.mkdirSync(artifacts);
    const pack = (name, version, dependencies = {}) => {
      const folder = path.join(f.root, `${name}-${version}`); fs.mkdirSync(folder);
      write(folder, 'package.json', JSON.stringify({ name, version, dependencies }));
      const child = spawnSync(process.execPath, [findNpmCli(), 'pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], { cwd: folder, encoding: 'utf8', env: { ...process.env, npm_config_cache: path.join(f.root, 'pack-cache') } });
      assert.equal(child.status, 0, child.stderr);
      const packed = JSON.parse(child.stdout)[0];
      return { version, resolved: `file:${path.join(artifacts, packed.filename)}`, integrity: packed.integrity };
    };
    const leafOld = pack('ait-fixture-leaf', '1.0.0');
    pack('ait-fixture-leaf', '1.1.0');
    const parent = { ...pack('ait-fixture-parent', '1.0.0', { 'ait-fixture-leaf': '^1.0.0' }), dependencies: { 'ait-fixture-leaf': '^1.0.0' } };
    const filename = path.join(f.source, 'packages/fixture/package.json');
    const manifest = JSON.parse(fs.readFileSync(filename));
    manifest.dependencies = { 'ait-fixture-parent': parent.resolved };
    fs.writeFileSync(filename, JSON.stringify(manifest));
    write(f.source, 'packages/fixture/package-lock.json', JSON.stringify({
      name: manifest.name, version: manifest.version, lockfileVersion: 3, requires: true,
      packages: {
        '': { name: manifest.name, version: manifest.version, dependencies: manifest.dependencies, bin: manifest.bin },
        'node_modules/ait-fixture-parent': parent,
        'node_modules/ait-fixture-leaf': leafOld,
      },
    }));
    const spawn = (command, args, config) => {
      if (command === process.execPath && path.basename(args[0]) === 'npm-cli.js' && (args.includes('ci') || args.includes('install'))) {
        const child = spawnSync(command, [...args, '--offline'], config);
        assert.equal(child.status, 0, child.stderr);
        return child;
      }
      return spawnSync(command, args, config);
    };
    const result = installAll(options(f.source, f.prefix), { AitError, spawn });
    const installedRoot = path.join(f.prefix, 'packages/fixture/node_modules/ait-install-fixture');
    const leafManifest = require.resolve('ait-fixture-leaf/package.json', { paths: [installedRoot] });
    assert.equal(JSON.parse(fs.readFileSync(leafManifest)).version, '1.0.0');
    const sourceLock = fs.readFileSync(path.join(f.source, 'packages/fixture/package-lock.json'));
    assert.deepEqual(fs.readFileSync(path.join(installedRoot, 'npm-shrinkwrap.json')), sourceLock);
    const receipt = JSON.parse(fs.readFileSync(result.receipt));
    assert.equal(receipt.packages[1].runtimeLockSha256, require('node:crypto').createHash('sha256').update(sourceLock).digest('hex'));
  } finally { f.cleanup(); }
});

test('install-all preserves exact GitHub commit semantics using an offline Git transport fixture', { skip: !supportedNode }, () => {
  const f = fixture();
  try {
    const commit = git(f.source, ['rev-parse', 'HEAD']);
    const opts = options(f.source, f.prefix); opts.fromPath = null; opts.github = REPOSITORY; opts.ref = commit;
    let fetched = false;
    const spawn = (command, args, config) => {
      if (command === 'git' && args.includes('fetch')) {
        fetched = true;
        assert.equal(args.at(-2), `${REPOSITORY}.git`);
        assert.equal(args.at(-1), commit);
        assert.equal(config.shell, false);
        assert.equal(config.env.GIT_TERMINAL_PROMPT, '0');
        return spawnSync('git', ['-c', 'protocol.file.allow=always', 'fetch', '--quiet', '--depth=1', '--no-tags', '--no-recurse-submodules', f.source, commit], config);
      }
      return spawnSync(command, args, config);
    };
    const result = installAll(opts, { AitError, spawn });
    assert.equal(fetched, true);
    assert.equal(result.source.kind, 'github_commit');
    assert.equal(result.source.commit, commit);
    assert.equal(result.source.workspaceDirty, false);
    assert.equal(result.source.requestedRef, commit);
  } finally { f.cleanup(); }
});

test('install-all normalizes Git slash-form roots and still rejects nested checkout paths', { skip: !supportedNode }, () => {
  const f = fixture();
  try {
    let rootQueries = 0;
    const spawn = (command, args, config) => {
      if (command === 'git' && args.includes('rev-parse') && args.includes('--show-toplevel')) {
        rootQueries += 1;
        return { status: 0, stdout: `${f.source.replaceAll('\\', '/')}\n`, stderr: '' };
      }
      return spawnSync(command, args, config);
    };
    const installed = installAll(options(f.source, f.prefix), { AitError, spawn });
    assert.equal(installed.source.checkout, f.source);
    assert.equal(rootQueries, 1);
    const nestedPrefix = path.join(f.root, 'nested-rejected');
    assert.throws(() => installAll(options(path.join(f.source, 'packages/fixture'), nestedPrefix), { AitError, spawn }), /must identify the checkout root/);
    assert.equal(rootQueries, 2);
    assert.equal(fs.existsSync(path.join(nestedPrefix, 'INSTALLATION.json')), false);
  } finally { f.cleanup(); }
});

test('install-all rejects credential files, duplicate bins and symlinks before npm execution', { skip: !supportedNode }, () => {
  for (const condition of ['credential', 'duplicate', ...(process.platform === 'win32' ? [] : ['symlink'])]) {
    const f = fixture();
    try {
      if (condition === 'credential') write(f.source, 'packages/fixture/.env', 'PRIVATE=value');
      if (condition === 'duplicate') {
        const filename = path.join(f.source, 'packages/fixture/package.json');
        const manifest = JSON.parse(fs.readFileSync(filename)); manifest.bin = { ait: 'dist/cli.js' };
        fs.writeFileSync(filename, JSON.stringify(manifest));
      }
      if (condition === 'symlink') fs.symlinkSync(path.join(f.root, 'outside'), path.join(f.source, 'packages/fixture/link'));
      let npmStarted = false;
      const spawn = (command, args, config) => { if (command === process.execPath) npmStarted = true; return spawnSync(command, args, config); };
      assert.throws(() => installAll(options(f.source, f.prefix), { AitError, spawn }), condition === 'credential' ? /credential\/configuration/ : condition === 'duplicate' ? /duplicate CLI/ : /symlink/);
      assert.equal(npmStarted, false);
      assert.equal(fs.existsSync(path.join(f.prefix, '.work')), false);
    } finally { f.cleanup(); }
  }
});

test('AIT install-all integration returns its normal JSON error envelope', () => {
  const result = capture(() => main(['install-all', '--json']));
  assert.equal(result.exit, 2);
  assert.equal(result.value.protocol, 'ait-result/v1');
  assert.equal(result.value.ok, false);
  assert.equal(result.value.meta.error, 'INVALID_ARGUMENT');
});

test('install-all withholds changing local file snapshots and does not pass unrelated credentials to builds', { skip: !supportedNode || process.platform === 'win32' }, () => {
  const f = fixture();
  const filename = path.join(f.source, 'packages/fixture/changing.txt');
  const originalRead = fs.readSync;
  const originalSecret = process.env.AIT_FIXTURE_SECRET;
  try {
    write(f.source, 'packages/fixture/changing.txt', 'a'.repeat(65_536));
    let changed = false;
    fs.readSync = (fd, ...args) => {
      const bytes = originalRead(fd, ...args);
      const stat = fs.fstatSync(fd);
      if (!changed && stat.ino === fs.statSync(filename).ino && bytes) {
        changed = true;
        fs.appendFileSync(filename, 'growth');
      }
      return bytes;
    };
    process.env.AIT_FIXTURE_SECRET = 'fixture-value-must-not-be-passed';
    let npmStarted = false;
    const spawn = (command, args, config) => {
      assert.equal(config.env.AIT_FIXTURE_SECRET, undefined);
      if (command === process.execPath) npmStarted = true;
      return spawnSync(command, args, config);
    };
    assert.throws(() => installAll(options(f.source, f.prefix), { AitError, spawn }), /grew while reading|changed while reading/);
    assert.equal(changed, true);
    assert.equal(npmStarted, false);
    assert.equal(fs.existsSync(path.join(f.prefix, 'INSTALLATION.json')), false);
  } finally {
    fs.readSync = originalRead;
    if (originalSecret === undefined) delete process.env.AIT_FIXTURE_SECRET;
    else process.env.AIT_FIXTURE_SECRET = originalSecret;
    f.cleanup();
  }
});

test('install-all rejects a source symlink substituted between validation and open', { skip: !supportedNode || process.platform === 'win32' }, () => {
  const f = fixture();
  const filename = path.join(f.source, 'packages/fixture/substituted.txt');
  const outside = path.join(f.root, 'outside-source');
  const originalOpen = fs.openSync;
  try {
    write(f.source, 'packages/fixture/substituted.txt', 'intended');
    fs.writeFileSync(outside, 'outside');
    let substituted = false;
    fs.openSync = (file, ...args) => {
      if (!substituted && file === filename) {
        substituted = true;
        fs.unlinkSync(filename);
        fs.symlinkSync(outside, filename);
      }
      return originalOpen(file, ...args);
    };
    assert.throws(() => installAll(options(f.source, f.prefix), { AitError }));
    assert.equal(substituted, true);
    assert.equal(fs.existsSync(path.join(f.prefix, 'INSTALLATION.json')), false);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'outside');
  } finally { fs.openSync = originalOpen; f.cleanup(); }
});
