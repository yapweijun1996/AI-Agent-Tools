import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { ROOT, NODE, npmArgs, runNode } from './tooling.mjs';
import { fixture } from '../tests/stage1-fixture.mjs';
import { createExecutionFixture } from '../tests/execution-fixture.mjs';
import { buildExecutionFixture } from './build-fixture.mjs';

mkdirSync(join(ROOT, '.cache'), { recursive: true });
const temporary = mkdtempSync(join(ROOT, '.cache', 'packed-consumer-'));
let f, execution;
try {
  const packed = JSON.parse(runNode(npmArgs(['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]), { capture: true }).stdout)[0];
  const contents = new Set(packed.files.map(file => file.path));
  for (const path of ['bin/angit.js', 'dist/cli.js', 'dist/index.js', 'dist/index.d.ts', 'dist/core.js', 'dist/core/git-process.js', 'dist/native/platform.exe', 'dist/native/platform.identity.json', 'dist/native/execution.exe', 'dist/native/execution.identity.json', 'native/Platform.cs', 'native/Execution.cs', 'assets/empty-hooks/README.txt', 'sql/001_initial.sql', 'sql/002_runtime_metadata.sql', 'sql/registry.sql', 'sql/registry_runtime.sql', 'schemas/policy.schema.json', 'contracts/commands.json', 'docs/CONTRACT.md', 'docs/CLI_REFERENCE.md', 'docs/STAGE1.md', 'docs/STAGE2.md', 'LICENSE']) assert.ok(contents.has(path), 'Missing packed asset: ' + path);
  for (const path of contents) assert.ok(!/^(?:temp|tests|evidence|node_modules|\.cache)\//.test(path), 'Unexpected packed artifact: ' + path);
  const tarball = join(temporary, packed.filename);
  const consumer = join(temporary, 'consumer'); mkdirSync(consumer);
  writeFileSync(join(consumer, 'package.json'), JSON.stringify({ name: 'angit-disposable-consumer', version: '0.0.0', private: true, type: 'module' }));
  runNode(npmArgs(['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', '--no-package-lock', tarball]), { cwd: consumer, capture: true });
  const installed = join(consumer, 'node_modules', 'agent-native-git');
  const bin = join(installed, 'bin', 'angit.js');
  const invoke = (args) => JSON.parse(runNode([bin, ...args, '--json'], { cwd: consumer, capture: true }).stdout);
  assert.equal(invoke(['--version']).data.version, '0.0.0');
  const capabilities = invoke(['--capabilities']);
  assert.deepEqual(capabilities.data.commands.filter(command => command.available).map(command => command.name), ['init', 'doctor', 'status', 'task add', 'task list', 'task show', 'task message', 'task cancel', 'agent start', 'agent stop', 'run', 'worktree list', 'snapshot list']);
  const commands = JSON.parse(readFileSync(join(installed, 'contracts/commands.json'), 'utf8')).commands;
  for (const command of commands) assert.equal(invoke([...command.name.split(' '), '--help']).ok, true);
  // Runtime-selected installation path: this is not a compile-time source import.
  const { main: installedMain } = await import(pathToFileURL(join(installed, 'dist/cli.js')).href);
  f = fixture();
  const outcomes = [];
  const execute = async (args) => {
    const observed = await f.command(args, { cliMain: installedMain });
    assert.equal(observed.exit, 0, observed.output + observed.errors);
    assert.equal(observed.result?.ok, true, observed.output);
    outcomes.push({ command: observed.result.command, ok: true });
    return observed.result;
  };
  const initialized = await execute(f.initArgs);
  assert.equal(initialized.data.baselineOid, f.oid); assert.equal(initialized.data.verification, 'unverified');
  await execute(['doctor', '--deep', '--json']); await execute(['status', '--json']);
  const task = f.task('tsk_packed'); const taskFile = f.save('packed-task.json', task);
  await execute(['task', 'add', '--file', taskFile, '--idempotency-key', 'packed-task', '--json']);
  assert.deepEqual((await execute(['task', 'list', '--json'])).data.items.map(item => item.taskId), ['tsk_packed']);
  assert.deepEqual((await execute(['task', 'show', 'tsk_packed', '--history', '--json'])).data.task.spec, task);
  const message = f.save('packed-message.json', { schemaVersion: 'angit-message-input/v1', taskId: 'tsk_packed', kind: 'contract.updated', summary: 'Packed consumer advisory', relatedTaskIds: [], artifactIds: [], commitOid: f.oid });
  await execute(['task', 'message', '--file', message, '--idempotency-key', 'packed-message', '--json']);
  assert.equal((await execute(['task', 'cancel', 'tsk_packed', '--reason', 'Packed smoke complete', '--idempotency-key', 'packed-cancel', '--json'])).data.status, 'cancelled');
  assert.deepEqual((await execute(['worktree', 'list', '--json'])).data.items, []);
  assert.equal((await execute(['snapshot', 'list', '--include-unverified', '--json'])).data.items[0].commitOid, f.oid);
  buildExecutionFixture(ROOT);
  execution = createExecutionFixture('commit');
  const installedExecution = async (args) => {
    const observed = await execution.command(args, { cliMain: installedMain });
    assert.equal(observed.exit, 0, observed.output + observed.errors);
    assert.equal(observed.result?.ok, true, observed.output);
    return observed.result;
  };
  await installedExecution(execution.initArgs);
  const executionSpec = execution.task('tsk_installed_execution');
  const executionFile = execution.save('installed-execution.json', executionSpec);
  await installedExecution(['task', 'add', '--file', executionFile, '--idempotency-key', 'installed-task', '--json']);
  const launched = await installedExecution(['agent', 'start', '--task', 'tsk_installed_execution', '--profile', execution.runtimeProfileId, '--idempotency-key', 'installed-start', '--json']);
  const captured = await installedExecution(['task', 'show', 'tsk_installed_execution', '--json']);
  assert.equal(captured.data.task.status, 'submitted');
  assert.equal(captured.data.task.completionOpId, null);
  assert.equal(execution.git(['rev-parse', 'HEAD']), execution.oid);
  const executionEvidence = { command: launched.command, taskStatus: captured.data.task.status, ownerHeadPreserved: true, provider: 'owned inert native fixture; no Coding Agent or network' };
  const alternate = spawnSync('node', ['--version'], { shell: false, encoding: 'utf8', timeout: 5000 });
  let alternateRuntime = { version: alternate.stdout.trim(), exercised: false };
  if (alternate.status === 0 && alternate.stdout.trim() !== 'v24.21.0') {
    const probe = spawnSync('node', ['--input-type=module', '-e', "import {execute} from 'agent-native-git';try{await execute({schemaVersion:'angit-request/v1',requestId:'req_boundary',command:'status',projectId:'prj_boundary',options:{}},process.cwd());process.exitCode=1;}catch(e){console.log(JSON.stringify({code:e.code,exit:e.exitCode}));}"], { cwd: consumer, shell: false, encoding: 'utf8', timeout: 15000 });
    assert.equal(probe.status, 0); assert.deepEqual(JSON.parse(probe.stdout), { code: 'UNSUPPORTED_RUNTIME', exit: 3 });
    alternateRuntime.exercised = true;
  }
  const report = { schemaVersion: 'angit-stage2-pack-evidence/v1', observedAt: new Date().toISOString(), node: process.version,
    packageVersion: '0.0.0', published: false, offlineInstall: true, installerScripts: false,
    tarballSha256: createHash('sha256').update(readFileSync(tarball)).digest('hex'), packedFiles: contents.size,
    utilityLeaves: commands.length, metadataCommands: outcomes, baselineVerification: 'unverified',
    stateRoot: 'internal isolated owner-private fixture; not default host AppData', alternateRuntime, execution: executionEvidence };
  console.log(JSON.stringify(report, null, 2));
  if (process.argv.includes('--evidence')) writeFileSync(join(ROOT, 'evidence/stage2-pack.json'), JSON.stringify(report, null, 2) + '\n');
} finally {
  await execution?.cleanup(); f?.cleanup(); rmSync(temporary, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 });
}
