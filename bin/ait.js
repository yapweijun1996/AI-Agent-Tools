#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const VERSION = '0.1.0';
const RESULT_PROTOCOL = 'ait-result/v1';
const INSTALL_STATE_VERSION = 'ait-install-state/v1';
const PROFILE_INDEX_VERSION = '1.0.0';
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_OUTPUT_BYTES = 1_048_576;
const LIFECYCLES = new Set(['Planned', 'Experimental', 'Verified', 'Stable', 'Deprecated']);

class AitError extends Error {
  constructor(message, exitCode = 2, code = 'AIT_ERROR', details = null) {
    super(message);
    this.name = 'AitError';
    this.exitCode = exitCode;
    this.code = code;
    this.details = details;
  }
}

function usage() {
  return [
    'Usage:',
    '  ait list [--json] [--registry PATH] [--home PATH]',
    '  ait doctor [--json] [--registry PATH] [--home PATH]',
    '  ait install TOOL_ID [--allow-experimental] [--json] [--registry PATH] [--home PATH]',
    '  ait install TOOL_ID --from-path PACKAGE_DIR [--allow-experimental] [--json] [--registry PATH] [--home PATH]',
    '  ait dispatch TOOL_ID [--allow-execution] [--cwd PATH] [--json] [--registry PATH] [--home PATH] [--profile-index PATH] -- [ARGS...]',
    '',
    'Installation and execution are always explicit. Registry metadata is not trusted code.',
  ].join('\n');
}

function parseArgs(argv) {
  const options = {
    json: false,
    registry: null,
    home: null,
    cwd: null,
    fromPath: null,
    profileIndex: null,
    allowExperimental: false,
    allowExecution: false,
    command: null,
    positionals: [],
    passthrough: [],
  };
  let passthrough = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (passthrough) {
      options.passthrough.push(arg);
      continue;
    }
    if (arg === '--') {
      passthrough = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--allow-experimental') {
      options.allowExperimental = true;
      continue;
    }
    if (arg === '--allow-execution') {
      options.allowExecution = true;
      continue;
    }
    if (arg === '--help' || arg === '-h') {
      options.command = 'help';
      continue;
    }
    if (arg === '--version' || arg === '-v') {
      options.command = 'version';
      continue;
    }
    if (['--registry', '--home', '--cwd', '--from-path', '--profile-index'].includes(arg)) {
      if (index + 1 >= argv.length) {
        throw new AitError(`${arg} requires a value`, 2, 'INVALID_ARGUMENT');
      }
      const optionName = {
        '--registry': 'registry',
        '--home': 'home',
        '--cwd': 'cwd',
        '--from-path': 'fromPath',
        '--profile-index': 'profileIndex',
      }[arg];
      options[optionName] = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith('-')) {
      throw new AitError(`Unknown option: ${arg}`, 2, 'UNKNOWN_OPTION');
    }
    if (!options.command) {
      options.command = arg;
    } else {
      options.positionals.push(arg);
    }
  }

  if (!options.command) {
    options.command = 'help';
  }
  return options;
}

function readJson(filePath, label) {
  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    throw new AitError(`Cannot read ${label}: ${error.message}`, 1, 'READ_FAILED');
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new AitError(`Invalid JSON in ${label}: ${error.message}`, 2, 'INVALID_JSON');
  }
}

function writeJsonAtomic(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const temporary = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${randomUUID()}.tmp`);
  const content = `${JSON.stringify(value, null, 2)}\n`;
  let descriptor;
  try {
    descriptor = fs.openSync(temporary, 'wx', 0o600);
    fs.writeFileSync(descriptor, content);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, filePath);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function validateRegistry(registry) {
  if (!registry || typeof registry !== 'object' || !Array.isArray(registry.tools)) {
    throw new AitError('Registry must contain a tools array', 2, 'INVALID_REGISTRY');
  }
  const ids = new Set();
  for (const tool of registry.tools) {
    if (!tool || typeof tool !== 'object' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(tool.id)) {
      throw new AitError('Registry contains a tool with an invalid id', 2, 'INVALID_REGISTRY');
    }
    if (ids.has(tool.id)) {
      throw new AitError(`Registry contains duplicate id: ${tool.id}`, 2, 'INVALID_REGISTRY');
    }
    ids.add(tool.id);
    if (!nonEmpty(tool.name) || !nonEmpty(tool.description) || !LIFECYCLES.has(tool.status)) {
      throw new AitError(`Registry tool is incomplete: ${tool.id}`, 2, 'INVALID_REGISTRY');
    }
    if (tool.npm !== null && (typeof tool.npm !== 'object' || !nonEmpty(tool.npm.name) || !isSafePackageName(tool.npm.name))) {
      throw new AitError(`Registry npm identity is invalid: ${tool.id}`, 2, 'INVALID_REGISTRY');
    }
    if (tool.release_version !== null && !nonEmpty(tool.release_version)) {
      throw new AitError(`Registry release version is invalid: ${tool.id}`, 2, 'INVALID_REGISTRY');
    }
  }
  return registry;
}

function registryPath(options) {
  return path.resolve(options.registry || path.join(__dirname, '..', 'TOOL_REGISTRY.json'));
}

function homePath(options) {
  return path.resolve(options.home || process.env.AIT_HOME || path.join(os.homedir(), '.ai-agent-tools'));
}

function loadRegistry(options) {
  return validateRegistry(readJson(registryPath(options), 'registry'));
}

function profileIndexPath(options) {
  return path.resolve(options.profileIndex || path.join(__dirname, '..', 'docs', 'profiles', 'PROFILE_INDEX.json'));
}

function safeRelativeCatalogPath(value, label) {
  if (!nonEmpty(value) || path.isAbsolute(value) || path.posix.isAbsolute(value) || value.includes('\\') || value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..')) {
    throw new AitError(`Invalid ${label}: ${value}`, 2, 'INVALID_PROFILE_INDEX');
  }
  return value;
}

function validateProfileCatalog(catalog) {
  if (!catalog || typeof catalog !== 'object' || catalog.schema_version !== PROFILE_INDEX_VERSION || !Array.isArray(catalog.profiles)) {
    throw new AitError(`Profile catalog must use schema ${PROFILE_INDEX_VERSION}`, 2, 'INVALID_PROFILE_INDEX');
  }
  const ids = new Set();
  const keys = new Set();
  for (const profile of catalog.profiles) {
    if (!profile || typeof profile !== 'object' || !nonEmpty(profile.profile_id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(profile.tool_id)) {
      throw new AitError('Profile catalog contains an invalid profile identity', 2, 'INVALID_PROFILE_INDEX');
    }
    if (ids.has(profile.profile_id)) throw new AitError(`Duplicate profile id: ${profile.profile_id}`, 2, 'INVALID_PROFILE_INDEX');
    ids.add(profile.profile_id);
    if (!isSafePackageName(profile.package_name) || !/^\d+\.\d+\.\d+$/.test(profile.package_version) || !nonEmpty(profile.executable)) {
      throw new AitError(`Profile identity is incomplete: ${profile.profile_id}`, 2, 'INVALID_PROFILE_INDEX');
    }
    safeSegment(profile.executable, 'profile executable');
    if (!nonEmpty(profile.protocol) || !nonEmpty(profile.document) || !Array.isArray(profile.tests) || profile.tests.length === 0) {
      throw new AitError(`Profile metadata is incomplete: ${profile.profile_id}`, 2, 'INVALID_PROFILE_INDEX');
    }
    safeRelativeCatalogPath(profile.document, 'profile document');
    profile.tests.forEach((testPath) => safeRelativeCatalogPath(testPath, 'profile test path'));
    if (profile.evidence_status !== 'source_observed' && profile.evidence_status !== 'artifact_verified') {
      throw new AitError(`Profile evidence status is invalid: ${profile.profile_id}`, 2, 'INVALID_PROFILE_INDEX');
    }
    if (profile.applicability !== 'exact_package_version') {
      throw new AitError(`Profile applicability is not exact: ${profile.profile_id}`, 2, 'INVALID_PROFILE_INDEX');
    }
    const key = `${profile.tool_id}|${profile.package_name}|${profile.package_version}|${profile.executable}`;
    if (keys.has(key)) throw new AitError(`Duplicate exact profile match: ${key}`, 2, 'INVALID_PROFILE_INDEX');
    keys.add(key);
  }
  return catalog;
}

function loadProfileCatalog(options) {
  const filePath = profileIndexPath(options);
  if (!fs.existsSync(filePath)) return { schema_version: PROFILE_INDEX_VERSION, profiles: [] };
  return validateProfileCatalog(readJson(filePath, 'profile catalog'));
}

function selectProfile(tool, record, catalog) {
  const matches = catalog.profiles.filter((profile) => profile.tool_id === tool.id
    && profile.package_name === record.package
    && profile.package_version === record.version
    && profile.executable === record.bin.name);
  if (matches.length > 1) throw new AitError(`Multiple exact profiles match ${tool.id}`, 2, 'PROFILE_AMBIGUOUS');
  return matches[0] || null;
}

function validationFailure(message) {
  return { passed: false, classification: 'protocol_error', message };
}

function validateNativeProfile(profile, stdout, exitCode, args = []) {
  let value;
  try {
    value = JSON.parse(stdout);
  } catch {
    return validationFailure('Native stdout is not exactly one JSON document');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return validationFailure('Native envelope is not an object');
  if (profile.protocol === 'code-slice-native-v1') {
    if (!['1.0', '1.1'].includes(value.schemaVersion) || typeof value.ok !== 'boolean' || !Array.isArray(value.warnings)) return validationFailure('Code Slice envelope is invalid');
    if (value.schemaVersion === '1.1' && (value.operation !== 'cli' || value.ok !== false)) return validationFailure('Code Slice v1.1 is reserved for CLI errors');
    if (value.schemaVersion === '1.0' && value.operation === 'cli') return validationFailure('Code Slice CLI errors require v1.1');
    if (value.ok) {
      if (exitCode !== 0 || (value.operation !== 'capabilities' && (!value.result || typeof value.result !== 'object'))) return validationFailure('Code Slice success has an invalid exit/status or result');
      const bounded = value.warnings.some((warning) => warning && warning.code === 'OUTLINE_TRUNCATED') || Boolean(value.result && value.result.page && value.result.page.hasMore === true);
      return { passed: true, classification: bounded ? 'bounded_success' : 'complete' };
    }
    if (exitCode === 0 || !value.error || typeof value.error.code !== 'string') return validationFailure('Code Slice failure has an invalid exit/status or error');
    return { passed: true, classification: 'error' };
  }
  if (profile.protocol === 'project-profile-native-v1') {
    if (value.schemaVersion !== '1.0' || !['complete', 'partial', 'unsupported', 'error'].includes(value.status) || !value.coverage || !['complete', 'partial'].includes(value.coverage.status) || !Array.isArray(value.warnings)) return validationFailure('Project Profile envelope is invalid');
    if (value.status === 'complete') {
      const strict = args.includes('--strict');
      if (exitCode === 0 && value.coverage.status === 'complete') return { passed: true, classification: 'complete' };
      if (strict && exitCode === 2 && value.warnings.some((warning) => warning && (warning.severity === 'warning' || warning.severity === 'error'))) return { passed: true, classification: 'strict_rejected' };
      return validationFailure('Project Profile complete status has an invalid exit or coverage');
    }
    if (value.status === 'partial' && exitCode === 2 && value.coverage.status === 'partial') return { passed: true, classification: 'partial' };
    if (value.status === 'unsupported' && exitCode === 2) return { passed: true, classification: 'unsupported' };
    if (value.status === 'error' && exitCode === 1) return { passed: true, classification: 'error' };
    return validationFailure('Project Profile status and exit code disagree');
  }
  if (profile.protocol === 'change-impact-native-v0.1-draft') {
    if (value.schemaVersion !== '0.1-draft' || typeof value.ok !== 'boolean' || !Array.isArray(value.warnings)) return validationFailure('Change Impact envelope is invalid');
    if (value.ok) {
      if (exitCode !== 0 || typeof value.operation !== 'string' || !Array.isArray(value.unresolved)) return validationFailure('Change Impact success has an invalid exit/status');
      if (value.operation === 'capabilities') return { passed: true, classification: 'capabilities' };
      if (!value.analysis || !['complete', 'partial'].includes(value.analysis.status) || !Array.isArray(value.analysis.stopReasons)) return validationFailure('Change Impact analysis status is invalid');
      return { passed: true, classification: value.analysis.status === 'partial' ? 'partial_success' : 'complete' };
    }
    if (![1, 2].includes(exitCode) || !value.error || typeof value.error.code !== 'string') return validationFailure('Change Impact failure has an invalid exit/status or error');
    return { passed: true, classification: 'error' };
  }
  if (profile.protocol === 'test-scope-native-v1') {
    if (value.schemaVersion !== '1' || !['complete', 'partial', 'error'].includes(value.status) || !value.data || typeof value.data !== 'object' || Array.isArray(value.data) || !Array.isArray(value.diagnostics) || !value.truncation || typeof value.truncation.truncated !== 'boolean' || !Array.isArray(value.truncation.reasons) || !value.stats || typeof value.stats !== 'object' || Array.isArray(value.stats)) return validationFailure('Test Scope envelope is invalid');
    if (value.status === 'complete' && exitCode === 0) return { passed: true, classification: 'complete' };
    if (value.status === 'partial' && exitCode === 0) return { passed: true, classification: 'partial' };
    if (value.status === 'error' && [1, 2].includes(exitCode)) return { passed: true, classification: 'error' };
    return validationFailure('Test Scope status and exit code disagree');
  }
  return validationFailure(`Unsupported profile protocol: ${profile.protocol}`);
}

function loadState(home) {
  const statePath = path.join(home, 'installed.json');
  if (!fs.existsSync(statePath)) {
    return { schema_version: INSTALL_STATE_VERSION, installed: [] };
  }
  const state = readJson(statePath, 'installation state');
  if (state.schema_version !== INSTALL_STATE_VERSION || !Array.isArray(state.installed)) {
    throw new AitError('Installation state has an unsupported schema', 2, 'INVALID_STATE');
  }
  return state;
}

function saveState(home, state) {
  writeJsonAtomic(path.join(home, 'installed.json'), state);
}

function result(data, status = 'ok', ok = true, meta = {}) {
  return {
    protocol: RESULT_PROTOCOL,
    ok,
    status,
    data,
    meta: { ...meta, ait_version: VERSION },
  };
}

function findTool(registry, id) {
  const tool = registry.tools.find((candidate) => candidate.id === id);
  if (!tool) {
    throw new AitError(`Unknown registry tool: ${id}`, 2, 'UNKNOWN_TOOL');
  }
  return tool;
}

function assertInstallAllowed(tool, allowExperimental) {
  if (tool.status === 'Deprecated' || tool.status === 'Planned') {
    throw new AitError(`Tool ${tool.id} is not installable at lifecycle ${tool.status}`, 4, 'LIFECYCLE_BLOCKED');
  }
  if (tool.status === 'Experimental' && !allowExperimental) {
    throw new AitError(`Tool ${tool.id} is Experimental; repeat with --allow-experimental`, 4, 'EXPERIMENTAL_REQUIRES_APPROVAL');
  }
  if (!tool.npm || !nonEmpty(tool.npm.name) || !nonEmpty(tool.release_version)) {
    throw new AitError(`Tool ${tool.id} has no confirmed npm identity and release version`, 4, 'PACKAGE_IDENTITY_UNKNOWN');
  }
}

function safeSegment(value, label) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value)) {
    throw new AitError(`Unsafe ${label}: ${value}`, 4, 'UNSAFE_PATH');
  }
  return value;
}

function isSafePackageName(value) {
  return typeof value === 'string'
    && /^(?:@[A-Za-z0-9._-]+\/)?[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function packageRoot(target, packageName) {
  if (!isSafePackageName(packageName)) {
    throw new AitError(`Unsafe package name: ${packageName}`, 4, 'UNSAFE_PATH');
  }
  const segments = packageName.split('/').map((segment, index) => {
    if (index === 0 && segment.startsWith('@')) {
      if (!/^@[A-Za-z0-9._-]+$/.test(segment)) {
        throw new AitError(`Unsafe package name: ${packageName}`, 4, 'UNSAFE_PATH');
      }
      return segment;
    }
    return safeSegment(segment, 'package name');
  });
  return path.join(target, 'node_modules', ...segments);
}

function npmInvocation() {
  if (process.platform === 'win32') {
    const lifecyclePath = process.env.npm_execpath;
    const bundledPath = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    const npmCli = lifecyclePath && fs.existsSync(lifecyclePath) ? lifecyclePath : bundledPath;
    if (fs.existsSync(npmCli)) return { command: process.execPath, prefix: [npmCli] };
  }
  return { command: 'npm', prefix: [] };
}

function runNpm(args, jsonMode) {
  const invocation = npmInvocation();
  const child = spawnSync(invocation.command, [...invocation.prefix, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: DEFAULT_OUTPUT_BYTES,
    windowsHide: true,
  });
  if (child.error) {
    throw new AitError(`npm installation failed to start: ${child.error.message}`, 1, 'NPM_START_FAILED');
  }
  if (!jsonMode && child.stdout) process.stderr.write(child.stdout);
  if (!jsonMode && child.stderr) process.stderr.write(child.stderr);
  if (child.status !== 0) {
    throw new AitError(`npm installation failed with exit code ${child.status}`, 1, 'NPM_INSTALL_FAILED', {
      exit_code: child.status,
      stderr: child.stderr || '',
    });
  }
}

function packageBin(packageJson, packageName) {
  if (typeof packageJson.bin === 'string') {
    if (!nonEmpty(packageJson.bin)) {
      throw new AitError(`Installed package ${packageName} declares no executable`, 4, 'BIN_MISSING');
    }
    return { name: packageName.split('/').pop(), path: packageJson.bin };
  }
  if (!packageJson.bin || typeof packageJson.bin !== 'object') {
    throw new AitError(`Installed package ${packageName} declares no executable`, 4, 'BIN_MISSING');
  }
  const names = Object.keys(packageJson.bin).sort();
  if (names.length === 0 || !nonEmpty(packageJson.bin[names[0]])) {
    throw new AitError(`Installed package ${packageName} declares no executable`, 4, 'BIN_MISSING');
  }
  return { name: safeSegment(names[0], 'executable name'), path: packageJson.bin[names[0]] };
}

function installTool(options) {
  const registry = loadRegistry(options);
  const id = options.positionals[0];
  if (!id) throw new AitError('install requires a registry tool id', 2, 'MISSING_TOOL');
  const tool = findTool(registry, id);
  assertInstallAllowed(tool, options.allowExperimental);
  const home = homePath(options);
  const target = path.join(home, 'packages', safeSegment(tool.id, 'tool id'), safeSegment(tool.release_version, 'release version'));
  const packageName = tool.npm.name;
  const installedRoot = packageRoot(target, packageName);
  const source = options.fromPath ? path.resolve(options.fromPath) : `${packageName}@${tool.release_version}`;
  if (options.fromPath && !fs.existsSync(path.join(source, 'package.json'))) {
    throw new AitError(`Local package has no package.json: ${source}`, 2, 'PACKAGE_MANIFEST_MISSING');
  }
  if (fs.existsSync(path.join(installedRoot, 'package.json'))) {
    const state = loadState(home);
    const existing = state.installed.find((entry) => entry.id === tool.id && entry.version === tool.release_version);
    if (existing) return result({ tool: tool.id, package: existing.package, already_installed: true }, 'ok', true);
  }

  fs.mkdirSync(target, { recursive: true, mode: 0o700 });
  const rootPackage = {
    name: `ait-install-${tool.id}`,
    version: '0.0.0',
    private: true,
  };
  writeJsonAtomic(path.join(target, 'package.json'), rootPackage);
  runNpm([
    'install',
    '--prefix', target,
    '--ignore-scripts',
    '--no-audit',
    '--no-fund',
    '--no-package-lock',
    '--save-exact',
    source,
  ], options.json);

  const installedPackage = readJson(path.join(installedRoot, 'package.json'), 'installed package manifest');
  if (installedPackage.name !== packageName) {
    throw new AitError(`Installed package name mismatch: expected ${packageName}`, 4, 'PACKAGE_IDENTITY_MISMATCH');
  }
  if (installedPackage.version !== tool.release_version) {
    throw new AitError(`Installed package version mismatch: expected ${tool.release_version}`, 4, 'PACKAGE_VERSION_MISMATCH');
  }
  const bin = packageBin(installedPackage, packageName);
  const state = loadState(home);
  state.installed = state.installed.filter((entry) => entry.id !== tool.id);
  state.installed.push({
    id: tool.id,
    name: tool.name,
    package: packageName,
    version: installedPackage.version || tool.release_version,
    root: target,
    bin,
    source: options.fromPath ? { kind: 'path', value: source } : { kind: 'npm', value: source },
    execution_approved: false,
    installed_at: new Date().toISOString(),
  });
  saveState(home, state);
  return result({ tool: tool.id, package: packageName, version: installedPackage.version || tool.release_version }, 'ok', true);
}

function listTools(options) {
  const registry = loadRegistry(options);
  const state = loadState(homePath(options));
  const installed = new Map(state.installed.map((entry) => [entry.id, entry]));
  return result({
    registry: path.relative(process.cwd(), registryPath(options)) || '.',
    tools: registry.tools.map((tool) => ({
      id: tool.id,
      name: tool.name,
      status: tool.status,
      installable: Boolean(tool.npm && tool.release_version && !['Planned', 'Deprecated'].includes(tool.status)),
      package: tool.npm ? tool.npm.name : null,
      release_version: tool.release_version,
      installed: installed.has(tool.id),
    })),
  });
}

function doctor(options) {
  const registry = loadRegistry(options);
  const home = homePath(options);
  const state = loadState(home);
  const issues = [];
  for (const entry of state.installed) {
    if (!registry.tools.some((tool) => tool.id === entry.id)) {
      issues.push({ id: entry.id, code: 'NOT_IN_REGISTRY', message: 'Installed tool is absent from the selected registry' });
      continue;
    }
    if (!fs.existsSync(path.join(entry.root, 'package.json'))) {
      issues.push({ id: entry.id, code: 'INSTALLATION_MISSING', message: 'Installation root is missing' });
    }
  }
  return result({ registry: registry.tools.length, installed: state.installed.length, issues }, issues.length ? 'incomplete' : 'ok', issues.length === 0, { issue_count: issues.length });
}

function assertWithin(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new AitError('Installation path escapes AIT home', 4, 'PATH_ESCAPE');
  }
}

function resolveExecutable(entry) {
  const home = homePath(entry.options);
  const realHome = fs.realpathSync(home);
  const realRoot = fs.realpathSync(entry.record.root);
  assertWithin(realHome, realRoot);
  const packageRootPath = fs.realpathSync(packageRoot(realRoot, entry.record.package));
  const shim = path.join(realRoot, 'node_modules', '.bin', entry.record.bin.name + (process.platform === 'win32' ? '.cmd' : ''));
  if (process.platform !== 'win32' && fs.existsSync(shim)) {
    const realShim = fs.realpathSync(shim);
    assertWithin(realRoot, realShim);
    return { command: realShim, args: [] };
  }
  const script = path.resolve(packageRootPath, entry.record.bin.path);
  assertWithin(packageRootPath, script);
  if (!fs.existsSync(script)) throw new AitError('Installed executable is missing', 4, 'BIN_MISSING');
  const realScript = fs.realpathSync(script);
  assertWithin(packageRootPath, realScript);
  if (path.extname(realScript).toLowerCase() === '.js') return { command: process.execPath, args: [realScript] };
  return { command: realScript, args: [] };
}

function safeEnvironment() {
  const allowed = ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'TEMP', 'TMP', 'HOME', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'];
  return Object.fromEntries(allowed.filter((key) => process.env[key] !== undefined).map((key) => [key, process.env[key]]));
}

function dispatchTool(options) {
  if (!options.allowExecution) {
    throw new AitError('dispatch requires explicit --allow-execution', 4, 'EXECUTION_REQUIRES_APPROVAL');
  }
  const id = options.positionals[0];
  if (!id) throw new AitError('dispatch requires a registry tool id', 2, 'MISSING_TOOL');
  const registry = loadRegistry(options);
  const tool = findTool(registry, id);
  const state = loadState(homePath(options));
  const record = state.installed.find((entry) => entry.id === id);
  if (!record) throw new AitError(`Tool is not installed: ${id}`, 4, 'NOT_INSTALLED');
  if (!tool.npm || record.package !== tool.npm.name || record.version !== tool.release_version) {
    throw new AitError(`Installed identity does not match the selected registry: ${id}`, 4, 'PACKAGE_IDENTITY_MISMATCH');
  }
  const profile = selectProfile(tool, record, loadProfileCatalog(options));
  const executable = resolveExecutable({ options, record });
  const cwd = path.resolve(options.cwd || process.cwd());
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) {
    throw new AitError(`Dispatch cwd is not a directory: ${cwd}`, 2, 'INVALID_CWD');
  }
  const child = spawnSync(executable.command, [...executable.args, ...options.passthrough], {
    cwd,
    env: safeEnvironment(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: DEFAULT_TIMEOUT_MS,
    maxBuffer: DEFAULT_OUTPUT_BYTES,
    windowsHide: true,
    shell: false,
  });
  if (child.error && child.error.code !== 'ETIMEDOUT') {
    throw new AitError(`Tool execution failed to start: ${child.error.message}`, 1, 'EXECUTION_START_FAILED');
  }
  const exitCode = child.status === null ? 1 : child.status;
  let data = { stdout: child.stdout || '', stderr: child.stderr || '' };
  const trimmed = (child.stdout || '').trim();
  if (trimmed) {
    try { data = JSON.parse(trimmed); } catch { /* Preserve non-JSON native output as bounded text. */ }
  }
  const profileValidation = profile
    ? validateNativeProfile(profile, child.stdout || '', exitCode, options.passthrough)
    : null;
  const nativeOk = exitCode === 0;
  const wrapperOk = nativeOk && (!profileValidation || profileValidation.passed);
  const output = result(data, wrapperOk ? 'ok' : 'error', wrapperOk, {
    tool: id,
    package: record.package,
    version: record.version,
    exit_code: exitCode,
    native_exit: exitCode,
    signal: child.signal || null,
    cwd,
    native_stdout: child.stdout || '',
    native_stderr: child.stderr || '',
    ...(profile ? {
      profile: {
        id: profile.profile_id,
        protocol: profile.protocol,
        classification: profileValidation.classification,
        validation: profileValidation.passed ? 'passed' : 'failed',
        message: profileValidation.message || null,
      },
    } : {}),
  });
  return { output, exitCode: profileValidation && !profileValidation.passed ? 4 : exitCode };
}

function textOutput(value) {
  if (value && value.data && value.data.stdout !== undefined) {
    process.stdout.write(value.data.stdout);
    if (value.data.stderr) process.stderr.write(value.data.stderr);
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function main(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
    if (options.command === 'help') {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (options.command === 'version') {
      process.stdout.write(`${VERSION}\n`);
      return 0;
    }
    let output;
    let exitCode = 0;
    if (options.command === 'list') output = listTools(options);
    else if (options.command === 'doctor') output = doctor(options);
    else if (options.command === 'install') output = installTool(options);
    else if (options.command === 'dispatch') {
      const dispatched = dispatchTool(options);
      output = dispatched.output;
      exitCode = dispatched.exitCode;
    } else {
      throw new AitError(`Unknown command: ${options.command}`, 2, 'UNKNOWN_COMMAND');
    }
    if (!output.ok && exitCode === 0) exitCode = 3;
    if (options.json) process.stdout.write(`${JSON.stringify(output)}\n`);
    else textOutput(output);
    return exitCode;
  } catch (error) {
    const failure = error instanceof AitError
      ? error
      : new AitError(error.message || String(error), 1, 'INTERNAL_ERROR');
    const output = result(null, failure.exitCode === 3 ? 'incomplete' : 'error', false, {
      error: failure.code,
      message: failure.message,
      details: failure.details,
    });
    if (options && options.json) process.stdout.write(`${JSON.stringify(output)}\n`);
    else process.stderr.write(`${failure.message}\n`);
    return failure.exitCode;
  }
}

if (require.main === module) process.exitCode = main();

module.exports = {
  AitError,
  VERSION,
  parseArgs,
  validateRegistry,
  validateProfileCatalog,
  selectProfile,
  validateNativeProfile,
  result,
  packageBin,
  safeEnvironment,
  main,
};
