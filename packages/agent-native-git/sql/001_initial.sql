-- Effective Stage 0 prospective persistence contract. NOT a deployed product migration.
-- Run only against a NEW disposable database for review/validation.
-- No production migration, background worker or agent runtime is included.
-- Connection setup (foreign_keys, WAL, synchronous, busy_timeout) is in connection.sql.
BEGIN IMMEDIATE;

CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY CHECK (version > 0),
  file_sha256 TEXT NOT NULL CHECK (length(file_sha256) = 64),
  applied_at_ms INTEGER NOT NULL CHECK (applied_at_ms >= 0)
) STRICT;

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  common_dir TEXT NOT NULL UNIQUE,
  repo_identity TEXT NOT NULL UNIQUE,
  object_format TEXT NOT NULL CHECK (object_format IN ('sha1','sha256')),
  integration_ref TEXT NOT NULL UNIQUE CHECK (integration_ref LIKE 'refs/angit/%'),
  integration_oid TEXT NOT NULL CHECK (length(integration_oid) IN (40,64)),
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  profiles_hash TEXT NOT NULL CHECK (length(profiles_hash) = 64),
  content_epoch INTEGER NOT NULL DEFAULT 0 CHECK (content_epoch BETWEEN 0 AND 9007199254740991),
  authority_incarnation TEXT NOT NULL CHECK (length(authority_incarnation)=64 AND authority_incarnation NOT GLOB '*[^0-9a-f]*'),
  coordinator_epoch INTEGER NOT NULL DEFAULT 0 CHECK (coordinator_epoch BETWEEN 0 AND 9007199254740991),
  state TEXT NOT NULL DEFAULT 'initializing'
    CHECK (state IN ('initializing','idle','running','paused','recovery_required')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0)
) STRICT;

CREATE TABLE policy_revisions (
  project_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK (revision > 0),
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  policy_json TEXT NOT NULL CHECK (json_valid(policy_json)),
  approval_reference TEXT NOT NULL,
  activated_at_ms INTEGER NOT NULL CHECK (activated_at_ms >= 0),
  PRIMARY KEY (project_id,revision),
  UNIQUE (project_id,policy_hash),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE tasks (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 200),
  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','blocked','leased','running','submitted','validating',
                     'integrating','completed','failed','cancelled','needs_review')),
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority BETWEEN 0 AND 100),
  version INTEGER NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
  base_epoch INTEGER NOT NULL CHECK (base_epoch >= 0),
  spec_json TEXT NOT NULL CHECK (json_valid(spec_json)),
  spec_sha256 TEXT NOT NULL CHECK (length(spec_sha256) = 64),
  cancel_requested INTEGER NOT NULL DEFAULT 0 CHECK (cancel_requested IN (0,1)),
  effective_in_current_snapshot TEXT NOT NULL DEFAULT 'unknown'
    CHECK (effective_in_current_snapshot IN ('yes','no','unknown')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  updated_at_ms INTEGER NOT NULL CHECK (updated_at_ms >= created_at_ms),
  PRIMARY KEY (project_id,id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;
CREATE INDEX idx_tasks_schedule ON tasks(project_id,status,priority DESC,created_at_ms,id);

CREATE TABLE task_dependencies (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  depends_on_id TEXT NOT NULL,
  PRIMARY KEY (project_id,task_id,depends_on_id),
  CHECK (task_id <> depends_on_id),
  FOREIGN KEY (project_id,task_id) REFERENCES tasks(project_id,id),
  FOREIGN KEY (project_id,depends_on_id) REFERENCES tasks(project_id,id)
) STRICT;
CREATE INDEX idx_dependency_reverse ON task_dependencies(project_id,depends_on_id);

CREATE TRIGGER dependency_cycle_guard BEFORE INSERT ON task_dependencies
WHEN EXISTS (
  WITH RECURSIVE ancestors(id) AS (
    SELECT NEW.depends_on_id
    UNION
    SELECT d.depends_on_id FROM task_dependencies d JOIN ancestors a ON d.task_id=a.id
    WHERE d.project_id=NEW.project_id
  ) SELECT 1 FROM ancestors WHERE id=NEW.task_id
)
BEGIN SELECT RAISE(ABORT,'DEPENDENCY_CYCLE'); END;
CREATE TRIGGER dependency_no_update BEFORE UPDATE ON task_dependencies
BEGIN SELECT RAISE(ABORT,'DEPENDENCY_IMMUTABLE'); END;
CREATE TRIGGER dependency_no_delete BEFORE DELETE ON task_dependencies
BEGIN SELECT RAISE(ABORT,'DEPENDENCY_IMMUTABLE'); END;
CREATE TRIGGER task_spec_immutable BEFORE UPDATE OF spec_json,spec_sha256,base_epoch ON tasks
WHEN NEW.spec_json <> OLD.spec_json OR NEW.spec_sha256 <> OLD.spec_sha256
     OR NEW.base_epoch <> OLD.base_epoch
BEGIN SELECT RAISE(ABORT,'TASK_SPEC_IMMUTABLE'); END;

CREATE TABLE task_transitions (
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  PRIMARY KEY (from_state,to_state)
) STRICT;
INSERT INTO task_transitions VALUES
 ('queued','blocked'),('queued','leased'),('queued','cancelled'),('queued','needs_review'),
 ('blocked','queued'),('blocked','cancelled'),('blocked','needs_review'),
 ('leased','running'),('leased','failed'),('leased','cancelled'),('leased','needs_review'),
 ('running','submitted'),('running','failed'),('running','cancelled'),('running','needs_review'),
 ('submitted','validating'),('submitted','cancelled'),('submitted','needs_review'),
 ('validating','integrating'),('validating','needs_review'),('validating','cancelled'),
 ('integrating','completed'),('integrating','needs_review'),
 ('failed','queued'),('failed','cancelled'),('failed','needs_review'),
 ('needs_review','queued'),('needs_review','submitted'),('needs_review','cancelled');
CREATE TRIGGER task_transition_guard BEFORE UPDATE OF status ON tasks
WHEN NEW.status <> OLD.status AND NOT EXISTS (
 SELECT 1 FROM task_transitions WHERE from_state=OLD.status AND to_state=NEW.status
)
BEGIN SELECT RAISE(ABORT,'INVALID_TASK_TRANSITION'); END;
CREATE TRIGGER task_version_guard BEFORE UPDATE ON tasks
WHEN NEW.version <> OLD.version + 1
BEGIN SELECT RAISE(ABORT,'TASK_VERSION_MUST_INCREMENT'); END;

CREATE TABLE attempts (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number > 0),
  status TEXT NOT NULL CHECK (status IN
    ('reserved','starting','running','stopping','submitted','failed','cancelled','orphaned')),
  authority_incarnation TEXT NOT NULL CHECK (length(authority_incarnation)=64),
  resource_key TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 0 CHECK (version BETWEEN 0 AND 9007199254740991),
  spawn_intent_id TEXT,
  termination_kind TEXT CHECK (termination_kind IN ('no_process_created','writer_tree_terminated')),
  termination_receipt_hash TEXT CHECK (length(termination_receipt_hash)=64),
  submission_tree_oid TEXT CHECK (length(submission_tree_oid) IN (40,64)),
  submission_ref TEXT,
  base_oid TEXT NOT NULL CHECK (length(base_oid) IN (40,64)),
  base_epoch INTEGER NOT NULL CHECK (base_epoch >= 0),
  coordinator_epoch INTEGER NOT NULL CHECK (coordinator_epoch BETWEEN 1 AND 9007199254740991),
  fencing_token INTEGER NOT NULL CHECK (fencing_token BETWEEN 1 AND 9007199254740991),
  runtime_profile_hash TEXT NOT NULL CHECK (length(runtime_profile_hash) = 64),
  pid INTEGER CHECK (pid IS NULL OR pid > 0),
  process_identity TEXT,
  started_at_ms INTEGER,
  heartbeat_at_ms INTEGER,
  ended_at_ms INTEGER,
  submission_oid TEXT CHECK (submission_oid IS NULL OR length(submission_oid) IN (40,64)),
  PRIMARY KEY (project_id,id),
  UNIQUE (project_id,task_id,number),
  FOREIGN KEY (project_id,task_id) REFERENCES tasks(project_id,id),
  CHECK (ended_at_ms IS NULL OR started_at_ms IS NULL OR ended_at_ms >= started_at_ms),
  CHECK ((status IN ('submitted','failed','cancelled') AND ended_at_ms IS NOT NULL AND termination_kind IS NOT NULL AND termination_receipt_hash IS NOT NULL) OR (status IN ('reserved','starting','running','stopping','orphaned') AND ended_at_ms IS NULL AND termination_kind IS NULL AND termination_receipt_hash IS NULL)),
  CHECK (status <> 'submitted' OR (submission_oid IS NOT NULL AND submission_tree_oid IS NOT NULL AND submission_ref LIKE 'refs/angit/%' AND process_identity IS NOT NULL AND started_at_ms IS NOT NULL)),
  CHECK (status NOT IN ('running','stopping') OR (process_identity IS NOT NULL AND started_at_ms IS NOT NULL AND spawn_intent_id IS NOT NULL)),
  CHECK (status <> 'starting' OR spawn_intent_id IS NOT NULL),
  CHECK (termination_kind IS NOT 'no_process_created' OR
    (status IN ('failed','cancelled') AND pid IS NULL AND process_identity IS NULL AND started_at_ms IS NULL))
) STRICT;
-- Orphaned / unknown attempts MUST keep ended_at_ms NULL until proven stopped.
CREATE UNIQUE INDEX one_unterminated_attempt_per_task
  ON attempts(project_id,task_id) WHERE ended_at_ms IS NULL;

CREATE TABLE worktrees (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  attempt_id TEXT,
  operation_id TEXT,
  role TEXT NOT NULL CHECK (role IN ('task','candidate')),
  canonical_path TEXT NOT NULL UNIQUE,
  branch_ref TEXT UNIQUE,
  base_oid TEXT NOT NULL CHECK (length(base_oid) IN (40,64)),
  status TEXT NOT NULL CHECK (status IN ('provisioning','ready','preserved','missing','retired')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (project_id,id),
  UNIQUE (project_id,attempt_id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (project_id,attempt_id) REFERENCES attempts(project_id,id),
  CHECK ((role='task' AND attempt_id IS NOT NULL AND branch_ref IS NOT NULL)
       OR (role='candidate' AND operation_id IS NOT NULL AND branch_ref IS NULL))
) STRICT;

CREATE TABLE leases (
 project_id TEXT NOT NULL, resource_key TEXT NOT NULL,
 authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
 owner_id TEXT, fencing_token INTEGER NOT NULL CHECK(fencing_token BETWEEN 1 AND 9007199254740991),
 coordinator_epoch INTEGER NOT NULL CHECK(coordinator_epoch BETWEEN 1 AND 9007199254740991),
 expires_at_ms INTEGER NOT NULL CHECK(expires_at_ms BETWEEN 0 AND 9007199254740991),
 action TEXT NOT NULL CHECK(action IN ('grant','renew','release')),
 prior_writer_resolved_receipt TEXT,
 heartbeat_interval_ms INTEGER NOT NULL CHECK(heartbeat_interval_ms>0),
 lease_duration_ms INTEGER NOT NULL CHECK(lease_duration_ms BETWEEN 1 AND 9007199254740991),
 PRIMARY KEY(project_id,authority_incarnation,resource_key), FOREIGN KEY(project_id) REFERENCES projects(id),
 CHECK(heartbeat_interval_ms <= lease_duration_ms / 3),
 CHECK((action='release' AND owner_id IS NULL AND expires_at_ms=0) OR (action IN ('grant','renew') AND owner_id IS NOT NULL)),
 CHECK(action <> 'grant' OR length(prior_writer_resolved_receipt)=64)
) STRICT;
CREATE TRIGGER lease_insert BEFORE INSERT ON leases WHEN
 NEW.action<>'grant' OR NEW.fencing_token<>1 OR NOT EXISTS (
 SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation AND p.coordinator_epoch=NEW.coordinator_epoch)
BEGIN SELECT RAISE(ABORT,'INVALID_INITIAL_GRANT'); END;
CREATE TRIGGER lease_action_guard BEFORE UPDATE ON leases WHEN
 NEW.project_id<>OLD.project_id OR NEW.resource_key<>OLD.resource_key OR
 NOT EXISTS (SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation AND p.coordinator_epoch=NEW.coordinator_epoch) OR
 (NEW.action='grant' AND (OLD.owner_id IS NOT NULL OR NEW.authority_incarnation<>OLD.authority_incarnation OR NEW.fencing_token<>OLD.fencing_token+1 OR NEW.prior_writer_resolved_receipt IS NULL)) OR
 (NEW.action='renew' AND (OLD.owner_id IS NULL OR NEW.owner_id IS NOT OLD.owner_id OR NEW.authority_incarnation<>OLD.authority_incarnation OR NEW.coordinator_epoch<>OLD.coordinator_epoch OR NEW.fencing_token<>OLD.fencing_token OR NEW.expires_at_ms<=OLD.expires_at_ms)) OR
 (NEW.action='release' AND (OLD.owner_id IS NULL OR NEW.authority_incarnation<>OLD.authority_incarnation OR NEW.fencing_token<>OLD.fencing_token))
BEGIN SELECT RAISE(ABORT,'INVALID_LEASE_ACTION'); END;
CREATE TRIGGER lease_no_delete BEFORE DELETE ON leases
BEGIN SELECT RAISE(ABORT,'LEASE_COUNTER_MUST_BE_RETAINED'); END;

CREATE TABLE plans (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('merge','undo','restore')),
  operation_id TEXT NOT NULL,
  authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
  coordinator_epoch INTEGER NOT NULL CHECK(coordinator_epoch>0),
  fencing_token INTEGER NOT NULL CHECK(fencing_token>0),
  resource_key TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  candidate_tree_oid TEXT CHECK(length(candidate_tree_oid) IN (40,64)),
  environment_hash TEXT NOT NULL CHECK(length(environment_hash)=64),
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  plan_hash TEXT NOT NULL CHECK (length(plan_hash) = 64),
  expected_oid TEXT NOT NULL CHECK (length(expected_oid) IN (40,64)),
  expected_content_epoch INTEGER NOT NULL CHECK (expected_content_epoch >= 0),
  candidate_oid TEXT CHECK (candidate_oid IS NULL OR length(candidate_oid) IN (40,64)),
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  profiles_hash TEXT NOT NULL CHECK (length(profiles_hash) = 64),
  verdict TEXT NOT NULL CHECK (verdict IN ('ready','conflicts','blocked','no_change')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  expires_at_ms INTEGER NOT NULL CHECK (expires_at_ms > created_at_ms),
  PRIMARY KEY (project_id,id),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;
CREATE TRIGGER plans_immutable BEFORE UPDATE ON plans
BEGIN SELECT RAISE(ABORT,'PLAN_IMMUTABLE'); END;

CREATE TABLE plan_sources (
  project_id TEXT NOT NULL,
  plan_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  attempt_id TEXT NOT NULL,
  submission_oid TEXT NOT NULL CHECK (length(submission_oid) IN (40,64)),
  PRIMARY KEY (project_id,plan_id,ordinal),
  UNIQUE (project_id,plan_id,attempt_id),
  FOREIGN KEY (project_id,plan_id) REFERENCES plans(project_id,id),
  FOREIGN KEY (project_id,attempt_id) REFERENCES attempts(project_id,id)
) STRICT;

CREATE TABLE operations (
 project_id TEXT NOT NULL, id TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('init','worktree_create','spawn','stop','merge','undo','restore','backup')),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','candidate_created','testing','tests_passed','git_promoted','effect_observed','finalized','failed','abandoned','needs_review')),
 plan_id TEXT, expected_oid TEXT, candidate_oid TEXT, candidate_tree_oid TEXT,
 policy_hash TEXT NOT NULL CHECK(length(policy_hash)=64), profiles_hash TEXT NOT NULL CHECK(length(profiles_hash)=64), environment_hash TEXT,
 authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
 coordinator_epoch INTEGER NOT NULL CHECK(coordinator_epoch BETWEEN 1 AND 9007199254740991),
 fencing_token INTEGER NOT NULL CHECK(fencing_token BETWEEN 1 AND 9007199254740991),
 resource_key TEXT NOT NULL, owner_id TEXT NOT NULL, repository_identity TEXT NOT NULL,
 principal_scope_id TEXT NOT NULL, request_key_hash TEXT NOT NULL CHECK(length(request_key_hash)=64),
 semantic_request_hash TEXT NOT NULL CHECK(length(semantic_request_hash)=64),
 intent_hash TEXT NOT NULL CHECK(length(intent_hash)=64), intent_json TEXT NOT NULL CHECK(json_valid(intent_json)),
 version INTEGER NOT NULL DEFAULT 0 CHECK(version BETWEEN 0 AND 9007199254740991),
 last_observation_id TEXT, created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
 updated_at_ms INTEGER NOT NULL CHECK(updated_at_ms>=created_at_ms),
 PRIMARY KEY(project_id,id), UNIQUE(project_id,plan_id),
 FOREIGN KEY(project_id) REFERENCES projects(id), FOREIGN KEY(project_id,plan_id) REFERENCES plans(project_id,id),
 CHECK((kind IN ('merge','undo','restore') AND phase<>'effect_observed' AND plan_id IS NOT NULL AND expected_oid IS NOT NULL AND candidate_oid IS NOT NULL AND candidate_tree_oid IS NOT NULL AND environment_hash IS NOT NULL)
 OR (kind NOT IN ('merge','undo','restore') AND phase IN ('prepared','effect_observed','finalized','failed','abandoned','needs_review') AND plan_id IS NULL))
) STRICT;
CREATE UNIQUE INDEX one_integration_pipeline_per_project ON operations(project_id)
 WHERE kind IN ('merge','undo','restore') AND phase NOT IN ('finalized','failed','abandoned');

CREATE TABLE operation_observations (
 project_id TEXT NOT NULL, operation_id TEXT NOT NULL, id TEXT NOT NULL,
 kind TEXT NOT NULL, observation_type TEXT NOT NULL,
 authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
 coordinator_epoch INTEGER NOT NULL CHECK(coordinator_epoch>0), fencing_token INTEGER NOT NULL CHECK(fencing_token>0),
 resource_key TEXT NOT NULL, owner_id TEXT NOT NULL,
 body_json TEXT NOT NULL CHECK(json_valid(body_json)), observed_at_ms INTEGER NOT NULL CHECK(observed_at_ms>=0),
 PRIMARY KEY(project_id,id), FOREIGN KEY(project_id,operation_id) REFERENCES operations(project_id,id)
) STRICT;

CREATE TABLE idempotency_keys (
  project_id TEXT NOT NULL,
  stable_principal TEXT NOT NULL,
  command TEXT NOT NULL,
  key_hash TEXT NOT NULL CHECK (length(key_hash) = 64),
  request_hash TEXT NOT NULL CHECK (length(request_hash) = 64),
  operation_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('reserved','applied','failed','unknown')),
  result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (project_id,stable_principal,command,key_hash),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (project_id,operation_id) REFERENCES operations(project_id,id)
) STRICT;

CREATE TABLE artifacts (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
  bytes INTEGER NOT NULL CHECK (bytes >= 0),
  kind TEXT NOT NULL CHECK (kind IN ('diff','test','log','manifest','contract')),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (project_id,id),
  UNIQUE (project_id,relative_path),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;

CREATE TABLE evidence (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  candidate_oid TEXT NOT NULL CHECK (length(candidate_oid) IN (40,64)),
  tree_oid TEXT NOT NULL CHECK (length(tree_oid) IN (40,64)),
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  profiles_hash TEXT NOT NULL CHECK (length(profiles_hash) = 64),
  evidence_sha256 TEXT NOT NULL CHECK (length(evidence_sha256) = 64),
  environment_hash TEXT NOT NULL CHECK(length(environment_hash)=64),
  authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
  verdict TEXT NOT NULL CHECK (verdict IN ('pass','fail','incomplete')),
  body_json TEXT NOT NULL CHECK (json_valid(body_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (project_id,id),
  FOREIGN KEY (project_id,operation_id) REFERENCES operations(project_id,id)
) STRICT;
CREATE TABLE test_runs (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  evidence_id TEXT NOT NULL,
  check_id TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  exit_code INTEGER CHECK (exit_code IS NULL OR exit_code BETWEEN 0 AND 255),
  signal TEXT,
  completed INTEGER NOT NULL CHECK (completed IN (0,1)),
  passed INTEGER NOT NULL CHECK (passed >= 0),
  failed INTEGER NOT NULL CHECK (failed >= 0),
  skipped INTEGER NOT NULL CHECK (skipped >= 0),
  todo INTEGER NOT NULL CHECK (todo >= 0),
  cancelled INTEGER NOT NULL CHECK (cancelled >= 0),
  PRIMARY KEY (project_id,id),
  UNIQUE (project_id,evidence_id,check_id),
  FOREIGN KEY (project_id,evidence_id) REFERENCES evidence(project_id,id),
  FOREIGN KEY (project_id,artifact_id) REFERENCES artifacts(project_id,id),
  CHECK (exit_code IS NULL OR signal IS NULL)
) STRICT;

CREATE TABLE snapshots (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  commit_oid TEXT NOT NULL CHECK (length(commit_oid) IN (40,64)),
  tree_oid TEXT NOT NULL CHECK (length(tree_oid) IN (40,64)),
  parent_oid TEXT CHECK (parent_oid IS NULL OR length(parent_oid) IN (40,64)),
  ref_name TEXT NOT NULL UNIQUE CHECK (ref_name LIKE 'refs/angit/%'),
  kind TEXT NOT NULL CHECK (kind IN ('baseline','integration','undo','restore')),
  verification TEXT NOT NULL CHECK (verification IN ('verified','unverified')),
  evidence_id TEXT,
  policy_hash TEXT NOT NULL CHECK (length(policy_hash) = 64),
  profiles_hash TEXT NOT NULL CHECK(length(profiles_hash)=64),
  environment_hash TEXT,
  authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
  content_epoch INTEGER NOT NULL CHECK (content_epoch BETWEEN 0 AND 9007199254740991),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (project_id,id),
  FOREIGN KEY (project_id,operation_id) REFERENCES operations(project_id,id),
  FOREIGN KEY (project_id,evidence_id) REFERENCES evidence(project_id,id),
  CHECK (verification <> 'verified' OR evidence_id IS NOT NULL),
  CHECK ((kind='baseline' AND verification='unverified' AND parent_oid IS NULL AND evidence_id IS NULL)
      OR (kind<>'baseline' AND parent_oid IS NOT NULL))
) STRICT;
CREATE TRIGGER snapshot_evidence_guard BEFORE INSERT ON snapshots
WHEN NEW.verification='verified' AND NOT EXISTS (
 SELECT 1 FROM evidence e WHERE e.project_id=NEW.project_id AND e.id=NEW.evidence_id
   AND e.operation_id=NEW.operation_id AND e.verdict='pass' AND e.candidate_oid=NEW.commit_oid
   AND e.tree_oid=NEW.tree_oid AND e.policy_hash=NEW.policy_hash
   AND e.profiles_hash=NEW.profiles_hash AND e.environment_hash=NEW.environment_hash
   AND e.authority_incarnation=NEW.authority_incarnation
)
BEGIN SELECT RAISE(ABORT,'SNAPSHOT_EVIDENCE_MISMATCH'); END;
CREATE TRIGGER snapshots_immutable BEFORE UPDATE ON snapshots
BEGIN SELECT RAISE(ABORT,'SNAPSHOT_IMMUTABLE'); END;

CREATE TABLE task_integrations (
  project_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  PRIMARY KEY (project_id,task_id,operation_id),
  FOREIGN KEY (project_id,task_id) REFERENCES tasks(project_id,id),
  FOREIGN KEY (project_id,operation_id) REFERENCES operations(project_id,id),
  FOREIGN KEY (project_id,snapshot_id) REFERENCES snapshots(project_id,id)
) STRICT;
CREATE TRIGGER completed_requires_integration BEFORE UPDATE OF status ON tasks
WHEN NEW.status='completed' AND NOT EXISTS (
 SELECT 1 FROM task_integrations ti
 JOIN snapshots s ON s.project_id=ti.project_id AND s.id=ti.snapshot_id
 JOIN operations o ON o.project_id=ti.project_id AND o.id=ti.operation_id
 WHERE ti.project_id=NEW.project_id AND ti.task_id=NEW.id
   AND s.operation_id=o.id AND s.verification='verified' AND o.phase='finalized'
   AND EXISTS(SELECT 1 FROM plan_sources ps JOIN attempts a ON a.project_id=ps.project_id AND a.id=ps.attempt_id
     WHERE ps.project_id=o.project_id AND ps.plan_id=o.plan_id AND a.task_id=NEW.id)
)
BEGIN SELECT RAISE(ABORT,'COMPLETION_REQUIRES_FINALIZED_VERIFIED_INTEGRATION'); END;

CREATE TABLE events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
  coordinator_epoch INTEGER NOT NULL CHECK (coordinator_epoch BETWEEN 1 AND 9007199254740991),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  FOREIGN KEY (project_id) REFERENCES projects(id)
) STRICT;
CREATE INDEX idx_events_project_cursor ON events(project_id,id);
CREATE TRIGGER events_no_update BEFORE UPDATE ON events
BEGIN SELECT RAISE(ABORT,'EVENT_APPEND_ONLY'); END;
CREATE TRIGGER events_no_delete BEFORE DELETE ON events
BEGIN SELECT RAISE(ABORT,'EVENT_APPEND_ONLY'); END;

CREATE TABLE messages (
  project_id TEXT NOT NULL,
  id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  event_id INTEGER NOT NULL UNIQUE,
  sender_scope TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('progress','contract.updated','dependency.hint','review.requested','submission.hint')),
  payload_json TEXT NOT NULL CHECK (json_valid(payload_json)),
  created_at_ms INTEGER NOT NULL CHECK (created_at_ms >= 0),
  PRIMARY KEY (project_id,id),
  FOREIGN KEY (project_id,task_id) REFERENCES tasks(project_id,id),
  FOREIGN KEY (event_id) REFERENCES events(id)
) STRICT;

CREATE TABLE backup_activations (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, old_incarnation TEXT NOT NULL, new_incarnation TEXT NOT NULL UNIQUE,
 backup_digest TEXT NOT NULL CHECK(length(backup_digest)=64), approval_reference TEXT NOT NULL,
 old_writer_termination_receipt TEXT NOT NULL CHECK(length(old_writer_termination_receipt)=64),
 registry_readback_receipt TEXT NOT NULL CHECK(length(registry_readback_receipt)=64),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','registry_installed','workflow_installed','finalized')),
 CHECK(new_incarnation<>old_incarnation), FOREIGN KEY(project_id) REFERENCES projects(id)
) STRICT;
CREATE TRIGGER project_incarnation_activation BEFORE UPDATE OF authority_incarnation ON projects
WHEN NEW.authority_incarnation<>OLD.authority_incarnation AND (
 NOT EXISTS(SELECT 1 FROM backup_activations a WHERE a.project_id=OLD.id
   AND a.old_incarnation=OLD.authority_incarnation AND a.new_incarnation=NEW.authority_incarnation
   AND a.phase IN ('registry_installed','workflow_installed','finalized'))
 OR EXISTS(SELECT 1 FROM operations o WHERE o.project_id=OLD.id
   AND o.phase NOT IN ('finalized','failed','abandoned'))
 OR EXISTS(SELECT 1 FROM attempts a WHERE a.project_id=OLD.id AND a.ended_at_ms IS NULL)
 OR EXISTS(SELECT 1 FROM leases l WHERE l.project_id=OLD.id AND l.owner_id IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'EXPLICIT_BACKUP_ACTIVATION_REQUIRED'); END;
CREATE TRIGGER project_epoch BEFORE UPDATE OF coordinator_epoch ON projects
WHEN NEW.authority_incarnation=OLD.authority_incarnation AND NEW.coordinator_epoch<>OLD.coordinator_epoch+1
BEGIN SELECT RAISE(ABORT,'COORDINATOR_EPOCH_MUST_ADVANCE_ONCE'); END;
CREATE TRIGGER task_initial_guard BEFORE INSERT ON tasks WHEN NEW.status<>'queued' OR NEW.version<>0 OR NEW.cancel_requested<>0
BEGIN SELECT RAISE(ABORT,'TASK_MUST_START_QUEUED'); END;

CREATE TRIGGER attempt_initial_guard BEFORE INSERT ON attempts WHEN NEW.status<>'reserved' OR NEW.version<>0 OR NEW.ended_at_ms IS NOT NULL OR NEW.submission_oid IS NOT NULL
BEGIN SELECT RAISE(ABORT,'ATTEMPT_MUST_START_RESERVED'); END;

CREATE TRIGGER intent_init BEFORE INSERT ON operations WHEN NEW.kind='init' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('canonicalRepositoryPath','canonicalCommonDir','repositoryIdentity','registrationId','approvedBaseOid','approvedBaseTreeOid','objectFormat','baselineRef','integrationRef','baselineExpectedAbsent','integrationExpectedAbsent','stateSchemaHash','policyHash','profilesHash')) AND (json_type(NEW.intent_json,'$.canonicalRepositoryPath')='text' AND length(json_extract(NEW.intent_json,'$.canonicalRepositoryPath')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.canonicalCommonDir')='text' AND length(json_extract(NEW.intent_json,'$.canonicalCommonDir')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.repositoryIdentity')='text' AND length(json_extract(NEW.intent_json,'$.repositoryIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.repositoryIdentity'))=64 AND json_extract(NEW.intent_json,'$.repositoryIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.registrationId')='text' AND length(json_extract(NEW.intent_json,'$.registrationId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.approvedBaseOid')='text' AND length(json_extract(NEW.intent_json,'$.approvedBaseOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.approvedBaseOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.approvedBaseOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.approvedBaseTreeOid')='text' AND length(json_extract(NEW.intent_json,'$.approvedBaseTreeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.approvedBaseTreeOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.approvedBaseTreeOid') NOT GLOB '*[^0-9a-f]*') AND json_extract(NEW.intent_json,'$.objectFormat') IN ('sha1','sha256') AND (json_type(NEW.intent_json,'$.baselineRef')='text' AND length(json_extract(NEW.intent_json,'$.baselineRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.integrationRef')='text' AND length(json_extract(NEW.intent_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND json_extract(NEW.intent_json,'$.baselineExpectedAbsent')=1 AND json_extract(NEW.intent_json,'$.integrationExpectedAbsent')=1 AND (json_type(NEW.intent_json,'$.stateSchemaHash')='text' AND length(json_extract(NEW.intent_json,'$.stateSchemaHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.stateSchemaHash'))=64 AND json_extract(NEW.intent_json,'$.stateSchemaHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.policyHash')='text' AND length(json_extract(NEW.intent_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.policyHash'))=64 AND json_extract(NEW.intent_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.profilesHash')='text' AND length(json_extract(NEW.intent_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.profilesHash'))=64 AND json_extract(NEW.intent_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*')),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_worktree_create BEFORE INSERT ON operations WHEN NEW.kind='worktree_create' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('attemptId','operationOwnerId','managedParent','canonicalPath','role','branchRef','branchExpectedAbsent','baseOid','baseTreeOid','ownershipMarkerId')) AND ((json_type(NEW.intent_json,'$.attemptId')='text' AND length(json_extract(NEW.intent_json,'$.attemptId')) BETWEEN 1 AND 64) OR json_type(NEW.intent_json,'$.attemptId')='null') AND ((json_type(NEW.intent_json,'$.operationOwnerId')='text' AND length(json_extract(NEW.intent_json,'$.operationOwnerId')) BETWEEN 1 AND 64) OR json_type(NEW.intent_json,'$.operationOwnerId')='null') AND (json_type(NEW.intent_json,'$.managedParent')='text' AND length(json_extract(NEW.intent_json,'$.managedParent')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.canonicalPath')='text' AND length(json_extract(NEW.intent_json,'$.canonicalPath')) BETWEEN 1 AND 4096) AND json_extract(NEW.intent_json,'$.role') IN ('task','candidate') AND ((json_type(NEW.intent_json,'$.branchRef')='text' AND length(json_extract(NEW.intent_json,'$.branchRef')) BETWEEN 1 AND 4096) OR json_type(NEW.intent_json,'$.branchRef')='null') AND (json_extract(NEW.intent_json,'$.branchExpectedAbsent')=1 OR json_type(NEW.intent_json,'$.branchExpectedAbsent')='null') AND (json_type(NEW.intent_json,'$.baseOid')='text' AND length(json_extract(NEW.intent_json,'$.baseOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.baseOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.baseOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.baseTreeOid')='text' AND length(json_extract(NEW.intent_json,'$.baseTreeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.baseTreeOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.baseTreeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.ownershipMarkerId')='text' AND length(json_extract(NEW.intent_json,'$.ownershipMarkerId')) BETWEEN 1 AND 64)),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_spawn BEFORE INSERT ON operations WHEN NEW.kind='spawn' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('attemptId','worktreeId','approvedExecutable','executableHash','runtimeProfileHash','supervisorId','launchIdentity','argumentDigest','requestDigest','cwd','environmentProfileHash','budget')) AND (json_type(NEW.intent_json,'$.attemptId')='text' AND length(json_extract(NEW.intent_json,'$.attemptId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.worktreeId')='text' AND length(json_extract(NEW.intent_json,'$.worktreeId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.approvedExecutable')='text' AND length(json_extract(NEW.intent_json,'$.approvedExecutable')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.executableHash')='text' AND length(json_extract(NEW.intent_json,'$.executableHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.executableHash'))=64 AND json_extract(NEW.intent_json,'$.executableHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.runtimeProfileHash')='text' AND length(json_extract(NEW.intent_json,'$.runtimeProfileHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.runtimeProfileHash'))=64 AND json_extract(NEW.intent_json,'$.runtimeProfileHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.supervisorId')='text' AND length(json_extract(NEW.intent_json,'$.supervisorId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.launchIdentity')='text' AND length(json_extract(NEW.intent_json,'$.launchIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.launchIdentity'))=64 AND json_extract(NEW.intent_json,'$.launchIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.argumentDigest')='text' AND length(json_extract(NEW.intent_json,'$.argumentDigest')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.argumentDigest'))=64 AND json_extract(NEW.intent_json,'$.argumentDigest') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.requestDigest')='text' AND length(json_extract(NEW.intent_json,'$.requestDigest')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.requestDigest'))=64 AND json_extract(NEW.intent_json,'$.requestDigest') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.cwd')='text' AND length(json_extract(NEW.intent_json,'$.cwd')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.environmentProfileHash')='text' AND length(json_extract(NEW.intent_json,'$.environmentProfileHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.environmentProfileHash'))=64 AND json_extract(NEW.intent_json,'$.environmentProfileHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.budget')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.budget') WHERE key NOT IN ('timeoutMs','stdoutBytes','stderrBytes','maxProcesses')) AND (json_type(NEW.intent_json,'$.budget.timeoutMs')='integer' AND json_extract(NEW.intent_json,'$.budget.timeoutMs') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.budget.stdoutBytes')='integer' AND json_extract(NEW.intent_json,'$.budget.stdoutBytes') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.budget.stderrBytes')='integer' AND json_extract(NEW.intent_json,'$.budget.stderrBytes') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.budget.maxProcesses')='integer' AND json_extract(NEW.intent_json,'$.budget.maxProcesses') BETWEEN 1 AND 9007199254740991))),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_stop BEFORE INSERT ON operations WHEN NEW.kind='stop' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('attemptId','targetProcess','stopMode','graceDeadlineMs','finalDeadlineMs')) AND (json_type(NEW.intent_json,'$.attemptId')='text' AND length(json_extract(NEW.intent_json,'$.attemptId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.targetProcess')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.targetProcess') WHERE key NOT IN ('supervisorId','launchIdentity','pid','startIdentity','executableHash','descendantScopeHash')) AND (json_type(NEW.intent_json,'$.targetProcess.supervisorId')='text' AND length(json_extract(NEW.intent_json,'$.targetProcess.supervisorId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.targetProcess.launchIdentity')='text' AND length(json_extract(NEW.intent_json,'$.targetProcess.launchIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.targetProcess.launchIdentity'))=64 AND json_extract(NEW.intent_json,'$.targetProcess.launchIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.targetProcess.pid')='integer' AND json_extract(NEW.intent_json,'$.targetProcess.pid') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.targetProcess.startIdentity')='text' AND length(json_extract(NEW.intent_json,'$.targetProcess.startIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.targetProcess.startIdentity'))=64 AND json_extract(NEW.intent_json,'$.targetProcess.startIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.targetProcess.executableHash')='text' AND length(json_extract(NEW.intent_json,'$.targetProcess.executableHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.targetProcess.executableHash'))=64 AND json_extract(NEW.intent_json,'$.targetProcess.executableHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.targetProcess.descendantScopeHash')='text' AND length(json_extract(NEW.intent_json,'$.targetProcess.descendantScopeHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.targetProcess.descendantScopeHash'))=64 AND json_extract(NEW.intent_json,'$.targetProcess.descendantScopeHash') NOT GLOB '*[^0-9a-f]*')) AND json_extract(NEW.intent_json,'$.stopMode') IN ('graceful_then_force','graceful_only') AND (json_type(NEW.intent_json,'$.graceDeadlineMs')='integer' AND json_extract(NEW.intent_json,'$.graceDeadlineMs') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.finalDeadlineMs')='integer' AND json_extract(NEW.intent_json,'$.finalDeadlineMs') BETWEEN 1 AND 9007199254740991)),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_merge BEFORE INSERT ON operations WHEN NEW.kind='merge' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('planId','planHash','expectedIntegrationOid','candidateOid','candidateTreeOid','sources','integrationRef','candidateRef','snapshotRef','snapshotExpectedAbsent','policyHash','profilesHash','requiredChecks','environmentHash','expectedContentEpoch','nextContentEpoch','taskMembership')) AND (json_type(NEW.intent_json,'$.planId')='text' AND length(json_extract(NEW.intent_json,'$.planId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.planHash')='text' AND length(json_extract(NEW.intent_json,'$.planHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.planHash'))=64 AND json_extract(NEW.intent_json,'$.planHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.expectedIntegrationOid')='text' AND length(json_extract(NEW.intent_json,'$.expectedIntegrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.expectedIntegrationOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.expectedIntegrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.candidateOid')='text' AND length(json_extract(NEW.intent_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.candidateTreeOid')='text' AND length(json_extract(NEW.intent_json,'$.candidateTreeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.candidateTreeOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.candidateTreeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.sources')='array' AND json_array_length(NEW.intent_json,'$.sources') BETWEEN 0 AND 1000) AND (json_type(NEW.intent_json,'$.integrationRef')='text' AND length(json_extract(NEW.intent_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.candidateRef')='text' AND length(json_extract(NEW.intent_json,'$.candidateRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.snapshotRef')='text' AND length(json_extract(NEW.intent_json,'$.snapshotRef')) BETWEEN 1 AND 4096) AND json_extract(NEW.intent_json,'$.snapshotExpectedAbsent')=1 AND (json_type(NEW.intent_json,'$.policyHash')='text' AND length(json_extract(NEW.intent_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.policyHash'))=64 AND json_extract(NEW.intent_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.profilesHash')='text' AND length(json_extract(NEW.intent_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.profilesHash'))=64 AND json_extract(NEW.intent_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.requiredChecks')='array' AND json_array_length(NEW.intent_json,'$.requiredChecks') BETWEEN 1 AND 1000) AND (json_type(NEW.intent_json,'$.environmentHash')='text' AND length(json_extract(NEW.intent_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.environmentHash'))=64 AND json_extract(NEW.intent_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.expectedContentEpoch')='integer' AND json_extract(NEW.intent_json,'$.expectedContentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.nextContentEpoch')='integer' AND json_extract(NEW.intent_json,'$.nextContentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.taskMembership')='array' AND json_array_length(NEW.intent_json,'$.taskMembership') BETWEEN 0 AND 30)),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_undo BEFORE INSERT ON operations WHEN NEW.kind='undo' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('planId','planHash','expectedIntegrationOid','candidateOid','candidateTreeOid','sources','integrationRef','candidateRef','snapshotRef','snapshotExpectedAbsent','policyHash','profilesHash','requiredChecks','environmentHash','expectedContentEpoch','nextContentEpoch','taskMembership','originalBatchOperationId')) AND (json_type(NEW.intent_json,'$.planId')='text' AND length(json_extract(NEW.intent_json,'$.planId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.planHash')='text' AND length(json_extract(NEW.intent_json,'$.planHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.planHash'))=64 AND json_extract(NEW.intent_json,'$.planHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.expectedIntegrationOid')='text' AND length(json_extract(NEW.intent_json,'$.expectedIntegrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.expectedIntegrationOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.expectedIntegrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.candidateOid')='text' AND length(json_extract(NEW.intent_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.candidateTreeOid')='text' AND length(json_extract(NEW.intent_json,'$.candidateTreeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.candidateTreeOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.candidateTreeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.sources')='array' AND json_array_length(NEW.intent_json,'$.sources') BETWEEN 0 AND 1000) AND (json_type(NEW.intent_json,'$.integrationRef')='text' AND length(json_extract(NEW.intent_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.candidateRef')='text' AND length(json_extract(NEW.intent_json,'$.candidateRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.snapshotRef')='text' AND length(json_extract(NEW.intent_json,'$.snapshotRef')) BETWEEN 1 AND 4096) AND json_extract(NEW.intent_json,'$.snapshotExpectedAbsent')=1 AND (json_type(NEW.intent_json,'$.policyHash')='text' AND length(json_extract(NEW.intent_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.policyHash'))=64 AND json_extract(NEW.intent_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.profilesHash')='text' AND length(json_extract(NEW.intent_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.profilesHash'))=64 AND json_extract(NEW.intent_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.requiredChecks')='array' AND json_array_length(NEW.intent_json,'$.requiredChecks') BETWEEN 1 AND 1000) AND (json_type(NEW.intent_json,'$.environmentHash')='text' AND length(json_extract(NEW.intent_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.environmentHash'))=64 AND json_extract(NEW.intent_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.expectedContentEpoch')='integer' AND json_extract(NEW.intent_json,'$.expectedContentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.nextContentEpoch')='integer' AND json_extract(NEW.intent_json,'$.nextContentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.taskMembership')='array' AND json_array_length(NEW.intent_json,'$.taskMembership') BETWEEN 0 AND 30) AND (json_type(NEW.intent_json,'$.originalBatchOperationId')='text' AND length(json_extract(NEW.intent_json,'$.originalBatchOperationId')) BETWEEN 1 AND 64)),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_restore BEFORE INSERT ON operations WHEN NEW.kind='restore' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('planId','planHash','expectedIntegrationOid','candidateOid','candidateTreeOid','sources','integrationRef','candidateRef','snapshotRef','snapshotExpectedAbsent','policyHash','profilesHash','requiredChecks','environmentHash','expectedContentEpoch','nextContentEpoch','taskMembership','targetVerifiedSnapshotId')) AND (json_type(NEW.intent_json,'$.planId')='text' AND length(json_extract(NEW.intent_json,'$.planId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.planHash')='text' AND length(json_extract(NEW.intent_json,'$.planHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.planHash'))=64 AND json_extract(NEW.intent_json,'$.planHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.expectedIntegrationOid')='text' AND length(json_extract(NEW.intent_json,'$.expectedIntegrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.expectedIntegrationOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.expectedIntegrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.candidateOid')='text' AND length(json_extract(NEW.intent_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.candidateTreeOid')='text' AND length(json_extract(NEW.intent_json,'$.candidateTreeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.candidateTreeOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.candidateTreeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.sources')='array' AND json_array_length(NEW.intent_json,'$.sources') BETWEEN 0 AND 1000) AND (json_type(NEW.intent_json,'$.integrationRef')='text' AND length(json_extract(NEW.intent_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.candidateRef')='text' AND length(json_extract(NEW.intent_json,'$.candidateRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.snapshotRef')='text' AND length(json_extract(NEW.intent_json,'$.snapshotRef')) BETWEEN 1 AND 4096) AND json_extract(NEW.intent_json,'$.snapshotExpectedAbsent')=1 AND (json_type(NEW.intent_json,'$.policyHash')='text' AND length(json_extract(NEW.intent_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.policyHash'))=64 AND json_extract(NEW.intent_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.profilesHash')='text' AND length(json_extract(NEW.intent_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.profilesHash'))=64 AND json_extract(NEW.intent_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.requiredChecks')='array' AND json_array_length(NEW.intent_json,'$.requiredChecks') BETWEEN 1 AND 1000) AND (json_type(NEW.intent_json,'$.environmentHash')='text' AND length(json_extract(NEW.intent_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.environmentHash'))=64 AND json_extract(NEW.intent_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.expectedContentEpoch')='integer' AND json_extract(NEW.intent_json,'$.expectedContentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.nextContentEpoch')='integer' AND json_extract(NEW.intent_json,'$.nextContentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.taskMembership')='array' AND json_array_length(NEW.intent_json,'$.taskMembership') BETWEEN 0 AND 30) AND (json_type(NEW.intent_json,'$.targetVerifiedSnapshotId')='text' AND length(json_extract(NEW.intent_json,'$.targetVerifiedSnapshotId')) BETWEEN 1 AND 64)),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER intent_backup BEFORE INSERT ON operations WHEN NEW.kind='backup' AND NOT coalesce((json_type(NEW.intent_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$') WHERE key NOT IN ('approvalReference','quiescentBarrierId','integrationOid','contentEpoch','eventWatermark','lastFinalizedOperationId','requiredMembers','targetPath','targetOwnershipId','manifestSchemaHash','excludedWork')) AND (json_type(NEW.intent_json,'$.approvalReference')='text' AND length(json_extract(NEW.intent_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.quiescentBarrierId')='text' AND length(json_extract(NEW.intent_json,'$.quiescentBarrierId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.integrationOid')='text' AND length(json_extract(NEW.intent_json,'$.integrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.integrationOid')) IN (40,64) AND json_extract(NEW.intent_json,'$.integrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.contentEpoch')='integer' AND json_extract(NEW.intent_json,'$.contentEpoch') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.eventWatermark')='integer' AND json_extract(NEW.intent_json,'$.eventWatermark') BETWEEN 0 AND 9007199254740991) AND (json_type(NEW.intent_json,'$.lastFinalizedOperationId')='text' AND length(json_extract(NEW.intent_json,'$.lastFinalizedOperationId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.requiredMembers')='array' AND json_array_length(NEW.intent_json,'$.requiredMembers') BETWEEN 1 AND 1000) AND (json_type(NEW.intent_json,'$.targetPath')='text' AND length(json_extract(NEW.intent_json,'$.targetPath')) BETWEEN 1 AND 4096) AND (json_type(NEW.intent_json,'$.targetOwnershipId')='text' AND length(json_extract(NEW.intent_json,'$.targetOwnershipId')) BETWEEN 1 AND 64) AND (json_type(NEW.intent_json,'$.manifestSchemaHash')='text' AND length(json_extract(NEW.intent_json,'$.manifestSchemaHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.intent_json,'$.manifestSchemaHash'))=64 AND json_extract(NEW.intent_json,'$.manifestSchemaHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.intent_json,'$.excludedWork')='array' AND json_array_length(NEW.intent_json,'$.excludedWork') BETWEEN 0 AND 1000)),0)
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_INTENT'); END;

CREATE TRIGGER observation_init BEFORE INSERT ON operation_observations WHEN NEW.kind='init' AND NOT ((NEW.observation_type='storage_initialized' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('registrationId','storageSchemaHash')) AND (json_type(NEW.body_json,'$.registrationId')='text' AND length(json_extract(NEW.body_json,'$.registrationId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.storageSchemaHash')='text' AND length(json_extract(NEW.body_json,'$.storageSchemaHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.storageSchemaHash'))=64 AND json_extract(NEW.body_json,'$.storageSchemaHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='refs_initialized' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('baselineRef','baselineOid','integrationRef','integrationOid')) AND (json_type(NEW.body_json,'$.baselineRef')='text' AND length(json_extract(NEW.body_json,'$.baselineRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.baselineOid')='text' AND length(json_extract(NEW.body_json,'$.baselineOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.baselineOid')) IN (40,64) AND json_extract(NEW.body_json,'$.baselineOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.integrationRef')='text' AND length(json_extract(NEW.body_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.integrationOid')='text' AND length(json_extract(NEW.body_json,'$.integrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.integrationOid')) IN (40,64) AND json_extract(NEW.body_json,'$.integrationOid') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='effect_complete' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('registeredRepositoryIdentity','registrationId','storageSchemaHash','baselineRef','baselineOid','integrationRef','integrationOid')) AND (json_type(NEW.body_json,'$.registeredRepositoryIdentity')='text' AND length(json_extract(NEW.body_json,'$.registeredRepositoryIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.registeredRepositoryIdentity'))=64 AND json_extract(NEW.body_json,'$.registeredRepositoryIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.registrationId')='text' AND length(json_extract(NEW.body_json,'$.registrationId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.storageSchemaHash')='text' AND length(json_extract(NEW.body_json,'$.storageSchemaHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.storageSchemaHash'))=64 AND json_extract(NEW.body_json,'$.storageSchemaHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.baselineRef')='text' AND length(json_extract(NEW.body_json,'$.baselineRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.baselineOid')='text' AND length(json_extract(NEW.body_json,'$.baselineOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.baselineOid')) IN (40,64) AND json_extract(NEW.body_json,'$.baselineOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.integrationRef')='text' AND length(json_extract(NEW.body_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.integrationOid')='text' AND length(json_extract(NEW.body_json,'$.integrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.integrationOid')) IN (40,64) AND json_extract(NEW.body_json,'$.integrationOid') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','effect_observed','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_worktree_create BEFORE INSERT ON operation_observations WHEN NEW.kind='worktree_create' AND NOT ((NEW.observation_type='path_allocated' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('canonicalPath','ownershipMarkerId')) AND (json_type(NEW.body_json,'$.canonicalPath')='text' AND length(json_extract(NEW.body_json,'$.canonicalPath')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.ownershipMarkerId')='text' AND length(json_extract(NEW.body_json,'$.ownershipMarkerId')) BETWEEN 1 AND 64)),0)) OR (NEW.observation_type='effect_complete' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('canonicalPath','ownershipMarkerId','baseOid','baseTreeOid','branchRef','role')) AND (json_type(NEW.body_json,'$.canonicalPath')='text' AND length(json_extract(NEW.body_json,'$.canonicalPath')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.ownershipMarkerId')='text' AND length(json_extract(NEW.body_json,'$.ownershipMarkerId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.baseOid')='text' AND length(json_extract(NEW.body_json,'$.baseOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.baseOid')) IN (40,64) AND json_extract(NEW.body_json,'$.baseOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.baseTreeOid')='text' AND length(json_extract(NEW.body_json,'$.baseTreeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.baseTreeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.baseTreeOid') NOT GLOB '*[^0-9a-f]*') AND ((json_type(NEW.body_json,'$.branchRef')='text' AND length(json_extract(NEW.body_json,'$.branchRef')) BETWEEN 1 AND 4096) OR json_type(NEW.body_json,'$.branchRef')='null') AND json_extract(NEW.body_json,'$.role') IN ('task','candidate')),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','effect_observed','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_spawn BEFORE INSERT ON operation_observations WHEN NEW.kind='spawn' AND NOT ((NEW.observation_type='process_start' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('process','observedStartAtMs')) AND (json_type(NEW.body_json,'$.process')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$.process') WHERE key NOT IN ('supervisorId','launchIdentity','pid','startIdentity','executableHash','descendantScopeHash')) AND (json_type(NEW.body_json,'$.process.supervisorId')='text' AND length(json_extract(NEW.body_json,'$.process.supervisorId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.process.launchIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.launchIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.launchIdentity'))=64 AND json_extract(NEW.body_json,'$.process.launchIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.pid')='integer' AND json_extract(NEW.body_json,'$.process.pid') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.body_json,'$.process.startIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.startIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.startIdentity'))=64 AND json_extract(NEW.body_json,'$.process.startIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.executableHash')='text' AND length(json_extract(NEW.body_json,'$.process.executableHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.executableHash'))=64 AND json_extract(NEW.body_json,'$.process.executableHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.descendantScopeHash')='text' AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash'))=64 AND json_extract(NEW.body_json,'$.process.descendantScopeHash') NOT GLOB '*[^0-9a-f]*')) AND (json_type(NEW.body_json,'$.observedStartAtMs')='integer' AND json_extract(NEW.body_json,'$.observedStartAtMs') BETWEEN 0 AND 9007199254740991)),0)) OR (NEW.observation_type='effect_complete' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('process','observedStartAtMs','startAndExitReceiptHash')) AND (json_type(NEW.body_json,'$.process')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$.process') WHERE key NOT IN ('supervisorId','launchIdentity','pid','startIdentity','executableHash','descendantScopeHash')) AND (json_type(NEW.body_json,'$.process.supervisorId')='text' AND length(json_extract(NEW.body_json,'$.process.supervisorId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.process.launchIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.launchIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.launchIdentity'))=64 AND json_extract(NEW.body_json,'$.process.launchIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.pid')='integer' AND json_extract(NEW.body_json,'$.process.pid') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.body_json,'$.process.startIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.startIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.startIdentity'))=64 AND json_extract(NEW.body_json,'$.process.startIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.executableHash')='text' AND length(json_extract(NEW.body_json,'$.process.executableHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.executableHash'))=64 AND json_extract(NEW.body_json,'$.process.executableHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.descendantScopeHash')='text' AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash'))=64 AND json_extract(NEW.body_json,'$.process.descendantScopeHash') NOT GLOB '*[^0-9a-f]*')) AND (json_type(NEW.body_json,'$.observedStartAtMs')='integer' AND json_extract(NEW.body_json,'$.observedStartAtMs') BETWEEN 0 AND 9007199254740991) AND ((json_type(NEW.body_json,'$.startAndExitReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.startAndExitReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.startAndExitReceiptHash'))=64 AND json_extract(NEW.body_json,'$.startAndExitReceiptHash') NOT GLOB '*[^0-9a-f]*') OR json_type(NEW.body_json,'$.startAndExitReceiptHash')='null')),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','effect_observed','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_stop BEFORE INSERT ON operation_observations WHEN NEW.kind='stop' AND NOT ((NEW.observation_type='stop_requested' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('process','requestedAtMs')) AND (json_type(NEW.body_json,'$.process')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$.process') WHERE key NOT IN ('supervisorId','launchIdentity','pid','startIdentity','executableHash','descendantScopeHash')) AND (json_type(NEW.body_json,'$.process.supervisorId')='text' AND length(json_extract(NEW.body_json,'$.process.supervisorId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.process.launchIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.launchIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.launchIdentity'))=64 AND json_extract(NEW.body_json,'$.process.launchIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.pid')='integer' AND json_extract(NEW.body_json,'$.process.pid') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.body_json,'$.process.startIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.startIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.startIdentity'))=64 AND json_extract(NEW.body_json,'$.process.startIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.executableHash')='text' AND length(json_extract(NEW.body_json,'$.process.executableHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.executableHash'))=64 AND json_extract(NEW.body_json,'$.process.executableHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.descendantScopeHash')='text' AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash'))=64 AND json_extract(NEW.body_json,'$.process.descendantScopeHash') NOT GLOB '*[^0-9a-f]*')) AND (json_type(NEW.body_json,'$.requestedAtMs')='integer' AND json_extract(NEW.body_json,'$.requestedAtMs') BETWEEN 0 AND 9007199254740991)),0)) OR (NEW.observation_type='effect_complete' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('process','writerTreeTerminated','terminationReceiptHash')) AND (json_type(NEW.body_json,'$.process')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$.process') WHERE key NOT IN ('supervisorId','launchIdentity','pid','startIdentity','executableHash','descendantScopeHash')) AND (json_type(NEW.body_json,'$.process.supervisorId')='text' AND length(json_extract(NEW.body_json,'$.process.supervisorId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.process.launchIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.launchIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.launchIdentity'))=64 AND json_extract(NEW.body_json,'$.process.launchIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.pid')='integer' AND json_extract(NEW.body_json,'$.process.pid') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.body_json,'$.process.startIdentity')='text' AND length(json_extract(NEW.body_json,'$.process.startIdentity')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.startIdentity'))=64 AND json_extract(NEW.body_json,'$.process.startIdentity') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.executableHash')='text' AND length(json_extract(NEW.body_json,'$.process.executableHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.executableHash'))=64 AND json_extract(NEW.body_json,'$.process.executableHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.process.descendantScopeHash')='text' AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.process.descendantScopeHash'))=64 AND json_extract(NEW.body_json,'$.process.descendantScopeHash') NOT GLOB '*[^0-9a-f]*')) AND json_extract(NEW.body_json,'$.writerTreeTerminated')=1 AND (json_type(NEW.body_json,'$.terminationReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.terminationReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.terminationReceiptHash'))=64 AND json_extract(NEW.body_json,'$.terminationReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','effect_observed','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_backup BEFORE INSERT ON operation_observations WHEN NEW.kind='backup' AND NOT ((NEW.observation_type='member_written' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('member')) AND (json_type(NEW.body_json,'$.member')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$.member') WHERE key NOT IN ('kind','identity','sha256','bytes')) AND json_extract(NEW.body_json,'$.member.kind') IN ('database','schema','ref','object','artifact') AND (json_type(NEW.body_json,'$.member.identity')='text' AND length(json_extract(NEW.body_json,'$.member.identity')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.member.sha256')='text' AND length(json_extract(NEW.body_json,'$.member.sha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.member.sha256'))=64 AND json_extract(NEW.body_json,'$.member.sha256') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.member.bytes')='integer' AND json_extract(NEW.body_json,'$.member.bytes') BETWEEN 0 AND 9007199254740991))),0)) OR (NEW.observation_type='effect_complete' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('manifestSha256','manifestBytes','members','allMembersDurableAndVerified','barrierId')) AND (json_type(NEW.body_json,'$.manifestSha256')='text' AND length(json_extract(NEW.body_json,'$.manifestSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.manifestSha256'))=64 AND json_extract(NEW.body_json,'$.manifestSha256') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.manifestBytes')='integer' AND json_extract(NEW.body_json,'$.manifestBytes') BETWEEN 1 AND 9007199254740991) AND (json_type(NEW.body_json,'$.members')='array' AND json_array_length(NEW.body_json,'$.members') BETWEEN 1 AND 1000) AND json_extract(NEW.body_json,'$.allMembersDurableAndVerified')=1 AND (json_type(NEW.body_json,'$.barrierId')='text' AND length(json_extract(NEW.body_json,'$.barrierId')) BETWEEN 1 AND 64)),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','effect_observed','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_merge BEFORE INSERT ON operation_observations WHEN NEW.kind='merge' AND NOT ((NEW.observation_type='candidate_pinned' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('candidateOid','treeOid','candidateRef')) AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.treeOid')='text' AND length(json_extract(NEW.body_json,'$.treeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.treeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.treeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.candidateRef')='text' AND length(json_extract(NEW.body_json,'$.candidateRef')) BETWEEN 1 AND 4096)),0)) OR (NEW.observation_type='testing_started' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('candidateOid','environmentHash')) AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.environmentHash')='text' AND length(json_extract(NEW.body_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.environmentHash'))=64 AND json_extract(NEW.body_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='acceptance' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('evidenceId','evidenceSha256','candidateOid','treeOid','policyHash','profilesHash','environmentHash','requiredChecks','checks','artifacts')) AND (json_type(NEW.body_json,'$.evidenceId')='text' AND length(json_extract(NEW.body_json,'$.evidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.evidenceSha256')='text' AND length(json_extract(NEW.body_json,'$.evidenceSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.evidenceSha256'))=64 AND json_extract(NEW.body_json,'$.evidenceSha256') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.treeOid')='text' AND length(json_extract(NEW.body_json,'$.treeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.treeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.treeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.policyHash')='text' AND length(json_extract(NEW.body_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.policyHash'))=64 AND json_extract(NEW.body_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.profilesHash')='text' AND length(json_extract(NEW.body_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.profilesHash'))=64 AND json_extract(NEW.body_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.environmentHash')='text' AND length(json_extract(NEW.body_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.environmentHash'))=64 AND json_extract(NEW.body_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.requiredChecks')='array' AND json_array_length(NEW.body_json,'$.requiredChecks') BETWEEN 1 AND 1000) AND (json_type(NEW.body_json,'$.checks')='array' AND json_array_length(NEW.body_json,'$.checks') BETWEEN 1 AND 30) AND (json_type(NEW.body_json,'$.artifacts')='array' AND json_array_length(NEW.body_json,'$.artifacts') BETWEEN 1 AND 1000)),0)) OR (NEW.observation_type='promotion' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('integrationRef','integrationOid','snapshotRef','snapshotOid','acceptanceEvidenceId','acceptanceEvidenceSha256')) AND (json_type(NEW.body_json,'$.integrationRef')='text' AND length(json_extract(NEW.body_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.integrationOid')='text' AND length(json_extract(NEW.body_json,'$.integrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.integrationOid')) IN (40,64) AND json_extract(NEW.body_json,'$.integrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.snapshotRef')='text' AND length(json_extract(NEW.body_json,'$.snapshotRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.snapshotOid')='text' AND length(json_extract(NEW.body_json,'$.snapshotOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.snapshotOid')) IN (40,64) AND json_extract(NEW.body_json,'$.snapshotOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.acceptanceEvidenceId')='text' AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.acceptanceEvidenceSha256')='text' AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceSha256'))=64 AND json_extract(NEW.body_json,'$.acceptanceEvidenceSha256') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='finalization' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('snapshotId','evidenceId','eventId')) AND (json_type(NEW.body_json,'$.snapshotId')='text' AND length(json_extract(NEW.body_json,'$.snapshotId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.evidenceId')='text' AND length(json_extract(NEW.body_json,'$.evidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.eventId')='integer' AND json_extract(NEW.body_json,'$.eventId') BETWEEN 1 AND 9007199254740991)),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','candidate_created','testing','tests_passed','git_promoted','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_undo BEFORE INSERT ON operation_observations WHEN NEW.kind='undo' AND NOT ((NEW.observation_type='candidate_pinned' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('candidateOid','treeOid','candidateRef')) AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.treeOid')='text' AND length(json_extract(NEW.body_json,'$.treeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.treeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.treeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.candidateRef')='text' AND length(json_extract(NEW.body_json,'$.candidateRef')) BETWEEN 1 AND 4096)),0)) OR (NEW.observation_type='testing_started' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('candidateOid','environmentHash')) AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.environmentHash')='text' AND length(json_extract(NEW.body_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.environmentHash'))=64 AND json_extract(NEW.body_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='acceptance' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('evidenceId','evidenceSha256','candidateOid','treeOid','policyHash','profilesHash','environmentHash','requiredChecks','checks','artifacts')) AND (json_type(NEW.body_json,'$.evidenceId')='text' AND length(json_extract(NEW.body_json,'$.evidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.evidenceSha256')='text' AND length(json_extract(NEW.body_json,'$.evidenceSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.evidenceSha256'))=64 AND json_extract(NEW.body_json,'$.evidenceSha256') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.treeOid')='text' AND length(json_extract(NEW.body_json,'$.treeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.treeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.treeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.policyHash')='text' AND length(json_extract(NEW.body_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.policyHash'))=64 AND json_extract(NEW.body_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.profilesHash')='text' AND length(json_extract(NEW.body_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.profilesHash'))=64 AND json_extract(NEW.body_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.environmentHash')='text' AND length(json_extract(NEW.body_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.environmentHash'))=64 AND json_extract(NEW.body_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.requiredChecks')='array' AND json_array_length(NEW.body_json,'$.requiredChecks') BETWEEN 1 AND 1000) AND (json_type(NEW.body_json,'$.checks')='array' AND json_array_length(NEW.body_json,'$.checks') BETWEEN 1 AND 30) AND (json_type(NEW.body_json,'$.artifacts')='array' AND json_array_length(NEW.body_json,'$.artifacts') BETWEEN 1 AND 1000)),0)) OR (NEW.observation_type='promotion' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('integrationRef','integrationOid','snapshotRef','snapshotOid','acceptanceEvidenceId','acceptanceEvidenceSha256')) AND (json_type(NEW.body_json,'$.integrationRef')='text' AND length(json_extract(NEW.body_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.integrationOid')='text' AND length(json_extract(NEW.body_json,'$.integrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.integrationOid')) IN (40,64) AND json_extract(NEW.body_json,'$.integrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.snapshotRef')='text' AND length(json_extract(NEW.body_json,'$.snapshotRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.snapshotOid')='text' AND length(json_extract(NEW.body_json,'$.snapshotOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.snapshotOid')) IN (40,64) AND json_extract(NEW.body_json,'$.snapshotOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.acceptanceEvidenceId')='text' AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.acceptanceEvidenceSha256')='text' AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceSha256'))=64 AND json_extract(NEW.body_json,'$.acceptanceEvidenceSha256') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='finalization' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('snapshotId','evidenceId','eventId')) AND (json_type(NEW.body_json,'$.snapshotId')='text' AND length(json_extract(NEW.body_json,'$.snapshotId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.evidenceId')='text' AND length(json_extract(NEW.body_json,'$.evidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.eventId')='integer' AND json_extract(NEW.body_json,'$.eventId') BETWEEN 1 AND 9007199254740991)),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','candidate_created','testing','tests_passed','git_promoted','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER observation_restore BEFORE INSERT ON operation_observations WHEN NEW.kind='restore' AND NOT ((NEW.observation_type='candidate_pinned' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('candidateOid','treeOid','candidateRef')) AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.treeOid')='text' AND length(json_extract(NEW.body_json,'$.treeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.treeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.treeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.candidateRef')='text' AND length(json_extract(NEW.body_json,'$.candidateRef')) BETWEEN 1 AND 4096)),0)) OR (NEW.observation_type='testing_started' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('candidateOid','environmentHash')) AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.environmentHash')='text' AND length(json_extract(NEW.body_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.environmentHash'))=64 AND json_extract(NEW.body_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='acceptance' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('evidenceId','evidenceSha256','candidateOid','treeOid','policyHash','profilesHash','environmentHash','requiredChecks','checks','artifacts')) AND (json_type(NEW.body_json,'$.evidenceId')='text' AND length(json_extract(NEW.body_json,'$.evidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.evidenceSha256')='text' AND length(json_extract(NEW.body_json,'$.evidenceSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.evidenceSha256'))=64 AND json_extract(NEW.body_json,'$.evidenceSha256') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.candidateOid')='text' AND length(json_extract(NEW.body_json,'$.candidateOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.candidateOid')) IN (40,64) AND json_extract(NEW.body_json,'$.candidateOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.treeOid')='text' AND length(json_extract(NEW.body_json,'$.treeOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.treeOid')) IN (40,64) AND json_extract(NEW.body_json,'$.treeOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.policyHash')='text' AND length(json_extract(NEW.body_json,'$.policyHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.policyHash'))=64 AND json_extract(NEW.body_json,'$.policyHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.profilesHash')='text' AND length(json_extract(NEW.body_json,'$.profilesHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.profilesHash'))=64 AND json_extract(NEW.body_json,'$.profilesHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.environmentHash')='text' AND length(json_extract(NEW.body_json,'$.environmentHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.environmentHash'))=64 AND json_extract(NEW.body_json,'$.environmentHash') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.requiredChecks')='array' AND json_array_length(NEW.body_json,'$.requiredChecks') BETWEEN 1 AND 1000) AND (json_type(NEW.body_json,'$.checks')='array' AND json_array_length(NEW.body_json,'$.checks') BETWEEN 1 AND 30) AND (json_type(NEW.body_json,'$.artifacts')='array' AND json_array_length(NEW.body_json,'$.artifacts') BETWEEN 1 AND 1000)),0)) OR (NEW.observation_type='promotion' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('integrationRef','integrationOid','snapshotRef','snapshotOid','acceptanceEvidenceId','acceptanceEvidenceSha256')) AND (json_type(NEW.body_json,'$.integrationRef')='text' AND length(json_extract(NEW.body_json,'$.integrationRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.integrationOid')='text' AND length(json_extract(NEW.body_json,'$.integrationOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.integrationOid')) IN (40,64) AND json_extract(NEW.body_json,'$.integrationOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.snapshotRef')='text' AND length(json_extract(NEW.body_json,'$.snapshotRef')) BETWEEN 1 AND 4096) AND (json_type(NEW.body_json,'$.snapshotOid')='text' AND length(json_extract(NEW.body_json,'$.snapshotOid')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.snapshotOid')) IN (40,64) AND json_extract(NEW.body_json,'$.snapshotOid') NOT GLOB '*[^0-9a-f]*') AND (json_type(NEW.body_json,'$.acceptanceEvidenceId')='text' AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.acceptanceEvidenceSha256')='text' AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceSha256')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.acceptanceEvidenceSha256'))=64 AND json_extract(NEW.body_json,'$.acceptanceEvidenceSha256') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='finalization' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('snapshotId','evidenceId','eventId')) AND (json_type(NEW.body_json,'$.snapshotId')='text' AND length(json_extract(NEW.body_json,'$.snapshotId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.evidenceId')='text' AND length(json_extract(NEW.body_json,'$.evidenceId')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.eventId')='integer' AND json_extract(NEW.body_json,'$.eventId') BETWEEN 1 AND 9007199254740991)),0)) OR (NEW.observation_type='safe_failure' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('reasonCode','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='abandonment' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('approvalReference','noUnresolvedEffect','proofReceiptHash')) AND (json_type(NEW.body_json,'$.approvalReference')='text' AND length(json_extract(NEW.body_json,'$.approvalReference')) BETWEEN 1 AND 4096) AND json_extract(NEW.body_json,'$.noUnresolvedEffect')=1 AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)) OR (NEW.observation_type='reconciliation' AND coalesce((json_type(NEW.body_json,'$')='object' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$') WHERE key NOT IN ('resumePhase','reasonCode','proofReceiptHash')) AND json_extract(NEW.body_json,'$.resumePhase') IN ('prepared','candidate_created','testing','tests_passed','git_promoted','finalized') AND (json_type(NEW.body_json,'$.reasonCode')='text' AND length(json_extract(NEW.body_json,'$.reasonCode')) BETWEEN 1 AND 64) AND (json_type(NEW.body_json,'$.proofReceiptHash')='text' AND length(json_extract(NEW.body_json,'$.proofReceiptHash')) BETWEEN 1 AND 4096 AND length(json_extract(NEW.body_json,'$.proofReceiptHash'))=64 AND json_extract(NEW.body_json,'$.proofReceiptHash') NOT GLOB '*[^0-9a-f]*')),0)))
BEGIN SELECT RAISE(ABORT,'INVALID_TYPED_OBSERVATION'); END;

CREATE TRIGGER operations_authority BEFORE INSERT ON operations WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN leases l ON l.project_id=p.id WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation AND p.coordinator_epoch=NEW.coordinator_epoch AND l.resource_key=NEW.resource_key AND l.authority_incarnation=NEW.authority_incarnation AND l.coordinator_epoch=NEW.coordinator_epoch AND l.fencing_token=NEW.fencing_token AND l.owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'STALE_AUTHORITY_TUPLE'); END;

CREATE TRIGGER attempts_authority BEFORE INSERT ON attempts WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN leases l ON l.project_id=p.id WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation AND p.coordinator_epoch=NEW.coordinator_epoch AND l.resource_key=NEW.resource_key AND l.authority_incarnation=NEW.authority_incarnation AND l.coordinator_epoch=NEW.coordinator_epoch AND l.fencing_token=NEW.fencing_token AND l.owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'STALE_AUTHORITY_TUPLE'); END;

CREATE TRIGGER operation_observations_authority BEFORE INSERT ON operation_observations WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN leases l ON l.project_id=p.id WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation AND p.coordinator_epoch=NEW.coordinator_epoch AND l.resource_key=NEW.resource_key AND l.authority_incarnation=NEW.authority_incarnation AND l.coordinator_epoch=NEW.coordinator_epoch AND l.fencing_token=NEW.fencing_token AND l.owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'STALE_AUTHORITY_TUPLE'); END;

CREATE TRIGGER operation_initial BEFORE INSERT ON operations WHEN NEW.phase<>'prepared' OR NEW.version<>0 OR NEW.last_observation_id IS NOT NULL
BEGIN SELECT RAISE(ABORT,'OPERATION_MUST_START_PREPARED'); END;

CREATE TRIGGER operation_immutable BEFORE UPDATE ON operations WHEN NEW.project_id IS NOT OLD.project_id OR NEW.id IS NOT OLD.id OR NEW.kind IS NOT OLD.kind OR NEW.plan_id IS NOT OLD.plan_id OR NEW.expected_oid IS NOT OLD.expected_oid OR NEW.candidate_oid IS NOT OLD.candidate_oid OR NEW.candidate_tree_oid IS NOT OLD.candidate_tree_oid OR NEW.policy_hash IS NOT OLD.policy_hash OR NEW.profiles_hash IS NOT OLD.profiles_hash OR NEW.environment_hash IS NOT OLD.environment_hash OR NEW.authority_incarnation IS NOT OLD.authority_incarnation OR NEW.coordinator_epoch IS NOT OLD.coordinator_epoch OR NEW.fencing_token IS NOT OLD.fencing_token OR NEW.resource_key IS NOT OLD.resource_key OR NEW.owner_id IS NOT OLD.owner_id OR NEW.repository_identity IS NOT OLD.repository_identity OR NEW.principal_scope_id IS NOT OLD.principal_scope_id OR NEW.request_key_hash IS NOT OLD.request_key_hash OR NEW.semantic_request_hash IS NOT OLD.semantic_request_hash OR NEW.intent_hash IS NOT OLD.intent_hash OR NEW.intent_json IS NOT OLD.intent_json OR NEW.created_at_ms IS NOT OLD.created_at_ms
BEGIN SELECT RAISE(ABORT,'OPERATION_INTENT_IMMUTABLE'); END;

CREATE TRIGGER operation_version BEFORE UPDATE ON operations WHEN NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'OPERATION_VERSION_MUST_INCREMENT'); END;

CREATE TRIGGER operation_update_authority BEFORE UPDATE ON operations WHEN NOT EXISTS(
 SELECT 1 FROM projects p JOIN leases l ON l.project_id=p.id
 JOIN operation_observations x ON x.project_id=p.id AND x.operation_id=NEW.id
   AND x.id=NEW.last_observation_id
 WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation
   AND x.authority_incarnation=p.authority_incarnation AND x.coordinator_epoch=p.coordinator_epoch
   AND x.resource_key=NEW.resource_key AND l.resource_key=x.resource_key
   AND l.authority_incarnation=x.authority_incarnation AND l.coordinator_epoch=x.coordinator_epoch
   AND l.fencing_token=x.fencing_token AND l.owner_id=x.owner_id)
BEGIN SELECT RAISE(ABORT,'STALE_EXECUTION_GRANT'); END;

CREATE TRIGGER plans_retain BEFORE DELETE ON plans WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER plan_sources_immutable BEFORE UPDATE ON plan_sources WHEN 1
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;

CREATE TRIGGER plan_sources_retain BEFORE DELETE ON plan_sources WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER evidence_immutable BEFORE UPDATE ON evidence WHEN 1
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;

CREATE TRIGGER evidence_retain BEFORE DELETE ON evidence WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER snapshots_retain BEFORE DELETE ON snapshots WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER task_integrations_immutable BEFORE UPDATE ON task_integrations WHEN 1
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;

CREATE TRIGGER task_integrations_retain BEFORE DELETE ON task_integrations WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER operation_observations_immutable BEFORE UPDATE ON operation_observations WHEN 1
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;

CREATE TRIGGER operation_observations_retain BEFORE DELETE ON operation_observations WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER idempotency_keys_retain BEFORE DELETE ON idempotency_keys WHEN 1
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;

CREATE TRIGGER idempotency_identity BEFORE UPDATE ON idempotency_keys WHEN NEW.project_id IS NOT OLD.project_id OR NEW.stable_principal IS NOT OLD.stable_principal OR NEW.command IS NOT OLD.command OR NEW.key_hash IS NOT OLD.key_hash OR NEW.request_hash IS NOT OLD.request_hash OR (OLD.operation_id IS NOT NULL AND NEW.operation_id IS NOT OLD.operation_id)
BEGIN SELECT RAISE(ABORT,'IDEMPOTENCY_CONFLICT'); END;

CREATE TRIGGER attempt_identity BEFORE UPDATE ON attempts WHEN NEW.project_id IS NOT OLD.project_id OR NEW.id IS NOT OLD.id OR NEW.task_id IS NOT OLD.task_id OR NEW.number IS NOT OLD.number OR NEW.base_oid IS NOT OLD.base_oid OR NEW.base_epoch IS NOT OLD.base_epoch OR NEW.authority_incarnation IS NOT OLD.authority_incarnation OR NEW.coordinator_epoch IS NOT OLD.coordinator_epoch OR NEW.fencing_token IS NOT OLD.fencing_token OR NEW.resource_key IS NOT OLD.resource_key OR NEW.owner_id IS NOT OLD.owner_id OR NEW.runtime_profile_hash IS NOT OLD.runtime_profile_hash OR (OLD.process_identity IS NOT NULL AND NEW.process_identity IS NOT OLD.process_identity) OR (OLD.started_at_ms IS NOT NULL AND NEW.started_at_ms IS NOT OLD.started_at_ms) OR (OLD.spawn_intent_id IS NOT NULL AND NEW.spawn_intent_id IS NOT OLD.spawn_intent_id)
BEGIN SELECT RAISE(ABORT,'ATTEMPT_IDENTITY_IMMUTABLE'); END;

CREATE TRIGGER attempt_version BEFORE UPDATE ON attempts WHEN NEW.version<>OLD.version+1
BEGIN SELECT RAISE(ABORT,'ATTEMPT_VERSION_MUST_INCREMENT'); END;

CREATE TRIGGER attempt_transition BEFORE UPDATE ON attempts WHEN OLD.status IN ('submitted','failed','cancelled') OR (NEW.status<>OLD.status AND NOT ((OLD.status='reserved' AND NEW.status IN ('starting','failed','cancelled','orphaned')) OR (OLD.status='starting' AND NEW.status IN ('running','stopping','failed','cancelled','orphaned')) OR (OLD.status='running' AND NEW.status IN ('stopping','submitted','failed','cancelled','orphaned')) OR (OLD.status='stopping' AND NEW.status IN ('cancelled','failed','orphaned')) OR (OLD.status='orphaned' AND NEW.status IN ('running','stopping','submitted','failed','cancelled'))))
BEGIN SELECT RAISE(ABORT,'INVALID_ATTEMPT_TRANSITION'); END;

CREATE TRIGGER attempt_live_incarnation BEFORE UPDATE ON attempts WHEN NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation)
BEGIN SELECT RAISE(ABORT,'STALE_AUTHORITY_INCARNATION'); END;

CREATE TRIGGER attempt_spawn_intent BEFORE UPDATE ON attempts WHEN NEW.status='starting' AND NOT EXISTS(SELECT 1 FROM operations o WHERE o.project_id=NEW.project_id AND o.id=NEW.spawn_intent_id AND o.kind='spawn' AND json_extract(o.intent_json,'$.attemptId')=NEW.id)
BEGIN SELECT RAISE(ABORT,'SPAWN_INTENT_REQUIRED'); END;

CREATE TRIGGER review_submission BEFORE UPDATE ON tasks WHEN OLD.status='needs_review' AND NEW.status='submitted' AND NOT EXISTS(SELECT 1 FROM attempts a WHERE a.project_id=NEW.project_id AND a.task_id=NEW.id AND a.status='submitted' AND a.ended_at_ms IS NOT NULL AND a.submission_oid IS NOT NULL)
BEGIN SELECT RAISE(ABORT,'PINNED_TERMINATED_SUBMISSION_REQUIRED'); END;

CREATE TRIGGER plan_source_pin BEFORE INSERT ON plan_sources WHEN NOT EXISTS(SELECT 1 FROM attempts a WHERE a.project_id=NEW.project_id AND a.id=NEW.attempt_id AND a.status='submitted' AND a.submission_oid=NEW.submission_oid)
BEGIN SELECT RAISE(ABORT,'INVALID_PLAN_SOURCE_PIN'); END;

CREATE TRIGGER plan_current_authority BEFORE INSERT ON plans WHEN NOT EXISTS(SELECT 1 FROM projects p JOIN leases l ON l.project_id=p.id WHERE p.id=NEW.project_id AND p.authority_incarnation=NEW.authority_incarnation AND p.coordinator_epoch=NEW.coordinator_epoch AND l.resource_key=NEW.resource_key AND l.authority_incarnation=NEW.authority_incarnation AND l.coordinator_epoch=NEW.coordinator_epoch AND l.fencing_token=NEW.fencing_token AND l.owner_id=NEW.owner_id)
BEGIN SELECT RAISE(ABORT,'STALE_PLAN_AUTHORITY'); END;

CREATE TRIGGER operation_plan_binding BEFORE INSERT ON operations WHEN NEW.kind IN ('merge','undo','restore') AND NOT EXISTS(
 SELECT 1 FROM plans p WHERE p.project_id=NEW.project_id AND p.id=NEW.plan_id
   AND p.id=json_extract(NEW.intent_json,'$.planId') AND p.operation_id=NEW.id AND p.kind=NEW.kind
   AND p.authority_incarnation=NEW.authority_incarnation AND p.verdict='ready'
   AND p.candidate_oid=NEW.candidate_oid AND p.candidate_tree_oid=NEW.candidate_tree_oid
   AND p.expected_oid=NEW.expected_oid AND p.policy_hash=NEW.policy_hash
   AND p.profiles_hash=NEW.profiles_hash AND p.environment_hash=NEW.environment_hash
   AND p.plan_hash=json_extract(NEW.intent_json,'$.planHash')
   AND p.expected_content_epoch=json_extract(NEW.intent_json,'$.expectedContentEpoch'))
BEGIN SELECT RAISE(ABORT,'PLAN_OPERATION_MISMATCH'); END;

CREATE TRIGGER observation_operation_binding BEFORE INSERT ON operation_observations WHEN NOT EXISTS(SELECT 1 FROM operations o WHERE o.project_id=NEW.project_id AND o.id=NEW.operation_id AND o.kind=NEW.kind AND o.authority_incarnation=NEW.authority_incarnation AND o.resource_key=NEW.resource_key AND o.phase NOT IN ('finalized','failed','abandoned'))
BEGIN SELECT RAISE(ABORT,'OBSERVATION_OPERATION_MISMATCH'); END;

CREATE TRIGGER operation_phase BEFORE UPDATE ON operations WHEN OLD.phase IN ('finalized','failed','abandoned') OR (NEW.phase<>OLD.phase AND NOT ((NEW.kind IN ('merge','undo','restore') AND ((OLD.phase='prepared' AND NEW.phase='candidate_created') OR (OLD.phase='candidate_created' AND NEW.phase='testing') OR (OLD.phase='testing' AND NEW.phase='tests_passed') OR (OLD.phase='tests_passed' AND NEW.phase='git_promoted') OR (OLD.phase='git_promoted' AND NEW.phase='finalized') OR (OLD.phase='git_promoted' AND NEW.phase='needs_review'))) OR (NEW.kind NOT IN ('merge','undo','restore') AND ((OLD.phase='prepared' AND NEW.phase='effect_observed') OR (OLD.phase='effect_observed' AND NEW.phase='finalized'))) OR (NEW.phase IN ('needs_review','failed','abandoned') AND OLD.phase<>'git_promoted') OR (OLD.phase='needs_review' AND EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.id=NEW.last_observation_id AND x.observation_type='reconciliation' AND json_extract(x.body_json,'$.resumePhase')=NEW.phase))))
BEGIN SELECT RAISE(ABORT,'INVALID_OPERATION_TRANSITION'); END;

CREATE TRIGGER operation_observation_pointer BEFORE UPDATE ON operations WHEN NEW.last_observation_id IS NULL OR NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.id=NEW.last_observation_id)
BEGIN SELECT RAISE(ABORT,'OPERATION_OBSERVATION_REQUIRED'); END;

CREATE TRIGGER safe_operation_exit BEFORE UPDATE ON operations WHEN NEW.phase IN ('failed','abandoned') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.id=NEW.last_observation_id AND x.observation_type=CASE NEW.phase WHEN 'failed' THEN 'safe_failure' ELSE 'abandonment' END AND json_extract(x.body_json,'$.noUnresolvedEffect')=1)
BEGIN SELECT RAISE(ABORT,'UNRESOLVED_EFFECT_MUST_REMAIN_REVIEW'); END;

CREATE TRIGGER effect_proof_init BEFORE UPDATE ON operations WHEN NEW.kind='init' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete' AND json_extract(x.body_json,'$.registrationId') IS json_extract(NEW.intent_json,'$.registrationId') AND json_extract(x.body_json,'$.storageSchemaHash') IS json_extract(NEW.intent_json,'$.stateSchemaHash') AND json_extract(x.body_json,'$.baselineRef') IS json_extract(NEW.intent_json,'$.baselineRef') AND json_extract(x.body_json,'$.baselineOid') IS json_extract(NEW.intent_json,'$.approvedBaseOid') AND json_extract(x.body_json,'$.integrationRef') IS json_extract(NEW.intent_json,'$.integrationRef') AND json_extract(x.body_json,'$.integrationOid') IS json_extract(NEW.intent_json,'$.approvedBaseOid') AND json_extract(x.body_json,'$.registeredRepositoryIdentity') IS json_extract(NEW.intent_json,'$.repositoryIdentity'))
BEGIN SELECT RAISE(ABORT,'COMPLETE_EFFECT_PROOF_REQUIRED'); END;

CREATE TRIGGER effect_proof_worktree_create BEFORE UPDATE ON operations WHEN NEW.kind='worktree_create' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete' AND json_extract(x.body_json,'$.canonicalPath') IS json_extract(NEW.intent_json,'$.canonicalPath') AND json_extract(x.body_json,'$.ownershipMarkerId') IS json_extract(NEW.intent_json,'$.ownershipMarkerId') AND json_extract(x.body_json,'$.baseOid') IS json_extract(NEW.intent_json,'$.baseOid') AND json_extract(x.body_json,'$.baseTreeOid') IS json_extract(NEW.intent_json,'$.baseTreeOid') AND json_extract(x.body_json,'$.branchRef') IS json_extract(NEW.intent_json,'$.branchRef') AND json_extract(x.body_json,'$.role') IS json_extract(NEW.intent_json,'$.role'))
BEGIN SELECT RAISE(ABORT,'COMPLETE_EFFECT_PROOF_REQUIRED'); END;

CREATE TRIGGER effect_proof_spawn BEFORE UPDATE ON operations WHEN NEW.kind='spawn' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete' AND json_extract(x.body_json,'$.process.supervisorId') IS json_extract(NEW.intent_json,'$.supervisorId') AND json_extract(x.body_json,'$.process.launchIdentity') IS json_extract(NEW.intent_json,'$.launchIdentity') AND json_extract(x.body_json,'$.process.executableHash') IS json_extract(NEW.intent_json,'$.executableHash'))
BEGIN SELECT RAISE(ABORT,'COMPLETE_EFFECT_PROOF_REQUIRED'); END;

CREATE TRIGGER effect_proof_stop BEFORE UPDATE ON operations WHEN NEW.kind='stop' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete' AND json_extract(x.body_json,'$.process.startIdentity') IS json_extract(NEW.intent_json,'$.targetProcess.startIdentity') AND json_extract(x.body_json,'$.process.launchIdentity') IS json_extract(NEW.intent_json,'$.targetProcess.launchIdentity') AND json_extract(x.body_json,'$.process.descendantScopeHash') IS json_extract(NEW.intent_json,'$.targetProcess.descendantScopeHash'))
BEGIN SELECT RAISE(ABORT,'COMPLETE_EFFECT_PROOF_REQUIRED'); END;

CREATE TRIGGER effect_proof_backup BEFORE UPDATE ON operations WHEN NEW.kind='backup' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete' AND json_extract(x.body_json,'$.barrierId') IS json_extract(NEW.intent_json,'$.quiescentBarrierId'))
BEGIN SELECT RAISE(ABORT,'COMPLETE_EFFECT_PROOF_REQUIRED'); END;

CREATE TRIGGER evidence_operation_binding BEFORE INSERT ON evidence WHEN NOT EXISTS(SELECT 1 FROM operations o WHERE o.project_id=NEW.project_id AND o.id=NEW.operation_id AND o.candidate_oid=NEW.candidate_oid AND o.candidate_tree_oid=NEW.tree_oid AND o.policy_hash=NEW.policy_hash AND o.profiles_hash=NEW.profiles_hash AND o.environment_hash=NEW.environment_hash AND o.authority_incarnation=NEW.authority_incarnation AND o.id=json_extract(NEW.body_json,'$.operationId') AND o.plan_id=json_extract(NEW.body_json,'$.planId'))
BEGIN SELECT RAISE(ABORT,'EVIDENCE_OPERATION_MISMATCH'); END;

CREATE TRIGGER evidence_pass_complete BEFORE INSERT ON evidence WHEN NEW.verdict='pass' AND (coalesce(json_extract(NEW.body_json,'$.dirtyBefore'),1)<>0 OR coalesce(json_extract(NEW.body_json,'$.dirtyAfter'),1)<>0 OR coalesce(json_array_length(NEW.body_json,'$.checks'),0)=0 OR EXISTS(SELECT 1 FROM json_each(NEW.body_json,'$.checks') c WHERE coalesce(json_extract(c.value,'$.status'),'')<>'passed' OR coalesce(json_extract(c.value,'$.completed'),0)<>1 OR coalesce(json_extract(c.value,'$.exitCode'),-1)<>0 OR json_type(c.value,'$.signal')<>'null' OR coalesce(json_extract(c.value,'$.passed'),0)<=0 OR coalesce(json_extract(c.value,'$.failed'),1)<>0 OR coalesce(json_extract(c.value,'$.skipped'),1)<>0 OR coalesce(json_extract(c.value,'$.todo'),1)<>0 OR coalesce(json_extract(c.value,'$.cancelled'),1)<>0 OR coalesce(json_array_length(c.value,'$.artifacts'),0)=0))
BEGIN SELECT RAISE(ABORT,'INCOMPLETE_REQUIRED_EVIDENCE'); END;

CREATE TRIGGER acceptance_proof BEFORE UPDATE ON operations WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase IN ('tests_passed','git_promoted','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x JOIN evidence e ON e.project_id=x.project_id AND e.id=json_extract(x.body_json,'$.evidenceId') WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='acceptance' AND e.operation_id=NEW.id AND e.verdict='pass' AND e.evidence_sha256=json_extract(x.body_json,'$.evidenceSha256') AND e.candidate_oid=NEW.candidate_oid AND e.tree_oid=NEW.candidate_tree_oid AND e.policy_hash=NEW.policy_hash AND e.profiles_hash=NEW.profiles_hash AND e.environment_hash=NEW.environment_hash AND e.candidate_oid=json_extract(x.body_json,'$.candidateOid') AND e.tree_oid=json_extract(x.body_json,'$.treeOid') AND e.policy_hash=json_extract(x.body_json,'$.policyHash') AND e.profiles_hash=json_extract(x.body_json,'$.profilesHash') AND e.environment_hash=json_extract(x.body_json,'$.environmentHash'))
BEGIN SELECT RAISE(ABORT,'DURABLE_SAME_OPERATION_ACCEPTANCE_REQUIRED'); END;

CREATE TRIGGER promotion_proof BEFORE UPDATE ON operations WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase IN ('git_promoted','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x JOIN evidence e ON e.project_id=x.project_id AND e.id=json_extract(x.body_json,'$.acceptanceEvidenceId') WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='promotion' AND json_extract(x.body_json,'$.integrationOid')=NEW.candidate_oid AND json_extract(x.body_json,'$.snapshotOid')=NEW.candidate_oid AND json_extract(x.body_json,'$.integrationRef')=json_extract(NEW.intent_json,'$.integrationRef') AND json_extract(x.body_json,'$.snapshotRef')=json_extract(NEW.intent_json,'$.snapshotRef') AND e.operation_id=NEW.id AND e.evidence_sha256=json_extract(x.body_json,'$.acceptanceEvidenceSha256'))
BEGIN SELECT RAISE(ABORT,'EXACT_PROMOTED_REFS_REQUIRED'); END;

CREATE TRIGGER snapshot_operation_binding BEFORE INSERT ON snapshots WHEN NEW.kind<>'baseline' AND NOT EXISTS(SELECT 1 FROM operations o WHERE o.project_id=NEW.project_id AND o.id=NEW.operation_id AND o.candidate_oid=NEW.commit_oid AND o.candidate_tree_oid=NEW.tree_oid AND o.expected_oid=NEW.parent_oid AND o.policy_hash=NEW.policy_hash AND o.profiles_hash=NEW.profiles_hash AND o.environment_hash=NEW.environment_hash AND o.authority_incarnation=NEW.authority_incarnation AND NEW.ref_name=json_extract(o.intent_json,'$.snapshotRef') AND NEW.content_epoch=json_extract(o.intent_json,'$.nextContentEpoch'))
BEGIN SELECT RAISE(ABORT,'SNAPSHOT_OPERATION_MISMATCH'); END;

CREATE TRIGGER task_integration_same_operation BEFORE INSERT ON task_integrations WHEN NOT EXISTS(SELECT 1 FROM operations o JOIN snapshots s ON s.project_id=o.project_id AND s.operation_id=o.id JOIN evidence e ON e.project_id=s.project_id AND e.id=s.evidence_id AND e.operation_id=o.id JOIN plan_sources ps ON ps.project_id=o.project_id AND ps.plan_id=o.plan_id JOIN attempts a ON a.project_id=ps.project_id AND a.id=ps.attempt_id WHERE o.project_id=NEW.project_id AND o.id=NEW.operation_id AND o.phase='finalized' AND s.id=NEW.snapshot_id AND s.verification='verified' AND e.verdict='pass' AND a.task_id=NEW.task_id)
BEGIN SELECT RAISE(ABORT,'TASK_INTEGRATION_OPERATION_MISMATCH'); END;

CREATE TRIGGER integration_intent_projection BEFORE INSERT ON operations WHEN NEW.kind IN ('merge','undo','restore') AND (json_extract(NEW.intent_json,'$.expectedIntegrationOid')<>NEW.expected_oid OR json_extract(NEW.intent_json,'$.candidateOid')<>NEW.candidate_oid OR json_extract(NEW.intent_json,'$.candidateTreeOid')<>NEW.candidate_tree_oid OR json_extract(NEW.intent_json,'$.policyHash')<>NEW.policy_hash OR json_extract(NEW.intent_json,'$.profilesHash')<>NEW.profiles_hash OR json_extract(NEW.intent_json,'$.environmentHash')<>NEW.environment_hash OR json_extract(NEW.intent_json,'$.nextContentEpoch')<>json_extract(NEW.intent_json,'$.expectedContentEpoch')+1)
BEGIN SELECT RAISE(ABORT,'INTENT_PROJECTION_MISMATCH'); END;

CREATE TRIGGER integration_membership BEFORE INSERT ON operations
WHEN NEW.kind IN ('merge','undo','restore') AND (
 json_array_length(NEW.intent_json,'$.sources')<>(SELECT count(*) FROM plan_sources ps WHERE ps.project_id=NEW.project_id AND ps.plan_id=NEW.plan_id)
 OR EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.sources') x WHERE NOT EXISTS(
   SELECT 1 FROM plan_sources ps JOIN attempts a ON a.project_id=ps.project_id AND a.id=ps.attempt_id
   WHERE ps.project_id=NEW.project_id AND ps.plan_id=NEW.plan_id AND ps.ordinal=x.key
     AND a.task_id=json_extract(x.value,'$.taskId') AND a.id=json_extract(x.value,'$.attemptId')
     AND a.base_oid=json_extract(x.value,'$.baseOid') AND ps.submission_oid=json_extract(x.value,'$.submissionOid')
     AND a.submission_tree_oid=json_extract(x.value,'$.submissionTreeOid') AND a.submission_ref=json_extract(x.value,'$.submissionRef')))
 OR json_array_length(NEW.intent_json,'$.taskMembership')<>(SELECT count(DISTINCT a.task_id)
   FROM plan_sources ps JOIN attempts a ON a.project_id=ps.project_id AND a.id=ps.attempt_id
   WHERE ps.project_id=NEW.project_id AND ps.plan_id=NEW.plan_id)
 OR EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.taskMembership') m WHERE NOT EXISTS(
   SELECT 1 FROM plan_sources ps JOIN attempts a ON a.project_id=ps.project_id AND a.id=ps.attempt_id
   WHERE ps.project_id=NEW.project_id AND ps.plan_id=NEW.plan_id AND a.task_id=m.value))
 OR EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.taskMembership') m GROUP BY m.value HAVING count(*)>1))
BEGIN SELECT RAISE(ABORT,'FROZEN_SOURCE_MEMBERSHIP_MISMATCH'); END;

CREATE TRIGGER source_freeze_after_intent BEFORE INSERT ON plan_sources WHEN EXISTS(SELECT 1 FROM operations o WHERE o.project_id=NEW.project_id AND o.plan_id=NEW.plan_id)
BEGIN SELECT RAISE(ABORT,'PLAN_SOURCES_FROZEN'); END;

CREATE TRIGGER backup_required_database BEFORE INSERT ON operations WHEN NEW.kind='backup' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredMembers') m WHERE json_extract(m.value,'$.kind')='database')
BEGIN SELECT RAISE(ABORT,'BACKUP_MEMBER_CATEGORY_REQUIRED'); END;

CREATE TRIGGER backup_required_schema BEFORE INSERT ON operations WHEN NEW.kind='backup' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredMembers') m WHERE json_extract(m.value,'$.kind')='schema')
BEGIN SELECT RAISE(ABORT,'BACKUP_MEMBER_CATEGORY_REQUIRED'); END;

CREATE TRIGGER backup_required_ref BEFORE INSERT ON operations WHEN NEW.kind='backup' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredMembers') m WHERE json_extract(m.value,'$.kind')='ref')
BEGIN SELECT RAISE(ABORT,'BACKUP_MEMBER_CATEGORY_REQUIRED'); END;

CREATE TRIGGER backup_required_object BEFORE INSERT ON operations WHEN NEW.kind='backup' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredMembers') m WHERE json_extract(m.value,'$.kind')='object')
BEGIN SELECT RAISE(ABORT,'BACKUP_MEMBER_CATEGORY_REQUIRED'); END;

CREATE TRIGGER backup_required_artifact BEFORE INSERT ON operations WHEN NEW.kind='backup' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredMembers') m WHERE json_extract(m.value,'$.kind')='artifact')
BEGIN SELECT RAISE(ABORT,'BACKUP_MEMBER_CATEGORY_REQUIRED'); END;

CREATE TRIGGER backup_members_complete BEFORE UPDATE ON operations WHEN NEW.kind='backup' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete' AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredMembers') m WHERE NOT EXISTS(SELECT 1 FROM json_each(x.body_json,'$.members') n WHERE json_extract(n.value,'$.kind')=json_extract(m.value,'$.kind') AND json_extract(n.value,'$.identity')=json_extract(m.value,'$.identity') AND json_extract(n.value,'$.sha256')=json_extract(m.value,'$.sha256') AND json_extract(n.value,'$.bytes')=json_extract(m.value,'$.bytes'))))
BEGIN SELECT RAISE(ABORT,'BACKUP_COMPLETE_SET_REQUIRED'); END;

CREATE TRIGGER lease_release_proof BEFORE UPDATE ON leases WHEN NEW.action='release' AND (NEW.prior_writer_resolved_receipt IS NULL OR length(NEW.prior_writer_resolved_receipt)<>64)
BEGIN SELECT RAISE(ABORT,'LEASE_RELEASE_TERMINATION_REQUIRED'); END;

CREATE TRIGGER required_checks_evidence BEFORE UPDATE ON operations
WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase IN ('tests_passed','git_promoted','finalized')
 AND NOT EXISTS(SELECT 1 FROM operation_observations x JOIN evidence e
   ON e.project_id=x.project_id AND e.id=json_extract(x.body_json,'$.evidenceId')
   AND e.evidence_sha256=json_extract(x.body_json,'$.evidenceSha256')
   WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='acceptance'
     AND e.operation_id=NEW.id AND e.verdict='pass'
     AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredChecks') r WHERE NOT EXISTS(
       SELECT 1 FROM json_each(e.body_json,'$.checks') c
       WHERE json_extract(c.value,'$.checkId')=r.value AND json_extract(c.value,'$.status')='passed')))
BEGIN SELECT RAISE(ABORT,'REQUIRED_CHECK_MISSING'); END;

CREATE TRIGGER integration_finalization_snapshot BEFORE UPDATE ON operations WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase='finalized' AND NOT EXISTS(SELECT 1 FROM snapshots s WHERE s.project_id=NEW.project_id AND s.operation_id=NEW.id AND s.commit_oid=NEW.candidate_oid AND s.tree_oid=NEW.candidate_tree_oid AND s.verification='verified')
BEGIN SELECT RAISE(ABORT,'FINALIZATION_SNAPSHOT_REQUIRED'); END;

CREATE TRIGGER freeze_task_transitions_insert BEFORE INSERT ON task_transitions WHEN 1
BEGIN SELECT RAISE(ABORT,'TRANSITION_CONTRACT_IMMUTABLE'); END;

CREATE TRIGGER freeze_task_transitions_update BEFORE UPDATE ON task_transitions WHEN 1
BEGIN SELECT RAISE(ABORT,'TRANSITION_CONTRACT_IMMUTABLE'); END;

CREATE TRIGGER freeze_task_transitions_delete BEFORE DELETE ON task_transitions WHEN 1
BEGIN SELECT RAISE(ABORT,'TRANSITION_CONTRACT_IMMUTABLE'); END;

CREATE TRIGGER operation_repository_binding BEFORE INSERT ON operations
WHEN NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=NEW.project_id AND p.repo_identity=NEW.repository_identity)
 OR (NEW.kind='init' AND (json_extract(NEW.intent_json,'$.repositoryIdentity')<>NEW.repository_identity
 OR json_extract(NEW.intent_json,'$.policyHash')<>NEW.policy_hash
 OR json_extract(NEW.intent_json,'$.profilesHash')<>NEW.profiles_hash))
BEGIN SELECT RAISE(ABORT,'REPOSITORY_OR_PROFILE_IDENTITY_MISMATCH'); END;
CREATE TRIGGER stop_exact_process_identity BEFORE UPDATE ON operations
WHEN NEW.kind='stop' AND NEW.phase IN ('effect_observed','finalized') AND NOT EXISTS(
 SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='effect_complete'
 AND json_extract(x.body_json,'$.process.supervisorId')=json_extract(NEW.intent_json,'$.targetProcess.supervisorId')
 AND json_extract(x.body_json,'$.process.launchIdentity')=json_extract(NEW.intent_json,'$.targetProcess.launchIdentity')
 AND json_extract(x.body_json,'$.process.pid')=json_extract(NEW.intent_json,'$.targetProcess.pid')
 AND json_extract(x.body_json,'$.process.startIdentity')=json_extract(NEW.intent_json,'$.targetProcess.startIdentity')
 AND json_extract(x.body_json,'$.process.executableHash')=json_extract(NEW.intent_json,'$.targetProcess.executableHash')
 AND json_extract(x.body_json,'$.process.descendantScopeHash')=json_extract(NEW.intent_json,'$.targetProcess.descendantScopeHash'))
BEGIN SELECT RAISE(ABORT,'EXACT_PROCESS_START_IDENTITY_REQUIRED'); END;

-- Acceptance/promotion are single selected immutable receipts; later corrections append reconciliation.
CREATE UNIQUE INDEX one_selected_acceptance ON operation_observations(project_id,operation_id)
 WHERE observation_type='acceptance';
CREATE UNIQUE INDEX one_promotion_receipt ON operation_observations(project_id,operation_id)
 WHERE observation_type='promotion';
CREATE TRIGGER retained_promotion_phase_floor BEFORE UPDATE ON operations
WHEN NEW.phase NOT IN ('git_promoted','needs_review','finalized') AND EXISTS(
 SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id
   AND x.operation_id=NEW.id AND x.observation_type='promotion')
BEGIN SELECT RAISE(ABORT,'PROMOTED_OPERATION_MUST_FINALIZE'); END;
CREATE TRIGGER candidate_phase_proof BEFORE UPDATE ON operations
WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase='candidate_created' AND (
 NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id
   AND x.observation_type='candidate_pinned' AND json_extract(x.body_json,'$.candidateOid')=NEW.candidate_oid
   AND json_extract(x.body_json,'$.treeOid')=NEW.candidate_tree_oid
   AND json_extract(x.body_json,'$.candidateRef')=json_extract(NEW.intent_json,'$.candidateRef'))
 OR NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id
   AND x.id=NEW.last_observation_id AND ((x.observation_type='candidate_pinned'
     AND json_extract(x.body_json,'$.candidateOid')=NEW.candidate_oid
     AND json_extract(x.body_json,'$.treeOid')=NEW.candidate_tree_oid
     AND json_extract(x.body_json,'$.candidateRef')=json_extract(NEW.intent_json,'$.candidateRef'))
     OR (x.observation_type='reconciliation' AND json_extract(x.body_json,'$.resumePhase')=NEW.phase))))
BEGIN SELECT RAISE(ABORT,'EXACT_PINNED_CANDIDATE_REQUIRED'); END;
CREATE TRIGGER testing_phase_proof BEFORE UPDATE ON operations
WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase='testing' AND (
 NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id
   AND x.observation_type='testing_started' AND json_extract(x.body_json,'$.candidateOid')=NEW.candidate_oid
   AND json_extract(x.body_json,'$.environmentHash')=NEW.environment_hash)
 OR NOT EXISTS(SELECT 1 FROM operation_observations x WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id
   AND x.id=NEW.last_observation_id AND ((x.observation_type='testing_started'
     AND json_extract(x.body_json,'$.candidateOid')=NEW.candidate_oid
     AND json_extract(x.body_json,'$.environmentHash')=NEW.environment_hash)
     OR (x.observation_type='reconciliation' AND json_extract(x.body_json,'$.resumePhase')=NEW.phase))))
BEGIN SELECT RAISE(ABORT,'EXACT_TESTING_START_REQUIRED'); END;
CREATE TRIGGER promotion_uses_selected_acceptance BEFORE INSERT ON operation_observations
WHEN NEW.observation_type='promotion' AND NOT EXISTS(
 SELECT 1 FROM operation_observations x JOIN operations o ON o.project_id=x.project_id AND o.id=x.operation_id
 JOIN evidence e ON e.project_id=x.project_id AND e.id=json_extract(x.body_json,'$.evidenceId')
   AND e.evidence_sha256=json_extract(x.body_json,'$.evidenceSha256')
 WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.operation_id AND x.observation_type='acceptance'
   AND e.operation_id=o.id AND e.verdict='pass'
   AND e.id=json_extract(NEW.body_json,'$.acceptanceEvidenceId')
   AND e.evidence_sha256=json_extract(NEW.body_json,'$.acceptanceEvidenceSha256')
   AND NOT EXISTS(SELECT 1 FROM json_each(o.intent_json,'$.requiredChecks') r WHERE NOT EXISTS(
     SELECT 1 FROM json_each(e.body_json,'$.checks') c
     WHERE json_extract(c.value,'$.checkId')=r.value AND json_extract(c.value,'$.status')='passed')))
BEGIN SELECT RAISE(ABORT,'SELECTED_ACCEPTANCE_RECEIPT_REQUIRED'); END;
CREATE TRIGGER snapshot_uses_selected_acceptance BEFORE INSERT ON snapshots
WHEN NEW.kind<>'baseline' AND NOT EXISTS(
 SELECT 1 FROM operation_observations x JOIN operations o ON o.project_id=x.project_id AND o.id=x.operation_id
 JOIN evidence e ON e.project_id=x.project_id AND e.id=json_extract(x.body_json,'$.evidenceId')
   AND e.evidence_sha256=json_extract(x.body_json,'$.evidenceSha256')
 JOIN operation_observations promoted ON promoted.project_id=x.project_id AND promoted.operation_id=x.operation_id
   AND promoted.observation_type='promotion'
   AND json_extract(promoted.body_json,'$.acceptanceEvidenceId')=e.id
   AND json_extract(promoted.body_json,'$.acceptanceEvidenceSha256')=e.evidence_sha256
 WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.operation_id AND x.observation_type='acceptance'
   AND e.id=NEW.evidence_id AND e.operation_id=NEW.operation_id AND e.verdict='pass'
   AND NOT EXISTS(SELECT 1 FROM json_each(o.intent_json,'$.requiredChecks') r WHERE NOT EXISTS(
     SELECT 1 FROM json_each(e.body_json,'$.checks') c
     WHERE json_extract(c.value,'$.checkId')=r.value AND json_extract(c.value,'$.status')='passed')))
BEGIN SELECT RAISE(ABORT,'SNAPSHOT_SELECTED_ACCEPTANCE_REQUIRED'); END;
CREATE TRIGGER completion_intent_membership BEFORE INSERT ON task_integrations
WHEN NOT EXISTS(SELECT 1 FROM operations o, json_each(o.intent_json,'$.taskMembership') m
 WHERE o.project_id=NEW.project_id AND o.id=NEW.operation_id AND m.value=NEW.task_id)
BEGIN SELECT RAISE(ABORT,'TASK_NOT_IN_FROZEN_INTENT'); END;
CREATE TRIGGER completed_intent_membership BEFORE UPDATE OF status ON tasks
WHEN NEW.status='completed' AND NOT EXISTS(SELECT 1 FROM task_integrations ti JOIN operations o
 ON o.project_id=ti.project_id AND o.id=ti.operation_id, json_each(o.intent_json,'$.taskMembership') m
 WHERE ti.project_id=NEW.project_id AND ti.task_id=NEW.id AND m.value=NEW.id)
BEGIN SELECT RAISE(ABORT,'TASK_NOT_IN_FROZEN_INTENT'); END;

CREATE TRIGGER acceptance_details_match_evidence BEFORE UPDATE ON operations
WHEN NEW.kind IN ('merge','undo','restore') AND NEW.phase IN ('tests_passed','git_promoted','finalized')
 AND NOT EXISTS(SELECT 1 FROM operation_observations x JOIN evidence e
   ON e.project_id=x.project_id AND e.id=json_extract(x.body_json,'$.evidenceId')
   AND e.evidence_sha256=json_extract(x.body_json,'$.evidenceSha256')
   WHERE x.project_id=NEW.project_id AND x.operation_id=NEW.id AND x.observation_type='acceptance'
     AND json_extract(x.body_json,'$.checks')=json_extract(e.body_json,'$.checks')
     AND json_array_length(x.body_json,'$.requiredChecks')=json_array_length(NEW.intent_json,'$.requiredChecks')
     AND NOT EXISTS(SELECT 1 FROM json_each(NEW.intent_json,'$.requiredChecks') r WHERE NOT EXISTS(
       SELECT 1 FROM json_each(x.body_json,'$.requiredChecks') a WHERE a.value=r.value)))
BEGIN SELECT RAISE(ABORT,'ACCEPTANCE_DETAILS_MISMATCH'); END;

PRAGMA user_version = 1;
COMMIT;
-- Record the exact migration checksum after verifying outcome; reconcile interrupted receipt.
