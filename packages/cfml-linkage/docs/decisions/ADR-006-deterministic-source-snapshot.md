# ADR-006: Snapshot supported source deterministically before parsing

> **Status: PROVISIONAL / M1 PARTIAL.** The snapshot implementation and tests cover the current foundation; broader parser/cache integration remains open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Discovery, source fingerprints, metadata, ignores, symlink handling, and snapshot limits |
| Source of truth | `src/snapshot.js`, `test/snapshot.test.js`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed, including deterministic discovery, configured ignore-glob/hidden-file policy matching, repeatability, content change, symlink, limit, and no-execution cases |
| Verification | Snapshot implementation verified locally on Node `v25.2.1`; cross-platform and parser integration remain unverified |
| Limitations | Complete drift recovery, worker ordering, cache invalidation, and CI matrix are not implemented; richer glob syntax, generated-file detection, and filesystem-specific hidden attributes remain bounded/open |

## Decision

The M1 snapshot reads bytes but never decodes or executes source. It:

- discovers `.cfm`, `.cfml`, `.cfc`, `.html`, `.htm`, `.js`, `.mjs`, and `.css` files;
- sorts directory entries and final files with deterministic code-unit ordering;
- ignores default dependency/generated/cache/secret directory names, configured root-relative `ignoreGlobs` patterns, and dot-prefixed entries when `hiddenFilePolicy` is `ignore`;
- records root-relative POSIX path, canonical real path, byte count, mtime, and content SHA-256;
- calculates a project source fingerprint from sorted relative paths and content hashes, excluding mtime and volatile creation time;
- does not follow symlinks and reports skipped symlinks as incomplete diagnostics;
- detects a file changing during the read and reports snapshot drift;
- enforces file and byte limits with explicit incomplete/resource diagnostics.

The `createSnapshot` API consumes the canonical root guard from `src/root-guard.js`. It returns derived snapshot state; it does not mutate source and is not yet the authoritative Graph IR producer.

## Consequences

The parser can consume a stable, bounded file set and incremental logic can distinguish content freshness from filesystem metadata. Ignoring or rejecting unsafe entries may produce incomplete output, which is intentional. The current implementation uses synchronous filesystem operations for simple deterministic behavior; bounded worker concurrency is deferred until evidence justifies it.
