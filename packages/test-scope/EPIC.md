# agent-test-scope Epic Plan

| Field | Value |
|---|---|
| Status | Active — V0.1 implementation baseline |
| Target | V0.1 vertical slice |
| Sequencing | Evidence-driven |

Each epic must deliver an independently verifiable product capability. Detailed implementation work belongs in `TASK.md`.

## EPIC-001 — Contract Foundation

**Outcome:** Freeze the machine-readable V0.1 contract.

Scope:

- schema version;
- operations;
- requests;
- result envelope;
- diagnostics;
- confidence;
- risk;
- truncation;
- deterministic ordering.

Acceptance:

- schemas validate examples;
- CLI/library can return contract-shaped capability results;
- invalid requests fail before repository analysis.

## EPIC-002 — Safe Repository Discovery

**Outcome:** Analyze repository files without escaping the explicit root.

Scope:

- canonical root;
- ignore rules;
- generated/vendor exclusions;
- secret exclusions;
- symlink handling;
- file/byte limits.

Acceptance:

- outside-root paths rejected;
- unsafe symlinks rejected;
- secrets never returned;
- deterministic discovery fixtures pass.

## EPIC-003 — Test Framework Discovery

**Outcome:** Detect supported test infrastructure.

Scope:

- Vitest;
- Jest;
- Node.js native test;
- package scripts;
- test roots/conventions.

Acceptance:

- framework fixture matrix passes;
- unsupported/ambiguous cases are explicit.

## EPIC-004 — Direct Test Mapping

**Outcome:** Map changed source files to directly related tests.

Scope:

- basename conventions;
- co-located tests;
- test-directory conventions.

Acceptance:

```text
src/foo.ts → tests/foo.test.ts
src/foo.ts → src/foo.spec.ts
```

must be deterministic and evidence-backed.

## EPIC-005 — Static Import Evidence

**Outcome:** Detect bounded repository-local source/test relationships.

Scope:

- ESM imports;
- static CommonJS require;
- safe local path resolution;
- partial semantics for unsupported dynamic behavior.

Acceptance:

- direct-import fixtures pass;
- unsupported dynamic loading never becomes confirmed evidence.

## EPIC-006 — Evidence Ranking

**Outcome:** Rank candidate tests consistently.

Scope:

- evidence normalization;
- confidence classification;
- deterministic tie-breaking;
- ambiguity reporting.

Acceptance:

- repeated identical runs produce byte-stable normalized recommendations.

## EPIC-007 — Risk Classification

**Outcome:** Determine required verification breadth from observable signals.

Scope:

- low/medium/high/critical/unknown;
- shared/exported files;
- broad consumers;
- config/package/release/security-sensitive files.

Acceptance:

- each non-unknown risk has structured supporting signals;
- heuristics cannot silently elevate certainty.

## EPIC-008 — Verification Planning

**Outcome:** Produce minimum/recommended/release verification scopes.

Scope:

- targeted tests;
- package suite;
- typecheck;
- build;
- release checks.

Acceptance:

- plans contain provenance;
- no command is represented as executed or passed.

## EPIC-009 — CLI + Library API

**Outcome:** One core engine accessible through both interfaces.

Acceptance:

- CLI/library parity tests pass;
- stdout is machine-readable JSON;
- diagnostics are structured.

## EPIC-010 — Security + Bounds

**Outcome:** Prove resource and trust boundaries.

Acceptance:

- root escape;
- symlink;
- secret;
- timeout;
- file/byte/result bounds;
- malformed evidence inputs;

all have tests.

## EPIC-011 — Agent Skill Integration

**Outcome:** Publish an agent-facing skill describing correct operation and result handling.

Acceptance:

- agent workflow explains `complete != tests passed`;
- no skill instruction encourages hidden test execution.

## EPIC-012 — Packaging + Release Evidence

**Outcome:** Produce a reproducible npm package.

Acceptance:

- clean install;
- build;
- verification;
- coverage;
- schemas;
- packaged CLI/library smoke;
- benchmark;
- docs consistency;

all pass before release.
