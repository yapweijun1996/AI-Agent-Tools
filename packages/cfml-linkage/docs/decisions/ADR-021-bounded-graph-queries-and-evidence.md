# ADR-021: Bounded Graph Queries and Evidence Explanations

- **Status:** Accepted for the bounded T-035 scope
- **Date:** 2026-09-14
- **Decision owners:** Core analyzer boundary

## Context

The bounded Graph IR now contains deterministic nodes, edges, unresolved records, diagnostics, confidence, and source evidence. Coding agents need focused relationship views without loading or mutating the graph, while unresolved and incomplete coverage must remain visible. A query layer must not become an impact-ranking engine or invent runtime relationships.

## Decision

Implement `src/graph-query.js` with three read-only entry points:

1. `createGraphSnapshot(graph)` deep-copies and freezes a validated Graph IR document. Query code reads only this immutable snapshot and never reads project source or executes CFML, JavaScript, SQL, or application code.
2. `queryGraph(snapshotOrGraph, request)` supports bounded `related`, `callers`, `callees`, `includes`, `included-by`, `trace`, `scope-flow`, `tables`, `routes`, `unresolved`, `explain-edge`, `impact-evidence`, and `stats` operations.
3. `validateQueryRequest(request)` validates and normalizes the operation, exact selectors, edge-type list, direction, and traversal bounds without reading a graph.
4. Node selectors are exact IDs or exact path, canonical name, or name values with an optional kind filter. Ambiguous selectors return no target and a diagnostic; no filename similarity or target ranking is used. `explain-edge` requires an exact edge ID.
5. Traversal is cycle-safe and deterministic. `max_results`, `max_depth`, and `max_visited` cap query work; exhausted limits emit diagnostics, retain the bounded result, and set query `complete=false`.
6. Results contain bounded node/edge/unresolved evidence slices. `explain-edge` uses a deterministic template over the recorded relation, confidence, metadata, span, and evidence. It is not an LLM-generated explanation and does not promote confidence.

The query envelope is `agent-cfml-linkage-query/v0.1`. T-045 wires the bounded query commands to fresh analysis graphs, and T-046 reuses request validation from the private CLI configuration boundary; graph persistence and a released public library remain separate tasks.

## Consequences

- Agents can ask focused, repeatable linkage questions while preserving graph completeness and uncertainty.
- Reverse traversal is derived in memory and does not alter the serialized Graph IR.
- Query results are bounded projections rather than a second source of truth; callers can use exact IDs and evidence to inspect the original graph.
- Generic impact prioritization and test selection remain owned by downstream tools.

## Verification

- `test/graph-query.test.js` exercises immutable snapshots, exact selectors, all declared operations, evidence slices, deterministic explanations, unresolved filtering, traversal/result/depth/visited limits, ambiguity, invalid options, and result immutability.
- `npm test` reports 95 passed; the query module re-copies even snapshot-shaped input before freezing, validates bounded request arrays, is syntax-checked, and uses no third-party dependency or runtime/service access.

## Limitations

The implementation does not expose a public package export, validate every JSON Schema property beyond the Graph builder's validator, rank impact, resolve dynamic targets, or claim full parser, runtime, browser, database, or engine behavior. Analysis orchestration exists only through the private bounded entry point.
