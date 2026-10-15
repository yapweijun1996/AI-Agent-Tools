import { DatabaseSync } from 'node:sqlite';
import type { SQLInputValue, SQLOutputValue } from 'node:sqlite';
import { existsSync, lstatSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { AngitError } from '../shared.js';
import type { PlatformAdapter } from '../shared.js';
import { canonical, readAsset, sha256 } from '../json.js';
import { advance, integer, jsonObject, object, text } from './values.js';
import { contained } from './git.js';
import type { Repository } from './git.js';
import type { ApprovedPolicy } from './policy.js';
import type { TerminationReceipt } from '../execution-native.js';

export type Row = Record<string, SQLOutputValue>;
export function row(value: Row | undefined, name: string): Row {
  if (value === undefined) throw new AngitError('STATE_INVALID', `Missing ${name}`);
  return value;
}
export function transaction<T>(db: DatabaseSync, work: () => T, mode: 'IMMEDIATE' | 'DEFERRED' = 'IMMEDIATE'): T {
  db.exec(`BEGIN ${mode}`);
  try { const result = work(); db.exec('COMMIT'); return result; }
  catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
}
function open(path: string, readOnly: boolean): DatabaseSync {
  if (!existsSync(path)) throw new AngitError('STATE_MISSING', 'Known durable database is missing; no recreation is allowed');
  const db = new DatabaseSync(path, { readOnly, allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: 250 });
  try {
    db.exec('PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=250;');
    if (!readOnly) db.exec('PRAGMA synchronous=FULL;');
    const check = db.prepare('PRAGMA quick_check').get();
    if (!check || Object.values(check)[0] !== 'ok' || db.prepare('PRAGMA foreign_key_check').get()) throw new AngitError('STATE_CORRUPT', 'Database integrity/foreign keys require recovery');
    if (db.prepare('PRAGMA foreign_keys').get()?.foreign_keys !== 1) throw new AngitError('PERSISTENCE_UNSUPPORTED', 'Foreign-key enforcement is unavailable');
    return db;
  } catch (error) { db.close(); throw error; }
}
function create(path: string): DatabaseSync {
  if (existsSync(path)) throw new AngitError('STATE_UNKNOWN', 'Unregistered durable file exists; preserve it for review');
  return new DatabaseSync(path, { allowExtension: false, enableDoubleQuotedStringLiterals: false, timeout: 250 });
}
const MIGRATIONS = ['sql/001_initial.sql', 'sql/002_runtime_metadata.sql'];
export function migrationHash(): string {
  return sha256(canonical(MIGRATIONS.map((file, index) => ({ version: index + 1, sha256: sha256(readAsset(file)) }))));
}
function migrateNew(db: DatabaseSync): void {
  db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA busy_timeout=250;');
  if (db.prepare('PRAGMA journal_mode=WAL').get()?.journal_mode !== 'wal') throw new AngitError('PERSISTENCE_UNSUPPORTED', 'WAL journal was not established');
  for (const [index, file] of MIGRATIONS.entries()) {
    const bytes = readAsset(file), sql = bytes.toString('utf8'), hash = sha256(bytes);
    const commit = sql.lastIndexOf('COMMIT;');
    if (commit < 0 || !/^(?:\s|--[^\r\n]*(?:\r?\n|$))*$/.test(sql.slice(commit + 'COMMIT;'.length))) throw new AngitError('MIGRATION_INVALID', 'Migration must end with its transaction commit and optional line comments');
    db.exec(sql.slice(0, commit));
    try {
      db.prepare('INSERT INTO schema_migrations(version,file_sha256,applied_at_ms) VALUES(?,?,?)').run(index + 1, hash, Date.now());
      db.exec(`PRAGMA user_version=${index + 1}; COMMIT;`);
    } catch (error) { if (db.isTransaction) db.exec('ROLLBACK'); throw error; }
  }
}
export function verifyMigrations(db: DatabaseSync): void {
  const receipts = db.prepare('SELECT version,file_sha256 FROM schema_migrations ORDER BY version').all();
  const version = integer(row(db.prepare('PRAGMA user_version').get(), 'user_version').user_version, 'user_version');
  if (version > MIGRATIONS.length || receipts.length > MIGRATIONS.length) throw new AngitError('SCHEMA_UNSUPPORTED', 'Future workflow schema is observation-only; this runtime cannot interpret it');
  if (version !== MIGRATIONS.length || receipts.length !== MIGRATIONS.length) throw new AngitError('SCHEMA_INCOMPLETE', 'Missing migration receipt requires explicit recovery, not read-side repair');
  for (const [index, file] of MIGRATIONS.entries()) {
    const receipt = receipts[index];
    if (!receipt || receipt.version !== index + 1 || receipt.file_sha256 !== sha256(readAsset(file))) throw new AngitError('MIGRATION_CHECKSUM_MISMATCH', 'Workflow migration checksum is not exact');
  }
  if (db.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'wal') throw new AngitError('PERSISTENCE_UNSUPPORTED', 'Workflow no longer uses WAL');
}
export interface Registration {
  projectId: string; commonDir: string; repositoryIdentity: string; incarnation: string; workflowPath: string;
  active: boolean; registrationId: string; directory: string; directoryIdentity: string; guardPath: string; guardIdentity: string;
  workflowIdentity: string; policyPath: string; policyHash: string; profilesHash: string; requestKeyHash: string; semanticHash: string; approvedBase: string;
}
function registration(value: Row): Registration {
  return { projectId: text(value.project_id, 'project_id'), commonDir: text(value.canonical_common_dir, 'canonical_common_dir'), repositoryIdentity: text(value.repository_identity, 'repository_identity'),
    incarnation: text(value.authority_incarnation, 'authority_incarnation'), workflowPath: text(value.workflow_path, 'workflow_path'), active: value.admission_state === 'active',
    registrationId: text(value.registration_id, 'registration_id'), directory: text(value.state_directory, 'state_directory'), directoryIdentity: text(value.directory_identity, 'directory_identity'),
    guardPath: text(value.guard_path, 'guard_path'), guardIdentity: text(value.guard_file_identity, 'guard_file_identity'), workflowIdentity: text(value.workflow_file_identity, 'workflow_file_identity'),
    policyPath: text(value.policy_path, 'policy_path'), policyHash: text(value.policy_hash, 'policy_hash'), profilesHash: text(value.profiles_hash, 'profiles_hash'),
    requestKeyHash: text(value.request_key_hash, 'request_key_hash'), semanticHash: text(value.semantic_request_hash, 'semantic_request_hash'), approvedBase: text(value.approved_base_oid, 'approved_base_oid') };
}
export class Storage {
  constructor(readonly platform: PlatformAdapter, readonly stateRoot: string, readonly ownerSid: string) {}
  assertLocation(repo: Repository): void {
    let ancestor = this.stateRoot;
    const missing: string[] = [];
    for (let depth = 0; !existsSync(ancestor) && depth < 64; depth++) {
      const parent = dirname(ancestor);
      if (parent === ancestor) throw new AngitError('STATE_LOCATION_DENIED', 'State root has no verified existing local ancestor');
      missing.unshift(basename(ancestor)); ancestor = parent;
    }
    const identity = this.platform.identify(ancestor);
    if (!identity.directory || !identity.localDisk) throw new AngitError('STATE_LOCATION_DENIED', 'State root requires a verified local directory ancestor');
    const canonicalTarget = resolve(identity.canonicalPath, ...missing);
    if (contained(repo.root.canonicalPath, canonicalTarget) || contained(repo.common.canonicalPath, canonicalTarget)) throw new AngitError('STATE_LOCATION_DENIED', 'Canonical durable state must remain outside repository/Git source');
  }
  private checkRegistry(db: DatabaseSync): void {
    const receipt = row(db.prepare('SELECT * FROM registry_migrations WHERE version=1').get(), 'registry migration receipt');
    if (receipt.registry_sha256 !== sha256(readAsset('sql/registry.sql')) || receipt.runtime_sha256 !== sha256(readAsset('sql/registry_runtime.sql'))) throw new AngitError('MIGRATION_CHECKSUM_MISMATCH', 'Registry migration checksum mismatch');
  }
  registry(write: boolean, bootstrap = false): DatabaseSync {
    const path = join(this.stateRoot, 'registry.sqlite');
    if (!existsSync(path)) {
      if (!bootstrap) throw new AngitError('PROJECT_NOT_FOUND', 'Canonical project registry has not been initialized');
      if (existsSync(this.stateRoot) && !existsSync(path) && readdirSync(this.stateRoot).length !== 0) throw new AngitError('STATE_UNKNOWN', 'Nonempty state root has no registry; preserve it rather than bootstrap replacement');
      this.platform.preparePrivateDirectory(this.stateRoot);
      // SQLite serializes bootstrap schema/receipt creation. No existence test confers rival authority.
      const db = new DatabaseSync(path, { allowExtension: false, timeout: 250 });
      try {
        db.exec('PRAGMA foreign_keys=ON; PRAGMA synchronous=FULL; PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=250;');
        transaction(db, () => {
          const known = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
          if (!known.length) {
            db.exec(readAsset('sql/registry.sql').toString('utf8'));
            db.exec(readAsset('sql/registry_runtime.sql').toString('utf8'));
            db.prepare('INSERT INTO registry_migrations VALUES(1,?,?,?)').run(sha256(readAsset('sql/registry.sql')), sha256(readAsset('sql/registry_runtime.sql')), Date.now());
          } else this.checkRegistry(db);
        });
        this.platform.assertPrivateFile(path);
        return db;
      } catch (error) { db.close(); throw error; }
    }
    this.platform.assertPrivateDirectory(this.stateRoot);
    this.platform.assertPrivateFile(path);
    const db = open(path, !write);
    try { this.checkRegistry(db); return db; } catch (error) { db.close(); throw error; }
  }
  lookup(db: DatabaseSync, repo: Repository): Registration | null {
    const byIdentity = db.prepare('SELECT r.*,x.* FROM registrations r JOIN registration_receipts x USING(project_id) WHERE r.repository_identity=?').get(repo.repositoryIdentity);
    const byPath = db.prepare('SELECT repository_identity FROM registrations WHERE canonical_common_dir=?').get(repo.common.canonicalPath);
    if (byPath && byPath.repository_identity !== repo.repositoryIdentity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Registered path now names another OS file identity');
    if (!byIdentity) {
      if (db.prepare('SELECT 1 FROM registrations WHERE repository_identity=?').get(repo.repositoryIdentity)) throw new AngitError('STATE_CORRUPT', 'Canonical registration exists without its durable identity receipt');
      return null;
    }
    const result = registration(byIdentity);
    if (byIdentity.activation_id !== null || db.prepare("SELECT 1 FROM activation_intents WHERE project_id=? AND phase<>'finalized' LIMIT 1").get(repo.projectId)) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Backup activation/reconciliation is outside Stage1; preserve registry/workflow state');
    if (result.projectId !== repo.projectId || result.repositoryIdentity !== repo.repositoryIdentity) throw new AngitError('REPOSITORY_IDENTITY_CHANGED', 'Canonical registration identity mismatch');
    return result;
  }
  register(db: DatabaseSync, repo: Repository, policy: ApprovedPolicy, requestKeyHash: string, semanticHash: string, approvedBase: string): Registration {
    return transaction(db, () => {
      const prior = this.lookup(db, repo);
      if (prior) return prior;
      this.assertLocation(repo);
      const parent = this.platform.preparePrivateDirectory(join(this.stateRoot, 'projects'));
      if (existsSync(join(parent.canonicalPath, repo.projectId))) throw new AngitError('STATE_UNKNOWN', 'Unregistered project state directory already exists; preserve it for explicit recovery');
      const directory = this.platform.preparePrivateDirectory(join(parent.canonicalPath, repo.projectId));
      this.platform.preparePrivateDirectory(join(directory.canonicalPath, 'hooks'));
      const guardPath = join(directory.canonicalPath, 'guard.sqlite'), workflowPath = join(directory.canonicalPath, 'state.sqlite');
      const guard = create(guardPath);
      try {
        guard.exec('PRAGMA journal_mode=DELETE; PRAGMA synchronous=FULL; PRAGMA busy_timeout=250;');
        transaction(guard, () => {
          guard.exec('CREATE TABLE guard_identity(id INTEGER PRIMARY KEY CHECK(id=1),project_identity TEXT NOT NULL) STRICT;');
          guard.prepare('INSERT INTO guard_identity VALUES(1,?)').run(repo.repositoryIdentity);
        });
      } finally { guard.close(); }
      const workflow = create(workflowPath);
      try { migrateNew(workflow); } finally { workflow.close(); }
      const guardIdentity = this.platform.assertPrivateFile(guardPath).identity, workflowIdentity = this.platform.assertPrivateFile(workflowPath).identity;
      const incarnation = randomBytes(32).toString('hex'), registrationId = `reg_${randomBytes(16).toString('hex')}`;
      db.prepare('INSERT INTO registrations VALUES(?,?,?,?,?,NULL,?)').run(repo.projectId, repo.common.canonicalPath, repo.repositoryIdentity, incarnation, workflowPath, 'blocked');
      db.prepare('INSERT INTO registration_receipts VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(repo.projectId, registrationId, directory.canonicalPath, directory.identity, guardPath, guardIdentity, workflowIdentity,
        policy.path, policy.hash, policy.profilesHash, requestKeyHash, semanticHash, approvedBase, Date.now());
      return registration(row(db.prepare('SELECT r.*,x.* FROM registrations r JOIN registration_receipts x USING(project_id) WHERE project_id=?').get(repo.projectId), 'registration readback'));
    });
  }
  workflow(reg: Registration, write: boolean): DatabaseSync {
    const directory = this.platform.identify(reg.directory);
    if (!directory.directory || !directory.localDisk || directory.identity !== reg.directoryIdentity || directory.ownerSid !== this.ownerSid || this.platform.assertPrivateFile(reg.workflowPath).identity !== reg.workflowIdentity) throw new AngitError('STATE_IDENTITY_CHANGED', 'Workflow storage identity changed');
    const db = open(reg.workflowPath, !write);
    try { verifyMigrations(db); return db; } catch (error) { db.close(); throw error; }
  }
  acquireGuard(reg: Registration): DatabaseSync {
    if (this.platform.assertPrivateFile(reg.guardPath).identity !== reg.guardIdentity) throw new AngitError('GUARD_IDENTITY_CHANGED', 'Lifetime guard file identity changed');
    const guard = open(reg.guardPath, false);
    try {
      if (guard.prepare('PRAGMA journal_mode').get()?.journal_mode !== 'delete' || guard.prepare('SELECT project_identity FROM guard_identity WHERE id=1').get()?.project_identity !== reg.repositoryIdentity) throw new AngitError('GUARD_IDENTITY_CHANGED', 'Persisted guard identity is invalid');
      // No CREATE/DDL is run on a runtime guard: rival lock acquisition must never mutate its identity.
      guard.exec('PRAGMA busy_timeout=0; BEGIN EXCLUSIVE;');
      return guard;
    } catch (error) { guard.close(); throw error; }
  }
  capacity(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, additionalBytes = 0): void {
    const pageCount = integer(row(db.prepare('PRAGMA page_count').get(), 'page_count').page_count, 'page_count');
    const pageSize = integer(row(db.prepare('PRAGMA page_size').get(), 'page_size').page_size, 'page_size');
    // Charge one main database, reserving any WAL-backed logical growth for checkpoint.
    let bytes = Math.max(pageCount * pageSize, statSync(reg.workflowPath).size);
    const walPath = `${reg.workflowPath}-wal`;
    if (existsSync(walPath)) bytes += statSync(walPath).size;
    // Charge retained physical files once, not both their artifact rows and their paths.
    const files = new Map<string, number>();
    const retained = (directory: string, depth = 0): void => {
      if (!existsSync(directory)) return;
      if (depth > 64) throw new AngitError('STORAGE_LIMIT_REACHED', 'Retained execution storage exceeds the bounded directory depth; preserve it for review');
      const entry = lstatSync(directory);
      if (!entry.isDirectory() || entry.isSymbolicLink()) throw new AngitError('STATE_IDENTITY_CHANGED', 'Retained artifact directory cannot follow a replacement or link');
      for (const name of readdirSync(directory)) {
        const path = join(directory, name), entry = lstatSync(path);
        if (entry.isSymbolicLink()) throw new AngitError('STATE_IDENTITY_CHANGED', 'Retained artifact links cannot bypass storage accounting');
        if (entry.isDirectory()) retained(path, depth + 1);
        else if (entry.isFile()) files.set(resolve(path), entry.size);
        else throw new AngitError('STATE_IDENTITY_CHANGED', 'Unknown retained artifact type cannot bypass storage accounting');
      }
    };
    retained(join(reg.directory, 'artifacts'));
    retained(join(reg.directory, 'execution'));
    for (const size of files.values()) bytes += size;
    for (const attempt of db.prepare('SELECT * FROM attempts WHERE project_id=? AND ended_at_ms IS NULL').all(reg.projectId)) {
      const attemptId = text(attempt.id, 'attemptId');
      const artifact = db.prepare('SELECT * FROM artifacts WHERE project_id=? AND id=?').get(reg.projectId, `${attemptId}_budget`);
      let outputBudget: number;
      if (artifact) {
        const path = join(reg.directory, 'artifacts', `${attemptId}_budget.json`);
        this.platform.assertPrivateFile(path);
        if (artifact.relative_path !== `artifacts/${attemptId}_budget.json` || lstatSync(path).size > 1024) throw new AngitError('STATE_CORRUPT', 'Active output budget requires its bounded immutable manifest');
        const content = readFileSync(path);
        if (content.length > 1024 || content.length !== artifact.bytes || sha256(content) !== artifact.sha256) throw new AngitError('STATE_CORRUPT', 'Active output budget differs from its admitted digest');
        const budget = jsonObject(content.toString('utf8'), 'active output budget');
        if (budget.attemptId !== attemptId) throw new AngitError('STATE_CORRUPT', 'Active output budget belongs to another attempt');
        outputBudget = integer(budget.maxOutputBytes, 'maxOutputBytes');
      } else {
        // Reconcile pre-reservation-manifest Stage2 state without weakening admission.
        const spawn = attempt.spawn_intent_id === null ? undefined : db.prepare("SELECT intent_json FROM operations WHERE project_id=? AND id=? AND kind='spawn'").get(reg.projectId, text(attempt.spawn_intent_id, 'spawn operation'));
        if (spawn) {
          const budget = object(jsonObject(text(spawn.intent_json, 'spawn intent'), 'spawn intent').budget, 'spawn budget');
          const stdout = integer(budget.stdoutBytes, 'stdoutBytes'), stderr = integer(budget.stderrBytes, 'stderrBytes');
          outputBudget = stdout === stderr ? stdout : stdout + stderr;
        } else {
          const profile = policy.profiles.find(value => sha256(canonical(value)) === attempt.runtime_profile_hash);
          if (!profile) throw new AngitError('RECOVERY_REQUIRED', 'Unknown active output reservation cannot admit more storage');
          outputBudget = Math.min(integer(profile.maxOutputBytes, 'profile output'), integer(object(policy.value.limits, 'limits').maxArtifactBytes, 'maxArtifactBytes'));
        }
      }
      const directory = join(reg.directory, 'execution', attemptId);
      const observedOutput = (files.get(resolve(directory, 'stdout.bin')) ?? 0) + (files.get(resolve(directory, 'stderr.bin')) ?? 0);
      // Native stdout/stderr share one cap; only the unwritten balance remains reserved.
      bytes += Math.max(0, outputBudget - observedOutput) + 131072;
    }
    // Incoming payload plus 128 KiB for metadata/index pages and WAL framing.
    const projectedBytes = bytes + additionalBytes + 131072;
    if (!Number.isSafeInteger(bytes) || !Number.isSafeInteger(additionalBytes) || additionalBytes < 0 || !Number.isSafeInteger(projectedBytes) || projectedBytes > policy.maxStoredBytes) throw new AngitError('STORAGE_LIMIT_REACHED', 'Owner storage limit blocks admission including retained artifacts and active output reservations; history is retained');
  }
}
export interface Authority { projectId: string; authorityIncarnation: string; coordinatorEpoch: number; resourceKey: string; fencingToken: number; ownerId: string }
export function currentProject(db: DatabaseSync, reg: Registration): Row {
  const project = row(db.prepare('SELECT * FROM projects WHERE id=?').get(reg.projectId), 'project');
  if (project.repo_identity !== reg.repositoryIdentity || project.authority_incarnation !== reg.incarnation || project.common_dir !== reg.commonDir) throw new AngitError('REGISTRY_WORKFLOW_MISMATCH', 'Registry/workflow identity mismatch requires recovery');
  return project;
}
export function unresolved(db: DatabaseSync, projectId: string): boolean {
  return db.prepare('SELECT 1 FROM attempts WHERE project_id=? AND ended_at_ms IS NULL LIMIT 1').get(projectId) !== undefined ||
    db.prepare("SELECT 1 FROM operations WHERE project_id=? AND phase NOT IN ('finalized','failed','abandoned') LIMIT 1").get(projectId) !== undefined;
}
export function startAuthority(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, ownerId: string): Authority {
  return transaction(db, () => {
    const project = currentProject(db, reg);
    if (unresolved(db, reg.projectId)) throw new AngitError('RECOVERY_REQUIRED', 'Unresolved attempt or external effect blocks new mutation authority');
    const epoch = advance(integer(project.coordinator_epoch, 'coordinator_epoch'), 'coordinator epoch');
    db.prepare('UPDATE projects SET coordinator_epoch=? WHERE id=? AND coordinator_epoch=?').run(epoch, reg.projectId, integer(project.coordinator_epoch, 'coordinator_epoch'));
    const held = db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND owner_id IS NOT NULL').all(reg.projectId, reg.incarnation);
    for (const grant of held) {
      const resource = text(grant.resource_key, 'resource_key');
      if (!['metadata:', 'integration:'].some(prefix => resource === `${prefix}${reg.projectId}`)) throw new AngitError('RECOVERY_REQUIRED', 'Unknown grant cannot be auto-released');
      // The same guard is held and the closed journal/attempt set proves metadata-only stale grants have no writer/effect.
      const proof = canonical({ kind: 'guarded_metadata_no_unresolved_effect', projectId: reg.projectId, incarnation: reg.incarnation, epoch,
        resource, priorOwner: text(grant.owner_id, 'owner_id'), priorFence: integer(grant.fencing_token, 'fencing_token') });
      const digest = sha256(proof);
      db.prepare('INSERT INTO metadata_grant_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(reg.projectId, digest, reg.incarnation, epoch, resource, integer(grant.fencing_token, 'fencing_token'), text(grant.owner_id, 'owner_id'), proof, Date.now());
      db.prepare("UPDATE leases SET owner_id=NULL,expires_at_ms=0,action='release',coordinator_epoch=?,prior_writer_resolved_receipt=? WHERE project_id=? AND authority_incarnation=? AND resource_key=?").run(epoch, digest, reg.projectId, reg.incarnation, resource);
    }
    return grantLease(db, reg, policy, ownerId, `metadata:${reg.projectId}`, epoch);
  });
}
export function grantLease(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, ownerId: string, resourceKey: string, epoch: number): Authority {
  if (resourceKey !== `metadata:${reg.projectId}` && resourceKey !== `integration:${reg.projectId}`) throw new AngitError('CAPABILITY_UNAVAILABLE', 'Stage1 grants only generated metadata/init resources');
  const prior = db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(reg.projectId, reg.incarnation, resourceKey);
  if (prior?.owner_id !== null && prior !== undefined) throw new AngitError('RECOVERY_REQUIRED', 'Existing ownership was not proven released');
  const fence = prior ? advance(integer(prior.fencing_token, 'fencing_token'), 'fencing token') : 1;
  const proof = sha256(canonical({ projectId: reg.projectId, epoch, resourceKey, priorFence: prior?.fencing_token ?? 0, noUnresolvedEffect: true }));
  const expires = Date.now() + policy.leaseDurationMs;
  if (prior) db.prepare("UPDATE leases SET owner_id=?,fencing_token=?,coordinator_epoch=?,expires_at_ms=?,action='grant',prior_writer_resolved_receipt=?,heartbeat_interval_ms=?,lease_duration_ms=? WHERE project_id=? AND authority_incarnation=? AND resource_key=?").run(ownerId, fence, epoch, expires, proof, policy.heartbeatIntervalMs, policy.leaseDurationMs, reg.projectId, reg.incarnation, resourceKey);
  else db.prepare("INSERT INTO leases VALUES(?,?,?,?,?,?,?,'grant',?,?,?)").run(reg.projectId, resourceKey, reg.incarnation, ownerId, fence, epoch, expires, proof, policy.heartbeatIntervalMs, policy.leaseDurationMs);
  return { projectId: reg.projectId, authorityIncarnation: reg.incarnation, coordinatorEpoch: epoch, resourceKey, fencingToken: fence, ownerId };
}
export interface LeaseClock { wallTime: number; monotonicTime: number }
export function renewLease(db: DatabaseSync, authority: Authority, policy: ApprovedPolicy, clock: LeaseClock): void {
  const now = Date.now(), elapsed = performance.now() - clock.monotonicTime;
  if (elapsed < 0 || Math.abs(now - clock.wallTime - elapsed) > policy.heartbeatIntervalMs) throw new AngitError('RECOVERY_REQUIRED', 'Live lease timing changed; no replacement is inferred');
  const grant = row(db.prepare('SELECT l.*,p.coordinator_epoch AS current_epoch,p.authority_incarnation AS current_incarnation FROM leases l JOIN projects p ON p.id=l.project_id WHERE l.project_id=? AND l.authority_incarnation=? AND l.resource_key=?').get(authority.projectId, authority.authorityIncarnation, authority.resourceKey), 'current lease');
  if (grant.current_epoch !== authority.coordinatorEpoch || grant.current_incarnation !== authority.authorityIncarnation || grant.coordinator_epoch !== authority.coordinatorEpoch ||
    grant.fencing_token !== authority.fencingToken || grant.owner_id !== authority.ownerId || integer(grant.expires_at_ms, 'expires_at_ms') <= now) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Exact current live grant is required; expiry does not establish replacement');
  if (elapsed < policy.heartbeatIntervalMs) return;
  const expires = now + policy.leaseDurationMs;
  if (!Number.isSafeInteger(expires) || expires <= integer(grant.expires_at_ms, 'expires_at_ms')) throw new AngitError('RECOVERY_REQUIRED', 'Lease renewal cannot establish monotonic approved timing');
  const updated = db.prepare("UPDATE leases SET action='renew',expires_at_ms=? WHERE project_id=? AND authority_incarnation=? AND coordinator_epoch=? AND resource_key=? AND owner_id=? AND fencing_token=?").run(expires, authority.projectId, authority.authorityIncarnation, authority.coordinatorEpoch, authority.resourceKey, authority.ownerId, authority.fencingToken);
  if (updated.changes !== 1) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Lease renewal exact tuple failed');
  clock.wallTime = now; clock.monotonicTime = performance.now();
}
export function releaseLease(db: DatabaseSync, authority: Authority): void {
  if (unresolved(db, authority.projectId)) throw new AngitError('RECOVERY_REQUIRED', 'Unresolved effect prevents lease release');
  const proof = canonical({ kind: 'closed_metadata_lifetime', ...authority, noUnresolvedEffect: true });
  const digest = sha256(proof);
  db.prepare('INSERT INTO metadata_grant_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(authority.projectId, digest, authority.authorityIncarnation, authority.coordinatorEpoch, authority.resourceKey, authority.fencingToken, authority.ownerId, proof, Date.now());
  const result = db.prepare("UPDATE leases SET owner_id=NULL,expires_at_ms=0,action='release',prior_writer_resolved_receipt=? WHERE project_id=? AND authority_incarnation=? AND coordinator_epoch=? AND resource_key=? AND owner_id=? AND fencing_token=?").run(digest, authority.projectId, authority.authorityIncarnation, authority.coordinatorEpoch, authority.resourceKey, authority.ownerId, authority.fencingToken);
  if (result.changes !== 1) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Exact lease release tuple did not match');
}
export function startSessionAuthority(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, ownerId: string, recover = false): Authority {
  if (!recover) return startAuthority(db, reg, policy, ownerId);
  return transaction(db, () => {
    const project = currentProject(db, reg), resourceKey = `metadata:${reg.projectId}`;
    if (db.prepare("SELECT 1 FROM operations WHERE project_id=? AND resource_key=? AND phase NOT IN ('finalized','failed','abandoned') LIMIT 1").get(reg.projectId, resourceKey)) throw new AngitError('RECOVERY_REQUIRED', 'Unknown metadata effects prevent recovery authority');
    const epoch = advance(integer(project.coordinator_epoch, 'coordinator_epoch'), 'coordinator epoch');
    db.prepare('UPDATE projects SET coordinator_epoch=? WHERE id=? AND coordinator_epoch=?').run(epoch, reg.projectId, integer(project.coordinator_epoch, 'coordinator_epoch'));
    const old = db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(reg.projectId, reg.incarnation, resourceKey);
    if (old?.owner_id !== null && old !== undefined) {
      const proof = canonical({ kind: 'guarded_metadata_session_closed', projectId: reg.projectId, incarnation: reg.incarnation, epoch, resourceKey, priorOwner: old.owner_id, priorFence: old.fencing_token, noMetadataWriter: true });
      const digest = sha256(proof);
      db.prepare('INSERT INTO metadata_grant_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(reg.projectId, digest, reg.incarnation, epoch, resourceKey, integer(old.fencing_token, 'fencing_token'), text(old.owner_id, 'owner_id'), proof, Date.now());
      db.prepare("UPDATE leases SET owner_id=NULL,expires_at_ms=0,action='release',coordinator_epoch=?,prior_writer_resolved_receipt=? WHERE project_id=? AND authority_incarnation=? AND resource_key=? AND owner_id=? AND fencing_token=?").run(epoch, digest, reg.projectId, reg.incarnation, resourceKey, text(old.owner_id, 'owner_id'), integer(old.fencing_token, 'fencing_token'));
    }
    // Unknown task/worktree grants remain untouched; a new epoch is not termination proof.
    return grantLease(db, reg, policy, ownerId, resourceKey, epoch);
  });
}
function grantExecutionResource(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, session: Authority, resourceKey: string, reconciliationProof?: string): Authority {
  const project = currentProject(db, reg);
  if (session.projectId !== reg.projectId || session.authorityIncarnation !== reg.incarnation || project.coordinator_epoch !== session.coordinatorEpoch) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Execution grant requires the current session epoch');
  const coordinator = row(db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(reg.projectId, reg.incarnation, session.resourceKey), 'session lease');
  if (coordinator.owner_id !== session.ownerId || coordinator.fencing_token !== session.fencingToken || coordinator.coordinator_epoch !== session.coordinatorEpoch || integer(coordinator.expires_at_ms, 'expires_at_ms') <= Date.now()) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Session ownership changed before resource reservation');
  const prior = db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(reg.projectId, reg.incarnation, resourceKey);
  if (prior !== undefined && prior.owner_id !== null) throw new AngitError('RECOVERY_REQUIRED', 'Existing resource writer has no exact release proof');
  if (reconciliationProof === undefined && db.prepare("SELECT 1 FROM operations WHERE project_id=? AND resource_key=? AND phase NOT IN ('finalized','failed','abandoned') LIMIT 1").get(reg.projectId, resourceKey)) throw new AngitError('RECOVERY_REQUIRED', 'Unresolved resource operation blocks a new grant');
  const fence = prior ? advance(integer(prior.fencing_token, 'fencing_token'), 'fencing token') : 1;
  const proof = canonical({ kind: reconciliationProof === undefined ? 'execution_resource_unowned' : 'terminated_execution_observer', ...session, resourceKey, priorFence: prior?.fencing_token ?? 0, priorRelease: prior?.prior_writer_resolved_receipt ?? null, reconciliationProof: reconciliationProof ?? null });
  const digest = sha256(proof), now = Date.now();
  db.prepare('INSERT INTO metadata_grant_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(reg.projectId, digest, reg.incarnation, session.coordinatorEpoch, resourceKey, fence, session.ownerId, proof, now);
  if (prior) db.prepare("UPDATE leases SET owner_id=?,fencing_token=?,coordinator_epoch=?,expires_at_ms=?,action='grant',prior_writer_resolved_receipt=?,heartbeat_interval_ms=?,lease_duration_ms=? WHERE project_id=? AND authority_incarnation=? AND resource_key=? AND owner_id IS NULL").run(session.ownerId, fence, session.coordinatorEpoch, now + policy.leaseDurationMs, digest, policy.heartbeatIntervalMs, policy.leaseDurationMs, reg.projectId, reg.incarnation, resourceKey);
  else db.prepare("INSERT INTO leases VALUES(?,?,?,?,?,?,?,'grant',?,?,?)").run(reg.projectId, resourceKey, reg.incarnation, session.ownerId, fence, session.coordinatorEpoch, now + policy.leaseDurationMs, digest, policy.heartbeatIntervalMs, policy.leaseDurationMs);
  return { ...session, resourceKey, fencingToken: fence };
}
export function grantTaskLease(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, session: Authority, taskId: string): Authority {
  if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(taskId)) throw new AngitError('INVALID_INPUT', 'Task lease requires a generated task resource');
  const task = row(db.prepare('SELECT * FROM tasks WHERE project_id=? AND id=?').get(reg.projectId, taskId), 'lease task');
  const project = currentProject(db, reg);
  if (task.status !== 'queued' || task.cancel_requested !== 0 || task.base_epoch !== project.content_epoch || db.prepare('SELECT 1 FROM attempts WHERE project_id=? AND task_id=? AND ended_at_ms IS NULL LIMIT 1').get(reg.projectId, taskId)) throw new AngitError('RECOVERY_REQUIRED', 'Task is not eligible for a fresh writer grant');
  return grantExecutionResource(db, reg, policy, session, `task:${taskId}`);
}
export function grantWorktreeLease(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, session: Authority, worktreeId: string): Authority {
  if (!/^[a-z][a-z0-9_-]{1,63}$/u.test(worktreeId)) throw new AngitError('INVALID_INPUT', 'Worktree lease requires a generated worktree resource');
  const worktree = row(db.prepare('SELECT w.*,a.authority_incarnation,a.coordinator_epoch,a.owner_id,a.ended_at_ms FROM worktrees w JOIN attempts a ON a.project_id=w.project_id AND a.id=w.attempt_id WHERE w.project_id=? AND w.id=?').get(reg.projectId, worktreeId), 'owned worktree');
  if (worktree.role !== 'task' || worktree.status !== 'provisioning' || worktree.authority_incarnation !== session.authorityIncarnation || worktree.coordinator_epoch !== session.coordinatorEpoch || worktree.owner_id !== session.ownerId || worktree.ended_at_ms !== null) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Worktree grant must bind a current owned reservation');
  return grantExecutionResource(db, reg, policy, session, `worktree:${worktreeId}`);
}
/** Called only after the native receipt verifier has proved MAC, exact launch/Job, and helper-lifetime absence. */
export function grantReconciliationLease(db: DatabaseSync, reg: Registration, policy: ApprovedPolicy, session: Authority, attemptId: string, resourceKey: string, verified: { receipt: TerminationReceipt; noLiveHelper: true }): Authority {
  const attempt = row(db.prepare('SELECT * FROM attempts WHERE project_id=? AND id=?').get(reg.projectId, attemptId), 'reconciliation attempt');
  const worktree = row(db.prepare('SELECT * FROM worktrees WHERE project_id=? AND attempt_id=?').get(reg.projectId, attemptId), 'reconciliation worktree');
  const final = verified.receipt, prior = final.authority;
  if (verified.noLiveHelper !== true || final.writerTreeTerminated !== true || canonical(final.process) !== attempt.process_identity ||
    prior.projectId !== reg.projectId || prior.authorityIncarnation !== reg.incarnation || prior.authorityIncarnation !== attempt.authority_incarnation || prior.coordinatorEpoch !== attempt.coordinator_epoch || prior.fencingToken !== attempt.fencing_token || prior.resourceKey !== attempt.resource_key || prior.ownerId !== attempt.owner_id ||
    ![`task:${text(attempt.task_id, 'taskId')}`, `worktree:${text(worktree.id, 'worktreeId')}`].includes(resourceKey)) throw new AngitError('NATIVE_IDENTITY_MISMATCH', 'Recovery observer requires exact historical full-tree proof for this resource');
  const old = row(db.prepare('SELECT * FROM leases WHERE project_id=? AND authority_incarnation=? AND resource_key=?').get(reg.projectId, reg.incarnation, resourceKey), 'historical writer lease');
  if (old.owner_id !== prior.ownerId || old.coordinator_epoch !== prior.coordinatorEpoch || resourceKey === prior.resourceKey && old.fencing_token !== prior.fencingToken) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Historical resource grant does not match stopped execution');
  const proof = canonical({ kind: 'verified_native_tree_stopped_reconciliation', attemptId, resourceKey, oldAuthority: { ...prior, resourceKey, fencingToken: old.fencing_token }, currentObserver: session, receipt: final, noLiveHelper: true });
  const digest = sha256(proof);
  db.prepare('INSERT INTO metadata_grant_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(reg.projectId, digest, reg.incarnation, session.coordinatorEpoch, resourceKey, integer(old.fencing_token, 'old fence'), text(old.owner_id, 'old owner'), proof, Date.now());
  const released = db.prepare("UPDATE leases SET owner_id=NULL,expires_at_ms=0,action='release',coordinator_epoch=?,prior_writer_resolved_receipt=? WHERE project_id=? AND authority_incarnation=? AND resource_key=? AND coordinator_epoch=? AND owner_id=? AND fencing_token=?").run(session.coordinatorEpoch, digest, reg.projectId, reg.incarnation, resourceKey, integer(old.coordinator_epoch, 'old epoch'), text(old.owner_id, 'old owner'), integer(old.fencing_token, 'old fence'));
  if (released.changes !== 1) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Historical resolved resource changed before observer handover');
  return grantExecutionResource(db, reg, policy, session, resourceKey, digest);
}
export function releaseExecutionLease(db: DatabaseSync, authority: Authority): void {
  let attempts: Row[];
  if (authority.resourceKey.startsWith('task:')) attempts = db.prepare('SELECT * FROM attempts WHERE project_id=? AND task_id=?').all(authority.projectId, authority.resourceKey.slice(5));
  else if (authority.resourceKey.startsWith('worktree:')) attempts = db.prepare('SELECT a.* FROM attempts a JOIN worktrees w ON w.project_id=a.project_id AND w.attempt_id=a.id WHERE w.project_id=? AND w.id=?').all(authority.projectId, authority.resourceKey.slice(9));
  else throw new AngitError('INVALID_INPUT', 'Execution release requires an owned task/worktree resource');
  if (!attempts.length || attempts.some(attempt => attempt.ended_at_ms === null || attempt.termination_receipt_hash === null || attempt.termination_kind === null)) throw new AngitError('RECOVERY_REQUIRED', 'Matching writer tree has no full termination proof');
  if (db.prepare("SELECT 1 FROM operations WHERE project_id=? AND resource_key=? AND phase NOT IN ('finalized','failed','abandoned') LIMIT 1").get(authority.projectId, authority.resourceKey)) throw new AngitError('RECOVERY_REQUIRED', 'Matching resource operation remains unresolved');
  const proof = canonical({ kind: 'closed_execution_resource', ...authority, attempts: attempts.map(attempt => ({ attemptId: attempt.id, terminationKind: attempt.termination_kind, terminationReceiptHash: attempt.termination_receipt_hash, endedAtMs: attempt.ended_at_ms })) });
  const digest = sha256(proof);
  db.prepare('INSERT INTO metadata_grant_receipts VALUES(?,?,?,?,?,?,?,?,?)').run(authority.projectId, digest, authority.authorityIncarnation, authority.coordinatorEpoch, authority.resourceKey, authority.fencingToken, authority.ownerId, proof, Date.now());
  const updated = db.prepare("UPDATE leases SET owner_id=NULL,expires_at_ms=0,action='release',prior_writer_resolved_receipt=? WHERE project_id=? AND authority_incarnation=? AND coordinator_epoch=? AND resource_key=? AND owner_id=? AND fencing_token=?").run(digest, authority.projectId, authority.authorityIncarnation, authority.coordinatorEpoch, authority.resourceKey, authority.ownerId, authority.fencingToken);
  if (updated.changes !== 1) throw new AngitError('STALE_AUTHORITY_TUPLE', 'Execution release exact ownership tuple changed');
}
export function sqlBindings(authority: Authority): SQLInputValue[] {
  return [authority.authorityIncarnation, authority.coordinatorEpoch, authority.fencingToken, authority.resourceKey, authority.ownerId];
}
