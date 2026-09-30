# Agent Error Lens Epics

Last reviewed: 2026-09-13

Status axes are independent:

- Planned: scope and acceptance are documented.
- Implemented: repository code exists.
- Verified: applicable checks have passed against that code/artifact.
- Released: an exact version is published and independently read back.

## E0 — Contract hardening

Outcome: freeze the smallest safe public contract before parser development.

Scope:

- input and result schemas;
- diagnostic, producer, evidence, issue, warning, truncation, and stats types;
- parser versus producer outcome semantics;
- stable ID, deduplication, ordering, null, Unicode, and serialization rules;
- offset mapping, redaction, path, work-budget, CLI exit, package, and compatibility decisions.

Acceptance:

- executable schema and TypeScript types have one source of truth;
- Golden contract examples validate;
- unresolved public decisions are closed or explicitly deferred;
- architecture review confirms no reasoning/execution responsibility leaked into the package.

State: Contract artifacts and boundary decisions implemented and verified; downstream core, producer, and interface work is tracked in E1-E4, while full quality and release remain incomplete.

## E1 — Bounded input and normalization core

Outcome: turn untrusted artifacts into a bounded parse view with reversible evidence mapping.

Scope:

- request validation;
- deterministic work budgets;
- UTF-8/decoded string and newline handling;
- ANSI and terminal normalization;
- raw-to-normalized offset mapping;
- lexical path containment.

Acceptance:

- all fixed and secondary work budgets are enforced deterministically;
- normalized evidence maps to exact raw artifact ranges;
- malformed, excessive, unsupported, and outside-root inputs fail closed;
- processing performs no network, subprocess, or repository writes.

State: Implemented and verified for bounded normalization plus generic-structured parsing; approved producer adapters are now also verified under E2, while canonical quality and release remain incomplete.

## E2 — V0.1 producer adapters

Outcome: extract evidence-backed candidates from the approved V0.1 producer set.

Scope:

- generic structured diagnostics;
- TypeScript;
- Vitest;
- ESLint;
- conservative generic text fallback;
- mixed/nested producer attribution.

Acceptance:

- every adapter has positive, negative, malformed, multiline, ANSI, and bounded fixtures;
- exact producer syntax and generic heuristic confidence are separated;
- generic patterns never produce `confirmed`;
- unsupported segments remain explicit.

State: Implemented and verified for the approved V0.1 adapter matrix; canonical output quality, cross-platform proof, and release remain incomplete.

## E3 — Canonicalization and output safety

Outcome: produce minimal, byte-stable, sanitized canonical diagnostics.

Scope:

- normalized severities, phases, messages, codes, locations, and producers;
- secret redaction;
- stable diagnostic IDs;
- deterministic deduplication and evidence union;
- stable ordering, summaries, stats, issues, warnings, and truncation;
- canonical JSON serialization.

Acceptance:

- repeated process runs produce byte-identical output;
- deduplication preserves all distinct evidence;
- secret fixtures do not leak through output, IDs, warnings, snapshots, or errors;
- truncation and uncertainty cannot appear complete or confirmed.

State: Implemented and verified for stable IDs, deterministic deduplication/evidence union, ordering, summaries, statuses, truncation, canonical serialization, and the approved cross-platform quality matrix; release remains incomplete.

## E4 — Library, CLI, and package

Outcome: expose one core implementation through safe library and CLI interfaces.

Scope:

- library `parse` and `capabilities`;
- CLI `parse` and `capabilities`;
- stdin/stdout/stderr and exit-code behavior;
- npm exports, declarations, executable mapping, package contents, and compatibility;
- dependency and license review.

Acceptance:

- CLI and library canonical results are equivalent;
- producer failure cannot become an Error Lens process failure;
- clean consumers can import the packed library and run the packed CLI;
- package metadata and contents match the approved contract.

State: Library/CLI interface behavior, packed consumer/CLI checks, and cross-platform proof are implemented and verified against the shared core; release remains incomplete.

## E5 — Verification and release evidence

Outcome: prove the source, package, and released artifact independently.

Scope:

- static, unit, fixture, determinism, security, resource, parity, and agent-facing E2E checks;
- approved cross-platform Node/OS CI matrix;
- tarball and clean-install verification;
- release documentation and rollback guidance;
- tag, release, registry, integrity, and `gitHead` readback.

Acceptance:

- all applicable rows in the verification matrix pass at exact HEAD;
- the packed artifact passes independent consumer and CLI smoke tests;
- version, tag, release, and registry evidence agree;
- `PROGRESS.md` separately records Implemented, Verified, and Released state.

State: In progress for release evidence. V0.1 source verification and the first three release-preparation acceptance items are implemented and verified: README/CHANGELOG/ADR/runbook/workflow, package metadata, 73-file tarball inspection with stable dry-run integrity, and packed consumer/CLI smoke. Exact-HEAD run `34731128500` passes all 9 Node/OS jobs; authorized tag, release CI, npm ownership, registry artifact, registry integrity, and `gitHead` evidence remain unverified and unreleased.

## Dependency order

```text
E0 Contract
  -> E1 Bounded core
  -> E2 Adapters
  -> E3 Canonical output safety
  -> E4 Interfaces/package
  -> E5 Verification/release
```

Some fixture design may begin during E0, but producer implementation must not outrun the public contract.
