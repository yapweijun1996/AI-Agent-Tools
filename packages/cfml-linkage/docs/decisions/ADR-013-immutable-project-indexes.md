# ADR-013: Build immutable indexes before resolution

> **Status: PROVISIONAL / T-023 VERIFIED.** The index builder is implemented and tested; bounded cross-file resolvers and Graph IR consumers are now present, while broader resolution remains open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Path, component, method, application, mapping, custom-tag, symbol, query, and per-file fact indexes |
| Source of truth | `src/project-index.js`, `test/project-index.test.js`, this ADR, and `ARCHITECTURE.md` |
| Evidence | `npm test`: 95 passed; reversed fact input produces identical indexes and ambiguity is retained |
| Verification | Unique/missing/ambiguous lookup states, frozen copied facts, source-file mismatch diagnostics, and deterministic ordering pass locally |
| Limitations | Indexes are an internal library boundary; broader resolver coverage, public API, and cache integration remain outside this slice |

## Decision

`buildProjectIndexes()` consumes a Fact IR bundle and optional snapshot metadata, sorts facts by the Fact IR canonical key, deep-copies/freeze-protects values, and builds plain immutable lookup records. It exposes `lookupIndex()` so consumers receive `missing`, `unique`, or `ambiguous` states rather than silently selecting a candidate.

The indexes are:

- `pathIndex` for discovered source-file metadata;
- `componentIndex`, `methodIndex`, `applicationIndex`, `mappingIndex`, `customTagIndex`, and `symbolIndex` for statically known symbols;
- `queryIndex` for source files, visible tables, and literal datasources;
- `factByFile` for all facts, including dynamic or unresolved evidence.

Unknown or dynamic facts are retained in `factByFile` but are not promoted into symbol indexes. Facts referencing a source file absent from the source index produce an explicit error and make the index incomplete without dropping the fact. Candidate arrays remain sorted and frozen; index objects are null-prototype records to avoid prototype-key collisions.

## Consequences

Resolvers can consume stable read-only lookups without depending on parser order or mutating a shared index. Ambiguity is represented as data and is available for conservative unresolved results. Deep copying adds bounded cost, but protects the source Fact bundle and preserves the one-way data flow. This is not evidence that a target resolves; resolution remains a later task.
