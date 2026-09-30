# ADR-022: Adversarial fixture safe-failure boundary

- **Status:** Accepted for bounded v0.1 implementation
- **Date:** 2026-09-15
- **Decision owners:** Project implementation

## Context

A static linkage tool must not turn syntax-like text, malformed input, ambiguous names, or path escapes into confirmed relationships. The repository also needs inert fixtures that prove these boundaries without executing application code or requiring a full CFML grammar.

## Decision

Maintain separate inert negative and adversarial fixtures for:

- duplicate direct and mapped components, with candidate-bearing ambiguity records;
- parent-traversal include expressions, with `OUTSIDE_ROOT` evidence;
- malformed and unsupported CFML, with parser diagnostics and incomplete results;
- comments and strings in CFML, HTML, JavaScript, and CSS, without false linkage facts;
- ordered include cycles, with incomplete scope expansion and `SCOPE_INCLUDE_CYCLE` evidence.

The mixed web scanner skips CFML script regions while scanning bounded HTML structures, but continues to extract visible `cfquery` SQL separately. This prevents script-string markup from becoming HTML facts without claiming general CFML grammar coverage.

## Consequences

- Fixtures are read and parsed only by injected structural scanners; `source_execution` remains `false`.
- Unresolved, candidate, diagnostic, and incomplete states remain observable and deterministic.
- Resource-limit checks remain focused unit evidence rather than being hidden in a large fixture.
- Full CFML/script grammar and runtime behavior remain explicitly unclaimed.

## Evidence

- `fixtures/negative/ambiguity-and-out-of-root/`
- `fixtures/negative/malformed-and-partial/`
- `fixtures/adversarial/misleading-and-limits/`
- `test/adversarial-fixtures.test.js`
- `src/web-scanner.js`
- `npm test` reports 95 passed and 0 failed, including CFML block-closure and mixed-node-budget regressions; no source, database, browser, network, or runtime service was accessed.
