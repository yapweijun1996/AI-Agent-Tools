# ADR-025: Enforce the bounded library evidence budget

- **Status:** Accepted for bounded v0.1 implementation
- **Date:** 2026-09-15
- **Scope:** T-048 global evidence-item enforcement in the private analysis/library pipeline
- **Verification:** `test/analyzer.test.js` covers deterministic truncation, incomplete status, diagnostic details, retained evidence count, and Graph validation; the full `npm test` suite passes locally (95 tests)

## Context

The v0.1 configuration contract requires `limits.max_evidence`, and the Graph IR counts evidence attached to nodes, edges, and unresolved records. Before this change, the private CLI validated that field but the library pipeline did not enforce it. A caller could therefore receive more evidence than the declared bound while the result still appeared to honor the policy.

## Decision

`analyzeProject` reads the optional library `maxEvidence` option or configured `limits.max_evidence`, defaulting to the bounded v0.1 evidence ceiling when no value is supplied. `buildGraph` applies one global limit after deterministic node, edge, and unresolved ordering is established.

Evidence is retained in this deterministic priority order:

1. edge evidence;
2. unresolved-record evidence;
3. node evidence.

When the cap is exceeded, evidence arrays are conservatively reduced to the allowed prefix, the graph remains structurally present, `stats.evidence_count` reports the retained count, `complete` becomes `false`, and a `RESOURCE_LIMIT` diagnostic includes `max_evidence`. No relationship or target is guessed, and the resulting Graph IR continues through validation.

## Consequences

The private library and CLI now share the configured evidence budget. A low cap can leave some records with incomplete evidence; the explicit diagnostic and incomplete status prevent that result from being treated as fully covered. Output-size and wall-time budgets remain separate boundaries.

This decision does not add parser coverage, runtime behavior, graph persistence, or a public release API. The separate T-049 edge budget is enforced on the final Graph edge set; T-037 provides bounded private-library serialized-output enforcement, T-038 provides the cooperative wall-time boundary, and T-039 verifies bounded cross-budget behavior. The package remains private and non-executing.
