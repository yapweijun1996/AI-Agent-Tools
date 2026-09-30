# ADR-002: Use content-independent deterministic identities and canonical ordering

> **Status: PROVISIONAL / T-003 VERIFIED (BOUNDED).** The identity rules are documented, fixture-checked, and exercised by the bounded Graph producer; broader platform behavior remains open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Graph/Fact identity, ordering, freshness, and duplicate evidence |
| Source of truth | This ADR, `SPEC.md`, `src/graph.js`, and deterministic repeat-run tests |
| Evidence | `examples/identity-order-v0.1.json`; inline deterministic reference check |
| Verification | Contract fixture/reference, bounded Graph identity/order, and aggregate repeatability checks pass; cross-platform identity behavior remains unverified |
| Limitations | Filesystem case behavior, Unicode normalization, and producer integration remain open |

## Context

Agents need to compare graph results across runs and source edits. Source hashes are necessary freshness evidence but must not cause a semantically unchanged file or symbol to receive a new identity. Parallel parsing must also produce the same serialized order.

## Decision

### Canonical paths

1. Convert separators to `/`.
2. Resolve `.` segments.
3. Reject `..` segments that escape the canonical analysis root; do not normalize them into a target.
4. Store project-relative paths only in Graph/Fact IR.
5. Preserve path case in the canonical value. If the filesystem exposes case-colliding paths, emit an explicit diagnostic and do not silently choose one.
6. Keep source content hashes, parser versions, and snapshot fingerprints in freshness fields, never identity fields.

### Node identity

Define the node identity tuple as:

```text
(kind, canonical_path, canonical_symbol_or_semantic_name)
```

The empty string is used when a node has no symbol. The production ID is:

```text
node:<lowercase hex SHA-256(
  "v0.1" + NUL + "node" + NUL + kind + NUL
  + canonical_path + NUL + canonical_symbol_or_semantic_name
)>
```

The tuple is content-independent. Node kind and symbol semantics are contract inputs; changing either intentionally creates a new identity.

### Edge identity and deduplication

A resolution event carries its source `fact_id`. Exact duplicate events are merged. Semantic duplicates are grouped by `(type, from, to, condition, dynamic)` and retain a sorted unique `source_fact_ids` list plus the union of bounded evidence. The final edge identity is:

```text
edge:<lowercase hex SHA-256(
  "v0.1" + NUL + "edge" + NUL + type + NUL + from + NUL + to + NUL
  + join("\x1f", sorted(source_fact_ids)) + NUL + condition_key
)>
```

`condition_key` is a canonical serialized condition or the empty string. Edge IDs do not contain source text or a source content hash. If evidence differs but the semantic key does not, evidence is merged in canonical order.

### Ordering

Canonical JSON output sorts:

1. `nodes` by `id`;
2. `edges` by `(from, type, to, id)`;
3. `unresolved` by `(source_node, relation_type, span.start_line, span.start_col, id)`;
4. `diagnostics` by `(severity rank, code, id)` where `info < warning < error`;
5. evidence by `(file, start_line, start_col, end_line, end_col, kind, rule_id, normalized)`;
6. fact bundles by `(file, span.start_line, span.start_col, span.end_line, span.end_col, kind, fact_id)`.

Canonical comparison excludes explicitly volatile fields such as snapshot creation time. JSON serialization uses UTF-8 and a stable property order defined by the serializer. Worker completion order must never control output order.

## Consequences

The graph can retain stable node identity across content edits while freshness changes are visible. Hash-based IDs avoid path escaping and collision ambiguity, but are less readable and require a shared implementation. Evidence merging and canonical sorting add work but prevent duplicate or order-dependent agent results.

Case-collision and Unicode policy need platform fixtures before release. Until then, unresolved/diagnostic output is safer than choosing a target.

## Verification fixture

`examples/identity-order-v0.1.json` records canonicalization inputs, expected node/edge IDs, and expected sort keys for the reference algorithm. The bounded Graph producer and aggregate analysis repeat-run tests exercise these rules; broader producer integrations must preserve them before release.
