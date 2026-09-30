# ADR-003: Make confidence evidence-gated and incompleteness explicit

> **Status: PROVISIONAL / BOUNDED RESOLVER VERIFIED.** The policy and fixture are documented and checked; bounded resolver/Graph behavior is verified while broader coverage remains open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Confidence levels, unresolved relationships, diagnostics, and completeness |
| Source of truth | This ADR, `SPEC.md`, bounded resolver implementations, and their tests |
| Evidence | `examples/confidence-v0.1.json`; local policy invariant check |
| Verification | Confidence policy fixture and bounded resolver/Graph confidence, unresolved, and completeness behavior checks pass; broader resolver coverage remains unverified |
| Limitations | Exact parser diagnostics and resolver coverage depend on future implementation |

## Context

Static linkage often has several plausible interpretations. A numeric score or a filename convention can look precise while hiding ambiguity. The graph must help agents distinguish a unique static fact from a candidate and from a relationship that cannot be safely resolved.

## Decision

### Confidence gates

| Level | Required evidence | Prohibited promotion |
| --- | --- | --- |
| `confirmed` | Exact supported syntax, one unique in-root deterministic target, bounded evidence, and no dynamic target resolution | Filename similarity, LLM output, numeric score, or unresolved/partial evidence |
| `strong` | Unique deterministic target supported by bounded mapping or type inference, with no unresolved target choice | Ambiguous candidates, dynamic target expressions, numeric score alone |
| `candidate` | One or more statically plausible targets, or a statically visible external/deployment binding whose final target is not proven | Treating the result as a unique authoritative edge |
| `unresolved` | Insufficient evidence to choose a safe target | Guessing a target to improve coverage |

Resolvers submit evidence but never assign a higher class than the central policy permits. Numeric scores are optional telemetry and cannot promote a class. A `dynamic=true` edge cannot be `confirmed`.

### Unresolved relationships

Unresolved relationships are normal analysis output. Each record keeps the source node, relation type, normalized expression, span, reason code, bounded evidence, candidates, and an optional suggested resolution. Candidate IDs are retained only when statically plausible; an empty candidate list is valid.

### Completeness

`complete=true` means all requested files were safely read and all enabled required stages completed for the declared capability scope. It does not mean every dynamic relationship was resolved. Set `complete=false` when any requested source has partial/unsupported parsing, a snapshot changes during analysis, a resource limit is exhausted, or required resolver coverage is unavailable or fails closed. Out-of-root rejection remains a distinct access/input outcome.

### Diagnostics

Diagnostics are structured and bounded. Planned codes include `PARSE_PARTIAL`, `UNSUPPORTED_SYNTAX`, `DYNAMIC_EXPRESSION`, `AMBIGUOUS_TARGET`, `OUTSIDE_ROOT`, `PATH_NOT_FOUND`, `EXTERNAL_TARGET`, `SNAPSHOT_DRIFT`, `RESOURCE_LIMIT`, `CACHE_REBUILT`, and `INTERNAL_INVARIANT`. An internal invariant failure is an internal error, not a clean incomplete result.

## Consequences

Agents can safely filter confirmed/strong edges without mistaking plausible candidates for facts. Dynamic legacy behavior produces more unresolved records and may reduce completeness, but this is preferable to false authoritative links. The central policy becomes a compatibility boundary that every resolver and plugin must obey.

## Verification fixture

`examples/confidence-v0.1.json` covers positive levels, ambiguity, dynamic expressions, partial parsing, score non-promotion, and completeness conditions. The bounded resolver and Graph test suites exercise these decisions; broader resolver implementations must preserve them.
