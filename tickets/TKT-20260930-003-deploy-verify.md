---
id: TKT-20260930-003
title: Release Guard Deploy Verify MVP
type: feature
priority: P1
status: QA_READY
owner: Codex
requestor: repository owner
risk: MEDIUM
scope:
  in: [offline deployment evidence, package CLI and API, tests, docs, registry admission, authorized merge]
  out: [live URL collectors, deploy writes, npm publication, UI or SQL tools, old repository edits]
acceptance_criteria:
  - Match exact expected commit/build, required CI checks and every asset hash with provenance.
  - Missing, stale, future or conflicting evidence stays unknown; fresh mismatches fail.
  - Latest observations supersede earlier retries without silently choosing between simultaneous contradictions.
  - Validate bounded sanitized input; reject credentials, unexpected keys and unsafe URLs; never execute commands.
  - Browser cache/controller evidence is separate from HTTP; installed-device update always remains unverified.
  - Packaged CLI, root gates, exact-head platform CI and merged-main CI pass.
test_plan: [match, mismatch, missing, stale, future, retries, inconsistent evidence, cached assets, redirects, limits, redaction, determinism, CLI, clean package]
rollback_plan: [revert focused feature after reviewing any published consumer impact]
notes: [Owner explicitly authorizes merge after checks; no npm publication.]
---
## Contract
One versioned evidence bundle, explicit asOf cutoff, no ambient clock, no network or artifact commands. Source provenance consists of artifact SHA-256 and JSON pointers. Validation means consistency of supplied evidence, not authentication of producers.
