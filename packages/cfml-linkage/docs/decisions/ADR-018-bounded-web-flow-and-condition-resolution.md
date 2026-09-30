# ADR-018: Bounded Web-Flow and Condition Resolution

- **Status:** Accepted for the bounded T-032 scope
- **Date:** 2026-09-14
- **Decision owners:** Core analyzer boundary

## Context

The bounded scanners already recover form, redirect, `fetch`, jQuery AJAX, and `XMLHttpRequest.open` facts, while the literal path resolver can connect unique in-root targets. A condition on a web-flow fact must remain explainable without executing CFML, JavaScript, browser routing, or endpoint code.

## Decision

Implement `src/web-flow-resolver.js` as a read-only pass that:

1. consumes only explicit Fact IR condition containment and supplied literal path resolutions;
2. emits `ROUTES_WHEN` from the unique condition fact to the resolved target file, preserving flow kind, source flow fact ID, branch kind, and evaluation metadata;
3. preserves missing condition sources, dynamic targets, missing paths, ambiguity, external targets, and unsafe targets as unresolved records;
4. treats jQuery AJAX and `XMLHttpRequest.open` as bounded known-wrapper evidence from the scanner, not as browser or runtime proof; and
5. enforces a positive output-record limit and returns `WEB_FLOW_RESOURCE_LIMIT` with `complete=false` when exhausted.

The mixed scanner merge is ordered by numeric source byte offsets so CFML condition context is applied to embedded web-flow nodes deterministically. No URL normalization beyond the existing path resolver is introduced here.

## Consequences

- Static form, AJAX, fetch, and redirect edges can carry explicit condition evidence through Graph IR.
- Known client wrappers remain visible as bounded metadata while dynamic and runtime behavior stays unresolved.
- Route existence, browser reachability, JavaScript semantics, and full conditional control flow remain unclaimed.

## Verification

- `test/web-flow-resolver.test.js` uses the inert `fixtures/golden/web-flow-and-conditions/` fixture to verify literal form/AJAX/fetch/redirect targets, wrapper labels, condition edges, deterministic repeatability, Graph materialization, unresolved condition sources, and non-execution boundaries.
- The full `npm test` suite reports 95 passed; produced Graph IR and contract examples pass local Draft 2020-12 validation.
