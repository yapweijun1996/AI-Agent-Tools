# ADR-026: Enforce the bounded library Graph edge budget

- **Status:** Accepted for bounded v0.1 implementation
- **Date:** 2026-09-15
- **Scope:** T-049 final Graph edge-count enforcement in the private analysis/library pipeline
- **Verification:** `test/analyzer.test.js` covers configured truncation, deterministic output, incomplete status, diagnostic details, Graph validation, and reverse adjacency; the full `npm test` suite passes locally (95 tests)

## Context

The v0.1 configuration contract requires `limits.max_edges`, but the prior implementation used that value only to bound some resolver records. The final Graph could still contain more edges than the declared limit, especially for path and CFC resolutions whose resolver outputs were not uniformly capped. This made the library result's Graph IR boundary weaker than the configuration contract.

## Decision

`analyzeProject` accepts an optional `maxEdges` override or reads `limits.max_edges`, defaulting to the bounded v0.1 edge ceiling when no value is supplied. `buildGraph` applies the limit after it has created and deterministically sorted the final Graph edge set.

When the edge count exceeds the cap, the Graph retains the deterministic prefix of its sorted `edges` array, marks `complete` false, and appends an error-level `RESOURCE_LIMIT` diagnostic with `details.max_edges`. Nodes and unresolved records are retained, Graph statistics report the retained edge count, and `buildReverseAdjacency` is built from the retained edges only. Graph validation still runs; no target or relationship is guessed.

The private CLI passes its validated `limits.max_edges` to both the bounded resolver-record stages and the final Graph edge boundary. The latter is authoritative for the serialized Graph edge count.

## Consequences

The library Graph IR now honors the declared final edge budget with deterministic partial output and explicit incompleteness. A capped result cannot be treated as a complete graph, and its reverse adjacency remains referentially consistent with the retained edge set.

This decision does not add parser coverage, runtime behavior, graph persistence, or a public release API. T-037 separately provides bounded private-library serialized-output enforcement and T-038 provides the cooperative wall-time boundary. The package remains private and non-executing.
