# ADR-017: Bounded Shared-Scope Resolution

- **Status:** Accepted for the bounded T-031 scope with explicit event/output limits
- **Date:** 2026-09-14
- **Decision owners:** Core analyzer boundary

## Context

CFML includes can share scope writes with their caller, and later writes can override earlier values. The existing Fact IR records literal `cfset` targets, bounded RHS scope references, condition variables, and include order, while the path resolver provides literal include relationships. Runtime request scope and dynamic expressions remain unavailable.

## Decision

Implement `src/scope-resolver.js` as a read-only ordered pass over Fact IR and include resolutions:

1. Expand only literal resolved includes in source-span order, with cycle detection and bounded recursion.
2. Emit `SCOPE_PRODUCES` for statically recovered writes, `SCOPE_CONSUMES` for references with a unique prior producer, and `SCOPE_OVERRIDES` for later writes to the same scope name.
3. Preserve references without a prior producer as `MAPPING_UNKNOWN` unresolved records with bounded candidate IDs.
4. Preserve dynamic scope writes as `DYNAMIC_EXPRESSION` unresolved records.
5. Carry context file and deterministic event order in resolution evidence; keep reverse adjacency and serialized Graph IR responsibilities in the graph boundary.
6. Mark the scope result incomplete when a static include lacks a bounded resolution or an include cycle prevents complete expansion.
7. Enforce positive include-depth, event, and output-record limits; truncation is explicit through `SCOPE_RESOURCE_LIMIT` and `complete=false`.

The pass uses a small lexical scan over already bounded expression text; it does not evaluate CFML, execute includes, or infer runtime scope semantics.

## Consequences

- Include order and basic scope flow are available to Graph IR consumers without executing application code.
- External/request-provided variables remain explicit unresolved evidence.
- Dynamic names, `evaluate`, runtime branching, and full CFML scope semantics remain open for later fixture-backed work.

## Verification

- `test/scope-resolver.test.js` covers ordered production, consumption, overrides, dynamic preservation, missing include coverage, Graph edge materialization, and include-depth/event/output resource bounds; the full `npm test` suite reports 95 passed.
- `test/fact-extractor.test.js` verifies bounded RHS references and condition variables are retained in Fact IR.
