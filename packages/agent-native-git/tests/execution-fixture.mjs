import assert from 'node:assert/strict';
import { copyFileSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { DatabaseSync } from 'node:sqlite';
import { createNativePlatform } from '../dist/platform.js';
import { fixture, ROOT, NODE, GIT, GIT_HASH } from './stage1-fixture.mjs';

export { ROOT };
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export async function eventually(read, accept, { timeoutMs = 1800000, label = 'observable fixture state' } = {}) {
  const deadline = Date.now() + timeoutMs;
  let value;
  do {
    value = await read();
    if (accept(value)) return value;
    await delay(25);
  } while (Date.now() < deadline);
  assert.fail(`Timed out awaiting ${label}: ${JSON.stringify(value)}`);
}
export async function success(f, args, options) {
  const observed = await f.command(args, options);
  assert.equal(observed.exit, 0, observed.output + observed.errors);
  assert.equal(observed.result?.ok, true, observed.output);
  return observed.result;
}
export async function add(f, taskId, mode = 'commit', dependsOn = []) {
  const spec = f.task(taskId, dependsOn, { title: 'Inert execution ' + taskId,
    instructions: 'Immutable task text; $(not-a-shell-command) & exit 91. Execute only the approved fixed native fixture.',
    runtimeProfileId: 'profile_' + mode.replaceAll('-', '_') });
  const file = f.save(taskId + '.json', spec);
  await success(f, ['task', 'add', '--file', file, '--idempotency-key', 'add-' + taskId, '--json']);
  return spec;
}
export const startArgs = (taskId, mode, key = 'start-' + taskId) => ['agent', 'start', '--task', taskId, '--profile',
  'profile_' + mode.replaceAll('-', '_'), '--idempotency-key', key, '--json'];
export const show = async (f, taskId) => (await success(f, ['task', 'show', taskId, '--history', '--json'])).data;
export const worktrees = async f => (await success(f, ['worktree', 'list', '--include-preserved', '--json'])).data.items;

export function executionFixture({ modes = ['commit'], maxProcesses = 8, parallel = 3, policyOverrides = {}, profileOverrides = {} } = {}) {
  const f = fixture();
  const children = new Set();
  try {
    const builtExe = join(ROOT, 'tests/.native/execution-fixture.exe');
    const identity = JSON.parse(readFileSync(join(ROOT, 'tests/.native/execution-fixture.identity.json'), 'utf8'));
    assert.equal(identity.platform, 'win32-x64');
    assert.equal(hash(readFileSync(join(ROOT, 'native/fixtures/ExecutionFixture.cs'))), identity.sourceSha256,
      'Parent must explicitly rebuild the owned fixture after source changes.');
    assert.equal(hash(readFileSync(builtExe)), identity.exeSha256);
    const platform = createNativePlatform(ROOT);
    const executables = platform.preparePrivateDirectory(join(f.privateRoot, 'approved fixture executables'));
    const executable = join(executables.canonicalPath, 'execution-fixture.exe');
    copyFileSync(builtExe, executable);
    platform.assertPrivateFile(executable);
    f.executable = executable; f.executableHash = identity.exeSha256;
    const catalog = JSON.parse(readFileSync(f.profilesFile, 'utf8'));
    const check = catalog.profiles.find(profile => profile.id === 'check_required');
    f.observations = new Map();
    catalog.profiles = [check];
    for (const mode of modes) {
      const observation = platform.preparePrivateDirectory(join(f.privateRoot, 'observations-' + mode)).canonicalPath;
      f.observations.set(mode, observation);
      const commit = ['commit', 'outscope', 'delayed-commit', 'retry-once', 'commit-idle'].includes(mode);
      catalog.profiles.push({ id: 'profile_' + mode.replaceAll('-', '_'), kind: 'coding-agent', provider: 'mock', enabled: true,
        executable, executableSha256: f.executableHash, args: [mode, observation, ...(commit ? [GIT, GIT_HASH] : [])],
        cwdMode: 'managed-worktree', envAllow: ['SYSTEMROOT'], networkMode: 'deny', sandboxBackend: 'none', timeoutSeconds: 300,
        maxOutputBytes: 8192, versionProbeArgs: ['version'], completionMode: 'clean-commit-after-exit', requiresApproval: true,
        ...profileOverrides });
    }
    writeFileSync(f.profilesFile, JSON.stringify(catalog));
    f.policy.grants = [{ principal: 'owner', capabilities: ['project.register', 'project.read', 'task.create', 'task.message',
      'task.cancel', 'attempt.start', 'attempt.stop', 'coordinator.start'] }];
    f.policy.execution.allowedProfiles = catalog.profiles.map(profile => profile.id);
    f.policy.execution.maxParallelAgents = parallel;
    f.policy.execution.timeoutSeconds = 300;
    if (maxProcesses !== undefined && maxProcesses !== null) f.policy.execution.maxProcessesPerAttempt = maxProcesses;
    Object.assign(f.policy.execution, policyOverrides);
    writeFileSync(f.policyFile, JSON.stringify(f.policy));
    // Poll only this newly allocated fixture's committed projection. Public CLI
    // assertions remain separate; repeated native admission must not monopolize
    // the event loop of an in-process foreground consumer.
    const observe = read => {
      const readonly = { readOnly: true, allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: 250 };
      const registry = new DatabaseSync(join(f.stateRoot, 'registry.sqlite'), readonly);
      let registrations;
      try { registrations = registry.prepare('SELECT project_id,workflow_path FROM registrations').all(); }
      finally { registry.close(); }
      assert.equal(registrations.length, 1, 'Observe only the single project in this owned fixture.');
      const registration = registrations[0];
      assert.equal(registration.workflow_path, join(f.stateRoot, 'projects', registration.project_id, 'state.sqlite'));
      const db = new DatabaseSync(registration.workflow_path, readonly);
      try {
        db.exec('PRAGMA trusted_schema=OFF; BEGIN;');
        return read(db, registration.project_id);
      } finally { db.close(); }
    };
    f.observeTask = taskId => observe((db, projectId) => ({
      task: db.prepare('SELECT status,cancel_requested AS cancelRequested FROM tasks WHERE project_id=? AND id=?').get(projectId, taskId),
      attempts: db.prepare('SELECT id,status,ended_at_ms FROM attempts WHERE project_id=? AND task_id=? ORDER BY number').all(projectId, taskId),
    }));
    f.runningCount = () => observe((db, projectId) =>
      db.prepare("SELECT count(*) AS count FROM attempts WHERE project_id=? AND status='running'").get(projectId).count);
    f.launch = args => {
      const child = spawn(NODE, [join(ROOT, 'tests/execution-consumer.mjs'), f.repo, f.stateRoot, ...args],
        { shell: false, windowsHide: true, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '', errors = '', settled = false;
      const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (exit, signal) => resolve({ exit, signal }));
      });
      const completed = new Promise((resolve, reject) => {
        child.on('error', reject);
        child.stdout.on('data', bytes => { output += bytes.toString(); if (Buffer.byteLength(output) > 1048576) child.kill(); });
        child.stderr.on('data', bytes => { errors += bytes.toString(); if (Buffer.byteLength(errors) > 1048576) child.kill(); });
        child.on('close', (exit, signal) => {
          settled = true; children.delete(handle);
          let result;
          try { result = JSON.parse(output); } catch { result = undefined; }
          resolve({ exit, signal, output, errors, result });
        });
      });
      const handle = { child, completed, exited, get settled() { return settled; },
        async waitForExit(timeoutMs = 10000) {
          let timer;
          try { return await Promise.race([exited, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Owned CLI parent did not exit within its observation bound.')), timeoutMs);
          })]); } finally { clearTimeout(timer); }
        },
        async wait(timeoutMs = 3600000) {
          let timer;
          try { return await Promise.race([completed, new Promise((_, reject) => {
            timer = setTimeout(() => { child.kill(); reject(new Error('Real CLI consumer timed out; owned helper must reconcile parent EOF.')); }, timeoutMs);
          })]); } finally { clearTimeout(timer); }
        } };
      children.add(handle);
      return handle;
    };
    f.external = async args => f.launch(args).wait();
    f.started = mode => {
      const directory = f.observations.get(mode);
      return readdirSync(directory).filter(name => /^root-\d+\.started$/u.test(name)).map(name => {
        const [pid, ticks, cwd] = readFileSync(join(directory, name), 'utf8').split('|');
        return { pid: Number(pid), ticks, cwd, prefix: name.slice(0, -8), directory };
      });
    };
    const remove = f.cleanup;
    f.cleanup = async () => {
      // Stop through the real authenticated consumer first; never terminate provider PIDs directly.
      for (const handle of [...children]) {
        try {
          const listed = await f.command(['task', 'list', '--json']);
          for (const task of listed.result?.data.items ?? []) {
            const state = await f.command(['task', 'show', task.taskId, '--json']);
            const id = state.result?.data.task.activeAttemptId;
            if (id) await f.external(['agent', 'stop', id, '--reason', 'Owned fixture cleanup', '--wait-ms', '5000', '--idempotency-key', 'cleanup-' + id, '--json']);
          }
          await handle.wait(60000);
        } catch {
          handle.child.kill();
          // Release only this fixture's observers, then await actual parent completion.
          // Neither an observation deadline nor process exit proves writer-tree termination.
          handle.child.stdout.destroy(); handle.child.stderr.destroy();
          await handle.completed;
        }
      }
      // EOF cleanup belongs to the native owned Job. Unknown state/effects retain all evidence.
      const hasState = existsSync(f.stateRoot);
      const state = await f.command(['status', '--json']);
      if (hasState && !state.result?.ok) throw new Error('Preserved unreadable owned fixture state: ' + f.base);
      if (state.result?.ok && state.result.data.recoveryRequired === true)
        throw new Error('Preserved fixture with unresolved owned attempts/effects: ' + f.base);
      remove();
    };
    return f;
  } catch (error) { f.cleanup(); throw error; }
}

export function observationExists(f, mode, root, suffix) {
  return existsSync(join(f.observations.get(mode), root.prefix + '.' + suffix));
}

// Reuse the same actual native consumer in an installed, scripts-disabled package smoke.
export function createExecutionFixture(mode = 'commit', options = {}) {
  const f = executionFixture({ modes: [mode], ...options });
  f.runtimeProfileId = 'profile_' + mode.replaceAll('-', '_');
  const metadataTask = f.task;
  f.task = (id, dependsOn = [], changes = {}) => metadataTask(id, dependsOn, {
    title: 'Inert execution ' + id, instructions: 'Immutable native fixture intent; never shell task text.',
    runtimeProfileId: f.runtimeProfileId, ...changes });
  return f;
}
