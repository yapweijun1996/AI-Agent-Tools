-- Applied in the same registry bootstrap transaction as registry.sql, never to the guard.
CREATE TABLE registry_migrations (
 version INTEGER PRIMARY KEY CHECK(version=1), registry_sha256 TEXT NOT NULL CHECK(length(registry_sha256)=64),
 runtime_sha256 TEXT NOT NULL CHECK(length(runtime_sha256)=64), applied_at_ms INTEGER NOT NULL CHECK(applied_at_ms>=0)
) STRICT;
CREATE TABLE registration_receipts (
 project_id TEXT PRIMARY KEY REFERENCES registrations(project_id), registration_id TEXT NOT NULL UNIQUE,
 state_directory TEXT NOT NULL UNIQUE, directory_identity TEXT NOT NULL UNIQUE,
 guard_path TEXT NOT NULL UNIQUE, guard_file_identity TEXT NOT NULL UNIQUE,
 workflow_file_identity TEXT NOT NULL UNIQUE, policy_path TEXT NOT NULL, policy_hash TEXT NOT NULL CHECK(length(policy_hash)=64),
 profiles_hash TEXT NOT NULL CHECK(length(profiles_hash)=64), request_key_hash TEXT NOT NULL CHECK(length(request_key_hash)=64),
 semantic_request_hash TEXT NOT NULL CHECK(length(semantic_request_hash)=64), approved_base_oid TEXT NOT NULL,
 created_at_ms INTEGER NOT NULL CHECK(created_at_ms>=0)
) STRICT;
CREATE TRIGGER registry_receipt_immutable BEFORE UPDATE ON registration_receipts
BEGIN SELECT RAISE(ABORT,'REGISTRATION_RECEIPT_IMMUTABLE'); END;
CREATE TRIGGER registry_receipt_retain BEFORE DELETE ON registration_receipts
BEGIN SELECT RAISE(ABORT,'REGISTRATION_MUST_BE_RETAINED'); END;
