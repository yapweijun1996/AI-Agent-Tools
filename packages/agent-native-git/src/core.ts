import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { DatabaseSync } from 'node:sqlite';
import { AngitError, ASSET_ROOT, IMPLEMENTED_COMMANDS } from './shared.js';
import type { CommandRequest, CoreOptions, CoreReply, PlatformAdapter } from './shared.js';
import { canonical, parseJson, sha256, validateSchema } from './json.js';
import { createNativePlatform } from './platform.js';
import { ApprovedGit, discover } from './core/git.js';
import type { CheckoutReceipt, Repository } from './core/git.js';
import { authorize, loadPolicy } from './core/policy.js';
import type { ApprovedPolicy } from './core/policy.js';
import { Storage, currentProject, grantLease, migrationHash, releaseLease, renewLease, row, sqlBindings, startAuthority, transaction, unresolved } from './core/store.js';
import type { Authority, LeaseClock, Registration, Row } from './core/store.js';
import { advance, bounded, covers, encodedBytes, integer, intersects, jsonObject, object, selector, semanticOptions, strings, text } from './core/values.js';
import { ExecutionSession, readExecutionManifest, routeOwnerRequest } from './core/execution.js';
import type { ExecutionHost } from './core/execution.js';

interface Context { repo: Repository; registration: Registration; policy: ApprovedPolicy; db: DatabaseSync; project: Row; approval: Row }
interface Semantic { keyHash: string; requestHash: string; principal: string }
const CAPABILITY: Record<string, string> = { doctor: 'project.read', status: 'project.read', 'task add': 'task.create', 'task list': 'project.read', 'task show': 'project.read', 'task message': 'task.message', 'task cancel': 'task.cancel', 'worktree list': 'project.read', 'snapshot list': 'project.read', 'agent start': 'attempt.start', 'agent stop': 'attempt.stop', run: 'coordinator.start' };

export class Core {
  private readonly platform: PlatformAdapter;
  private readonly storage: Storage;
  private readonly assetRoot: string;
  private readonly ownerSid: string;
  constructor(options: CoreOptions = {}) {
    if (process.version !== 'v24.21.0') throw new AngitError('UNSUPPORTED_RUNTIME', 'Metadata Core requires Node 24.21.0; no effects were admitted.', 3);
    this.assetRoot = resolve(options.assetRoot ?? ASSET_ROOT);
    this.platform = createNativePlatform(this.assetRoot);
    const owner = this.platform.ownerContext();
    this.ownerSid = owner.sid;
    this.storage = new Storage(this.platform, resolve(options.stateRoot ?? owner.stateRoot), owner.sid);
  }
  resolveProjectId(repoPath: string): string { return discover(this.platform, repoPath).projectId; }
  private validate(request: CommandRequest, repo: Repository): void {
    if (!IMPLEMENTED_COMMANDS.some(command => command === request.command)) throw new AngitError('CAPABILITY_UNAVAILABLE', `${request.command} is outside implemented metadata/foreground execution capability; no effects were admitted`, 3);
    validateSchema(`commands/${request.command.replaceAll(' ', '-')}.schema.json`, request);
    if (request.projectId !== undefined && request.projectId !== repo.projectId) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Request projectId does not match canonical common-directory identity');
    if (request.command === 'init' && discover(this.platform, text(request.options.repoPath, 'repoPath')).common.identity !== repo.common.identity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Init repoPath differs from resolved project');
  }
  private semantic(request: CommandRequest, repo: Repository, initPolicy?: ApprovedPolicy): Semantic {
    if (!request.idempotencyKey) throw new AngitError('IDEMPOTENCY_REQUIRED', 'Metadata mutations require an idempotency key');
    const options = semanticOptions(request.options);
    if (initPolicy) {
      // Repository aliases and approval path spelling are not different work; exact approved bytes/OS identity are.
      delete options.repoPath; delete options.policyFile;
      options.repositoryIdentity = repo.repositoryIdentity; options.policyHash = initPolicy.hash; options.profilesHash = initPolicy.profilesHash;
    }
    return { keyHash: sha256(request.idempotencyKey), requestHash: sha256(canonical({ projectId: repo.projectId, command: request.command, options })), principal: `owner:${this.ownerSid}` };
  }
  private replay(db: DatabaseSync, request: CommandRequest, semantic: Semantic, reconcileInit = false): CoreReply | null {
    const receipt = db.prepare('SELECT * FROM idempotency_keys WHERE project_id=? AND stable_principal=? AND command=? AND key_hash=?').get(text(request.projectId, 'projectId'), semantic.principal, request.command, semantic.keyHash);
    if (!receipt) return null;
    if (receipt.request_hash !== semantic.requestHash) throw new AngitError('IDEMPOTENCY_CONFLICT', 'Idempotency key already binds different canonical work');
    if (reconcileInit && receipt.status === 'reserved' && receipt.result_json === null && typeof receipt.operation_id === 'string') return null;
    if (receipt.status !== 'applied' && receipt.status !== 'failed' || receipt.result_json === null) throw new AngitError('RECOVERY_REQUIRED', 'Identical reserved/unknown request retains its operation; effects are not repeated', 6, false, typeof receipt.operation_id === 'string' ? receipt.operation_id : null);
    const result = jsonObject(text(receipt.result_json, 'result_json'), 'stored reply');
    const data = object(result.data, 'stored reply data');
    return { data, coordinatorEpoch: result.coordinatorEpoch === null ? null : integer(result.coordinatorEpoch, 'coordinatorEpoch'), maxJsonBytes: integer(result.maxJsonBytes, 'maxJsonBytes') };
  }
  private save(db: DatabaseSync, request: CommandRequest, semantic: Semantic, reply: CoreReply, operationId: string | null = null): void {
    const bytes = canonical(reply);
    if (Buffer.byteLength(bytes) > (reply.maxJsonBytes ?? 1048576) - 512) throw new AngitError('OUTPUT_LIMIT', 'Mutation receipt exceeds owner JSON bound; transaction is not committed');
    db.prepare("INSERT INTO idempotency_keys VALUES(?,?,?,?,?,?,'applied',?,?)").run(text(request.projectId, 'projectId'), semantic.principal, request.command, semantic.keyHash, semantic.requestHash, operationId, bytes, Date.now());
  }
  private context(repo: Repository, write: boolean): Context {
    const registry = this.storage.registry(false);
    let registration: Registration;
    try {
      const found = this.storage.lookup(registry, repo);
      if (!found) throw new AngitError('PROJECT_NOT_FOUND', 'Repository identity is not registered');
      registration = found;
    }
    finally { registry.close(); }
    const policy = loadPolicy(this.platform, repo, registration.policyPath, this.assetRoot);
    if (policy.hash !== registration.policyHash || policy.profilesHash !== registration.profilesHash) throw new AngitError('POLICY_CHANGED', 'External owner policy/profile bytes changed; admission is paused');
    const db = this.storage.workflow(registration, write);
    try {
      const project = currentProject(db, registration), approval = row(db.prepare('SELECT * FROM runtime_approvals WHERE project_id=?').get(repo.projectId), 'runtime approval');
      if (project.policy_hash !== policy.hash || project.profiles_hash !== policy.profilesHash || approval.policy_file_identity !== policy.fileIdentity || approval.profiles_file_identity !== policy.profilesIdentity || approval.guard_identity !== registration.guardIdentity || approval.workflow_identity !== registration.workflowIdentity || approval.registration_id !== registration.registrationId) throw new AngitError('REGISTRY_WORKFLOW_MISMATCH', 'Workflow approval/identity receipts differ from current registry/policy');
      if (!registration.active) throw new AngitError('RECOVERY_REQUIRED', 'Registration is blocked; reads do not repair cross-database initialization');
      return { repo, registration, policy, db, project, approval };
    } catch (error) { db.close(); throw error; }
  }
  private executionEligibility(policy: ApprovedPolicy, profileId: string): Record<string, unknown> {
    const profile = policy.profiles.find(value => value.id === profileId);
    if (!profile) throw new AngitError('STATE_CORRUPT', 'Task references a missing approved profile declaration');
    return { runtimeProfileId: profileId, declarationEnabled: profile.enabled === true, execution: profile.enabled === true ? 'unverified' : 'disabled',
      availableInStage1: false, executableValidated: false, providerCompatibility: 'unknown' };
  }
  private event(db: DatabaseSync, authority: Authority, policy: ApprovedPolicy, type: string, entityId: string, summary: string, payload: Record<string, unknown>): number {
    const now = Date.now();
    const max = integer(row(db.prepare('SELECT coalesce(max(id),0) AS id FROM events').get(), 'event high watermark').id, 'eventId');
    const id = advance(max, 'event ID');
    const event = { schemaVersion: 'angit-event/v1', eventId: id, projectId: authority.projectId, type, entityId,
      coordinatorEpoch: authority.coordinatorEpoch, authorityIncarnation: authority.authorityIncarnation, createdAtMs: now, summary, payload };
    validateSchema('event.schema.json', event);
    if (encodedBytes(event) + 1 > policy.maxEventBytes) throw new AngitError('OUTPUT_LIMIT', 'Event including NDJSON newline exceeds owner-approved byte bound');
    db.prepare('INSERT INTO events(id,project_id,event_type,entity_id,authority_incarnation,coordinator_epoch,payload_json,created_at_ms) VALUES(?,?,?,?,?,?,?,?)').run(id, authority.projectId, type, entityId, authority.authorityIncarnation, authority.coordinatorEpoch, canonical({ summary, payload }), now);
    return id;
  }
  private observation(db: DatabaseSync, authority: Authority, operationId: string, observationType: string, data: Record<string, unknown>): string {
    const id = `obs_${randomBytes(16).toString('hex')}`, now = Date.now();
    validateSchema('operation-observation.schema.json', { observationId: id, operationId, projectId: authority.projectId, kind: 'init', observationType, observerAuthority: authority, observedAtMs: now, data });
    db.prepare('INSERT INTO operation_observations VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(authority.projectId, operationId, id, 'init', observationType, ...sqlBindings(authority), canonical(data), now);
    return id;
  }
  private cursor(context: Context, value: unknown, highWatermark: number): Record<string, unknown> {
    if (value !== undefined) {
      validateSchema('event-cursor.schema.json', value);
      const cursor = object(value, 'cursor');
      if (cursor.projectId !== context.repo.projectId || cursor.authorityIncarnation !== context.registration.incarnation || cursor.historyIdentity !== context.approval.history_identity || integer(cursor.afterEventId, 'afterEventId') > highWatermark || integer(cursor.snapshotHighWatermark, 'snapshotHighWatermark') > highWatermark) throw new AngitError('CURSOR_HISTORY_MISMATCH', 'Full cursor identity/watermarks require a fresh snapshot');
      for (const id of [cursor.afterEventId, cursor.snapshotHighWatermark]) if (id !== 0 && !context.db.prepare('SELECT 1 FROM events WHERE project_id=? AND id=?').get(context.repo.projectId, integer(id, 'cursor event ID'))) throw new AngitError('CURSOR_HISTORY_MISMATCH', 'Cursor event belongs to no current project history');
      return { ...cursor };
    }
    return { projectId: context.repo.projectId, authorityIncarnation: context.registration.incarnation, historyIdentity: text(context.approval.history_identity, 'history_identity'), afterEventId: highWatermark, snapshotHighWatermark: highWatermark };
  }
  private publicEvent(value: Row, maxBytes: number): Record<string, unknown> {
    const body = jsonObject(text(value.payload_json, 'payload_json'), 'event body');
    const event = { schemaVersion: 'angit-event/v1', eventId: integer(value.id, 'eventId'), projectId: text(value.project_id, 'projectId'), type: text(value.event_type, 'event type'), entityId: text(value.entity_id, 'entityId'),
      authorityIncarnation: text(value.authority_incarnation, 'authorityIncarnation'), coordinatorEpoch: integer(value.coordinator_epoch, 'coordinatorEpoch'), createdAtMs: integer(value.created_at_ms, 'createdAtMs'), summary: text(body.summary, 'summary'), payload: object(body.payload, 'payload') };
    validateSchema('event.schema.json', event);
    if (encodedBytes(event) + 1 > maxBytes) throw new AngitError('OUTPUT_LIMIT', 'Stored public event including NDJSON newline exceeds current owner bound');
    return event;
  }
  private history(context: Context, cursor: Record<string, unknown>, highWatermark: number, limit: number, taskId?: string): { events: Record<string, unknown>[]; cursor: Record<string, unknown>; hasMore: boolean } {
    const items = context.db.prepare('SELECT * FROM events WHERE project_id=? AND id>? AND id<=? ORDER BY id LIMIT ?').all(context.repo.projectId, integer(cursor.afterEventId, 'afterEventId'), highWatermark, limit + 1);
    const hasMore = items.length > limit, batch = items.slice(0, limit);
    const events = batch.filter(value => taskId === undefined || value.entity_id === taskId).map(value => this.publicEvent(value, context.policy.maxEventBytes));
    return { events, hasMore, cursor: { ...cursor, afterEventId: hasMore ? integer(row(batch[batch.length - 1], 'last replay event').id, 'eventId') : highWatermark } };
  }
  private task(db: DatabaseSync, projectId: string, taskId: string): Record<string, unknown> {
    const value = db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(projectId, taskId);
    if (!value) throw new AngitError('TASK_NOT_FOUND', 'Task is not present in this project');
    const spec = jsonObject(text(value.spec_json, 'spec_json'), 'task spec');
    if (sha256(canonical(spec)) !== value.spec_sha256) throw new AngitError('STATE_CORRUPT', 'Immutable task specification hash mismatch');
    const attempt = db.prepare('SELECT id FROM attempts WHERE project_id=? AND task_id=? AND ended_at_ms IS NULL').get(projectId, taskId);
    const completed = db.prepare('SELECT operation_id FROM task_integrations WHERE project_id=? AND task_id=? ORDER BY operation_id DESC LIMIT 1').get(projectId, taskId);
    const result = { schemaVersion: 'angit-task/v1', projectId, taskId, status: text(value.status, 'status'), version: integer(value.version, 'version'), spec,
      activeAttemptId: attempt ? text(attempt.id, 'attemptId') : null, completionOpId: completed ? text(completed.operation_id, 'operationId') : null,
      effectiveInCurrentSnapshot: text(value.effective_in_current_snapshot, 'effectiveness'), updatedAtMs: integer(value.updated_at_ms, 'updatedAtMs') };
    validateSchema('task.schema.json', result);
    return result;
  }
  async execute(request: CommandRequest, repoPath: string, options: { signal?: AbortSignal } = {}): Promise<CoreReply> {
    try {
      const repo = discover(this.platform, repoPath);
      this.validate(request, repo);
      if (request.command === 'init') return await this.init(request, repo);
      const context = this.context(repo, false);
      try {
        authorize(context.policy, CAPABILITY[request.command] ?? '');
        if (['agent start', 'run'].includes(request.command)) return await new ExecutionSession(this.executionHost()).execute(request, context, options);
        if (['task add', 'task message', 'task cancel', 'agent stop'].includes(request.command)) {
          const replay = this.replay(context.db, request, this.semantic(request, context.repo));
          if (replay) return replay;
          const routed = await routeOwnerRequest(this.executionHost(), context, request);
          if (routed) return routed;
          if (request.command === 'agent stop') throw new AngitError('RECOVERY_REQUIRED', 'No live authenticated owner coordinator owns this stop target; PID-only termination is unavailable');
          return await this.mutate(request, context);
        }
        const reply = this.read(request, context);
        if (request.command === 'doctor' && request.options.deep === true) {
          const git = new ApprovedGit(this.platform, repo, object(context.policy.value.git, 'git'), context.registration.directory);
          await git.audit();
          const baseline = text(context.approval.baseline_ref, 'baseline_ref'), integration = text(context.project.integration_ref, 'integration_ref');
          const expected = context.db.prepare("SELECT commit_oid FROM snapshots WHERE project_id=? AND kind='baseline'").get(repo.projectId);
          const checks = object(reply.data.diagnostics, 'diagnostics');
          checks.managedRefsExact = await git.ref(baseline) === expected?.commit_oid && await git.ref(integration) === context.project.integration_oid;
          checks.approvedGitHashValidated = true;
          if (!checks.managedRefsExact) reply.data.verdict = 'attention';
        }
        return reply;
      } finally { context.db.close(); }
    } catch (error) { throw this.failure(error); }
  }
  private executionHost(): ExecutionHost {
    return { platform: this.platform, storage: this.storage, assetRoot: this.assetRoot, ownerSid: this.ownerSid,
      context: (repo, write) => this.context(repo, write), validate: (request, repo) => this.validate(request, repo),
      metadata: (request, context, authority) => this.liveMetadata(request, context, authority),
      event: (db, authority, policy, type, entityId, summary, payload) => this.event(db, authority, policy, type, entityId, summary, payload) };
  }
  private async liveMetadata(request: CommandRequest, context: Context, authority: Authority): Promise<CoreReply> {
    authorize(context.policy, CAPABILITY[request.command] ?? '');
    const semantic = this.semantic(request, context.repo), replay = this.replay(context.db, request, semantic);
    if (replay) return replay;
    if (request.command === 'task add') await this.checkTaskPins(request, context);
    const currentPolicy = loadPolicy(this.platform, context.repo, context.policy.path, this.assetRoot);
    if (currentPolicy.hash !== context.policy.hash || currentPolicy.profilesHash !== context.policy.profilesHash) throw new AngitError('POLICY_CHANGED', 'Owner policy drift denies live metadata mutation');
    this.storage.capacity(context.db, context.registration, context.policy, encodedBytes(request));
    return transaction(context.db, () => {
      const project = currentProject(context.db, context.registration);
      const lease = row(context.db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(authority.projectId, authority.authorityIncarnation, authority.resourceKey), 'live metadata grant');
      if (project.coordinator_epoch !== authority.coordinatorEpoch || lease.owner_id !== authority.ownerId || lease.fencing_token !== authority.fencingToken || lease.coordinator_epoch !== authority.coordinatorEpoch || integer(lease.expires_at_ms, 'lease expiry') <= Date.now()) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Live metadata must reuse the exact current coordinator grant');
      const data = request.command === 'task add' ? this.addTask(request, context, authority) : this.message(request, context, authority);
      const reply = { data, coordinatorEpoch: authority.coordinatorEpoch, maxJsonBytes: context.policy.maxJsonBytes };
      this.save(context.db, request, semantic, reply);
      return reply;
    });
  }
  private async checkTaskPins(request: CommandRequest, context: Context): Promise<void> {
    const spec = object(request.options.spec, 'spec');
    if (!Array.isArray(spec.contractRefs)) throw new AngitError('INVALID_INPUT', 'Contract pins must be declared');
    if (!spec.contractRefs.length) return;
    const git = new ApprovedGit(this.platform, context.repo, object(context.policy.value.git, 'git'), context.registration.directory);
    await git.audit();
    for (const value of spec.contractRefs) {
      const pin = object(value, 'contract pin'), path = selector(text(pin.path, 'contract pin path'));
      if (path.endsWith('/') || path.split('/')[0]?.toLowerCase() === '.git') throw new AngitError('POLICY_DENIED', 'Contract pin requires an exact source file path');
      await git.contractPin(text(pin.commitOid, 'contract commit OID'), path, text(pin.sha256, 'contract SHA256'));
    }
  }
  private failure(error: unknown): AngitError {
    if (error instanceof AngitError) return error;
    if (error instanceof Error) {
      const info = object(error, 'error');
      if (typeof info.code === 'string' && /BUSY|LOCKED/u.test(info.code) || /database is locked|SQLITE_BUSY/iu.test(error.message)) return new AngitError('COORDINATOR_ALREADY_RUNNING', 'Canonical lifetime/registry guard is held; no mutation authority was granted', 5, true);
      return new AngitError('PERSISTENCE_UNCERTAIN', 'Storage/native operation failed; preserve state and inspect recovery before retrying', 6);
    }
    return new AngitError('PERSISTENCE_UNCERTAIN', 'Unknown persistence outcome blocks admission', 6);
  }
  private read(request: CommandRequest, context: Context): CoreReply {
    return transaction(context.db, () => {
      const project = currentProject(context.db, context.registration), command = request.command, options = request.options;
      const highWatermark = integer(row(context.db.prepare('SELECT coalesce(max(id),0) AS id FROM events WHERE project_id=?').get(context.repo.projectId), 'project high watermark').id, 'high watermark');
      let data: Record<string, unknown>;
      if (command === 'status') {
        const cursor = this.cursor(context, options.cursor, highWatermark);
        const counts: Record<string, number> = { queued: 0, blocked: 0, leased: 0, running: 0, submitted: 0, validating: 0, integrating: 0, completed: 0, failed: 0, cancelled: 0, needs_review: 0 };
        for (const item of context.db.prepare('SELECT status,count(*) AS count FROM tasks WHERE project_id=? GROUP BY status').all(context.repo.projectId)) counts[text(item.status, 'status')] = integer(item.count, 'count');
        const attemptCounts: Record<string, number> = { reserved: 0, starting: 0, running: 0, stopping: 0, orphaned: 0, submitted: 0, failed: 0, cancelled: 0 };
        for (const item of context.db.prepare('SELECT status,count(*) AS count FROM attempts WHERE project_id=? GROUP BY status').all(context.repo.projectId)) attemptCounts[text(item.status, 'attempt status')] = integer(item.count, 'attempt count');
        const operationCounts: Record<string, number> = { prepared: 0, candidate_created: 0, testing: 0, tests_passed: 0, git_promoted: 0, effect_observed: 0, finalized: 0, failed: 0, abandoned: 0, needs_review: 0 };
        for (const item of context.db.prepare('SELECT phase,count(*) AS count FROM operations WHERE project_id=? GROUP BY phase').all(context.repo.projectId)) operationCounts[text(item.phase, 'operation phase')] = integer(item.count, 'operation count');
        data = { projectId: context.repo.projectId, repositoryIdentity: context.repo.repositoryIdentity, state: project.state, contentEpoch: integer(project.content_epoch, 'content_epoch'), authorityIncarnation: context.registration.incarnation,
          integrationOid: project.integration_oid, verification: 'unverified', counts, attemptCounts, operationCounts, recoveryRequired: unresolved(context.db, context.repo.projectId), highWatermark, cursor, replay: [] };
        if (options.cursor !== undefined) {
          const replay = this.history(context, cursor, highWatermark, bounded(options.limit, 100));
          Object.assign(data, { replay: replay.events, cursor: replay.cursor, hasMore: replay.hasMore });
        }
      } else if (command === 'doctor') {
        const blocked = unresolved(context.db, context.repo.projectId);
        data = { projectId: context.repo.projectId, verdict: blocked || project.state !== 'idle' ? 'attention' : 'healthy',
          diagnostics: { registryWorkflowIdentity: true, schemaChecksums: true, databaseIntegrity: true, unresolvedAttemptsOrEffects: blocked, baselineVerification: 'unverified',
            nativeOwnerIdentity: true, gitDeepInspection: options.deep === true, providerExecutableCompatibility: 'unknown', stage: 'metadata-only' } };
      } else if (command === 'task list') {
        const limit = bounded(options.limit, 50);
        const items = context.db.prepare('SELECT id,title,status,version,effective_in_current_snapshot,spec_json,spec_sha256 FROM tasks WHERE project_id=? AND id>? AND (? IS NULL OR status=?) ORDER BY id LIMIT ?').all(context.repo.projectId, options.afterTaskId === undefined ? '' : text(options.afterTaskId, 'afterTaskId'), options.status === undefined ? null : text(options.status, 'status'), options.status === undefined ? null : text(options.status, 'status'), limit + 1);
        data = { items: items.slice(0, limit).map(value => {
          const spec = jsonObject(text(value.spec_json, 'spec_json'), 'task spec');
          if (sha256(canonical(spec)) !== value.spec_sha256) throw new AngitError('STATE_CORRUPT', 'Immutable list task specification hash mismatch');
          return { taskId: value.id, title: value.title, status: value.status, version: value.version, effectiveInCurrentSnapshot: value.effective_in_current_snapshot,
            executionEligibility: this.executionEligibility(context.policy, text(spec.runtimeProfileId, 'runtimeProfileId')) };
        }), nextCursor: items.length > limit ? row(items[limit - 1], 'pagination').id : null };
      } else if (command === 'task show') {
        const id = text(options.taskId, 'taskId'), limit = bounded(options.limit, 100);
        const projection = this.task(context.db, context.repo.projectId, id);
        data = { task: projection, executionEligibility: this.executionEligibility(context.policy, text(object(projection.spec, 'spec').runtimeProfileId, 'runtimeProfileId')),
          dependencies: context.db.prepare('SELECT depends_on_id FROM task_dependencies WHERE project_id=? AND task_id=? ORDER BY depends_on_id').all(context.repo.projectId, id).map(value => value.depends_on_id),
          attempts: context.db.prepare('SELECT a.*,w.id AS worktree_id FROM attempts a LEFT JOIN worktrees w ON w.project_id=a.project_id AND w.attempt_id=a.id WHERE a.project_id=? AND a.task_id=? ORDER BY a.number LIMIT ?').all(context.repo.projectId, id, limit).map(value => {
            const attemptId = text(value.id, 'attemptId'), artifactDirectory = join(context.registration.directory, 'execution', attemptId);
            return { ...value, attemptId, taskId: value.task_id, worktreeId: value.worktree_id, baseOid: value.base_oid, baseEpoch: value.base_epoch, spawnIntentId: value.spawn_intent_id,
              processIdentity: value.process_identity === null ? null : jsonObject(text(value.process_identity, 'process identity'), 'native process receipt'),
              terminationProof: value.termination_kind === null ? null : { kind: value.termination_kind, receiptHash: value.termination_receipt_hash },
              terminationReceipt: readExecutionManifest(this.platform, context.registration, context.db, `${attemptId}_terminated`),
              submissionOid: value.submission_oid, submissionTreeOid: value.submission_tree_oid, submissionRef: value.submission_ref,
              artifactDirectory, receiptPath: join(artifactDirectory, 'termination.json'),
              worktreeReceipt: value.worktree_id === null ? null : readExecutionManifest(this.platform, context.registration, context.db, `${text(value.worktree_id, 'worktreeId')}_receipt`) };
          }),
          messages: context.db.prepare('SELECT id,event_id,sender_scope,kind,payload_json,created_at_ms FROM messages WHERE project_id=? AND task_id=? ORDER BY event_id DESC LIMIT ?').all(context.repo.projectId, id, limit).map(value => ({ messageId: value.id, eventId: value.event_id, senderScope: value.sender_scope, kind: value.kind, message: parseJson(Buffer.from(text(value.payload_json, 'message'))), createdAtMs: value.created_at_ms })),
          evidenceLocators: context.db.prepare('SELECT ti.operation_id,ti.snapshot_id,s.evidence_id FROM task_integrations ti JOIN snapshots s ON s.project_id=ti.project_id AND s.id=ti.snapshot_id WHERE ti.project_id=? AND ti.task_id=? LIMIT ?').all(context.repo.projectId, id, limit) };
        if (options.history === true) {
          const cursor = this.cursor(context, options.cursor, highWatermark);
          if (options.cursor === undefined) cursor.afterEventId = 0;
          const history = this.history(context, cursor, highWatermark, limit, id);
          Object.assign(data, { history: history.events, cursor: history.cursor, hasMore: history.hasMore });
        }
      } else if (command === 'worktree list') {
        const limit = bounded(options.limit, 50);
        const items = context.db.prepare("SELECT id,attempt_id,operation_id,canonical_path,branch_ref,role,status,base_oid,created_at_ms FROM worktrees WHERE project_id=? AND (?=1 OR status<>'preserved') ORDER BY id LIMIT ?").all(context.repo.projectId, options.includePreserved === true ? 1 : 0, limit + 1);
        data = { items: items.slice(0, limit).map(value => ({ ...value, receipt: readExecutionManifest(this.platform, context.registration, context.db, `${text(value.id, 'worktreeId')}_receipt`) })), hasMore: items.length > limit };
      } else if (command === 'snapshot list') {
        const limit = bounded(options.limit, 50);
        const items = context.db.prepare("SELECT * FROM snapshots WHERE project_id=? AND id>? AND (?=1 OR verification='verified') ORDER BY id LIMIT ?").all(context.repo.projectId, options.afterSnapshotId === undefined ? '' : text(options.afterSnapshotId, 'afterSnapshotId'), options.includeUnverified === true ? 1 : 0, limit + 1);
        data = { items: items.slice(0, limit).map(value => {
          const snapshot = { schemaVersion: 'angit-snapshot/v1', projectId: context.repo.projectId, snapshotId: value.id, operationId: value.operation_id, commitOid: value.commit_oid, treeOid: value.tree_oid, parentOid: value.parent_oid, refName: value.ref_name, kind: value.kind, verification: value.verification, evidenceId: value.evidence_id, policyHash: value.policy_hash, profilesHash: value.profiles_hash, environmentHash: value.environment_hash, authorityIncarnation: value.authority_incarnation, contentEpoch: value.content_epoch, createdAtMs: value.created_at_ms };
          validateSchema('snapshot.schema.json', snapshot);
          return snapshot;
        }), nextCursor: items.length > limit ? row(items[limit - 1], 'pagination').id : null };
      } else throw new AngitError('CAPABILITY_UNAVAILABLE', 'Command is outside Stage1 read paths', 3);
      const reply = { data, coordinatorEpoch: integer(project.coordinator_epoch, 'coordinator_epoch'), maxJsonBytes: context.policy.maxJsonBytes };
      if (encodedBytes(reply) > context.policy.maxJsonBytes - 512) throw new AngitError('OUTPUT_LIMIT', 'Read result exceeds owner JSON bound; request a smaller limit');
      return reply;
    }, 'DEFERRED');
  }
  private async mutate(request: CommandRequest, observed: Context): Promise<CoreReply> {
    const semantic = this.semantic(request, observed.repo);
    const replay = this.replay(observed.db, request, semantic);
    if (replay) return replay;
    if (request.command === 'task cancel') {
      this.assertStoppedCancellation(observed, text(request.options.taskId, 'taskId'));
    }
    const guard = this.storage.acquireGuard(observed.registration);
    let active: Context | undefined;
    try {
      active = this.context(observed.repo, true);
      authorize(active.policy, CAPABILITY[request.command] ?? '');
      const prior = this.replay(active.db, request, semantic);
      if (prior) return prior;
      if (active.project.state !== 'idle') throw new AngitError('RECOVERY_REQUIRED', 'Non-idle workflow state denies metadata mutations');
      if (request.command === 'task add') await this.checkTaskPins(request, active);
      if (request.command === 'task cancel') {
        this.assertStoppedCancellation(active, text(request.options.taskId, 'taskId'));
      }
      this.storage.capacity(active.db, active.registration, active.policy, encodedBytes(request));
      const authority = startAuthority(active.db, active.registration, active.policy, `owner_${randomBytes(16).toString('hex')}`);
      const clock: LeaseClock = { wallTime: Date.now(), monotonicTime: performance.now() };
      return transaction(active.db, () => {
        currentProject(active!.db, active!.registration);
        if (!guard.isTransaction || this.platform.assertPrivateFile(active!.registration.guardPath).identity !== active!.registration.guardIdentity) throw new AngitError('GUARD_LOST', 'Lifetime guard identity/transaction was lost');
        renewLease(active!.db, authority, active!.policy, clock);
        let data: Record<string, unknown>;
        if (request.command === 'task add') data = this.addTask(request, active!, authority);
        else if (request.command === 'task message') data = this.message(request, active!, authority);
        else data = this.cancel(request, active!, authority);
        const reply = { data, coordinatorEpoch: authority.coordinatorEpoch, maxJsonBytes: active!.policy.maxJsonBytes };
        this.save(active!.db, request, semantic, reply);
        releaseLease(active!.db, authority);
        return reply;
      });
    } finally { active?.db.close(); if (guard.isTransaction) guard.exec('ROLLBACK'); guard.close(); }
  }
  private addTask(request: CommandRequest, context: Context, authority: Authority): Record<string, unknown> {
    validateSchema('task-input.schema.json', request.options.spec);
    const spec = object(request.options.spec, 'spec'), id = text(spec.taskId, 'taskId');
    const project = currentProject(context.db, context.registration);
    if (integer(spec.baseEpoch, 'baseEpoch') !== integer(project.content_epoch, 'content_epoch')) throw new AngitError('STALE_CONTENT_EPOCH', 'Task immutable base epoch is stale');
    if (context.db.prepare('SELECT 1 FROM tasks WHERE project_id=? AND id=?').get(context.repo.projectId, id)) throw new AngitError('TASK_EXISTS', 'Task identifier already exists');
    const runtime = text(spec.runtimeProfileId, 'runtimeProfileId');
    if (!context.policy.allowedProfiles.includes(runtime) || !context.policy.profiles.some(profile => profile.id === runtime && profile.kind === 'coding-agent')) throw new AngitError('POLICY_DENIED', 'Task runtime must reference an allowed declared coding-agent profile');
    const checks = strings(spec.requiredChecks, 'requiredChecks');
    if (context.policy.requiredChecks.some(id => !checks.includes(id))) throw new AngitError('POLICY_DENIED', 'Task cannot weaken owner-required checks');
    for (const check of checks) if (!context.policy.allowedProfiles.includes(check) || !context.policy.profiles.some(profile => profile.id === check && profile.kind === 'check')) throw new AngitError('POLICY_DENIED', 'Required check must reference an allowed declared check profile');
    for (const path of strings(spec.scopePaths, 'scopePaths')) {
      selector(path);
      if (path.split('/')[0]?.toLowerCase() === '.git' || !context.policy.allowedPaths.some(allowed => covers(allowed, path)) || context.policy.protectedPaths.some(protectedPath => intersects(protectedPath, path))) throw new AngitError('POLICY_DENIED', 'Task exact selectors exceed owner scope or intersect protected paths');
    }
    const dependencies = strings(spec.dependsOn, 'dependsOn');
    let blocked = false;
    for (const dependency of dependencies) {
      if (dependency === id) throw new AngitError('DEPENDENCY_CYCLE', 'A task cannot depend on itself');
      const value = context.db.prepare('SELECT status FROM tasks WHERE project_id=? AND id=?').get(context.repo.projectId, dependency);
      if (!value) throw new AngitError('CROSS_PROJECT_DEPENDENCY', 'Dependencies must already exist in the same project');
      if (value.status !== 'completed') blocked = true;
    }
    if (!Array.isArray(spec.contractRefs)) throw new AngitError('INVALID_INPUT', 'contractRefs must be an array');
    for (const item of spec.contractRefs) {
      const contract = object(item, 'contractRef'); selector(text(contract.path, 'contractRef.path'));
      const oid = text(contract.commitOid, 'commitOid');
      if (oid.length !== (project.object_format === 'sha1' ? 40 : 64)) throw new AngitError('INVALID_INPUT', 'Contract pin object format mismatch');
    }
    const now = Date.now(), frozen = canonical(spec);
    context.db.prepare('INSERT INTO tasks(project_id,id,title,priority,base_epoch,spec_json,spec_sha256,created_at_ms,updated_at_ms) VALUES(?,?,?,?,?,?,?,?,?)').run(context.repo.projectId, id, text(spec.title, 'title'), integer(spec.priority, 'priority'), integer(spec.baseEpoch, 'baseEpoch'), frozen, sha256(frozen), now, now);
    for (const dependency of dependencies) context.db.prepare('INSERT INTO task_dependencies VALUES(?,?,?)').run(context.repo.projectId, id, dependency);
    const createdEventId = this.event(context.db, authority, context.policy, 'task.created', id, 'Immutable task specification created; provider compatibility is unknown', { taskId: id, version: 0, status: 'queued', specSha256: sha256(frozen), runtimeExecutableValidated: false });
    if (blocked) {
      context.db.prepare("UPDATE tasks SET status='blocked',version=version+1,updated_at_ms=? WHERE project_id=? AND id=? AND version=0").run(now, context.repo.projectId, id);
      this.event(context.db, authority, context.policy, 'task.blocked', id, 'Incomplete immutable dependencies block task eligibility', { version: 1, dependsOn: dependencies });
    }
    return { taskId: id, status: blocked ? 'blocked' : 'queued', version: blocked ? 1 : 0, createdEventId, specSha256: sha256(frozen), runtimeExecutableValidated: false, providerCompatibility: 'unknown',
      executionEligibility: this.executionEligibility(context.policy, runtime) };
  }
  private message(request: CommandRequest, context: Context, authority: Authority): Record<string, unknown> {
    validateSchema('message-input.schema.json', request.options.message);
    const message = object(request.options.message, 'message'), taskId = text(message.taskId, 'taskId');
    this.task(context.db, context.repo.projectId, taskId);
    for (const id of strings(message.relatedTaskIds, 'relatedTaskIds')) this.task(context.db, context.repo.projectId, id);
    for (const id of strings(message.artifactIds, 'artifactIds')) if (!context.db.prepare('SELECT 1 FROM artifacts WHERE project_id=? AND id=?').get(context.repo.projectId, id)) throw new AngitError('MESSAGE_SCOPE_DENIED', 'Advisory artifact locator is outside this project');
    const id = `msg_${randomBytes(16).toString('hex')}`;
    const eventId = this.event(context.db, authority, context.policy, 'task.message', taskId, text(message.summary, 'summary'), { messageId: id, kind: message.kind, advisory: true });
    context.db.prepare('INSERT INTO messages VALUES(?,?,?,?,?,?,?,?)').run(context.repo.projectId, id, taskId, eventId, `owner:${this.ownerSid}`, text(message.kind, 'kind'), canonical(message), Date.now());
    const value = row(context.db.prepare('SELECT version FROM tasks WHERE project_id=? AND id=?').get(context.repo.projectId, taskId), 'task version');
    const version = advance(integer(value.version, 'version'), 'task version');
    context.db.prepare('UPDATE tasks SET version=?,updated_at_ms=? WHERE project_id=? AND id=? AND version=?').run(version, Date.now(), context.repo.projectId, taskId, integer(value.version, 'version'));
    return { taskId, messageId: id, eventId, version, advisory: true };
  }
  private assertStoppedCancellation(context: Context, taskId: string): void {
    const task = this.task(context.db, context.repo.projectId, taskId);
    if (!['queued', 'blocked', 'submitted', 'failed', 'needs_review'].includes(text(task.status, 'status')) || task.activeAttemptId !== null ||
      context.db.prepare('SELECT 1 FROM attempts WHERE project_id=? AND task_id=? AND (ended_at_ms IS NULL OR termination_kind IS NULL OR termination_receipt_hash IS NULL) LIMIT 1').get(context.repo.projectId, taskId)) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Cancellation requires no unresolved writer; live attempts use the authenticated owner broker', 3);
  }
  private cancel(request: CommandRequest, context: Context, authority: Authority): Record<string, unknown> {
    const id = text(request.options.taskId, 'taskId'), task = this.task(context.db, context.repo.projectId, id);
    this.assertStoppedCancellation(context, id);
    const version = advance(integer(task.version, 'version'), 'task version');
    const updated = context.db.prepare("UPDATE tasks SET status='cancelled',cancel_requested=1,version=?,updated_at_ms=? WHERE project_id=? AND id=? AND version=?").run(version, Date.now(), context.repo.projectId, id, integer(task.version, 'version'));
    if (updated.changes !== 1) throw new AngitError('VERSION_CONFLICT', 'Expected task version no longer matches');
    const eventId = this.event(context.db, authority, context.policy, 'task.cancelled', id, text(request.options.reason, 'reason'), { status: 'cancelled', version, noActiveWriter: true, pinnedSubmissionHistoryRetained: true });
    return { taskId: id, status: 'cancelled', version, eventId, terminal: true };
  }
  async follow(request: CommandRequest, repoPath: string, emit: (event: Record<string, unknown>) => Promise<void>, signal: AbortSignal): Promise<void> {
    try {
      const repo = discover(this.platform, repoPath); this.validate(request, repo);
      if (request.command !== 'status' || request.options.follow !== true || request.options.format !== 'ndjson') throw new AngitError('INVALID_INPUT', 'Follow is the explicit status NDJSON read path');
      let cursor: Record<string, unknown> | undefined;
      while (!signal.aborted) {
        const context = this.context(repo, false);
        let batch: { events: Record<string, unknown>[]; cursor: Record<string, unknown>; hasMore: boolean };
        try {
          authorize(context.policy, 'project.read');
          batch = transaction(context.db, () => {
            const highWatermark = integer(row(context.db.prepare('SELECT coalesce(max(id),0) AS id FROM events WHERE project_id=?').get(repo.projectId), 'high watermark').id, 'high watermark');
            cursor = this.cursor(context, cursor ?? request.options.cursor, highWatermark);
            return this.history(context, cursor, highWatermark, bounded(request.options.limit, 100));
          }, 'DEFERRED');
        } finally { context.db.close(); }
        for (const event of batch.events) { if (signal.aborted) return; await emit(event); }
        cursor = batch.cursor;
        if (!batch.hasMore) try { await delay(200, undefined, { signal }); } catch (error) { if (!signal.aborted) throw error; }
      }
    } catch (error) { throw this.failure(error); }
  }
  private async init(request: CommandRequest, repo: Repository): Promise<CoreReply> {
    const policy = loadPolicy(this.platform, repo, text(request.options.policyFile, 'policyFile'), this.assetRoot);
    authorize(policy, 'project.register');
    if (policy.heartbeatIntervalMs > 2_147_483_647) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Init heartbeat interval exceeds the supported timer range; no effects were admitted', 3);
    const semantic = this.semantic(request, repo, policy), normalized: CommandRequest = { ...request, projectId: repo.projectId };
    const approvedBase = text(request.options.approvedBase, 'approvedBase');
    this.storage.assertLocation(repo);
    this.storage.assertLocation(discover(this.platform, text(policy.value.repoRoot, 'repoRoot')));
    const registry = this.storage.registry(true, true);
    let reg: Registration;
    try {
      reg = this.storage.lookup(registry, repo) ?? this.storage.register(registry, repo, policy, semantic.keyHash, semantic.requestHash, approvedBase);
      if (reg.requestKeyHash !== semantic.keyHash || reg.semanticHash !== semantic.requestHash || reg.policyHash !== policy.hash || reg.profilesHash !== policy.profilesHash) throw new AngitError(reg.requestKeyHash === semantic.keyHash ? 'IDEMPOTENCY_CONFLICT' : 'PROJECT_EXISTS', 'Canonical repository has a different immutable registration request');
    } finally { registry.close(); }
    const guard = this.storage.acquireGuard(reg);
    try {
    const db = this.storage.workflow(reg, true);
    let heartbeat: NodeJS.Timeout | undefined;
    let renewalFailure: AngitError | undefined;
    let journalOperationId: string | null = null;
    try {
    let admitGit: (() => void) | undefined;
    const git = new class extends ApprovedGit {
      override async run(args: string[], input?: string): Promise<string> {
        admitGit?.();
        const result = await super.run(args, input);
        admitGit?.();
        return result;
      }
    }(this.platform, repo, object(policy.value.git, 'git'), reg.directory);
      if (db.prepare('SELECT 1 FROM projects WHERE id=?').get(repo.projectId)) {
        const project = currentProject(db, reg), approval = row(db.prepare('SELECT * FROM runtime_approvals WHERE project_id=?').get(repo.projectId), 'init approval');
        if (project.policy_hash !== policy.hash || project.profiles_hash !== policy.profilesHash || approval.policy_file_identity !== policy.fileIdentity ||
          approval.profiles_file_identity !== policy.profilesIdentity || approval.workflow_identity !== reg.workflowIdentity || approval.guard_identity !== reg.guardIdentity ||
          approval.registration_id !== reg.registrationId) throw new AngitError('REGISTRY_WORKFLOW_MISMATCH', 'Init replay cannot bypass current workflow/approval identity');
      }
      const replay = this.replay(db, normalized, semantic, true);
      if (replay) {
        if (!reg.active) this.activateRegistry(reg, db);
        return replay;
      }
      await git.audit();
      this.storage.capacity(db, reg, policy, Buffer.byteLength(policy.bytes) + Buffer.byteLength(policy.profilesBytes));
      const base = await git.base(approvedBase), baselineRef = `refs/angit/${repo.projectId}/baseline`, integrationRef = `refs/angit/${repo.projectId}/integration`;
      const existing = db.prepare("SELECT * FROM operations WHERE project_id=? AND kind='init'").get(repo.projectId);
      const operationId = existing ? text(existing.id, 'operationId') : `op_${randomBytes(16).toString('hex')}`;
      if (existing) journalOperationId = operationId;
      // The journaled operation retains the generated snapshot identity across exact reconciliation.
      const snapshotId = `snap_${sha256(operationId).slice(0, 32)}`;
      const coordinatorEpoch = existing ? advance(integer(currentProject(db, reg).coordinator_epoch, 'coordinator_epoch'), 'coordinator epoch') : 1;
      const result: CoreReply = { data: { projectId: repo.projectId, repositoryIdentity: repo.repositoryIdentity, operationId, registrationId: reg.registrationId, baselineOid: base.oid, baselineTreeOid: base.tree, baselineRef, integrationRef, snapshotId, verification: 'unverified', policyHash: policy.hash, profilesHash: policy.profilesHash }, coordinatorEpoch, maxJsonBytes: policy.maxJsonBytes };
      if (encodedBytes(result) > policy.maxJsonBytes - 512) throw new AngitError('OUTPUT_LIMIT', 'Complete init receipt exceeds approved JSON bound; no new init intent or Git effects were admitted');
      let authority: Authority, clock: LeaseClock;
      const assertGrant = (): void => {
        if (renewalFailure) throw renewalFailure;
        if (!guard.isTransaction || this.platform.assertPrivateFile(reg.guardPath).identity !== reg.guardIdentity) throw new AngitError('GUARD_LOST', 'Lifetime guard identity/transaction was lost');
        renewLease(db, authority, policy, clock);
      };
      const renew = (): void => {
        if (renewalFailure) throw renewalFailure;
        try { transaction(db, assertGrant); }
        catch (error) {
          const reason = error instanceof AngitError ? error.code : 'PERSISTENCE_ERROR';
          renewalFailure = new AngitError('RECOVERY_REQUIRED', `Init lease/guard renewal failed (${reason}); admission stopped and the journal is preserved for exact reconciliation. Synchronous native pauses cannot run heartbeats or revive an expired grant`, 6, false, operationId);
          clearInterval(heartbeat);
          throw renewalFailure;
        }
      };
      const startHeartbeat = (): void => {
        renew();
        admitGit = renew;
        // The callback is synchronous: clearing the timer leaves no renewal work behind the guard.
        heartbeat = setInterval(() => { try { renew(); } catch { /* Failure is latched; the awaited Git command must settle before cleanup. */ } }, policy.heartbeatIntervalMs);
      };
      if (!existing) {
        if (db.prepare('SELECT 1 FROM projects WHERE id=?').get(repo.projectId)) throw new AngitError('RECOVERY_REQUIRED', 'Project exists without a recoverable init journal');
        if (await git.ref(baselineRef) !== null || await git.ref(integrationRef) !== null) throw new AngitError('RECOVERY_REQUIRED', 'Generated refs already exist without this durable intent; no adoption/force is allowed');
        const checkout = await git.checkoutReceipt();
        journalOperationId = operationId;
        authority = transaction(db, () => {
          db.prepare('INSERT INTO projects(id,common_dir,repo_identity,object_format,integration_ref,integration_oid,policy_hash,profiles_hash,authority_incarnation,coordinator_epoch,created_at_ms) VALUES(?,?,?,?,?,?,?,?,?,1,?)').run(repo.projectId, reg.commonDir, repo.repositoryIdentity, base.format, integrationRef, base.oid, policy.hash, policy.profilesHash, reg.incarnation, Date.now());
          db.prepare('INSERT INTO policy_revisions VALUES(?,?,?,?,?,?)').run(repo.projectId, integer(policy.value.revision, 'revision'), policy.hash, canonical(policy.value), `external-owner-file:${policy.fileIdentity}`, Date.now());
          db.prepare('INSERT INTO runtime_approvals VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(repo.projectId, policy.path, policy.fileIdentity, policy.bytes, policy.profilesPath, policy.profilesIdentity, policy.profilesBytes,
            randomBytes(32).toString('hex'), reg.registrationId, baselineRef, reg.workflowIdentity, reg.guardIdentity, canonical(checkout));
          clock = { wallTime: Date.now(), monotonicTime: performance.now() };
          const grant = grantLease(db, reg, policy, `owner_${randomBytes(16).toString('hex')}`, `integration:${repo.projectId}`, coordinatorEpoch);
          const intent = { canonicalRepositoryPath: repo.root.canonicalPath, canonicalCommonDir: reg.commonDir, repositoryIdentity: repo.repositoryIdentity, registrationId: reg.registrationId,
            approvedBaseOid: base.oid, approvedBaseTreeOid: base.tree, objectFormat: base.format, baselineRef, integrationRef, baselineExpectedAbsent: true, integrationExpectedAbsent: true,
            stateSchemaHash: migrationHash(), policyHash: policy.hash, profilesHash: policy.profilesHash };
          const now = Date.now();
          validateSchema('operation-journal.schema.json', { schemaVersion: 'angit-operation/v1', projectId: repo.projectId, repositoryIdentity: repo.repositoryIdentity, operationId, kind: 'init', originAuthority: grant,
            principalScopeId: `scope_${sha256(this.ownerSid).slice(0, 32)}`, requestKeyHash: semantic.keyHash, semanticRequestHash: semantic.requestHash, policyHash: policy.hash, profilesHash: policy.profilesHash,
            createdAtMs: now, intentHash: sha256(canonical(intent)), intent, phase: 'prepared', version: 0, lastObservationId: null, updatedAtMs: now });
          db.prepare("INSERT INTO operations(project_id,id,kind,phase,policy_hash,profiles_hash,authority_incarnation,coordinator_epoch,fencing_token,resource_key,owner_id,repository_identity,principal_scope_id,request_key_hash,semantic_request_hash,intent_hash,intent_json,created_at_ms,updated_at_ms) VALUES(?,?,'init','prepared',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").run(repo.projectId, operationId, policy.hash, policy.profilesHash, ...sqlBindings(grant), repo.repositoryIdentity,
            `scope_${sha256(this.ownerSid).slice(0, 32)}`, semantic.keyHash, semantic.requestHash, sha256(canonical(intent)), canonical(intent), now, now);
          db.prepare("INSERT INTO idempotency_keys VALUES(?,?,?,?,?,?,'reserved',NULL,?)").run(repo.projectId, semantic.principal, request.command, semantic.keyHash, semantic.requestHash, operationId, now);
          this.observation(db, grant, operationId, 'storage_initialized', { registrationId: reg.registrationId, storageSchemaHash: migrationHash() });
          this.event(db, grant, policy, 'project.init_prepared', repo.projectId, 'Durable approved initialization intent precedes create-only refs', { operationId, baselineRef, integrationRef, approvedBaseOid: base.oid });
          return grant;
        });
        startHeartbeat();
        const currentPolicy = loadPolicy(this.platform, repo, policy.path, this.assetRoot);
        if (currentPolicy.hash !== policy.hash || currentPolicy.profilesHash !== policy.profilesHash) throw new AngitError('POLICY_CHANGED', 'Owner approval changed before Git ref creation');
        await git.audit();
        try { await git.createRefs(baselineRef, integrationRef, base.oid); }
        catch (error) { throw new AngitError('RECOVERY_REQUIRED', 'Create-only init ref outcome requires exact readback/reconciliation, never blind retry', 6, false, operationId); }
      } else {
        if (existing.semantic_request_hash !== semantic.requestHash || existing.request_key_hash !== semantic.keyHash || existing.policy_hash !== policy.hash || existing.profiles_hash !== policy.profilesHash) throw new AngitError('IDEMPOTENCY_CONFLICT', 'Init journal binds another request');
        const intent = jsonObject(text(existing.intent_json, 'intent_json'), 'immutable init intent');
        if (sha256(canonical(intent)) !== existing.intent_hash || intent.registrationId !== reg.registrationId || intent.approvedBaseOid !== base.oid || intent.approvedBaseTreeOid !== base.tree ||
          intent.baselineRef !== baselineRef || intent.integrationRef !== integrationRef || intent.stateSchemaHash !== migrationHash() || intent.policyHash !== policy.hash || intent.profilesHash !== policy.profilesHash) throw new AngitError('STATE_CORRUPT', 'Init immutable intent/readback binding is not exact');
        // Cross-database recovery accepts only exact current refs + immutable checkout receipt. Partial/unknown sets remain blocked.
        if (await git.ref(baselineRef) !== base.oid || await git.ref(integrationRef) !== base.oid) throw new AngitError('RECOVERY_REQUIRED', 'Partial/missing/unknown initialized refs are preserved, not retried or repaired', 6, false, operationId);
        const approval = row(db.prepare('SELECT * FROM runtime_approvals WHERE project_id=?').get(repo.projectId), 'approval');
        if (text(approval.checkout_receipt_json, 'checkout_receipt_json') !== canonical(await git.checkoutReceipt())) throw new AngitError('RECOVERY_REQUIRED', 'Checkout/index/protected refs changed; init cannot infer preservation', 6, false, operationId);
        journalOperationId = operationId;
        authority = transaction(db, () => {
          currentProject(db, reg);
          const epoch = coordinatorEpoch;
          if (db.prepare('SELECT 1 FROM attempts WHERE project_id=? LIMIT 1').get(repo.projectId) || db.prepare("SELECT 1 FROM operations WHERE project_id=? AND id<>? AND phase NOT IN ('finalized','failed','abandoned') LIMIT 1").get(repo.projectId, operationId)) throw new AngitError('RECOVERY_REQUIRED', 'Other unknown writers/effects prevent init reconciliation');
          db.prepare('UPDATE projects SET coordinator_epoch=? WHERE id=?').run(epoch, repo.projectId);
          const old = row(db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(repo.projectId, reg.incarnation, `integration:${repo.projectId}`), 'init grant');
          if (old.owner_id !== null) db.prepare("UPDATE leases SET action='release',owner_id=NULL,expires_at_ms=0,coordinator_epoch=?,prior_writer_resolved_receipt=? WHERE project_id=? AND authority_incarnation=? AND resource_key=?").run(epoch, sha256(canonical({ operationId, exactReadback: base.oid, stoppedGuardOwner: old.owner_id, noUnresolvedWriter: true })), repo.projectId, reg.incarnation, `integration:${repo.projectId}`);
          clock = { wallTime: Date.now(), monotonicTime: performance.now() };
          const grant = grantLease(db, reg, policy, `owner_${randomBytes(16).toString('hex')}`, `integration:${repo.projectId}`, epoch);
          this.observation(db, grant, operationId, 'reconciliation', { resumePhase: existing.phase === 'effect_observed' ? 'effect_observed' : 'prepared', reasonCode: 'exact_init_readback', proofReceiptHash: sha256(canonical({ operationId, baseOid: base.oid, treeOid: base.tree, checkoutReceipt: approval.checkout_receipt_json })) });
          this.event(db, grant, policy, 'project.init_reconciled', repo.projectId, 'Current guarded authority reconciled exact previously created refs without repeating Git effects', { operationId });
          return grant;
        });
        startHeartbeat();
      }
      if (await git.ref(baselineRef) !== base.oid || await git.ref(integrationRef) !== base.oid) throw new AngitError('RECOVERY_REQUIRED', 'Exact create-only managed ref readback failed', 6, false, operationId);
      const approval = row(db.prepare('SELECT * FROM runtime_approvals WHERE project_id=?').get(repo.projectId), 'approval');
      const checkout: CheckoutReceipt = await git.checkoutReceipt();
      if (canonical(checkout) !== approval.checkout_receipt_json) throw new AngitError('RECOVERY_REQUIRED', 'Owner checkout/index/non-managed refs were not preserved', 6, false, operationId);
      const reply = transaction(db, () => {
        currentProject(db, reg);
        assertGrant();
        const refs = { baselineRef, baselineOid: base.oid, integrationRef, integrationOid: base.oid };
        this.observation(db, authority, operationId, 'refs_initialized', refs);
        const complete = this.observation(db, authority, operationId, 'effect_complete', { registeredRepositoryIdentity: repo.repositoryIdentity, registrationId: reg.registrationId, storageSchemaHash: migrationHash(), ...refs });
        const operation = row(db.prepare('SELECT phase,version FROM operations WHERE project_id=? AND id=?').get(repo.projectId, operationId), 'init operation');
        if (operation.phase === 'prepared') db.prepare("UPDATE operations SET phase='effect_observed',version=version+1,last_observation_id=?,updated_at_ms=? WHERE project_id=? AND id=? AND version=?").run(complete, Date.now(), repo.projectId, operationId, integer(operation.version, 'version'));
        else if (operation.phase !== 'effect_observed') throw new AngitError('RECOVERY_REQUIRED', 'Init operation phase is not safely finalizable');
        db.prepare("UPDATE operations SET phase='finalized',version=version+1,last_observation_id=?,updated_at_ms=? WHERE project_id=? AND id=?").run(complete, Date.now(), repo.projectId, operationId);
        db.prepare("INSERT INTO snapshots(project_id,id,operation_id,commit_oid,tree_oid,ref_name,kind,verification,policy_hash,profiles_hash,authority_incarnation,content_epoch,created_at_ms) VALUES(?,?,?,?,?,?,'baseline','unverified',?,?,?,0,?)").run(repo.projectId, snapshotId, operationId, base.oid, base.tree, baselineRef, policy.hash, policy.profilesHash, reg.incarnation, Date.now());
        db.prepare("UPDATE projects SET state='idle' WHERE id=?").run(repo.projectId);
        this.event(db, authority, policy, 'project.initialized', repo.projectId, 'Create-only baseline/integration refs read back exactly; baseline remains unverified', { operationId, snapshotId, baselineOid: base.oid, verification: 'unverified' });
        db.prepare("UPDATE idempotency_keys SET status='applied',result_json=? WHERE project_id=? AND stable_principal=? AND command='init' AND key_hash=? AND request_hash=?").run(canonical(result), repo.projectId, semantic.principal, semantic.keyHash, semantic.requestHash);
        assertGrant();
        releaseLease(db, authority);
        return result;
      });
      clearInterval(heartbeat);
      admitGit = undefined;
      this.activateRegistry(reg, db);
      return reply;
    } catch (error) {
      if (renewalFailure) throw renewalFailure;
      if (journalOperationId !== null && error instanceof AngitError && error.operationId === null) throw new AngitError(error.code, error.message, error.exitCode, false, journalOperationId);
      if (journalOperationId !== null && !(error instanceof AngitError)) throw new AngitError('RECOVERY_REQUIRED', 'Init persistence/admission failed; preserve the journal and effects for exact reconciliation, never a blind retry', 6, false, journalOperationId);
      throw error;
    } finally {
      clearInterval(heartbeat);
      db.close();
    }
    } finally { try { if (guard.isTransaction) guard.exec('ROLLBACK'); } finally { guard.close(); } }
  }
  private activateRegistry(reg: Registration, db: DatabaseSync): void {
    const project = currentProject(db, reg);
    if (project.state !== 'idle' || unresolved(db, reg.projectId)) throw new AngitError('RECOVERY_REQUIRED', 'Workflow finalization proof is incomplete; registry remains blocked');
    const registry = this.storage.registry(true);
    try {
      transaction(registry, () => {
        const current = row(registry.prepare('SELECT * FROM registrations WHERE project_id=?').get(reg.projectId), 'registration');
        if (current.authority_incarnation !== reg.incarnation || current.repository_identity !== reg.repositoryIdentity) throw new AngitError('REGISTRY_WORKFLOW_MISMATCH', 'Cross-database activation identity changed');
        // Git/SQLite/registry have no shared transaction. Exact committed workflow receipt permits only this registry finalization, not replayed effects.
        registry.prepare("UPDATE registrations SET admission_state='active' WHERE project_id=? AND authority_incarnation=?").run(reg.projectId, reg.incarnation);
        if (registry.prepare('SELECT admission_state FROM registrations WHERE project_id=?').get(reg.projectId)?.admission_state !== 'active') throw new AngitError('PERSISTENCE_UNCERTAIN', 'Registry finalization exact readback failed');
      });
    } finally { registry.close(); }
  }
}
