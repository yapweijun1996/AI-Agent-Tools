# Design

`aptree` scans a workspace without executing project code. It emits deterministic JSON envelopes containing nodes, edges, provenance, freshness, stable IDs, and root-relative paths.

V1 prioritizes Node/JS/TS projects with generic fallback for docs and text assets. The scanner records local JS/TS import edges without resolving packages or executing code.

Static evidence adapters enrich the same graph/evidence plane instead of creating a second state model. The package/test adapters read bounded repository files, emit provenance-backed evidence nodes (`package`, `package-manager`, `package-lock`, `test-framework`) and reuse file test nodes/edges for `tests-for` and `impact`. Malformed or conflicting metadata is represented as evidence status, not as an exception that aborts generic scanning.

Public JSON compatibility is documented by a small hand-maintained schema in `schemas/aptree.schema.v1.json`, which is packaged with the CLI/library and tested against representative command envelopes.
