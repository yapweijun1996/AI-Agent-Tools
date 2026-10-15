-- Dedicated guard.sqlite; NEVER run this against state.sqlite.
-- The Coordinator holds this connection and transaction for its lifetime.
-- Bootstrap an EMPTY guard database while no coordinator is active.
PRAGMA journal_mode = DELETE;
PRAGMA synchronous = FULL;
PRAGMA busy_timeout = 0;
CREATE TABLE IF NOT EXISTS guard_identity (
  id INTEGER PRIMARY KEY CHECK (id=1),
  project_identity TEXT NOT NULL
);
-- Bootstrap must verify project_identity separately, before admission.
-- Runtime acquisition (keep open; release by ROLLBACK / closing connection):
BEGIN EXCLUSIVE;
-- Do not issue COMMIT until Coordinator admission and broker mutations stop.
-- Do not delete/rename guard.sqlite or its containing canonical state directory.
