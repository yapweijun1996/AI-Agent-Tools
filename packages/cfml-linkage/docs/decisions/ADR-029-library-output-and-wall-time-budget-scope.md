# ADR-029: Define the bounded library output and wall-time budget scope

- **Status:** Accepted for bounded T-037/T-038/T-039
- **Date:** 2026-09-15
- **Scope:** Private-library serialization, wall-time enforcement, and budget-contract regression coverage
- **Dependencies:** ADR-004, ADR-024, ADR-025, and ADR-026
- **Verification:** `src/output.js`, `src/cli.js`, `src/index.js`, `src/analyzer.js`, `src/snapshot.js`, `src/fact-extractor.js`, and the bounded analyzer/CLI regression tests verify T-037/T-038/T-039 for their bounded scopes; the full analyzer/release gate remains unverified

## Context

The v0.1 configuration already requires `limits.max_output_bytes` and `limits.max_wall_time_ms`. The private CLI and private library now share a bounded serialized-output helper, and the library enforces the Graph edge and evidence caps. T-038 now provides bounded library wall-time enforcement, and T-039 provides the bounded cross-budget regression gate, while T-037–T-039 retain executable scope.

## Decision

Define the reserved work as three bounded tasks:

- **T-037 — Library serialized-output budget:** implemented a named private-library `serializeAnalysis` boundary for analysis/query results. It counts UTF-8 bytes of the exact serialized JSON, shares the byte-counting helper with the CLI, and never truncates JSON arbitrarily. A cap hit returns an explicit `OUTPUT_LIMIT` incomplete result with bounded diagnostics; the structured `analyzeProject` object remains separate from its serialized form.
- **T-038 — Library wall-time budget:** enforce `limits.max_wall_time_ms` through a monotonic deadline with checks at stage boundaries and bounded per-file/per-record loops. A deadline returns preserved partial evidence, `complete=false`, and a deterministic `TIME_LIMIT` diagnostic identifying the limit and stage. Synchronous parser calls are not claimed to be preemptively cancellable; any non-cooperative backend limitation must remain explicit.
- **T-039 — Budget contract regression gate:** verify ownership, diagnostic codes/details, incomplete-result semantics, deterministic ordering, interaction of multiple limits, schema validity, and CLI/library parity for all configured budgets. The bounded analyzer/CLI regression coverage verifies combined edge/evidence/serialization behavior, deterministic partial results, Graph validity, and no-execution behavior. The gate must prove that budget handling does not execute source or weaken root, network, database, shell, browser, or secret-boundary controls.

T-037, T-038, and T-039 are implemented and verified for their bounded private-library output, wall-time, and cross-budget regression scopes. The wall-time boundary is cooperative: discovery/parse/Fact loops and resolver stage boundaries checkpoint a monotonic deadline, but a synchronous parser call is not preemptively cancellable. This ADR does not expand parser grammar, resolver coverage, graph persistence, or release scope.

## Acceptance boundary

A task may move to **Verified** only when its source, focused tests, relevant contract updates, and reproducible evidence are present. A time cap that cannot interrupt a synchronous backend must not be reported as a hard runtime kill; the result must identify the limitation or the backend must provide a bounded cancellation checkpoint.

## Consequences

The bounded budget tranche is complete without changing the current private/unreleased boundary. Existing Graph edge/evidence limits, the shared private library/CLI output helper, the cooperative wall-time budget, and the cross-budget regression coverage are authoritative for their bounded scopes. Public compatibility and release claims remain blocked by the broader gaps recorded in `PROGRESS.md`.
