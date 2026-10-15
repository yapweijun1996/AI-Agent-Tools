-- NEW disposable canonical registry; no live guard transfer.
CREATE TABLE registrations (
 project_id TEXT PRIMARY KEY, canonical_common_dir TEXT NOT NULL UNIQUE,
 repository_identity TEXT NOT NULL UNIQUE, authority_incarnation TEXT NOT NULL CHECK(length(authority_incarnation)=64),
 workflow_path TEXT NOT NULL, activation_id TEXT,
 admission_state TEXT NOT NULL CHECK(admission_state IN ('blocked','active'))
) STRICT;
CREATE TABLE activation_intents (
 id TEXT PRIMARY KEY, project_id TEXT NOT NULL, old_incarnation TEXT NOT NULL,
 new_incarnation TEXT NOT NULL CHECK(length(new_incarnation)=64), backup_digest TEXT NOT NULL CHECK(length(backup_digest)=64),
 approval_reference TEXT NOT NULL, old_namespace_stopped_receipt TEXT NOT NULL CHECK(length(old_namespace_stopped_receipt)=64),
 phase TEXT NOT NULL CHECK(phase IN ('prepared','registry_installed','workflow_installed','finalized')),
 CHECK(old_incarnation<>new_incarnation)
) STRICT;
-- Core admission requires exact registry/workflow incarnation + activation intent/readback agreement.
