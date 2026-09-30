---
id: TKT-20260930-002
title: Environment Doctor and Contract Check MVPs
type: feature
priority: P1
status: QA_READY
owner: Codex
requestor: repository owner
risk: MEDIUM
scope:
  in: [two independent CLI packages, offline contracts, safe opt-in probes, tests, docs, draft PR]
  out: [npm publication, merge, automatic fixes, network API calls, original repository edits]
constraints: [read-only, bounded output, no credential values, preserve existing packages]
acceptance_criteria:
  - Doctor compares declared requirements to sanitized evidence using pass/fail/unknown with source pointers.
  - Contract Check reports supported JSON Schema acceptance changes conservatively and tests supplied samples without exposing payloads.
  - Both packages expose documented capabilities/help, stable result schema, CLI/API and independent tests.
  - Root verification and supported-platform CI pass on the exact draft PR head.
test_plan: [negative inputs, absent evidence, Unicode/platform paths, secret redaction, stable ordering, compatibility classes, CLI and pack smoke, root pipeline]
rollback_plan: [close draft PR; revert feature commits after a separately approved merge]
notes: [No publication or merge authorized.]
---
## Context
Owner approves Environment Doctor and Contract Check implementation in the unified source repository.
## Requirements
Offline JSON requirements/snapshots and before/after schemas first. Live Doctor probes explicitly opt in to fixed version commands and config-name presence only. Contract checks classify acceptance changes, not universal API semantics.
## Non-Goals
No install, PATH mutation, restart, database access, environment-value export, network requests, schema writes, OpenAPI completeness or regex equivalence claims.
## QA Checklist
Bound reads/output and recursion; reject malformed input; preserve unknown evidence and unsupported keywords; inspect private-value handling; execute package and aggregate checks and CI.
