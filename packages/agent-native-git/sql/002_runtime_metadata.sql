-- Stage1 forward additions; Stage0 prospective schema and ninety SQL fixtures stay unchanged.
BEGIN IMMEDIATE;
CREATE TABLE runtime_approvals (
 project_id TEXT PRIMARY KEY REFERENCES projects(id), policy_path TEXT NOT NULL,
 policy_file_identity TEXT NOT NULL, policy_bytes TEXT NOT NULL CHECK(json_valid(policy_bytes)),
 profiles_path TEXT, profiles_file_identity TEXT, profiles_bytes TEXT NOT NULL CHECK(json_valid(profiles_bytes)),
 history_identity TEXT NOT NULL CHECK(length(history_identity)=64),
 registration_id TEXT NOT NULL UNIQUE, baseline_ref TEXT NOT NULL UNIQUE,
 workflow_identity TEXT NOT NULL, guard_identity TEXT NOT NULL,
 checkout_receipt_json TEXT NOT NULL CHECK(json_valid(checkout_receipt_json)),
 CHECK((profiles_path IS NULL AND profiles_file_identity IS NULL) OR (profiles_path IS NOT NULL AND profiles_file_identity IS NOT NULL))
) STRICT;
CREATE TRIGGER runtime_approval_immutable BEFORE UPDATE ON runtime_approvals
BEGIN SELECT RAISE(ABORT,'APPROVAL_IMMUTABLE'); END;
CREATE TRIGGER runtime_approval_retain BEFORE DELETE ON runtime_approvals
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;
CREATE TABLE metadata_grant_receipts (
 project_id TEXT NOT NULL REFERENCES projects(id), receipt_sha256 TEXT NOT NULL CHECK(length(receipt_sha256)=64),
 authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64), coordinator_epoch INTEGER NOT NULL CHECK(coordinator_epoch BETWEEN 1 AND 9007199254740991),
 resource_key TEXT NOT NULL, fencing_token INTEGER NOT NULL CHECK(fencing_token BETWEEN 1 AND 9007199254740991), owner_id TEXT NOT NULL,
 proof_json TEXT NOT NULL CHECK(json_valid(proof_json)), created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0),
 PRIMARY KEY(project_id,receipt_sha256)
) STRICT;
CREATE TRIGGER metadata_receipt_immutable BEFORE UPDATE ON metadata_grant_receipts
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER metadata_receipt_retain BEFORE DELETE ON metadata_grant_receipts
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;
CREATE TRIGGER messages_immutable BEFORE UPDATE ON messages
BEGIN SELECT RAISE(ABORT,'APPEND_ONLY'); END;
CREATE TRIGGER messages_retain BEFORE DELETE ON messages
BEGIN SELECT RAISE(ABORT,'HISTORY_MUST_BE_RETAINED'); END;
CREATE TRIGGER runtime_baseline_proof BEFORE INSERT ON snapshots WHEN NEW.kind='baseline' AND NOT EXISTS (
 SELECT 1 FROM operations o JOIN runtime_approvals a ON a.project_id=o.project_id
 WHERE o.project_id=NEW.project_id AND o.id=NEW.operation_id AND o.kind='init' AND o.phase='finalized'
 AND NEW.ref_name=a.baseline_ref AND NEW.commit_oid=json_extract(o.intent_json,'$.approvedBaseOid')
 AND NEW.tree_oid=json_extract(o.intent_json,'$.approvedBaseTreeOid') AND NEW.authority_incarnation=o.authority_incarnation
 AND NEW.policy_hash=o.policy_hash AND NEW.profiles_hash=o.profiles_hash AND NEW.content_epoch=0
)
BEGIN SELECT RAISE(ABORT,'BASELINE_INIT_PROOF_REQUIRED'); END;
COMMIT;
