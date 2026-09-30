# ADR-009: Keep cache disposable and freshness fingerprinted

> **Status: PROVISIONAL / M1 PARTIAL.** The cache skeleton and invalidation tests are implemented; Fact IR storage, parser versions, and broader cache integration remain open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Cache record shape, configuration/version fingerprints, file invalidation, corruption, and storage boundary |
| Source of truth | `src/cache.js`, `test/cache.test.js`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed, including key-order fingerprints, add/change/remove detection, stale contexts, atomic replacement, corruption, and path-boundary cases |
| Verification | Local Node tests pass; parser/fact cache integration and cross-platform filesystem behavior remain unverified |
| Limitations | Cache stores metadata only; it does not yet persist Fact IR, indexes, resolver results, or query state |

## Decision

The cache is a disposable, root-contained JSON optimization and never the source of truth. A record includes a versioned schema, canonical root, project cache key, source fingerprint, configuration fingerprint, parser/extractor/resolver fingerprints, and sorted per-file content hashes/byte counts. Source text and ASTs are not stored by this skeleton.

Configuration fingerprints recursively sort object keys while preserving array order. The project cache key combines source/configuration/parser/extractor/resolver fingerprints. Comparing records returns `fresh`, `miss`, `corrupt`, or `stale` with a specific reason and sorted added/changed/removed paths. Any source, configuration, parser, extractor, resolver, or root change prevents reuse.

Storage defaults to `.agent-cfml-linkage-cache/state.json` beneath the guarded root. Writes use a private temporary file and replacement; corrupt or stale state is safe to discard and rebuild. Cache paths are admitted by the root guard, and the snapshot ignores the cache directory.

## Consequences

Cache invalidation is explicit and inspectable rather than inferred from mtime alone. A cache failure can reduce performance but cannot authorize guessed linkage or bypass safety policy. The current synchronous JSON store is intentionally small; bounded Fact IR/index persistence and concurrency are deferred until those producers exist.
