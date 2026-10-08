'use strict';

// Source installation is explicit; discovery/dispatch never calls this module.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const REPOSITORY = 'https://github.com/yapweijun1996/AI-Agent-Tools';
const MAX_FILES = 20_000;
const MAX_SOURCE_BYTES = 64 * 1024 * 1024;
const MAX_PROCESS_BYTES = MAX_SOURCE_BYTES + MAX_FILES * 100;
const TIMEOUT_MS = 120_000;
const HASH = /^[a-f0-9]{40}$/;

function installAll(options, { AitError, spawn = spawnSync } = {}) {
  const fail = (message, code = 'INVALID_SOURCE', exitCode = 4) => {
    throw new AitError(message, exitCode, code);
  };
  if (options.positionals.length || options.passthrough.length || options.registry || options.home || options.cwd || options.profileIndex || options.allowExecution) {
    fail('install-all only accepts explicit source, prefix, build/experimental approval, and JSON options', 'INVALID_ARGUMENT', 2);
  }
  if (!options.prefix || Boolean(options.github) === Boolean(options.fromPath) || (options.ref && !options.github)) {
    fail('install-all requires --prefix NEW_DIR and exactly one of --github URL or --from-path CHECKOUT', 'INVALID_ARGUMENT', 2);
  }
  if (!options.allowExperimental) fail('Source tools are Experimental; install-all requires --allow-experimental', 'EXPERIMENTAL_REQUIRES_APPROVAL');
  if (!options.allowBuild) fail('Source installation executes package build scripts; install-all requires --allow-build', 'BUILD_REQUIRES_APPROVAL');
  if (options.github && options.github.replace(/\.git\/?$/, '').replace(/\/$/, '') !== REPOSITORY) {
    fail(`This source installer only accepts ${REPOSITORY}`, 'REPOSITORY_NOT_ALLOWED');
  }
  const ref = options.ref || 'HEAD';
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref) || ref.includes('..') || ref.endsWith('/')) {
    fail('Invalid Git source ref', 'INVALID_ARGUMENT', 2);
  }
  const [major, minor] = process.versions.node.split('.').map(Number);
  if (!((major === 22 && minor >= 13) || major === 24)) fail('Use Node 22.13+ or Node 24', 'UNSUPPORTED_NODE', 2);

  const requestedPrefix = path.resolve(options.prefix);
  if (fs.existsSync(requestedPrefix)) fail('Prefix already exists; choose a new directory to preserve prior installations', 'PREFIX_EXISTS', 2);
  const parent = path.dirname(requestedPrefix);
  if (!fs.existsSync(parent) || !fs.statSync(parent).isDirectory()) fail('Prefix parent must be an existing directory', 'INVALID_PREFIX', 2);
  const prefix = path.join(fs.realpathSync(parent), path.basename(requestedPrefix));
  if (process.platform === 'win32' && /[%!"\r\n]/.test(prefix)) fail('Prefix contains unsupported Windows launcher characters', 'UNSAFE_PATH');
  fs.mkdirSync(prefix, { mode: 0o700 });
  const work = path.join(prefix, '.work');
  const sourceRoot = path.join(work, 'source');
  fs.mkdirSync(sourceRoot, { recursive: true, mode: 0o700 });
  const emptyConfig = path.join(work, 'empty-config');
  const emptyGlobalConfig = path.join(work, 'empty-global-config');
  const emptyHooks = path.join(work, 'empty-hooks');
  fs.writeFileSync(emptyConfig, '', { mode: 0o600 });
  fs.writeFileSync(emptyGlobalConfig, '', { mode: 0o600 });
  fs.mkdirSync(emptyHooks, { mode: 0o700 });
  const allowedEnvironment = new Set(['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'WINDIR', 'SYSTEMDRIVE', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'COMSPEC', 'LANG', 'LC_ALL', 'TZ']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowedEnvironment.has(key)));
  const searchPath = env.PATH || env.Path || '';
  if (process.platform === 'win32') delete env.Path;
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: emptyConfig,
    GIT_TERMINAL_PROMPT: '0', GIT_TEMPLATE_DIR: emptyHooks,
    npm_config_userconfig: emptyConfig, npm_config_globalconfig: emptyGlobalConfig,
    npm_config_cache: path.join(prefix, '.cache', 'npm'),
    npm_config_ignore_scripts: 'true', npm_config_audit: 'false', npm_config_fund: 'false',
    PATH: `${path.dirname(process.execPath)}${path.delimiter}${searchPath}`,
  });
  function run(command, args, cwd, input, binary = false) {
    const child = spawn(command, args, {
      cwd, env, input, encoding: binary ? undefined : 'utf8', shell: false,
      stdio: ['pipe', 'pipe', 'pipe'], timeout: TIMEOUT_MS,
      maxBuffer: binary ? MAX_PROCESS_BYTES : 1_048_576, windowsHide: true,
    });
    if (child.error || child.status !== 0) {
      fail(`${path.basename(command)} failed${child.status === null ? '' : ` with exit ${child.status}`}; partial isolated prefix retained at ${prefix}`, 'INSTALL_PROCESS_FAILED', 1);
    }
    return child.stdout;
  }
  const gitArgs = ['-c', `core.hooksPath=${emptyHooks}`, '-c', 'core.fsmonitor=false', '-c', 'core.autocrlf=false', '-c', 'protocol.file.allow=never'];
  const git = (args, cwd, input, binary) => run('git', [...gitArgs, ...args], cwd, input, binary);
  const progress = (message) => { if (!options.json) process.stderr.write(`[install-all] ${message}\n`); };
  const hash = (value) => createHash('sha256').update(value).digest('hex');
  const portablePath = (value) => {
    const parts = value.split('/');
    if (!value || value.includes('\\') || /[\x00-\x1f\x7f:*?<>"|]/.test(value) || path.posix.isAbsolute(value)
      || parts.some((part) => !part || part === '.' || part === '..' || part.toLowerCase() === '.git'
        || /[. ]$/.test(part) || /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\.|$)/i.test(part))) {
      fail(`Unsafe source path: ${value}`, 'UNSAFE_PATH');
    }
    if (parts.some((part) => /^(?:\.npmrc|\.env(?:\..*)?)$/i.test(part))) {
      fail('Source snapshot contains credential/configuration file; remove it from this source install input', 'SENSITIVE_SOURCE_FILE');
    }
    return value;
  };
  const entries = [];
  const seen = new Set();
  let sourceBytes = 0;
  function copyEntry(name, data, executable) {
    portablePath(name);
    const folded = name.toLowerCase();
    if (seen.has(folded)) fail(`Source path collision: ${name}`, 'SOURCE_PATH_COLLISION');
    seen.add(folded);
    sourceBytes += data.length;
    if (entries.length >= MAX_FILES || sourceBytes > MAX_SOURCE_BYTES) fail('Source snapshot exceeds its file or byte limit', 'SOURCE_LIMIT', 3);
    const target = path.join(sourceRoot, ...name.split('/'));
    fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
    fs.writeFileSync(target, data, { flag: 'wx', mode: executable ? 0o755 : 0o644 });
    entries.push({ path: name, sha256: hash(data), bytes: data.length });
  }
  let source;
  function readLocalFile(filename, budget) {
    const before = fs.lstatSync(filename);
    if (!before.isFile() || before.isSymbolicLink()) fail('Local source snapshot contains a non-regular file', 'UNSUPPORTED_SOURCE_ENTRY');
    if (before.size > budget) fail('Source snapshot exceeds its byte limit', 'SOURCE_LIMIT', 3);
    const identity = (a, b) => a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
    let fd;
    try {
      fd = fs.openSync(filename, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
      const opened = fs.fstatSync(fd);
      if (!opened.isFile() || !identity(before, opened)) fail('Local source changed before reading', 'SOURCE_CHANGED');
      const chunks = [];
      const buffer = Buffer.alloc(Math.min(65_536, before.size + 1));
      let bytes = 0;
      while (true) {
        const read = fs.readSync(fd, buffer, 0, Math.min(buffer.length, before.size - bytes + 1), null);
        if (!read) break;
        bytes += read;
        if (bytes > before.size || bytes > budget) fail('Local source grew while reading', 'SOURCE_CHANGED');
        chunks.push(Buffer.from(buffer.subarray(0, read)));
      }
      if (bytes !== before.size || !identity(opened, fs.fstatSync(fd)) || !identity(opened, fs.lstatSync(filename)) || fs.realpathSync(filename) !== filename) fail('Local source changed while reading', 'SOURCE_CHANGED');
      return Buffer.concat(chunks, bytes);
    } finally { if (fd !== undefined) fs.closeSync(fd); }
  }
  try {
    if (options.github) {
      progress(`Fetching ${REPOSITORY} at ${ref}`);
      const gitRoot = path.join(work, 'git');
      fs.mkdirSync(gitRoot, { mode: 0o700 });
      git(['init', '--quiet'], gitRoot);
      git(['-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always', 'fetch', '--quiet', '--depth=1', '--no-tags', '--no-recurse-submodules', '--no-auto-gc', '--', `${REPOSITORY}.git`, ref], gitRoot);
      const commit = git(['rev-parse', '--verify', 'FETCH_HEAD^{commit}'], gitRoot).trim();
      if (!HASH.test(commit)) fail('Git did not resolve a supported immutable commit', 'INVALID_COMMIT');
      if (HASH.test(ref) && commit !== ref) fail('Fetched source commit differs from the requested commit', 'COMMIT_MISMATCH');
      const listing = git(['ls-tree', '-rz', '--full-tree', commit], gitRoot, undefined, true);
      const records = listing.toString('utf8').split('\0').filter(Boolean).map((record) => {
        const match = /^(100644|100755) blob ([a-f0-9]{40})\t([\s\S]+)$/.exec(record);
        if (!match) fail('Source commit contains an unsupported symlink, submodule, or tree record', 'UNSUPPORTED_SOURCE_ENTRY');
        portablePath(match[3]);
        return { mode: match[1], object: match[2], path: match[3] };
      });
      if (records.length > MAX_FILES) fail('Source snapshot exceeds its file limit', 'SOURCE_LIMIT', 3);
      const blobs = git(['cat-file', '--batch'], gitRoot, `${records.map((record) => record.object).join('\n')}\n`, true);
      let offset = 0;
      for (const record of records) {
        const end = blobs.indexOf(10, offset);
        const match = /^([a-f0-9]{40}) blob (\d+)$/.exec(blobs.subarray(offset, end).toString('ascii'));
        if (end < offset || !match || match[1] !== record.object) fail('Invalid Git blob batch evidence', 'INVALID_GIT_OBJECT');
        const size = Number(match[2]);
        offset = end + 1;
        if (!Number.isSafeInteger(size) || size > MAX_SOURCE_BYTES || offset + size >= blobs.length || blobs[offset + size] !== 10) fail('Invalid Git blob size', 'INVALID_GIT_OBJECT');
        copyEntry(record.path, blobs.subarray(offset, offset + size), record.mode === '100755');
        offset += size + 1;
      }
      if (offset !== blobs.length) fail('Unexpected trailing Git blob data', 'INVALID_GIT_OBJECT');
      source = { kind: 'github_commit', repository: REPOSITORY, requestedRef: ref, commit, workspaceDirty: false };
    } else {
      const checkout = fs.realpathSync(path.resolve(options.fromPath));
      const gitRoot = fs.realpathSync(path.resolve(git(['rev-parse', '--show-toplevel'], checkout).trim()));
      const sameRoot = process.platform === 'win32' ? gitRoot.toLowerCase() === checkout.toLowerCase() : gitRoot === checkout;
      if (!sameRoot) fail('--from-path must identify the checkout root', 'INVALID_SOURCE_ROOT');
      const commit = git(['rev-parse', '--verify', 'HEAD'], checkout).trim();
      if (!HASH.test(commit)) fail('Local source has no supported HEAD commit', 'INVALID_COMMIT');
      const manifest = JSON.parse(readLocalFile(path.join(checkout, 'package.json'), 1_048_576).toString('utf8'));
      const allowlist = ['package.json', 'package-lock.json', ...(Array.isArray(manifest.files) ? manifest.files : [])];
      const listing = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'], checkout, undefined, true);
      const selected = [...new Set(listing.toString('utf8').split('\0').filter(Boolean))].filter((name) => name.startsWith('packages/') || allowlist.some((allowed) => name === allowed || name.startsWith(`${allowed.replace(/\/$/, '')}/`))).sort();
      for (const name of selected) {
        portablePath(name);
        const segments = name.split('/');
        let filename = checkout;
        for (const segment of segments) {
          filename = path.join(filename, segment);
          if (fs.lstatSync(filename).isSymbolicLink()) fail('Local source snapshot contains a symlink', 'UNSUPPORTED_SOURCE_ENTRY');
        }
        const stat = fs.lstatSync(filename);
        copyEntry(name, readLocalFile(filename, MAX_SOURCE_BYTES - sourceBytes), (stat.mode & 0o111) !== 0);
      }
      source = { kind: 'local_worktree', repository: REPOSITORY, checkout, commit, workspaceDirty: git(['status', '--porcelain', '--untracked-files=normal'], checkout).trim().length > 0 };
    }
    entries.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    source.snapshotSha256 = hash(entries.map((entry) => `${entry.path}\0${entry.sha256}\n`).join(''));
    source.snapshotFiles = entries.length;
    source.snapshotBytes = sourceBytes;
    const readManifest = (folder) => JSON.parse(fs.readFileSync(path.join(folder, 'package.json'), 'utf8'));
    const rootManifest = readManifest(sourceRoot);
    const ownedRepository = (manifest) => manifest.repository && manifest.repository.url === `git+${REPOSITORY}.git`;
    if (rootManifest.name !== 'ai-agent-tools' || !ownedRepository(rootManifest)) fail('Source root is not the owned AI-Agent-Tools package', 'PACKAGE_IDENTITY_MISMATCH');
    const packageDirectories = fs.readdirSync(path.join(sourceRoot, 'packages')).sort();
    if (!packageDirectories.length) fail('Source snapshot contains no CLI packages', 'PACKAGES_MISSING');
    const inventory = [{ folder: 'ait', sourcePath: sourceRoot, manifest: rootManifest }];
    for (const folder of packageDirectories) {
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(folder)) fail('Unsafe package folder', 'UNSAFE_PATH');
      const packagePath = path.join(sourceRoot, 'packages', folder);
      const manifest = readManifest(packagePath);
      if (!ownedRepository(manifest) || manifest.repository.directory !== `packages/${folder}`) fail(`Package ownership metadata does not match ${folder}`, 'PACKAGE_IDENTITY_MISMATCH');
      if (!fs.existsSync(path.join(packagePath, 'package-lock.json'))) fail(`Package ${folder} has no dependency lockfile`, 'LOCKFILE_MISSING');
      inventory.push({ folder, sourcePath: packagePath, manifest });
    }
    const bins = new Set();
    const identities = new Set();
    for (const item of inventory) {
      const { manifest } = item;
      if (!/^(?:@[a-z0-9._-]+\/)?[a-z0-9][a-z0-9._-]*$/.test(manifest.name) || !/^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/.test(manifest.version) || identities.has(manifest.name)) fail('Unsafe or duplicate package identity', 'PACKAGE_IDENTITY_MISMATCH');
      identities.add(manifest.name);
      item.bins = typeof manifest.bin === 'string' ? { [manifest.name.split('/').pop()]: manifest.bin } : manifest.bin;
      if (!item.bins || typeof item.bins !== 'object' || Array.isArray(item.bins) || !Object.keys(item.bins).length) fail(`Package ${manifest.name} declares no CLI`, 'BIN_MISSING');
      for (const [name, target] of Object.entries(item.bins)) {
        if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(name) || bins.has(name) || typeof target !== 'string') fail('Unsafe or duplicate CLI name', 'BIN_COLLISION');
        portablePath(target.replace(/^\.\//, ''));
        if (!/\.(?:c?js|mjs)$/.test(target)) fail('Only Node JavaScript CLI entrypoints are supported', 'UNSUPPORTED_EXECUTABLE');
        bins.add(name);
      }
    }
    const npmCli = findNpmCli();
    if (!npmCli) fail('npm CLI is unavailable for the selected Node runtime', 'NPM_MISSING', 2);
    const npm = (args, cwd) => run(process.execPath, [npmCli, ...args], cwd);
    const artifacts = path.join(prefix, 'artifacts');
    fs.mkdirSync(artifacts, { mode: 0o700 });
    for (const item of inventory) {
      const sourceLockFile = path.join(item.sourcePath, 'package-lock.json');
      if (!fs.existsSync(sourceLockFile)) fail(`Package ${item.manifest.name} has no dependency lockfile`, 'LOCKFILE_MISSING');
      const sourceLockBytes = fs.readFileSync(sourceLockFile);
      if (item.folder !== 'ait') {
        progress(`Installing locked build dependencies: ${item.manifest.name}`);
        npm(['ci', '--include=dev', '--ignore-scripts', '--no-audit', '--no-fund'], item.sourcePath);
        if (item.manifest.scripts && item.manifest.scripts.build) {
          progress(`Building ${item.manifest.name}`);
          npm(['--ignore-scripts', 'run', 'build'], item.sourcePath);
        }
      }
      // Preserve the exact source lock as artifact evidence. Runtime locking is
      // enforced by the complete mapped consumer lock and npm ci below.
      const lockFile = path.join(item.sourcePath, 'package-lock.json');
      if (!fs.existsSync(lockFile)) fail(`Package ${item.manifest.name} has no dependency lockfile`, 'LOCKFILE_MISSING');
      const lockBytes = fs.readFileSync(lockFile);
      if (!lockBytes.equals(sourceLockBytes)) fail('Build dependencies or scripts changed the source dependency lock', 'LOCKFILE_MISMATCH');
      const lock = JSON.parse(lockBytes);
      if (lock.lockfileVersion !== 3 || lock.name !== item.manifest.name || lock.version !== item.manifest.version || !lock.packages || !lock.packages['']) fail('Source dependency lock identity or schema mismatch', 'LOCKFILE_MISMATCH');
      const shrinkwrap = path.join(item.sourcePath, 'npm-shrinkwrap.json');
      if (fs.existsSync(shrinkwrap) && !fs.readFileSync(shrinkwrap).equals(lockBytes)) fail('Existing shrinkwrap differs from the authoritative source lock', 'LOCKFILE_MISMATCH');
      fs.writeFileSync(shrinkwrap, lockBytes);
      item.runtimeLockSha256 = hash(lockBytes);
      // Include frozen producer evidence in the temporary artifact. Installation
      // below uses its own complete, mapped lock with npm ci, never npm install.
      const packedManifest = { ...item.manifest };
      if (Array.isArray(item.manifest.files) && !item.manifest.files.includes('npm-shrinkwrap.json')) packedManifest.files = [...item.manifest.files, 'npm-shrinkwrap.json'];
      fs.writeFileSync(path.join(item.sourcePath, 'package.json'), `${JSON.stringify(packedManifest, null, 2)}\n`);
      progress(`Packing ${item.manifest.name}`);
      const packed = JSON.parse(npm(['pack', '--ignore-scripts', '--json', '--pack-destination', artifacts], item.sourcePath));
      if (!Array.isArray(packed) || packed.length !== 1 || packed[0].name !== item.manifest.name || packed[0].version !== item.manifest.version || !/^[A-Za-z0-9._-]+\.tgz$/.test(packed[0].filename)) fail('npm packed an unexpected artifact', 'ARTIFACT_MISMATCH');
      if (!Array.isArray(packed[0].files) || !packed[0].files.some((file) => file.path === 'npm-shrinkwrap.json')) fail('Packed artifact excludes its frozen runtime lock', 'LOCKFILE_MISSING');
      const artifact = path.join(artifacts, packed[0].filename);
      const bytes = fs.readFileSync(artifact);
      const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
      if (integrity !== packed[0].integrity) fail('Packed artifact integrity mismatch', 'ARTIFACT_MISMATCH');
      const targetRoot = path.join(prefix, 'packages', item.folder);
      fs.mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
      const artifactSpec = `file:${artifact}`;
      const consumerManifest = { name: `ait-source-${item.folder}`, version: '0.0.0', private: true, dependencies: { [item.manifest.name]: artifactSpec } };
      const packageLocation = `node_modules/${item.manifest.name}`;
      const consumerPackages = { '': { name: consumerManifest.name, version: consumerManifest.version, dependencies: consumerManifest.dependencies } };
      for (const [location, record] of Object.entries(lock.packages)) {
        if (location && (!location.startsWith('node_modules/') || record.link)) fail('Source lock has an unsupported package location/link', 'LOCKFILE_MISMATCH');
        if (location) portablePath(location);
        consumerPackages[location ? `${packageLocation}/${location}` : packageLocation] = location ? record : { ...record, resolved: artifactSpec, integrity };
      }
      const consumerLock = { name: consumerManifest.name, version: consumerManifest.version, lockfileVersion: 3, requires: true, packages: consumerPackages };
      fs.writeFileSync(path.join(targetRoot, 'package.json'), `${JSON.stringify(consumerManifest, null, 2)}\n`);
      fs.writeFileSync(path.join(targetRoot, 'package-lock.json'), `${JSON.stringify(consumerLock, null, 2)}\n`);
      npm(['ci', '--omit=dev', '--ignore-scripts', '--no-audit', '--no-fund'], targetRoot);
      const installed = path.join(targetRoot, 'node_modules', ...item.manifest.name.split('/'));
      const installedManifest = readManifest(installed);
      if (installedManifest.name !== item.manifest.name || installedManifest.version !== item.manifest.version) fail('Installed artifact identity mismatch', 'PACKAGE_IDENTITY_MISMATCH');
      const installedShrinkwrap = path.join(installed, 'npm-shrinkwrap.json');
      if (!fs.existsSync(installedShrinkwrap) || hash(fs.readFileSync(installedShrinkwrap)) !== item.runtimeLockSha256) fail('Installed runtime shrinkwrap differs from source dependency lock', 'LOCKFILE_MISMATCH');
      item.installedRoot = installed;
      item.artifact = packed[0].filename;
      item.integrity = integrity;
      item.installLockSha256 = hash(fs.readFileSync(path.join(targetRoot, 'package-lock.json')));
      for (const binTarget of Object.values(item.bins)) {
        const filename = fs.realpathSync(path.join(installed, binTarget));
        const relative = path.relative(fs.realpathSync(installed), filename);
        if (relative.startsWith('..') || path.isAbsolute(relative) || !fs.statSync(filename).isFile()) fail('Installed CLI escapes its package', 'UNSAFE_PATH');
      }
    }
    const runtime = path.join(prefix, 'runtime');
    const binDirectory = path.join(prefix, 'bin');
    fs.mkdirSync(runtime, { mode: 0o700 });
    fs.mkdirSync(binDirectory, { mode: 0o700 });
    const nodeExecutable = path.join(runtime, process.platform === 'win32' ? 'node.exe' : 'node');
    const sourceNodeExecutable = fs.realpathSync(process.execPath);
    fs.copyFileSync(sourceNodeExecutable, nodeExecutable);
    // Some system/Homebrew Node distributions link libnode beside the binary.
    // Preserve that relative lookup, then verify the copied runtime on this host.
    const copiedNodeLibraries = [];
    const nodeLibDirectory = path.join(path.dirname(path.dirname(sourceNodeExecutable)), 'lib');
    if (fs.existsSync(nodeLibDirectory)) {
      for (const name of fs.readdirSync(nodeLibDirectory).sort()) {
        if (!/^libnode(?:\.[A-Za-z0-9._-]+)?\.(?:dylib|so(?:\.[0-9.]+)?)$/.test(name)) continue;
        const filename = path.join(nodeLibDirectory, name);
        if (!fs.lstatSync(filename).isFile()) continue;
        fs.copyFileSync(filename, path.join(runtime, name));
        copiedNodeLibraries.push({ file: name, sha256: hash(fs.readFileSync(filename)) });
      }
    }
    if (run(nodeExecutable, ['--version'], prefix).trim() !== process.version) fail('Copied Node runtime version mismatch', 'RUNTIME_MISMATCH');
    const runtimeLicense = findNodeLicense(sourceNodeExecutable);
    const licenseCopied = runtimeLicense !== null;
    if (licenseCopied) fs.copyFileSync(runtimeLicense, path.join(runtime, 'LICENSE'));
    const quote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
    for (const item of inventory) for (const [name, target] of Object.entries(item.bins)) {
      const executable = fs.realpathSync(path.join(item.installedRoot, target));
      if (process.platform === 'win32') {
        const relative = path.relative(binDirectory, executable).replaceAll('/', '\\');
        if (/[%!"\r\n]/.test(relative)) fail('Unsupported Windows CLI path', 'UNSAFE_PATH');
        fs.writeFileSync(path.join(binDirectory, `${name}.cmd`), `@"%~dp0..\\runtime\\node.exe" "%~dp0${relative}" %*\r\n`);
      } else {
        fs.writeFileSync(path.join(binDirectory, name), `#!/bin/sh\nexec ${quote(nodeExecutable)} ${quote(executable)} "$@"\n`, { mode: 0o755 });
      }
    }
    const installation = {
      schemaVersion: 'ait-source-install/v1', source, prefix,
      node: process.version, nodeExecutable, sourceNodeExecutable, nodeLicenseCopied: licenseCopied,
      copiedNodeLibraries, runtimeVerifiedOnHost: true, runtimeSelfContained: false,
      packages: inventory.map((item) => ({
        folder: item.folder, name: item.manifest.name, version: item.manifest.version,
        private: item.manifest.private === true, license: item.manifest.license || null,
        bins: Object.keys(item.bins), binTargets: item.bins, artifact: item.artifact,
        integrity: item.integrity, runtimeLockSha256: item.runtimeLockSha256,
        installLockSha256: item.installLockSha256,
      })),
      configurationChanged: false, lifecycleScriptsExecuted: false, packageBuildScriptsExecuted: true,
      nativeOptionalCapabilitiesVerified: false,
      rollback: 'Stop using this prefix and restore the previous PATH. Remove this isolated prefix explicitly after preserving needed artifacts.',
    };
    fs.writeFileSync(path.join(prefix, 'INSTALLATION.json'), `${JSON.stringify(installation, null, 2)}\n`, { mode: 0o600 });
    return { prefix, source, packages: inventory.length, bins: [...bins].sort(), pathDirectory: binDirectory, receipt: path.join(prefix, 'INSTALLATION.json') };
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

function findNpmCli() {
  const candidates = [
    process.env.npm_execpath,
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const folder of (process.env.PATH || process.env.Path || '').split(path.delimiter)) {
    candidates.push(path.join(folder, 'npm'), path.join(folder, 'node_modules', 'npm', 'bin', 'npm-cli.js'));
  }
  for (const candidate of candidates) {
    if (!candidate || !fs.existsSync(candidate)) continue;
    const real = fs.realpathSync(candidate);
    if (path.basename(real) === 'npm-cli.js' && fs.statSync(real).isFile()) return real;
  }
  return null;
}

function findNodeLicense(nodeExecutable) {
  const directory = path.dirname(nodeExecutable);
  for (const candidate of [path.join(directory, 'LICENSE'), path.join(directory, '..', 'LICENSE')]) {
    if (fs.existsSync(candidate) && fs.lstatSync(candidate).isFile()) return candidate;
  }
  return null;
}

module.exports = { installAll, findNpmCli, findNodeLicense, REPOSITORY, MAX_FILES, MAX_SOURCE_BYTES };
