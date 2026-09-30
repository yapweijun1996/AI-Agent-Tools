# ADR-015: Bounded Graph Construction and Reverse Adjacency

- **Status:** Accepted for the bounded T-025 scope
- **Date:** 2026-09-14
- **Decision owners:** Core analyzer boundary

## Context

Fact extraction and literal path resolution now produce deterministic evidence, but consumers need one Graph IR document without losing unresolved relationships. The graph contract also requires referential integrity and bounded reverse lookup support. Broader CFC, scope, repository, and runtime resolution is not available yet.

## Decision

Implement `src/graph.js` as a pure boundary over Fact IR and optional bounded resolution output:

1. Create stable, content-independent node IDs from node kind, project-relative path, and canonical semantic name.
2. Create stable edge IDs from relation type, endpoints, source fact IDs, and condition identity.
3. Convert only supported bounded resolutions into forward edges. Preserve dynamic, missing, external, unsafe, ambiguous, unsupported, and unimplemented relationships as unresolved records.
4. Represent visible SQL tables and literal datasources as evidence-backed nodes and query edges.
5. Validate duplicate IDs, supported edge types, endpoint existence, and unresolved source nodes before returning a graph.
6. Keep reverse adjacency as a separate immutable derived index (`buildReverseAdjacency`) so the versioned Graph IR schema remains the serialized source contract.
7. Mark graph completeness false when Fact IR or the supplied resolver result is incomplete; unresolved records alone do not imply failure.
8. Apply the configured final `max_edges` cap after deterministic edge ordering, retain the bounded prefix, emit `RESOURCE_LIMIT`, and derive reverse adjacency from retained edges.

The builder never executes source or resolves a candidate by filename similarity, LLM output, or runtime behavior. Its output remains bounded by the input facts, resolutions, and snapshot fingerprints.

## Consequences

- Graph IDs and ordering are repeatable for the same semantic inputs and injected timestamp.
- The graph can be schema-validated and consumed even when resolution is partial.
- Reverse callers/callees lookup is available without making derived indexes part of the serialized contract.
- Broader runtime linkage, graph persistence, and public query integration remain explicitly unimplemented; bounded query operations are supplied by the separate `src/graph-query.js` T-035 engine and exposed through the private T-045 CLI, while repository/action edges are supplied by the separate bounded T-034 resolver.

## Verification

- `test/graph.test.js` covers deterministic output, resolved/unresolved preservation, graph completeness, validation, and immutable reverse adjacency.
- `test/analyzer.test.js` covers configured edge-budget truncation, incomplete diagnostics, and reverse-adjacency consistency; the full `npm test` suite reports 95 passed.
- The bounded graph output passes local Draft 2020-12 validation against `schema/agent-cfml-linkage-graph-v0.1.schema.json`.
