import { randomBytes } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, lstatSync, openSync, readFileSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { DatabaseSync } from 'node:sqlite';
import { AngitError } from '../shared.js';
import type { CommandRequest, CoreReply, PlatformAdapter } from '../shared.js';
import { canonical, parseJson, sha256, validateSchema } from '../json.js';
import { callBroker, readTerminationReceipt, startBroker, startSupervision } from '../execution-native.js';
import type { BrokerDescriptor, BrokerHandle, BrokerRequest, ProcessReceipt, SupervisionHandle, SupervisionSpec, TerminationReceipt } from '../execution-native.js';
import { ApprovedGit, contained, discover } from './git.js';
import type { Repository } from './git.js';
import { authorize, loadPolicy } from './policy.js';
import type { ApprovedPolicy } from './policy.js';
import { currentProject, grantReconciliationLease, grantTaskLease, grantWorktreeLease, releaseExecutionLease, releaseLease, renewLease, row, sqlBindings, startSessionAuthority, transaction, unresolved } from './store.js';
import type { Authority, LeaseClock, Registration, Row, Storage } from './store.js';
import { advance, integer, jsonObject, object, semanticOptions, strings, text } from './values.js';
import { WorktreeBroker } from './worktrees.js';
import type { WorktreeDescription, WorktreeReceipt } from './worktrees.js';

export interface ExecutionContext { repo: Repository; registration: Registration; policy: ApprovedPolicy; db: DatabaseSync; project: Row; approval: Row }
export interface ExecutionHost {
  platform: PlatformAdapter; storage: Storage; assetRoot: string; ownerSid: string;
  context(repo: Repository, write: boolean): ExecutionContext;
  validate(request: CommandRequest, repo: Repository): void;
  metadata(request: CommandRequest, context: ExecutionContext, authority: Authority): Promise<CoreReply>;
  event(db: DatabaseSync, authority: Authority, policy: ApprovedPolicy, type: string, entityId: string, summary: string, payload: Record<string, unknown>): number;
}
interface Semantic { keyHash: string; requestHash: string; principal: string }
interface Slot {
  attemptId: string; taskId: string; worktreeId: string; taskAuthority: Authority; worktreeAuthority: Authority;
  description: WorktreeDescription; spec: Record<string, unknown>; profile: Record<string, unknown>; nativeSpec: SupervisionSpec;
  process?: ProcessReceipt; receipt?: WorktreeReceipt; handle?: SupervisionHandle; stopOperationId?: string; termination?: TerminationReceipt;
  cancelled: boolean; spawnCalled: boolean; done?: Promise<void>;
}
const CONTROL_METHODS = ['task add', 'task message', 'task cancel', 'agent stop'];
function id(prefix: string): string { return `${prefix}_${randomBytes(16).toString('hex')}`; }
function semantic(request: CommandRequest, ownerSid: string): Semantic {
  if (!request.idempotencyKey) throw new AngitError('IDEMPOTENCY_REQUIRED', 'Execution mutations require an idempotency key');
  return { keyHash: sha256(request.idempotencyKey), requestHash: sha256(canonical({ projectId: request.projectId, command: request.command, options: semanticOptions(request.options) })), principal: `owner:${ownerSid}` };
}
function boundedPrivate(platform: PlatformAdapter, path: string, maximum = 1_048_576): Buffer {
  const identity = platform.assertPrivateFile(path), before = lstatSync(identity.canonicalPath);
  if (!before.isFile() || before.isSymbolicLink() || before.size > maximum) throw new AngitError('STATE_CORRUPT', 'Execution receipt must be a bounded owner-private regular file');
  const bytes = readFileSync(identity.canonicalPath), after = statSync(identity.canonicalPath);
  if (bytes.length > maximum || before.size !== after.size || before.mtimeMs !== after.mtimeMs || platform.assertPrivateFile(path).identity !== identity.identity) throw new AngitError('STATE_IDENTITY_CHANGED', 'Execution receipt changed during read');
  return bytes;
}
function createPrivate(platform: PlatformAdapter, path: string, bytes: string): void {
  platform.assertPrivateDirectory(dirname(path));
  const fd = openSync(path, 'wx', 0o600);
  try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
  platform.assertPrivateFile(path);
}
function replyError(value: unknown): CoreReply {
  const response = object(value, 'broker reply');
  if (response.ok !== true) {
    const error = object(response.error, 'broker error');
    throw new AngitError(text(error.code, 'error code'), text(error.message, 'error message'), integer(error.exitCode, 'exitCode'), error.retryable === true, error.operationId === null ? null : text(error.operationId, 'operationId'));
  }
  const reply = object(response.reply, 'broker Core reply');
  return { data: object(reply.data, 'reply data'), coordinatorEpoch: reply.coordinatorEpoch === null ? null : integer(reply.coordinatorEpoch, 'coordinatorEpoch'), maxJsonBytes: integer(reply.maxJsonBytes, 'maxJsonBytes') };
}
export function readExecutionManifest(platform: PlatformAdapter, registration: Registration, db: DatabaseSync, name: string): unknown | null {
  if (!/^[a-z][a-z0-9_-]{1,100}$/u.test(name)) throw new AngitError('STATE_INVALID', 'Manifest identity must remain a generated local name');
  const path = `artifacts/${name}.json`, artifact = db.prepare('SELECT * FROM artifacts WHERE project_id=? AND relative_path=?').get(registration.projectId, path);
  if (!artifact) return null;
  const bytes = boundedPrivate(platform, join(registration.directory, path));
  if (artifact.kind !== 'manifest' || artifact.sha256 !== sha256(bytes) || artifact.bytes !== bytes.length) throw new AngitError('STATE_CORRUPT', 'Durable execution manifest digest differs');
  return parseJson(bytes);
}
export async function routeOwnerRequest(host: ExecutionHost, context: ExecutionContext, request: CommandRequest): Promise<CoreReply | null> {
  const path = join(context.registration.directory, 'control.json');
  if (!existsSync(path)) return null;
  const control = jsonObject(boundedPrivate(host.platform, path).toString('utf8'), 'owner control descriptor');
  const descriptor = object(control.descriptor, 'broker descriptor') as unknown as BrokerDescriptor;
  const scope = object(control.scope, 'owner control scope');
  validateSchema('ipc-scope.schema.json', scope);
  const project = currentProject(context.db, context.registration);
  if (descriptor.projectId !== context.repo.projectId || descriptor.authorityIncarnation !== context.registration.incarnation || descriptor.coordinatorEpoch !== project.coordinator_epoch || descriptor.ownerSid !== host.ownerSid || scope.handleDigest !== sha256(descriptor.scopeHandle) || scope.coordinatorEpoch !== descriptor.coordinatorEpoch || scope.projectId !== descriptor.projectId || scope.authorityIncarnation !== descriptor.authorityIncarnation || scope.revoked !== false || integer(scope.expiresAtMs, 'scope expiry') <= Date.now()) throw new AngitError('RECOVERY_REQUIRED', 'Stale or unbound owner control scope cannot grant mutation authority');
  const artifact = context.db.prepare('SELECT sha256 FROM artifacts WHERE project_id=? AND relative_path=?').get(context.repo.projectId, `artifacts/${text(scope.scopeId, 'scopeId')}.json`);
  if (artifact?.sha256 !== sha256(canonical(scope))) throw new AngitError('STATE_CORRUPT', 'Owner control scope has no durable digest-bound issuance receipt');
  if (context.db.prepare("SELECT 1 FROM events WHERE project_id=? AND event_type='scope.revoked' AND entity_id=? LIMIT 1").get(context.repo.projectId, text(scope.scopeId, 'scopeId'))) throw new AngitError('ACCESS_DENIED', 'Owner control scope was durably revoked');
  const reply = replyError(await callBroker(host.assetRoot, descriptor, request));
  const waitMs = request.options.waitMs === undefined ? 0 : integer(request.options.waitMs, 'waitMs');
  if (request.command !== 'agent stop' || waitMs <= 0) return reply;
  // Observe committed proof outside the broker's serialized mutation and native RPC lifetime.
  const attemptId = text(request.options.attemptId, 'attemptId'), deadline = performance.now() + waitMs;
  for (;;) {
    const attempt = context.db.prepare('SELECT status,ended_at_ms,termination_kind,termination_receipt_hash FROM attempts WHERE project_id=? AND id=?').get(context.repo.projectId, attemptId);
    if (attempt?.ended_at_ms !== null && attempt !== undefined && ['writer_tree_terminated', 'no_process_created'].includes(text(attempt.termination_kind, 'termination kind')) && typeof attempt.termination_receipt_hash === 'string') {
      return { ...reply, data: { ...reply.data, status: attempt.status, alreadyTerminated: true, waitTimedOut: false, terminationProof: { kind: attempt.termination_kind, receiptHash: attempt.termination_receipt_hash } } };
    }
    const remaining = deadline - performance.now();
    if (remaining <= 0) return { ...reply, data: { ...reply.data, alreadyTerminated: false, waitTimedOut: true, terminationProof: null } };
    await delay(Math.min(25, remaining));
  }
}

export class ExecutionSession {
  private context!: ExecutionContext;
  private authority!: Authority;
  private guard?: DatabaseSync;
  private broker?: BrokerHandle;
  private scope!: Record<string, unknown>;
  private controlPath = '';
  private controlIdentity = '';
  private timer?: NodeJS.Timeout;
  private heartbeatPending?: Promise<void>;
  private renewalFailure?: AngitError;
  private stopping = false;
  private wakeAdmission?: () => void;
  private readonly slots = new Map<string, Slot>();
  private readonly clocks = new Map<string, LeaseClock>();
  private serialTail: Promise<void> = Promise.resolve();
  private readonly results: Record<string, unknown>[] = [];
  private git!: ApprovedGit;
  private worktrees!: WorktreeBroker;
  private signal?: AbortSignal;
  private abortListener?: () => void;
  constructor(private readonly host: ExecutionHost) {}
  private async serialized<T>(work: () => Promise<T> | T): Promise<T> {
    const prior = this.serialTail;
    let finish!: () => void;
    this.serialTail = new Promise<void>(resolve => { finish = resolve; });
    await prior;
    try { return await work(); } finally { finish(); }
  }
  private event(authority: Authority, type: string, entityId: string, summary: string, payload: Record<string, unknown>): void {
    this.host.event(this.context.db, authority, this.context.policy, type, entityId, summary, payload);
  }
  private clock(authority: Authority): LeaseClock {
    let value = this.clocks.get(authority.resourceKey);
    if (!value) { value = { wallTime: Date.now(), monotonicTime: performance.now() }; this.clocks.set(authority.resourceKey, value); }
    return value;
  }
  private assertLive(allowStopping = false): void {
    if (this.renewalFailure) throw this.renewalFailure;
    if (!allowStopping && this.stopping) throw new AngitError('ADMISSION_STOPPED', 'Foreground coordinator stopped new admission');
    if (!this.guard?.isTransaction || this.host.platform.assertPrivateFile(this.context.registration.guardPath).identity !== this.context.registration.guardIdentity) throw new AngitError('GUARD_LOST', 'Foreground lifetime guard was lost');
    const repo = discover(this.host.platform, this.context.repo.root.canonicalPath);
    if (repo.repositoryIdentity !== this.context.repo.repositoryIdentity || repo.root.identity !== this.context.repo.root.identity || repo.gitDir.identity !== this.context.repo.gitDir.identity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Foreground repository identity changed');
    const policy = loadPolicy(this.host.platform, repo, this.context.policy.path, this.host.assetRoot);
    if (policy.hash !== this.context.policy.hash || policy.profilesHash !== this.context.policy.profilesHash || policy.fileIdentity !== this.context.policy.fileIdentity || policy.profilesIdentity !== this.context.policy.profilesIdentity) throw new AngitError('POLICY_CHANGED', 'Owner approval drift stops new admission and owned writers');
    currentProject(this.context.db, this.context.registration);
    renewLease(this.context.db, this.authority, this.context.policy, this.clock(this.authority));
    for (const slot of this.slots.values()) for (const grant of [slot.taskAuthority, slot.worktreeAuthority]) renewLease(this.context.db, grant, this.context.policy, this.clock(grant));
  }
  private async heartbeat(): Promise<void> {
    try {
      transaction(this.context.db, () => this.assertLive(true));
      await Promise.all([...this.slots.values()].map(async slot => { if (slot.handle) await slot.handle.pulse(); }));
    } catch (error) {
      this.renewalFailure ??= error instanceof AngitError ? error : new AngitError('RECOVERY_REQUIRED', 'Foreground grant/native heartbeat failed; unknown slots remain owned', 6);
      this.stopping = true;
      // Stop intents are still persisted under the exact retained tuple. A failed DB never authorizes an unjournaled stop.
      await this.stopAll('admission_drift').catch(() => undefined);
    }
  }
  private artifact(name: string, value: unknown): string {
    const bytes = canonical(value), path = join(this.context.registration.directory, 'artifacts', `${name}.json`);
    const existing = this.context.db.prepare('SELECT * FROM artifacts WHERE project_id=? AND id=?').get(this.context.repo.projectId, name);
    if (existing && (existing.sha256 !== sha256(bytes) || existing.bytes !== Buffer.byteLength(bytes))) throw new AngitError('STATE_CORRUPT', 'Immutable manifest identity already binds different bytes');
    this.host.storage.capacity(this.context.db, this.context.registration, this.context.policy, existsSync(path) ? 0 : Buffer.byteLength(bytes));
    if (existsSync(path)) {
      if (!boundedPrivate(this.host.platform, path).equals(Buffer.from(bytes))) throw new AngitError('STATE_CORRUPT', 'Existing generated manifest differs from exact recovered receipt');
    } else createPrivate(this.host.platform, path, bytes);
    if (!existing) this.context.db.prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,'manifest',?)").run(this.context.repo.projectId, name, `artifacts/${name}.json`, sha256(bytes), Buffer.byteLength(bytes), Date.now());
    return path;
  }
  private readArtifact<T>(name: string): T {
    const value = readExecutionManifest(this.host.platform, this.context.registration, this.context.db, name);
    if (value === null) throw new AngitError('RECOVERY_REQUIRED', 'Exact durable execution manifest is absent');
    return value as T;
  }
  private operation(kind: 'worktree_create' | 'spawn' | 'stop', authority: Authority, intent: Record<string, unknown>, key: Semantic): string {
    const operationId = id('op'), now = Date.now(), intentBytes = canonical(intent);
    validateSchema('operation-journal.schema.json', { schemaVersion: 'angit-operation/v1', projectId: this.context.repo.projectId, repositoryIdentity: this.context.repo.repositoryIdentity, operationId, kind, originAuthority: authority, principalScopeId: this.scope.scopeId, requestKeyHash: key.keyHash, semanticRequestHash: key.requestHash, policyHash: this.context.policy.hash, profilesHash: this.context.policy.profilesHash, createdAtMs: now, intentHash: sha256(intentBytes), intent, phase: 'prepared', version: 0, lastObservationId: null, updatedAtMs: now });
    this.context.db.prepare("INSERT INTO operations(project_id,id,kind,phase,policy_hash,profiles_hash,authority_incarnation,coordinator_epoch,fencing_token,resource_key,owner_id,repository_identity,principal_scope_id,request_key_hash,semantic_request_hash,intent_hash,intent_json,created_at_ms,updated_at_ms) VALUES(?,?,?,'prepared',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(this.context.repo.projectId, operationId, kind, this.context.policy.hash, this.context.policy.profilesHash, ...sqlBindings(authority), this.context.repo.repositoryIdentity, text(this.scope.scopeId, 'scopeId'), key.keyHash, key.requestHash, sha256(intentBytes), intentBytes, now, now);
    this.event(authority, `operation.${kind}_prepared`, operationId, 'Durable typed intent precedes its owned external effect', { operationId, kind, attemptId: intent.attemptId });
    return operationId;
  }
  private observe(operationId: string, authority: Authority, type: string, data: Record<string, unknown>, phase?: string): string {
    const operation = row(this.context.db.prepare('SELECT * FROM operations WHERE project_id=? AND id=?').get(this.context.repo.projectId, operationId), 'operation'), observationId = id('obs'), now = Date.now();
    validateSchema('operation-observation.schema.json', { observationId, operationId, projectId: this.context.repo.projectId, kind: operation.kind, observationType: type, observerAuthority: authority, observedAtMs: now, data });
    this.context.db.prepare('INSERT INTO operation_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(this.context.repo.projectId, operationId, observationId, text(operation.kind, 'kind'), type, ...sqlBindings(authority), canonical(data), now);
    if (phase !== undefined) {
      const updated = this.context.db.prepare('UPDATE operations SET phase=?,version=version+1,last_observation_id=?,updated_at_ms=? WHERE project_id=? AND id=? AND version=?').run(phase, observationId, now, this.context.repo.projectId, operationId, integer(operation.version, 'version'));
      if (updated.changes !== 1) throw new AngitError('VERSION_CONFLICT', 'Operation projection expected version changed');
    }
    return observationId;
  }
  private finalizeOperation(operationId: string, authority: Authority, data: Record<string, unknown>): void {
    this.observe(operationId, authority, 'effect_complete', data, 'effect_observed');
    const operation = row(this.context.db.prepare('SELECT version,last_observation_id FROM operations WHERE project_id=? AND id=?').get(this.context.repo.projectId, operationId), 'operation version');
    const updated = this.context.db.prepare("UPDATE operations SET phase='finalized',version=version+1,last_observation_id=?,updated_at_ms=? WHERE project_id=? AND id=? AND version=?").run(text(operation.last_observation_id, 'last observation'), Date.now(), this.context.repo.projectId, operationId, integer(operation.version, 'version'));
    if (updated.changes !== 1) throw new AngitError('VERSION_CONFLICT', 'Operation finalization expected version changed');
  }
  private taskChange(taskId: string, status: string, cancel = false): number {
    const task = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, taskId), 'task'), version = advance(integer(task.version, 'task version'), 'task version');
    const updated = this.context.db.prepare('UPDATE tasks SET status=?,cancel_requested=?,version=?,updated_at_ms=? WHERE project_id=? AND id=? AND version=?').run(status, cancel || task.cancel_requested === 1 ? 1 : 0, version, Date.now(), this.context.repo.projectId, taskId, integer(task.version, 'version'));
    if (updated.changes !== 1) throw new AngitError('VERSION_CONFLICT', 'Task expected version changed');
    this.event(this.authority, `task.${status}`, taskId, 'Task lifecycle projection changed without claiming completed integration', { taskId, status, version, cancelRequested: cancel || task.cancel_requested === 1 });
    return version;
  }
  private attemptChange(slot: Slot, status: string, values: Record<string, string | number | null> = {}): void {
    const attempt = row(this.context.db.prepare('SELECT * FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.attemptId), 'attempt');
    const columns = Object.keys(values);
    const allowed: Record<string, true> = { spawn_intent_id: true, pid: true, process_identity: true, started_at_ms: true, heartbeat_at_ms: true, ended_at_ms: true, termination_kind: true, termination_receipt_hash: true, submission_oid: true, submission_tree_oid: true, submission_ref: true };
    if (columns.some(column => !Object.hasOwn(allowed, column))) throw new AngitError('STATE_INVALID', 'Attempt update column is not part of the closed lifecycle projection');
    const updated = this.context.db.prepare(`UPDATE attempts SET status=?,version=version+1${columns.map(column => `,${column}=?`).join('')} WHERE project_id=? AND id=? AND version=?`).run(status, ...columns.map(column => values[column]!), this.context.repo.projectId, slot.attemptId, integer(attempt.version, 'version'));
    if (updated.changes !== 1) throw new AngitError('VERSION_CONFLICT', 'Attempt expected version changed');
    this.event(slot.taskAuthority, `attempt.${status}`, slot.attemptId, 'Owned attempt lifecycle observation recorded', { attemptId: slot.attemptId, taskId: slot.taskId, status, version: advance(integer(attempt.version, 'version'), 'attempt version') });
  }
  private profile(profileId: string): Record<string, unknown> {
    const execution = object(this.context.policy.value.execution, 'execution'), profile = this.context.policy.profiles.find(value => value.id === profileId);
    if (!profile || !this.context.policy.allowedProfiles.includes(profileId) || profile.kind !== 'coding-agent' || profile.enabled !== true || profile.requiresApproval !== true || profile.cwdMode !== 'managed-worktree') throw new AngitError('POLICY_DENIED', 'Execution requires an explicitly enabled approved coding-agent profile');
    if (execution.maxProcessesPerAttempt === undefined) throw new AngitError('POLICY_NOT_APPROVED', 'Explicit execution.maxProcessesPerAttempt approval is required before provisioning');
    const processes = integer(execution.maxProcessesPerAttempt, 'maxProcessesPerAttempt');
    if (processes < 1 || processes > 64 || this.context.policy.heartbeatIntervalMs > 2_147_483_647 || this.context.policy.leaseDurationMs > 2_147_483_647) throw new AngitError('POLICY_NOT_APPROVED', 'Approved process/timing budget exceeds the bounded native backend');
    const executable = text(profile.executable, 'profile executable');
    if (!isAbsolute(executable) || !/\.exe$/iu.test(executable) || /^(?:cmd|powershell|pwsh|wscript|cscript|mshta|bash|sh)\.exe$/iu.test(basename(executable))) throw new AngitError('POLICY_DENIED', 'Shell and script-launcher profiles cannot acquire execution authority');
    const identity = this.host.platform.identify(executable), before = statSync(identity.canonicalPath);
    if (identity.directory || identity.reparsePoint || !identity.localDisk || !before.isFile() || before.size > 268_435_456) throw new AngitError('POLICY_DENIED', 'Approved profile executable requires a bounded regular local identity');
    const digest = sha256(readFileSync(identity.canonicalPath)), after = statSync(identity.canonicalPath);
    if (digest !== profile.executableSha256 || before.size !== after.size || before.mtimeMs !== after.mtimeMs || this.host.platform.identify(executable).identity !== identity.identity) throw new AngitError('EXECUTABLE_IDENTITY_CHANGED', 'Approved profile executable fingerprint changed');
    strings(profile.args, 'profile args');
    if (strings(profile.envAllow, 'envAllow').some(name => !['SYSTEMROOT', 'WINDIR', 'PATH', 'HOME', 'USERPROFILE', 'TEMP', 'TMP'].includes(name))) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Stage2 does not forward credentials or arbitrary provider environment');
    if (profile.sandboxBackend !== 'none' || execution.requireSandbox !== false) throw new AngitError('CAPABILITY_UNAVAILABLE', 'No verified hostile-process sandbox backend is available');
    return profile;
  }
  private nativeSpec(attemptId: string, authority: Authority, description: WorktreeDescription, spec: Record<string, unknown>, profile: Record<string, unknown>, supervisorId = id('sup'), launchIdentity = randomBytes(32).toString('hex')): SupervisionSpec {
    const execution = object(this.context.policy.value.execution, 'execution'), limits = object(this.context.policy.value.limits, 'limits');
    const artifactDirectory = join(this.context.registration.directory, 'execution', attemptId), providerDirectory = join(artifactDirectory, 'provider');
    const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    if (!systemRoot || !isAbsolute(systemRoot)) throw new AngitError('PLATFORM_UNSUPPORTED', 'Windows system root is required for explicit provider environment');
    const system = this.host.platform.identify(join(systemRoot, 'System32'));
    if (!system.directory || !system.localDisk || system.reparsePoint) throw new AngitError('PLATFORM_UNSUPPORTED', 'Windows system identity is not a supported local directory');
    const environment: Record<string, string> = {
      SystemRoot: systemRoot, WINDIR: systemRoot, PATH: `${dirname(text(profile.executable, 'executable'))};${system.canonicalPath}`,
      HOME: providerDirectory, USERPROFILE: providerDirectory, TEMP: providerDirectory, TMP: providerDirectory,
      GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: 'NUL', GIT_ATTR_NOSYSTEM: '1', GIT_TERMINAL_PROMPT: '0',
      GIT_ASKPASS: '', SSH_ASKPASS: '', GIT_PAGER: '', PAGER: '', GIT_NO_REPLACE_OBJECTS: '1', GIT_ALLOW_PROTOCOL: '', GIT_PROTOCOL_FROM_USER: '0',
      GIT_CONFIG_COUNT: '8', GIT_CONFIG_KEY_0: 'core.hooksPath', GIT_CONFIG_VALUE_0: join(this.context.registration.directory, 'hooks'),
      GIT_CONFIG_KEY_1: 'core.fsmonitor', GIT_CONFIG_VALUE_1: 'false', GIT_CONFIG_KEY_2: 'core.attributesFile', GIT_CONFIG_VALUE_2: 'NUL',
      GIT_CONFIG_KEY_3: 'protocol.allow', GIT_CONFIG_VALUE_3: 'never', GIT_CONFIG_KEY_4: 'credential.helper', GIT_CONFIG_VALUE_4: '',
      GIT_CONFIG_KEY_5: 'core.askPass', GIT_CONFIG_VALUE_5: '', GIT_CONFIG_KEY_6: 'gc.auto', GIT_CONFIG_VALUE_6: '0',
      GIT_CONFIG_KEY_7: 'maintenance.auto', GIT_CONFIG_VALUE_7: 'false'
    };
    const input = canonical({ schemaVersion: 'angit-execution-input/v1', projectId: this.context.repo.projectId, attemptId, task: spec });
    if (Buffer.byteLength(input) > 1_048_576) throw new AngitError('INPUT_TOO_LARGE', 'Immutable provider task envelope exceeds its explicit stdin bound');
    return { executable: text(profile.executable, 'executable'), executableHash: text(profile.executableSha256, 'executableSha256'), args: strings(profile.args, 'args'), cwd: description.canonicalPath, environment, input, supervisorId, launchIdentity, authority,
      budget: { timeoutMs: Math.min(integer(profile.timeoutSeconds, 'profile timeout'), integer(execution.timeoutSeconds, 'execution timeout')) * 1000, maxOutputBytes: Math.min(integer(profile.maxOutputBytes, 'profile output'), integer(limits.maxArtifactBytes, 'maxArtifactBytes')), maxProcesses: integer(execution.maxProcessesPerAttempt, 'maxProcessesPerAttempt'), heartbeatMs: this.context.policy.leaseDurationMs, stopTimeoutMs: Math.min(this.context.policy.leaseDurationMs, 60_000) }, artifactDirectory };
  }
  private eligible(task: Row): Record<string, unknown> {
    const spec = jsonObject(text(task.spec_json, 'spec_json'), 'immutable task spec');
    validateSchema('task-input.schema.json', spec);
    const project = currentProject(this.context.db, this.context.registration);
    if (sha256(canonical(spec)) !== task.spec_sha256) throw new AngitError('STATE_CORRUPT', 'Immutable task digest changed');
    if (task.base_epoch !== project.content_epoch || spec.baseEpoch !== project.content_epoch) throw new AngitError('STALE_CONTENT_EPOCH', 'Task base epoch no longer permits execution');
    if (task.cancel_requested !== 0 || task.effective_in_current_snapshot === 'yes') throw new AngitError('TASK_NOT_ELIGIBLE', 'Cancelled or already effective task cannot reserve an attempt');
    if (this.context.db.prepare("SELECT 1 FROM task_dependencies d JOIN tasks t ON t.project_id=d.project_id AND t.id=d.depends_on_id WHERE d.project_id=? AND d.task_id=? AND (t.status<>'completed' OR t.effective_in_current_snapshot<>'yes') LIMIT 1").get(this.context.repo.projectId, text(task.id, 'taskId'))) throw new AngitError('DEPENDENCY_BLOCKED', 'Immutable DAG dependencies are not completed and effective');
    return spec;
  }
  private replay(request: CommandRequest, key: Semantic): CoreReply | null {
    const prior = this.context.db.prepare('SELECT * FROM idempotency_keys WHERE project_id=? AND stable_principal=? AND command=? AND key_hash=?').get(this.context.repo.projectId, key.principal, request.command, key.keyHash);
    if (!prior) return null;
    if (prior.request_hash !== key.requestHash) throw new AngitError('IDEMPOTENCY_CONFLICT', 'Idempotency key binds another immutable execution request');
    if (!['applied', 'failed'].includes(text(prior.status, 'status')) || prior.result_json === null) throw new AngitError('RECOVERY_REQUIRED', 'Reserved execution request retains its original launch; no duplicate execution is permitted', 6, false, prior.operation_id === null ? null : text(prior.operation_id, 'operationId'));
    return jsonObject(text(prior.result_json, 'result_json'), 'saved execution reply') as unknown as CoreReply;
  }
  private reserveKey(request: CommandRequest, key: Semantic, operationId: string | null): void {
    this.context.db.prepare("INSERT INTO idempotency_keys VALUES(?,?,?,?,?,?,'reserved',NULL,?)").run(this.context.repo.projectId, key.principal, request.command, key.keyHash, key.requestHash, operationId, Date.now());
  }
  private saveKey(request: CommandRequest, key: Semantic, reply: CoreReply): void {
    const bytes = canonical(reply);
    if (Buffer.byteLength(bytes) > this.context.policy.maxJsonBytes - 512) throw new AngitError('OUTPUT_LIMIT', 'Execution receipt exceeds the owner-approved reply bound');
    const updated = this.context.db.prepare("UPDATE idempotency_keys SET status='applied',result_json=? WHERE project_id=? AND stable_principal=? AND command=? AND key_hash=? AND request_hash=? AND status='reserved'").run(bytes, this.context.repo.projectId, key.principal, request.command, key.keyHash, key.requestHash);
    if (updated.changes !== 1) throw new AngitError('IDEMPOTENCY_CONFLICT', 'Execution receipt reservation changed');
  }
  private async reserve(task: Row, request: CommandRequest, key: Semantic): Promise<Slot | null> {
    this.assertLive();
    authorize(this.context.policy, 'attempt.start');
    const spec = this.eligible(task), profileId = text(spec.runtimeProfileId, 'runtimeProfileId');
    if (request.command === 'agent start' && request.options.runtimeProfileId !== profileId) throw new AngitError('POLICY_DENIED', 'Requested profile differs from the immutable task declaration');
    const profile = this.profile(profileId), execution = object(this.context.policy.value.execution, 'execution');
    const priorAttempts = integer(row(this.context.db.prepare('SELECT count(*) AS count FROM attempts WHERE project_id=? AND task_id=?').get(this.context.repo.projectId, text(task.id, 'taskId')), 'attempt count').count, 'attempt count');
    if (priorAttempts >= integer(execution.maxAttemptsPerTask, 'maxAttemptsPerTask')) throw new AngitError('ATTEMPT_LIMIT', 'Owner-approved attempt bound is exhausted');
    if (priorAttempts && request.options.retry !== true) throw new AngitError('RETRY_REQUIRED', 'A new attempt requires an explicit retry request');
    if (!['queued', 'blocked', 'failed', 'needs_review'].includes(text(task.status, 'task status'))) throw new AngitError('TASK_NOT_ELIGIBLE', 'Task lifecycle does not permit a new reservation');
    const base = await this.git.base(text(currentProject(this.context.db, this.context.registration).integration_oid, 'integration OID'));
    this.assertLive();
    const attemptId = id('att'), worktreeId = id('wt'), description = this.worktrees.describe(attemptId, worktreeId, base.oid, base.tree);
    return transaction(this.context.db, () => {
      this.assertLive();
      const current = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, text(task.id, 'taskId')), 'task reservation');
      if (current.version !== task.version) {
        // No attempt, artifact, lease or external effect exists yet; rescan run candidates only.
        if (request.command === 'run') return null;
        throw new AngitError('VERSION_CONFLICT', 'Task changed while checking immutable execution inputs');
      }
      this.eligible(current);
      const outputBudget = Math.min(integer(profile.maxOutputBytes, 'profile output'), integer(object(this.context.policy.value.limits, 'limits').maxArtifactBytes, 'maxArtifactBytes'));
      const budget = { attemptId, maxOutputBytes: outputBudget };
      this.host.storage.capacity(this.context.db, this.context.registration, this.context.policy, outputBudget + Buffer.byteLength(canonical(budget)) + 131072);
      this.artifact(`${attemptId}_budget`, budget);
      if (current.status !== 'queued') this.taskChange(text(task.id, 'taskId'), 'queued');
      const taskAuthority = grantTaskLease(this.context.db, this.context.registration, this.context.policy, this.authority, text(task.id, 'taskId'));
      this.context.db.prepare("INSERT INTO attempts(project_id,id,task_id,number,status,authority_incarnation,resource_key,owner_id,base_oid,base_epoch,coordinator_epoch,fencing_token,runtime_profile_hash) VALUES(?,?,?,?,'reserved',?,?,?,?,?,?,?,?)").run(this.context.repo.projectId, attemptId, text(task.id, 'taskId'), priorAttempts + 1, taskAuthority.authorityIncarnation, taskAuthority.resourceKey, taskAuthority.ownerId, base.oid, integer(current.base_epoch, 'base epoch'), taskAuthority.coordinatorEpoch, taskAuthority.fencingToken, sha256(canonical(profile)));
      this.context.db.prepare("INSERT INTO worktrees VALUES(?,?,?,NULL,'task',?,?,?,'provisioning',?)").run(this.context.repo.projectId, worktreeId, attemptId, description.canonicalPath, description.branchRef, base.oid, Date.now());
      const worktreeAuthority = grantWorktreeLease(this.context.db, this.context.registration, this.context.policy, this.authority, worktreeId);
      const nativeSpec = this.nativeSpec(attemptId, taskAuthority, description, spec, profile);
      const slot: Slot = { attemptId, taskId: text(task.id, 'taskId'), worktreeId, taskAuthority, worktreeAuthority, description, spec, profile, nativeSpec, cancelled: false, spawnCalled: false };
      const worktreeOp = this.operation('worktree_create', worktreeAuthority, { attemptId, operationOwnerId: null, managedParent: description.managedParent, canonicalPath: description.canonicalPath, role: 'task', branchRef: description.branchRef, branchExpectedAbsent: true, baseOid: base.oid, baseTreeOid: base.tree, ownershipMarkerId: description.ownershipMarkerId }, key);
      if (request.command === 'agent start') this.reserveKey(request, key, worktreeOp);
      this.taskChange(slot.taskId, 'leased');
      this.event(taskAuthority, 'attempt.reserved', attemptId, 'Unique task/worktree ownership reserved before external allocation', { attemptId, taskId: slot.taskId, worktreeId });
      this.slots.set(attemptId, slot);
      this.clock(taskAuthority); this.clock(worktreeAuthority);
      return slot;
    });
  }
  private async launch(slot: Slot, key: Semantic): Promise<void> {
    try {
      const worktreeOperation = row(this.context.db.prepare("SELECT * FROM operations WHERE project_id=? AND kind='worktree_create' AND json_extract(intent_json,'$.attemptId')=?").get(this.context.repo.projectId, slot.attemptId), 'worktree operation');
      slot.receipt = await this.worktrees.provision(slot.description, async allocation => {
        transaction(this.context.db, () => {
          this.assertLive(true);
          this.artifact(`${slot.worktreeId}_allocation`, allocation);
          this.observe(text(worktreeOperation.id, 'operationId'), slot.worktreeAuthority, 'path_allocated', { canonicalPath: allocation.canonicalPath, ownershipMarkerId: allocation.ownershipMarkerId });
        });
      });
      transaction(this.context.db, () => {
        this.assertLive(true);
        this.artifact(`${slot.worktreeId}_receipt`, slot.receipt);
        this.finalizeOperation(text(worktreeOperation.id, 'operationId'), slot.worktreeAuthority, { canonicalPath: slot.description.canonicalPath, ownershipMarkerId: slot.description.ownershipMarkerId, baseOid: slot.description.baseOid, baseTreeOid: slot.description.baseTreeOid, branchRef: slot.description.branchRef, role: 'task' });
        this.context.db.prepare("UPDATE worktrees SET status='ready' WHERE project_id=? AND id=? AND status='provisioning'").run(this.context.repo.projectId, slot.worktreeId);
      });
      if (slot.cancelled || this.stopping) {
        transaction(this.context.db, () => this.finishNoProcess(slot));
        return;
      }
      this.profile(text(slot.profile.id, 'profile id'));
      await this.worktrees.inspect(slot.receipt);
      if (slot.cancelled || this.stopping) {
        transaction(this.context.db, () => this.finishNoProcess(slot));
        return;
      }
      const spawnOperation = transaction(this.context.db, () => {
        this.assertLive();
        this.host.storage.capacity(this.context.db, this.context.registration, this.context.policy);
        const native = slot.nativeSpec;
        this.host.platform.preparePrivateDirectory(join(this.context.registration.directory, 'execution'));
        this.host.platform.preparePrivateDirectory(native.artifactDirectory);
        this.host.platform.preparePrivateDirectory(join(native.artifactDirectory, 'provider'));
        const operationId = this.operation('spawn', slot.taskAuthority, { attemptId: slot.attemptId, worktreeId: slot.worktreeId, approvedExecutable: native.executable, executableHash: native.executableHash, runtimeProfileHash: sha256(canonical(slot.profile)), supervisorId: native.supervisorId, launchIdentity: native.launchIdentity, argumentDigest: sha256(canonical(native.args)), requestDigest: sha256(native.input), cwd: native.cwd, environmentProfileHash: sha256(canonical(native.environment)), budget: { timeoutMs: native.budget.timeoutMs, stdoutBytes: native.budget.maxOutputBytes, stderrBytes: native.budget.maxOutputBytes, maxProcesses: native.budget.maxProcesses } }, key);
        this.attemptChange(slot, 'starting', { spawn_intent_id: operationId });
        return operationId;
      });
      // Any ambiguity after this call keeps the slot; absence of a PID is not proof that CreateProcess never happened.
      slot.spawnCalled = true;
      slot.handle = await startSupervision(this.host.assetRoot, slot.nativeSpec, { started: async process => {
        // This synchronous transaction cannot interleave with another DB transaction.
        // Never queue suspended-start persistence behind an unrelated asynchronous capture.
        transaction(this.context.db, () => {
          this.assertLive(true);
          if (process.supervisorId !== slot.nativeSpec.supervisorId || process.launchIdentity !== slot.nativeSpec.launchIdentity || process.executableHash !== slot.nativeSpec.executableHash) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Observed suspended process does not match durable spawn intent');
          if (!slot.receipt || this.host.platform.assertPrivateDirectory(slot.nativeSpec.cwd).identity !== slot.receipt.pathIdentity.identity ||
            this.host.platform.identify(slot.receipt.gitDirectory.canonicalPath).identity !== slot.receipt.gitDirectory.identity ||
            this.host.platform.assertPrivateFile(slot.receipt.gitPointer.canonicalPath).identity !== slot.receipt.gitPointer.identity) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Suspended start must retain exact allocated worktree and Git-directory identities before resume');
          const now = Date.now();
          this.artifact(`${slot.attemptId}_started`, process);
          this.observe(spawnOperation, slot.taskAuthority, 'process_start', { process, observedStartAtMs: now });
          this.attemptChange(slot, 'running', { pid: process.pid, process_identity: canonical(process), started_at_ms: now, heartbeat_at_ms: now });
          this.taskChange(slot.taskId, 'running');
          this.finalizeOperation(spawnOperation, slot.taskAuthority, { process, observedStartAtMs: now, startAndExitReceiptHash: null });
          slot.process = process;
        });
      } });
      if (slot.cancelled || this.stopping) await this.serialized(() => this.stopSlot(slot, 'owner_stop'));
      const termination = await slot.handle.completion;
      await this.serialized(() => this.finish(slot, termination));
    } catch (error) {
      await this.serialized(() => {
        transaction(this.context.db, () => {
          const attempt = row(this.context.db.prepare('SELECT * FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.attemptId), 'failed execution');
          if (attempt.ended_at_ms !== null) return;
          this.attemptChange(slot, 'orphaned');
          const task = row(this.context.db.prepare('SELECT status FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.taskId), 'orphan task');
          if (!['cancelled', 'needs_review'].includes(text(task.status, 'status'))) this.taskChange(slot.taskId, 'needs_review');
          this.context.db.prepare("UPDATE worktrees SET status='preserved' WHERE project_id=? AND id=?").run(this.context.repo.projectId, slot.worktreeId);
          this.event(slot.taskAuthority, 'attempt.unknown', slot.attemptId, 'Unknown allocation, start or termination retains writer ownership and preserved workspace', { attemptId: slot.attemptId, reasonCode: error instanceof AngitError ? error.code : 'persistence_uncertain' });
        });
      }).catch(() => undefined);
      this.stopping = true;
      this.renewalFailure ??= error instanceof AngitError ? error : new AngitError('RECOVERY_REQUIRED', 'Owned execution outcome is unknown; exact recovery is required', 6);
    } finally {
      const attempt = this.context.db.prepare('SELECT ended_at_ms FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.attemptId);
      if (attempt?.ended_at_ms !== null && attempt !== undefined) this.slots.delete(slot.attemptId);
    }
  }
  private finishNoProcess(slot: Slot): void {
    if (slot.spawnCalled || slot.process) throw new AngitError('RECOVERY_REQUIRED', 'Observed or possibly created writer cannot use no-process proof');
    const proof = sha256(canonical({ attemptId: slot.attemptId, neverCalledNativeSpawn: true, worktreeReceipt: slot.receipt }));
    this.attemptChange(slot, 'cancelled', { ended_at_ms: Date.now(), termination_kind: 'no_process_created', termination_receipt_hash: proof });
    const task = row(this.context.db.prepare('SELECT status FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.taskId), 'cancel task');
    if (task.status !== 'cancelled') this.taskChange(slot.taskId, 'cancelled', true);
    this.context.db.prepare("UPDATE worktrees SET status='preserved' WHERE project_id=? AND id=?").run(this.context.repo.projectId, slot.worktreeId);
    releaseExecutionLease(this.context.db, slot.taskAuthority); releaseExecutionLease(this.context.db, slot.worktreeAuthority);
    this.results.push(this.summary(slot.attemptId));
    this.settleStartReceipt(slot.attemptId);
  }
  private async finish(slot: Slot, receipt: TerminationReceipt): Promise<void> {
    if (!slot.process || receipt.writerTreeTerminated !== true || canonical(receipt.process) !== canonical(slot.process) || canonical(receipt.authority) !== canonical(slot.nativeSpec.authority)) throw new AngitError('RECOVERY_REQUIRED', 'Exact full writer-tree termination receipt is required before capture or slot release');
    const verified = await readTerminationReceipt(this.host.assetRoot, receipt.receiptPath, slot.nativeSpec, slot.process);
    if (canonical(verified) !== canonical(receipt)) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Durable native termination readback differs from supervised final receipt');
    if (receipt.reason === 'stop' && (slot.stopOperationId === undefined || receipt.stopOperationId !== slot.stopOperationId)) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Native stop receipt does not bind the exact durable stop intent');
    slot.termination = receipt;
    transaction(this.context.db, () => {
      this.artifact(`${slot.attemptId}_terminated`, receipt);
      for (const [kind, output] of [['stdout', receipt.stdout], ['stderr', receipt.stderr]] as const) {
        const path = relative(this.context.registration.directory, output.path).replaceAll('\\', '/');
        if (!contained(slot.nativeSpec.artifactDirectory, output.path) || path.startsWith('../')) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Output artifact escaped owned supervision storage');
        this.context.db.prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,'log',?)").run(this.context.repo.projectId, `${slot.attemptId}_${kind}`, path, output.sha256, output.bytes, Date.now());
      }
      if (slot.stopOperationId) this.finalizeOperation(slot.stopOperationId, slot.taskAuthority, { process: slot.process, writerTreeTerminated: true, terminationReceiptHash: receipt.terminationReceiptHash });
    });
    const task = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.taskId), 'termination task');
    let status = slot.cancelled || task.cancel_requested === 1 || this.stopping && receipt.reason !== 'exit' ? 'cancelled' : 'failed';
    let submission: { oid: string; treeOid: string; submissionRef: string } | undefined;
    if (status !== 'cancelled' && receipt.reason === 'exit' && receipt.rootExitCode === 0) {
      try {
        this.assertLive(true);
        if (!slot.receipt) throw new AngitError('WORKTREE_IDENTITY_CHANGED', 'Exact persisted owned worktree receipt is required');
        const submissionRef = `refs/angit/${this.context.repo.projectId}/submissions/${slot.attemptId}`;
        transaction(this.context.db, () => this.artifact(`${slot.attemptId}_capture`, { attemptId: slot.attemptId, authority: slot.taskAuthority, submissionRef, baseOid: slot.description.baseOid, taskSpecHash: sha256(canonical(slot.spec)), writerTreeTerminationReceiptHash: receipt.terminationReceiptHash }));
        submission = await this.worktrees.capture(slot.receipt, slot.description.baseOid, slot.spec, submissionRef);
        transaction(this.context.db, () => this.artifact(`${slot.attemptId}_submission`, submission));
        status = 'submitted';
      } catch (error) {
        if (!(error instanceof AngitError) || ['RECOVERY_REQUIRED', 'GIT_TIMEOUT', 'GIT_EXECUTION_FAILED', 'PERSISTENCE_UNCERTAIN', 'STATE_CORRUPT', 'STATE_IDENTITY_CHANGED'].includes(error.code)) throw error;
        if (['POLICY_CHANGED', 'GUARD_LOST', 'STALE_AUTHORITY_TUPLE', 'REPOSITORY_IDENTITY_CHANGED'].includes(error.code)) this.stopping = true;
        // Known dirty/scope failures preserve source; ambiguous create-only pin outcomes retain the attempt slot.
      }
    }
    transaction(this.context.db, () => {
      const values: Record<string, string | number | null> = { ended_at_ms: Math.max(receipt.observedAtMs, integer(row(this.context.db.prepare('SELECT started_at_ms FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.attemptId), 'start timestamp').started_at_ms, 'startedAtMs')), termination_kind: 'writer_tree_terminated', termination_receipt_hash: receipt.terminationReceiptHash };
      if (submission) Object.assign(values, { submission_oid: submission.oid, submission_tree_oid: submission.treeOid, submission_ref: submission.submissionRef });
      this.attemptChange(slot, status, values);
      const currentTask = row(this.context.db.prepare('SELECT status FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.taskId), 'final task');
      if (currentTask.status !== 'cancelled') this.taskChange(slot.taskId, status === 'submitted' ? 'submitted' : status === 'cancelled' ? 'cancelled' : 'needs_review', status === 'cancelled');
      this.context.db.prepare("UPDATE worktrees SET status='preserved' WHERE project_id=? AND id=?").run(this.context.repo.projectId, slot.worktreeId);
      releaseExecutionLease(this.context.db, slot.taskAuthority); releaseExecutionLease(this.context.db, slot.worktreeAuthority);
      this.settleStartReceipt(slot.attemptId);
      this.results.push(this.summary(slot.attemptId));
    });
  }
  private summary(attemptId: string): Record<string, unknown> {
    const attempt = row(this.context.db.prepare('SELECT a.*,w.id AS worktree_id FROM attempts a JOIN worktrees w ON w.project_id=a.project_id AND w.attempt_id=a.id WHERE a.project_id=? AND a.id=?').get(this.context.repo.projectId, attemptId), 'attempt summary');
    return { projectId: this.context.repo.projectId, attemptId, taskId: attempt.task_id, worktreeId: attempt.worktree_id, status: attempt.status, submissionOid: attempt.submission_oid, submissionTreeOid: attempt.submission_tree_oid, submissionRef: attempt.submission_ref, terminationProof: attempt.termination_kind === null ? null : { kind: attempt.termination_kind, receiptHash: attempt.termination_receipt_hash }, operationIds: this.context.db.prepare("SELECT id FROM operations WHERE project_id=? AND json_extract(intent_json,'$.attemptId')=? ORDER BY created_at_ms,id").all(this.context.repo.projectId, attemptId).map(value => value.id), providerCompatibility: 'unknown', workspacePreserved: true };
  }
  private settleStartReceipt(attemptId: string): void {
    const attempt = row(this.context.db.prepare('SELECT * FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, attemptId), 'terminal start receipt');
    if (attempt.ended_at_ms === null || attempt.termination_kind === null || attempt.termination_receipt_hash === null) throw new AngitError('RECOVERY_REQUIRED', 'Start receipt requires committed terminal proof');
    const reply = canonical({ data: this.summary(attemptId), coordinatorEpoch: this.authority.coordinatorEpoch, maxJsonBytes: this.context.policy.maxJsonBytes });
    if (Buffer.byteLength(reply) > this.context.policy.maxJsonBytes - 512) throw new AngitError('OUTPUT_LIMIT', 'Recovered execution receipt exceeds the owner-approved reply bound');
    this.context.db.prepare("UPDATE idempotency_keys SET status='applied',result_json=? WHERE project_id=? AND stable_principal=? AND command='agent start' AND status IN ('reserved','unknown') AND operation_id IN (SELECT id FROM operations WHERE project_id=? AND kind='worktree_create' AND json_extract(intent_json,'$.attemptId')=? AND request_key_hash=idempotency_keys.key_hash AND semantic_request_hash=idempotency_keys.request_hash)").run(reply, this.context.repo.projectId, `owner:${this.host.ownerSid}`, this.context.repo.projectId, attemptId);
  }
  private async stopSlot(slot: Slot, reason: string, request?: CommandRequest): Promise<string | null> {
    slot.cancelled = true;
    if (slot.termination) return slot.stopOperationId ?? null;
    if (!slot.process) return null;
    if (!slot.stopOperationId) {
      const operationId = transaction(this.context.db, () => {
        const key = request ? semantic(request, this.host.ownerSid) : { keyHash: sha256(`${slot.attemptId}:${reason}`), requestHash: sha256(canonical({ attemptId: slot.attemptId, reason })), principal: `owner:${this.host.ownerSid}` };
        // Generic approved executables have no verified provider-specific graceful-stop protocol.
        const operationId = this.operation('stop', slot.taskAuthority, { attemptId: slot.attemptId, targetProcess: slot.process, stopMode: 'graceful_then_force', graceDeadlineMs: Date.now(), finalDeadlineMs: Date.now() + slot.nativeSpec.budget.stopTimeoutMs }, key);
        this.observe(operationId, slot.taskAuthority, 'stop_requested', { process: slot.process, requestedAtMs: Date.now() });
        this.attemptChange(slot, 'stopping');
        if (request) this.context.db.prepare('UPDATE idempotency_keys SET operation_id=? WHERE project_id=? AND stable_principal=? AND command=? AND key_hash=? AND operation_id IS NULL').run(operationId, this.context.repo.projectId, key.principal, request.command, key.keyHash);
        return operationId;
      });
      slot.stopOperationId = operationId;
    }
    if (slot.handle) await slot.handle.stop(slot.stopOperationId);
    return slot.stopOperationId;
  }
  private async stopAll(reason: string): Promise<void> {
    await this.serialized(async () => {
      for (const slot of this.slots.values()) await this.stopSlot(slot, reason);
    });
  }
  private async brokerRequest(envelope: BrokerRequest): Promise<unknown> {
    try {
      if (envelope.peerSid !== this.host.ownerSid) throw new AngitError('ACCESS_DENIED', 'Native peer SID is not the owner');
      const request = object(envelope.request, 'broker command') as unknown as CommandRequest;
      this.host.validate(request, this.context.repo);
      if (!CONTROL_METHODS.includes(request.command)) throw new AngitError('POLICY_DENIED', 'Owner control scope does not grant this method');
      const reply = await this.serialized(async () => {
        this.assertLive(true);
        if (this.scope.revoked === true || integer(this.scope.expiresAtMs, 'scope expiry') <= Date.now()) throw new AngitError('ACCESS_DENIED', 'Owner control scope has expired or was revoked');
        if (['task add', 'task message'].includes(request.command)) {
          const result = await this.host.metadata(request, this.context, this.authority);
          this.wakeAdmission?.();
          return result;
        }
        authorize(this.context.policy, request.command === 'agent stop' ? 'attempt.stop' : 'task.cancel');
        const key = semantic(request, this.host.ownerSid), replay = this.replay(request, key);
        if (replay) return replay;
        const taskId = request.command === 'task cancel' ? text(request.options.taskId, 'taskId') : null;
        let slot = taskId ? [...this.slots.values()].find(value => value.taskId === taskId) : this.slots.get(text(request.options.attemptId, 'attemptId'));
        if (slot && this.context.db.prepare('SELECT ended_at_ms FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, slot.attemptId)?.ended_at_ms !== null) slot = undefined;
        if (!slot && request.command === 'agent stop') {
          const attempt = this.context.db.prepare('SELECT ended_at_ms FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, text(request.options.attemptId, 'attemptId'));
          if (!attempt || attempt.ended_at_ms === null) throw new AngitError('RECOVERY_REQUIRED', 'Stop target is not an exactly owned live supervisor');
          const result = { data: { ...this.summary(text(request.options.attemptId, 'attemptId')), accepted: false, alreadyTerminated: true }, coordinatorEpoch: this.authority.coordinatorEpoch, maxJsonBytes: this.context.policy.maxJsonBytes };
          transaction(this.context.db, () => { this.reserveKey(request, key, null); this.saveKey(request, key, result); });
          return result;
        }
        if (!slot && taskId && this.context.db.prepare('SELECT 1 FROM attempts WHERE project_id=? AND task_id=? AND ended_at_ms IS NULL LIMIT 1').get(this.context.repo.projectId, taskId)) throw new AngitError('RECOVERY_REQUIRED', 'Unterminated database attempt is not owned by a live cancellation slot; preserve unknown writers');
        const version = transaction(this.context.db, () => {
          this.reserveKey(request, key, null);
          if (taskId) {
            const task = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, taskId), 'cancel target');
            if (task.status === 'completed') throw new AngitError('ALREADY_INTEGRATED', 'Completed integration cannot be cancelled');
            if (task.status === 'cancelled') return integer(task.version, 'version');
            return this.taskChange(taskId, slot ? text(task.status, 'status') : 'cancelled', true);
          }
          return null;
        });
        const stopOperationId = slot ? await this.stopSlot(slot, text(request.options.reason, 'stop reason'), request) : null;
        const result: CoreReply = { data: taskId ? { taskId, attemptId: slot?.attemptId ?? null, status: slot ? 'stopping' : 'cancelled', version, cancelRequested: true, accepted: true, stopOperationId } : { attemptId: slot!.attemptId, taskId: slot!.taskId, stopOperationId, accepted: true, status: slot!.process ? 'stopping' : 'reserved' }, coordinatorEpoch: this.authority.coordinatorEpoch, maxJsonBytes: this.context.policy.maxJsonBytes };
        transaction(this.context.db, () => this.saveKey(request, key, result));
        return result;
      });
      return { ok: true, reply };
    } catch (error) {
      const value = error instanceof AngitError ? error : new AngitError('PERSISTENCE_UNCERTAIN', 'Broker mutation failed; no whole-command replay is permitted', 6);
      return { ok: false, error: { code: value.code, message: value.message, exitCode: value.exitCode, retryable: value.retryable, operationId: value.operationId } };
    }
  }
  private async publishBroker(): Promise<void> {
    const scopeId = id('scope'), handle = randomBytes(32).toString('hex');
    this.scope = { scopeId, handleDigest: sha256(handle), projectId: this.context.repo.projectId, authorityIncarnation: this.authority.authorityIncarnation, coordinatorEpoch: this.authority.coordinatorEpoch, principalId: `owner_${sha256(this.host.ownerSid).slice(0, 32)}`, allowedMethods: CONTROL_METHODS, allowedResources: [this.context.repo.projectId], expiresAtMs: Number.MAX_SAFE_INTEGER, revoked: false, ownerApprovalReference: `external-owner-file:${this.context.policy.fileIdentity}`, channelKind: 'owner_control', attemptId: null, launchIdentity: null };
    validateSchema('ipc-scope.schema.json', this.scope);
    const descriptor: BrokerDescriptor = { pipeName: `angit-${this.context.repo.projectId}-${randomBytes(16).toString('hex')}`, scopeHandle: handle, ownerSid: this.host.ownerSid, projectId: this.context.repo.projectId, authorityIncarnation: this.authority.authorityIncarnation, coordinatorEpoch: this.authority.coordinatorEpoch };
    transaction(this.context.db, () => { this.artifact(scopeId, this.scope); this.event(this.authority, 'scope.issued', scopeId, 'Owner-private control scope minted for this exact lifetime epoch', { scopeId, handleDigest: this.scope.handleDigest, channelKind: 'owner_control' }); });
    this.broker = await startBroker(this.host.assetRoot, descriptor, request => this.brokerRequest(request));
    this.controlPath = join(this.context.registration.directory, 'control.json');
    if (existsSync(this.controlPath)) {
      const prior = jsonObject(boundedPrivate(this.host.platform, this.controlPath).toString('utf8'), 'prior control');
      const priorScope = object(prior.scope, 'prior scope');
      validateSchema('ipc-scope.schema.json', priorScope);
      if (priorScope.projectId !== this.context.repo.projectId || priorScope.authorityIncarnation !== this.context.registration.incarnation || integer(priorScope.coordinatorEpoch, 'prior epoch') >= this.authority.coordinatorEpoch) throw new AngitError('RECOVERY_REQUIRED', 'Unknown owner control file is preserved');
      unlinkSync(this.controlPath);
    }
    createPrivate(this.host.platform, this.controlPath, canonical({ descriptor, scope: this.scope }));
    this.controlIdentity = this.host.platform.assertPrivateFile(this.controlPath).identity;
  }
  async execute(request: CommandRequest, observed: ExecutionContext, options: { signal?: AbortSignal } = {}): Promise<CoreReply> {
    if (request.command === 'run' && request.options.autoIntegrate === true) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Auto-integration remains unavailable; no execution effects were admitted', 3);
    this.signal = options.signal;
    if (this.signal?.aborted) throw new AngitError('ADMISSION_STOPPED', 'Foreground request was interrupted before mutation authority');
    const key = semantic(request, this.host.ownerSid);
    this.context = observed;
    const prior = this.replay(request, key);
    if (prior) return prior;
    this.guard = this.host.storage.acquireGuard(observed.registration);
    try {
      this.context = this.host.context(observed.repo, true);
      authorize(this.context.policy, request.command === 'agent start' ? 'attempt.start' : 'coordinator.start');
      const replay = this.replay(request, key);
      if (replay) return replay;
      if (request.command === 'agent start') {
        const task = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, text(request.options.taskId, 'taskId')), 'start target');
        const spec = this.eligible(task);
        if (request.options.runtimeProfileId !== spec.runtimeProfileId) throw new AngitError('POLICY_DENIED', 'Requested profile differs from immutable task declaration before execution authority');
        this.profile(text(request.options.runtimeProfileId, 'runtimeProfileId'));
      }
      const execution = object(this.context.policy.value.execution, 'execution'), parallel = request.command === 'agent start' ? 1 : request.options.parallel === undefined ? Math.min(3, integer(execution.maxParallelAgents, 'maxParallelAgents')) : integer(request.options.parallel, 'parallel');
      if (execution.maxProcessesPerAttempt === undefined || parallel < 1 || parallel > integer(execution.maxParallelAgents, 'maxParallelAgents')) throw new AngitError('POLICY_NOT_APPROVED', 'Explicit owner execution/process and parallel budgets are required before effects');
      if (unresolved(this.context.db, this.context.repo.projectId) && request.options.recover !== true) throw new AngitError('RECOVERY_REQUIRED', 'Unresolved writers retain their resource slots; use exact receipt recovery');
      this.host.platform.preparePrivateDirectory(join(this.context.registration.directory, 'artifacts'));
      this.authority = startSessionAuthority(this.context.db, this.context.registration, this.context.policy, id('owner'), request.options.recover === true);
      this.clock(this.authority);
      const host = this.host, session = this;
      this.git = new ApprovedGit(host.platform, this.context.repo, object(this.context.policy.value.git, 'git'), this.context.registration.directory);
      this.git.setAdmissionCheck(() => transaction(session.context.db, () => session.assertLive(true)));
      this.worktrees = new WorktreeBroker(host.platform, this.context.repo, this.git, this.context.registration, this.context.policy);
      this.abortListener = () => { this.stopping = true; void this.stopAll('foreground_interrupt').catch(() => undefined); };
      this.signal?.addEventListener('abort', this.abortListener, { once: true });
      if (this.signal?.aborted) this.abortListener();
      this.timer = setInterval(() => {
        if (!this.heartbeatPending) this.heartbeatPending = this.heartbeat().finally(() => { this.heartbeatPending = undefined; });
      }, this.context.policy.heartbeatIntervalMs);
      if (request.options.recover === true) await this.recover();
      if (unresolved(this.context.db, this.context.repo.projectId)) throw new AngitError('RECOVERY_REQUIRED', 'Unknown recovered slots remain blocked; no replacement launch was admitted', 6);
      if (this.stopping) throw new AngitError('ADMISSION_STOPPED', 'Foreground request was interrupted before broker admission');
      await this.publishBroker();
      if (this.signal?.aborted) this.abortListener();
      if (request.command === 'run') transaction(this.context.db, () => this.reserveKey(request, key, null));
      do {
        if (this.stopping) break;
        this.assertLive();
        const available = parallel - this.slots.size;
        // A brokered task can fill available capacity without waiting for an unrelated writer to finish.
        const admissionWake = request.command === 'run' && available > 0 ? Promise.withResolvers<void>() : undefined;
        this.wakeAdmission = admissionWake?.resolve;
        const tasks = request.command === 'agent start' ? [row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, text(request.options.taskId, 'taskId')), 'start target')] : this.context.db.prepare("SELECT t.* FROM tasks t WHERE t.project_id=? AND t.status IN ('queued','blocked') AND t.cancel_requested=0 AND t.base_epoch=? AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.project_id=t.project_id AND a.task_id=t.id) AND NOT EXISTS(SELECT 1 FROM task_dependencies d JOIN tasks x ON x.project_id=d.project_id AND x.id=d.depends_on_id WHERE d.project_id=t.project_id AND d.task_id=t.id AND (x.status<>'completed' OR x.effective_in_current_snapshot<>'yes')) ORDER BY t.priority DESC,t.created_at_ms,t.id LIMIT ?").all(this.context.repo.projectId, integer(currentProject(this.context.db, this.context.registration).content_epoch, 'content epoch'), available);
        let admissionChanged = false;
        for (const task of tasks) {
          if (this.stopping || this.slots.size >= parallel) break;
          const slot = await this.reserve(task, request, key);
          if (!slot) { admissionChanged = true; continue; }
          slot.done = this.launch(slot, key);
        }
        if (request.command === 'agent start') break;
        if (admissionChanged) continue;
        if (!this.slots.size && request.options.until !== 'stopped') break;
        if (this.slots.size) {
          const pending = [...this.slots.values()].map(slot => slot.done!);
          if (admissionWake && this.slots.size < parallel) pending.push(admissionWake.promise);
          await Promise.race(pending);
        }
        else await delay(Math.min(this.context.policy.heartbeatIntervalMs, 200));
      } while (!this.stopping);
      if (this.stopping) await this.stopAll('owner_stop');
      await Promise.all([...this.slots.values()].map(slot => slot.done));
      const unknown = unresolved(this.context.db, this.context.repo.projectId);
      if (request.command === 'agent start' && !this.results.length && !this.slots.size) throw new AngitError('ADMISSION_STOPPED', 'Foreground request was interrupted before any attempt was reserved');
      const reply: CoreReply = { data: request.command === 'agent start' ? this.results[0] ?? this.summary([...this.slots.keys()][0]!) : { projectId: this.context.repo.projectId, attempts: this.results, stopped: this.stopping, recoveryRequired: unknown }, coordinatorEpoch: this.authority.coordinatorEpoch, maxJsonBytes: this.context.policy.maxJsonBytes };
      if (unknown) throw this.renewalFailure ?? new AngitError('RECOVERY_REQUIRED', 'Owned execution outcome remains unknown; writer slots were not released', 6);
      transaction(this.context.db, () => { if (request.command === 'run') this.saveKey(request, key, reply); releaseLease(this.context.db, this.authority); });
      return reply;
    } finally {
      clearInterval(this.timer);
      if (this.abortListener) this.signal?.removeEventListener('abort', this.abortListener);
      this.stopping = true;
      try {
        if (this.authority && this.slots.size) {
          await this.stopAll('session_close').catch(() => undefined);
          await Promise.all([...this.slots.values()].map(slot => slot.done)).catch(() => undefined);
        }
        await this.heartbeatPending;
        if (this.scope) this.scope.revoked = true;
        await this.broker?.close();
        if (this.scope) transaction(this.context.db, () => this.event(this.authority, 'scope.revoked', text(this.scope.scopeId, 'scopeId'), 'Foreground owner control scope revoked before lifetime guard release', { scopeId: this.scope.scopeId, handleDigest: this.scope.handleDigest }));
        if (this.controlIdentity && existsSync(this.controlPath) && this.host.platform.assertPrivateFile(this.controlPath).identity === this.controlIdentity) unlinkSync(this.controlPath);
      } finally {
        try { if (this.context !== observed) this.context.db.close(); }
        finally { try { if (this.guard.isTransaction) this.guard.exec('ROLLBACK'); } finally { this.guard.close(); } }
      }
    }
  }
  private async recover(): Promise<void> {
    // Missing or unauthenticated receipts never authorize a spawn replay.
    const attempts = this.context.db.prepare('SELECT * FROM attempts WHERE project_id=? AND ended_at_ms IS NULL ORDER BY id').all(this.context.repo.projectId);
    for (const attempt of attempts) {
      const attemptId = text(attempt.id, 'attemptId');
      try {
        if (attempt.process_identity === null || attempt.spawn_intent_id === null) throw new AngitError('RECOVERY_REQUIRED', 'Unobserved native start cannot be inferred from a PID or elapsed lease');
        const process = this.readArtifact<ProcessReceipt>(`${attemptId}_started`);
        if (canonical(process) !== attempt.process_identity) throw new AngitError('STATE_CORRUPT', 'Retained observed process identity differs from attempt');
        const worktree = row(this.context.db.prepare('SELECT * FROM worktrees WHERE project_id=? AND attempt_id=?').get(this.context.repo.projectId, attemptId), 'recovery worktree');
        const receipt = this.readArtifact<WorktreeReceipt>(`${text(worktree.id, 'worktreeId')}_receipt`), task = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, text(attempt.task_id, 'taskId')), 'recovery task');
        const spec = jsonObject(text(task.spec_json, 'spec_json'), 'recovery immutable spec'), profile = this.profile(text(spec.runtimeProfileId, 'profileId'));
        if (sha256(canonical(spec)) !== task.spec_sha256 || sha256(canonical(profile)) !== attempt.runtime_profile_hash) throw new AngitError('STATE_CORRUPT', 'Recovery immutable task/profile identity differs');
        const prior: Authority = { projectId: this.context.repo.projectId, authorityIncarnation: text(attempt.authority_incarnation, 'incarnation'), coordinatorEpoch: integer(attempt.coordinator_epoch, 'epoch'), resourceKey: text(attempt.resource_key, 'resource'), fencingToken: integer(attempt.fencing_token, 'fence'), ownerId: text(attempt.owner_id, 'owner') };
        const nativeSpec = this.nativeSpec(attemptId, prior, receipt, spec, profile, process.supervisorId, process.launchIdentity);
        const final = await readTerminationReceipt(this.host.assetRoot, join(nativeSpec.artifactDirectory, 'termination.json'), nativeSpec, process);
        if (final.reason === 'stop') {
          const stop = final.stopOperationId === null ? undefined : this.context.db.prepare("SELECT intent_json FROM operations WHERE project_id=? AND id=? AND kind='stop'").get(this.context.repo.projectId, final.stopOperationId);
          if (!stop || canonical(jsonObject(text(stop.intent_json, 'stop intent'), 'stop intent').targetProcess) !== canonical(process)) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Recovered stop proof has no exact durable stop intent');
        }
        // A native verifier must independently prove that the owned helper is gone and the exact retained Job writer tree is empty.
        await this.reconcileTerminated(attempt, worktree, receipt, final);
      } catch (error) {
        transaction(this.context.db, () => {
          const current = row(this.context.db.prepare('SELECT status,version FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, attemptId), 'orphan recovery');
          if (current.status !== 'orphaned') this.context.db.prepare("UPDATE attempts SET status='orphaned',version=version+1 WHERE project_id=? AND id=? AND version=?").run(this.context.repo.projectId, attemptId, integer(current.version, 'version'));
          this.event(this.authority, 'attempt.recovery_blocked', attemptId, 'Unknown owned writer preserved without PID-only termination, reattachment or replacement', { attemptId, reasonCode: error instanceof AngitError ? error.code : 'unknown_receipt' });
        });
      }
    }
    transaction(this.context.db, () => {
      for (const request of this.context.db.prepare("SELECT * FROM idempotency_keys WHERE project_id=? AND stable_principal=? AND command='agent start' AND status IN ('reserved','unknown')").all(this.context.repo.projectId, `owner:${this.host.ownerSid}`)) {
        const operation = this.context.db.prepare("SELECT * FROM operations WHERE project_id=? AND id=? AND kind='worktree_create' AND request_key_hash=? AND semantic_request_hash=?").get(this.context.repo.projectId, text(request.operation_id, 'start operation'), text(request.key_hash, 'start key'), text(request.request_hash, 'start request hash'));
        if (!operation) continue;
        const attemptId = text(jsonObject(text(operation.intent_json, 'start intent'), 'start intent').attemptId, 'attemptId');
        const attempt = row(this.context.db.prepare('SELECT * FROM attempts WHERE project_id=? AND id=?').get(this.context.repo.projectId, attemptId), 'retained ended attempt');
        if (attempt.ended_at_ms === null) continue;
        const operations = this.context.db.prepare("SELECT phase FROM operations WHERE project_id=? AND json_extract(intent_json,'$.attemptId')=?").all(this.context.repo.projectId, attemptId);
        if (operations.some(value => !['finalized', 'failed', 'abandoned'].includes(text(value.phase, 'phase')))) continue;
        if (attempt.termination_kind === 'writer_tree_terminated') {
          const final = this.readArtifact<TerminationReceipt>(`${attemptId}_terminated`);
          const prior: Authority = { projectId: this.context.repo.projectId, authorityIncarnation: text(attempt.authority_incarnation, 'incarnation'), coordinatorEpoch: integer(attempt.coordinator_epoch, 'epoch'), resourceKey: text(attempt.resource_key, 'resource'), fencingToken: integer(attempt.fencing_token, 'fence'), ownerId: text(attempt.owner_id, 'owner') };
          if (final.writerTreeTerminated !== true || final.terminationReceiptHash !== attempt.termination_receipt_hash || canonical(final.process) !== attempt.process_identity || canonical(final.authority) !== canonical(prior)) throw new AngitError('STATE_CORRUPT', 'Retained ended attempt proof differs from its immutable execution receipt');
        } else if (attempt.termination_kind === 'no_process_created') {
          const worktree = row(this.context.db.prepare('SELECT id FROM worktrees WHERE project_id=? AND attempt_id=?').get(this.context.repo.projectId, attemptId), 'retained no-process worktree');
          const receipt = this.readArtifact<WorktreeReceipt>(`${text(worktree.id, 'worktreeId')}_receipt`);
          if (attempt.pid !== null || attempt.process_identity !== null || attempt.started_at_ms !== null || attempt.spawn_intent_id !== null || attempt.termination_receipt_hash !== sha256(canonical({ attemptId, neverCalledNativeSpawn: true, worktreeReceipt: receipt }))) throw new AngitError('STATE_CORRUPT', 'Retained no-process proof contradicts an observed or possibly created writer');
        } else throw new AngitError('RECOVERY_REQUIRED', 'Ended start attempt lacks exact terminal proof');
        this.settleStartReceipt(attemptId);
      }
      for (const request of this.context.db.prepare("SELECT * FROM idempotency_keys WHERE project_id=? AND command='run' AND status IN ('reserved','unknown')").all(this.context.repo.projectId)) {
        const operations = this.context.db.prepare('SELECT * FROM operations WHERE project_id=? AND request_key_hash=? AND semantic_request_hash=?').all(this.context.repo.projectId, text(request.key_hash, 'request key'), text(request.request_hash, 'request hash'));
        if (operations.some(operation => !['finalized', 'failed', 'abandoned'].includes(text(operation.phase, 'phase')))) continue;
        const attempts = this.context.db.prepare("SELECT DISTINCT a.* FROM attempts a JOIN operations o ON o.project_id=a.project_id AND json_extract(o.intent_json,'$.attemptId')=a.id WHERE a.project_id=? AND o.request_key_hash=? AND o.semantic_request_hash=? ORDER BY a.id").all(this.context.repo.projectId, text(request.key_hash, 'key hash'), text(request.request_hash, 'request hash'));
        if (attempts.some(attempt => attempt.ended_at_ms === null)) continue;
        const result = canonical({ data: { projectId: this.context.repo.projectId, attempts: attempts.map(attempt => this.summary(text(attempt.id, 'attemptId'))), stopped: true, recoveryRequired: false, recovered: true }, coordinatorEpoch: this.authority.coordinatorEpoch, maxJsonBytes: this.context.policy.maxJsonBytes });
        if (Buffer.byteLength(result) > this.context.policy.maxJsonBytes - 512) continue;
        this.context.db.prepare("UPDATE idempotency_keys SET status='failed',result_json=? WHERE project_id=? AND stable_principal=? AND command='run' AND key_hash=? AND request_hash=? AND status IN ('reserved','unknown')").run(result, this.context.repo.projectId, text(request.stable_principal, 'principal'), text(request.key_hash, 'key hash'), text(request.request_hash, 'request hash'));
      }
    });
  }
  private async reconcileTerminated(attempt: Row, worktree: Row, receipt: WorktreeReceipt, final: TerminationReceipt): Promise<void> {
    await this.worktrees.inspect(receipt);
    const attemptId = text(attempt.id, 'attemptId'), taskId = text(attempt.task_id, 'taskId');
    const capture = readExecutionManifest(this.host.platform, this.context.registration, this.context.db, `${attemptId}_capture`);
    let submission: { oid: string; treeOid: string; submissionRef: string } | undefined;
    if (capture !== null) {
      const intent = object(capture, 'retained capture intent'), spec = jsonObject(text(row(this.context.db.prepare('SELECT spec_json FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, taskId), 'capture task').spec_json, 'spec_json'), 'capture task spec');
      const submissionRef = `refs/angit/${this.context.repo.projectId}/submissions/${attemptId}`;
      if (intent.attemptId !== attemptId || intent.submissionRef !== submissionRef || intent.baseOid !== attempt.base_oid || intent.taskSpecHash !== sha256(canonical(spec)) || intent.writerTreeTerminationReceiptHash !== final.terminationReceiptHash || canonical(intent.authority) !== canonical(final.authority)) throw new AngitError('STATE_CORRUPT', 'Submission recovery requires the exact retained pre-effect capture intent');
      if (await this.git.ref(submissionRef) !== null) {
        if (attempt.status === 'stopping' || final.reason !== 'exit' || final.rootExitCode !== 0) throw new AngitError('RECOVERY_REQUIRED', 'Pinned submission contradicts pre-capture stop or execution outcome');
        submission = await this.worktrees.verifySubmission(receipt, text(attempt.base_oid, 'base OID'), spec, submissionRef);
        const saved = readExecutionManifest(this.host.platform, this.context.registration, this.context.db, `${attemptId}_submission`);
        if (saved !== null && canonical(saved) !== canonical(submission)) throw new AngitError('STATE_CORRUPT', 'Pinned submission differs from durable observed capture receipt');
      }
    }
    transaction(this.context.db, () => {
      const proof = { receipt: final, noLiveHelper: true as const };
      const taskAuthority = grantReconciliationLease(this.context.db, this.context.registration, this.context.policy, this.authority, attemptId, `task:${taskId}`, proof);
      const worktreeAuthority = grantReconciliationLease(this.context.db, this.context.registration, this.context.policy, this.authority, attemptId, `worktree:${text(worktree.id, 'worktreeId')}`, proof);
      this.artifact(`${attemptId}_terminated`, final);
      if (submission) this.artifact(`${attemptId}_submission`, submission);
      for (const [kind, output] of [['stdout', final.stdout], ['stderr', final.stderr]] as const) {
        const path = relative(this.context.registration.directory, output.path).replaceAll('\\', '/');
        if (!contained(join(this.context.registration.directory, 'execution', attemptId), output.path)) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Recovered output escaped owned attempt artifacts');
        const old = this.context.db.prepare('SELECT * FROM artifacts WHERE project_id=? AND id=?').get(this.context.repo.projectId, `${attemptId}_${kind}`);
        if (old && (old.relative_path !== path || old.sha256 !== output.sha256 || old.bytes !== output.bytes)) throw new AngitError('STATE_CORRUPT', 'Recovered output differs from immutable artifact receipt');
        if (!old) this.context.db.prepare("INSERT INTO artifacts VALUES(?,?,?,?,?,'log',?)").run(this.context.repo.projectId, `${attemptId}_${kind}`, path, output.sha256, output.bytes, Date.now());
      }
      for (const operation of this.context.db.prepare("SELECT * FROM operations WHERE project_id=? AND json_extract(intent_json,'$.attemptId')=? AND phase NOT IN ('finalized','failed','abandoned')").all(this.context.repo.projectId, attemptId)) {
        const operationId = text(operation.id, 'operationId'), authority = operation.resource_key === taskAuthority.resourceKey ? taskAuthority : worktreeAuthority;
        if (operation.phase === 'needs_review') this.observe(operationId, authority, 'reconciliation', { resumePhase: 'prepared', reasonCode: 'exact_native_termination', proofReceiptHash: final.terminationReceiptHash }, 'prepared');
        else this.observe(operationId, authority, 'reconciliation', { resumePhase: operation.phase, reasonCode: 'exact_native_termination', proofReceiptHash: final.terminationReceiptHash });
        if (operation.kind === 'spawn') this.finalizeOperation(operationId, authority, { process: final.process, observedStartAtMs: integer(attempt.started_at_ms, 'startedAtMs'), startAndExitReceiptHash: final.terminationReceiptHash });
        else if (operation.kind === 'stop') this.finalizeOperation(operationId, authority, { process: final.process, writerTreeTerminated: true, terminationReceiptHash: final.terminationReceiptHash });
        else if (operation.kind === 'worktree_create') this.finalizeOperation(operationId, authority, { canonicalPath: receipt.canonicalPath, ownershipMarkerId: receipt.ownershipMarkerId, baseOid: receipt.baseOid, baseTreeOid: receipt.baseTreeOid, branchRef: receipt.branchRef, role: 'task' });
        else throw new AngitError('RECOVERY_REQUIRED', 'Unknown operation kind cannot be reconciled from a native writer receipt');
      }
      const task = row(this.context.db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(this.context.repo.projectId, taskId), 'reconciled task');
      const cancelled = attempt.status === 'stopping' || task.cancel_requested === 1;
      const status = submission ? 'submitted' : cancelled ? 'cancelled' : 'failed';
      const updated = this.context.db.prepare("UPDATE attempts SET status=?,version=version+1,ended_at_ms=?,termination_kind='writer_tree_terminated',termination_receipt_hash=?,submission_oid=?,submission_tree_oid=?,submission_ref=? WHERE project_id=? AND id=? AND version=? AND ended_at_ms IS NULL").run(status, Math.max(final.observedAtMs, integer(attempt.started_at_ms, 'start timestamp')), final.terminationReceiptHash, submission?.oid ?? null, submission?.treeOid ?? null, submission?.submissionRef ?? null, this.context.repo.projectId, attemptId, integer(attempt.version, 'version'));
      if (updated.changes !== 1) throw new AngitError('VERSION_CONFLICT', 'Recovered attempt version changed');
      this.context.db.prepare("UPDATE worktrees SET status='preserved' WHERE project_id=? AND id=?").run(this.context.repo.projectId, text(worktree.id, 'worktreeId'));
      if (task.status !== 'cancelled') this.taskChange(taskId, submission && !cancelled ? 'submitted' : cancelled ? 'cancelled' : 'needs_review', cancelled);
      releaseExecutionLease(this.context.db, taskAuthority); releaseExecutionLease(this.context.db, worktreeAuthority);
      this.event(this.authority, 'attempt.reconciled', attemptId, 'Exact native termination and retained capture intent reconciled without repeating external effects', { attemptId, terminationReceiptHash: final.terminationReceiptHash, submissionOid: submission?.oid ?? null, workspacePreserved: true });
      const result = this.summary(attemptId);
      this.results.push(result);
      this.settleStartReceipt(attemptId);
    });
  }
}
