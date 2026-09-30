---
id: TKT-20260930-001
title: Consolidate owned tool source
type: refactor
priority: P1
status: PR_READY
owner: Codex
requestor: repository owner
risk: HIGH
scope:
  in: [Hub, ten owned tool repositories]
  out: [repository deletion, merging, npm publication]
constraints: [preserve contracts, preserve licenses, preserve local work]
acceptance_criteria:
  - Import complete reviewed source with provenance and coverage hashes.
  - Provide root install/build/test pipeline and independent package tests.
  - Preserve package identities, licenses and private flags.
  - Provide history recovery bundles and deletion readiness checklist.
  - Push feature branch and open draft PR with measured verification.
test_plan: [baseline tests, aggregate tests, build, available typecheck and lint, CLI smoke and pack checks]
rollback_plan: [close draft PR and retain original repositories and history bundles]
notes: [Owner explicitly supersedes previous monorepo prohibition.]
---
## Context
Owner requests one repository for all ten owned tools and Hub.
## Requirements
Complete source, contracts, tests, assets and documentation; evidence-backed migration.
## Non-Goals
No merges, deletions, npm publication or tokens.
## QA Checklist
Record exact results and blockers; preserve native module systems and compiler versions.

## Reviewer notes
High risk due to source volume and future repository deletion. Package boundaries, locks, exports, licenses and private flags are preserved; history stays local, no publish workflow is activated. Review coverage manifest and deletion checklist before any merge/deletion. Regression checks preserve AIT containment and native profiles.
