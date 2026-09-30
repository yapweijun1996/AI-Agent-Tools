# ADR-007: Decode only strict UTF-8 and preserve source coordinates

> **Status: PROVISIONAL / M1 PARTIAL.** Strict decoding and source-map behavior are implemented and tested; parser integration remains open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Source encoding, BOM handling, byte offsets, line/column spans, and invalid input |
| Source of truth | `src/source-map.js`, `test/source-map.test.js`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed, including multibyte UTF-8, BOM, invalid encoding, and range cases |
| Verification | Local Node tests pass; parser coordinate compatibility and cross-platform matrix remain unverified |
| Limitations | Only UTF-8 is accepted; parser-specific column conventions and non-UTF-8 source policy remain outside this slice |

## Decision

Accept strict UTF-8 only. Preserve a UTF-8 BOM in decoded text so byte offsets remain aligned; do not silently repair invalid bytes or fall back to Latin-1/system encoding. Invalid input returns `valid=false`, `complete=false`, no decoded text/map, and an `INVALID_ENCODING` diagnostic.

`SourceMap` maps zero-based byte offsets to one-based lines and zero-based JavaScript UTF-16 code-unit columns. It maps valid line/column positions back to byte offsets and returns Graph-compatible spans. Offsets inside a multibyte code point are reported as non-exact rather than fabricated; positions inside a surrogate pair are rejected.

The decoder and map are pure source-data processing. They do not execute, evaluate, or interpret CFML, JavaScript, SQL, or application code.

## Consequences

All later parser and resolver diagnostics can use one coordinate convention, including multibyte and CRLF content. Strict UTF-8 may mark legacy encoded files incomplete, but silent decoding would corrupt evidence and make source locations untrustworthy. Parser adapters must convert their native coordinates through this map before emitting facts.
