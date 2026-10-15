import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Writable } from 'node:stream';
import { main } from '../dist/cli.js';
import { createNativePlatform } from '../dist/platform.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const NODE = process.execPath;
const foundGit = spawnSync('where.exe', ['git.exe'], { encoding: 'utf8', shell: false, timeout: 5000 });
if (foundGit.status !== 0) throw new Error('A real local Git executable is required for metadata fixtures.');
export const GIT = foundGit.stdout.trim().split(/\r?\n/)[0];
export const GIT_HASH = createHash('sha256').update(readFileSync(GIT)).digest('hex');
const native = createNativePlatform(ROOT);
export function fixture({ grants, maxJsonBytes = 1048576 } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'angit stage1 '));
  // Protect only this newly allocated disposable fixture. Never repair an existing host anchor.
  const protect = spawnSync('C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe', ['-NoProfile', '-Command',
    '$sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=New-Object System.Security.AccessControl.DirectorySecurity;$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false);$rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,\"FullControl\",\"ContainerInherit,ObjectInherit\",\"None\",\"Allow\");$acl.AddAccessRule($rule);Set-Acl -LiteralPath $env:ANGIT_FIXTURE_BASE -AclObject $acl'],
    { shell: false, timeout: 15000, encoding: 'utf8', env: { ...process.env, ANGIT_FIXTURE_BASE: base } });
  if (protect.error || protect.status !== 0 || protect.stderr) { rmSync(base, { recursive: true }); throw protect.error || new Error(protect.stderr); }
  const privateRoot = join(base, 'owner private');
  native.preparePrivateDirectory(privateRoot);
  const repo = join(base, 'repository with spaces');
  mkdirSync(join(repo, 'src'), { recursive: true });
  mkdirSync(join(repo, 'protected'), { recursive: true });
  writeFileSync(join(repo, 'src/index.ts'), 'export const baseline = 1;\n');
  writeFileSync(join(repo, 'protected/config.ts'), 'export const protectedValue = 1;\n');
  const git = (args) => {
    const child = spawnSync(GIT, ['-c', 'core.hooksPath=NUL', '-c', 'core.fsmonitor=false', ...args], {
      cwd: repo, shell: false, timeout: 15000, maxBuffer: 1048576, encoding: 'utf8',
      env: { SystemRoot: process.env.SystemRoot, PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_TERMINAL_PROMPT: '0' },
    });
    if (child.error || child.status !== 0) throw child.error || new Error(child.stderr);
    return child.stdout.trim();
  };
  git(['init', '-b', 'main']); git(['add', 'src/index.ts', 'protected/config.ts']);
  git(['-c', 'user.name=Angit Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-m', 'Disposable committed baseline']);
  const oid = git(['rev-parse', 'HEAD']);
  const profilesFile = join(privateRoot, 'approved profiles.json');
  const profiles = { schemaVersion: 'angit-profiles/v1', profiles: [{
    id: 'profile_declared', kind: 'coding-agent', provider: 'mock', enabled: false,
    executable: NODE, executableSha256: createHash('sha256').update(readFileSync(NODE)).digest('hex'), args: [],
    cwdMode: 'managed-worktree', envAllow: [], networkMode: 'deny', sandboxBackend: 'none', timeoutSeconds: 30,
    maxOutputBytes: 1024, versionProbeArgs: ['--version'], completionMode: 'clean-commit-after-exit', requiresApproval: true,
  }] };
  profiles.profiles.push({ ...profiles.profiles[0], id: 'check_required', kind: 'check', provider: 'custom-check' });
  writeFileSync(profilesFile, JSON.stringify(profiles));
  const policyFile = join(privateRoot, 'approved policy.json');
  const policy = {
    schemaVersion: 'angit-policy/v1', policyId: 'policy_fixture', revision: 1, repoRoot: repo,
    trustMode: 'cooperative-local', grants: grants ?? [{ principal: 'owner', capabilities: ['project.register', 'project.read', 'task.create', 'task.message', 'task.cancel'] }],
    workspace: { allowedPaths: ['src/', 'protected/'], protectedPaths: ['protected/'], allowDeletion: false,
      allowBinary: false, allowSymlinks: false, allowSubmodules: false, allowLockfileChange: false },
    git: { protectedRefs: ['refs/heads/main'], allowRemote: false, allowForcePush: false, allowHardReset: false,
      allowForcedWorktreeRemoval: false, executable: { path: GIT, sha256: GIT_HASH } },
    execution: { allowedProfiles: ['profile_declared', 'check_required'], profilesFile, lease: { heartbeatIntervalMs: 1000, durationMs: 30000 },
      allowDependencyInstall: false, requireSandbox: false, maxParallelAgents: 3, timeoutSeconds: 30, maxAttemptsPerTask: 2 },
    integration: { requiredChecks: ['check_required'], allowAutoPromotion: false, rejectSkippedRequiredChecks: true,
      rejectDirtySource: true, maxPlanAgeSeconds: 300 },
    limits: { maxJsonBytes, maxEventBytes: 65536, maxArtifactBytes: 1048576, maxStoredBytes: 104857600 },
  };
  writeFileSync(policyFile, JSON.stringify(policy));
  const stateRoot = join(privateRoot, 'state');
  return { base, privateRoot, repo, oid, git, policy, policyFile, profilesFile, stateRoot,
    async command(args, extra = {}) {
      const { cliMain = main, ...options } = extra;
      let output = '', errors = '';
      const stdout = new Writable({ write(chunk, encoding, done) { output += chunk.toString(); done(); } });
      const stderr = new Writable({ write(chunk, encoding, done) { errors += chunk.toString(); done(); } });
      const exit = await cliMain(args, { cwd: repo, coreOptions: { stateRoot }, stdout, stderr, interactive: false, ...options });
      let result;
      try { result = JSON.parse(output); } catch { result = undefined; }
      return { exit, output, errors, result };
    },
    initArgs: ['init', '--repo', repo, '--base', oid, '--policy-file', policyFile, '--idempotency-key', 'initialize-fixture', '--json'],
    task(id, dependsOn = [], changes = {}) {
      return { schemaVersion: 'angit-task-input/v1', taskId: id, title: 'Metadata task ' + id,
        instructions: 'Record this immutable intent. Do not execute an agent.', runtimeProfileId: 'profile_declared',
        dependsOn, scopePaths: ['src/index.ts'], requiredChecks: ['check_required'], acceptance: ['Required behavior must be verified before integration.'],
        priority: 50, baseEpoch: 0, contractRefs: [], ...changes };
    },
    save(name, value) { const file = join(privateRoot, name); writeFileSync(file, JSON.stringify(value)); return file; },
    cleanup() { rmSync(base, { recursive: true, force: false, maxRetries: 5, retryDelay: 100 }); },
  };
}
