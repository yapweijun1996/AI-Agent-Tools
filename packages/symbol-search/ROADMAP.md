# agent-symbol-search Roadmap

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Planning horizon | Sequenced by evidence, not dates |

This roadmap describes sequencing and future intent. Runtime capability claims come from the package, schemas, tests, and capability output, not from this document.

## Baseline

**Status: Completed for V1 TypeScript — package implemented and verified in the current working tree.**

The repository now contains a Node.js/TypeScript package, schemas, CLI/library API, fixtures, contract/security tests, native coverage gates, CI configuration, release metadata, a benchmark baseline, and an agent-facing skill. Packages `0.1.1` and `0.1.2` were published publicly on 2026-09-08. Version `0.1.2` is a documentation-only patch that distributes the skill and npm integration guide; it does not change runtime behavior. The original documentation-only baseline remains visible in Git history; it is not current runtime state.

## Phase 0 — Contract foundation

**Status: Completed**

### Outcome

Freeze and execute the machine-readable contract before expanding parser coverage.

### Delivered

- package and Node.js runtime policy;
- request, result, and capability schemas with runtime validation;
- status, diagnostics, failure codes, limits, ranges, identity, confidence, and ordering;
- deterministic TypeScript project selection, including multiple-config ambiguity and no-config fallback;
- CLI JSON stdout, stderr diagnostics, and exit behavior;
- contract validation tests.

### Evidence

`npm run verify` passes the schema and contract suite from the current working tree; `npm ci` and `npm run build` reproduce the package.

## Phase 1 — TypeScript vertical slice

**Status: Completed**

### Outcome

Provide verified symbols, definitions, references, aliases, and explicit implementations for TypeScript.

### Delivered

- bounded discovery and root/security boundary;
- TypeScript Program/checker integration;
- declaration extraction and normalized kinds;
- semantic definition and reference traversal;
- explicit `implements`, `extends`, and supported abstract-method relationships;
- deterministic ranking and bounded output;
- honest partial/ambiguity behavior without structural or dynamic implementation claims;
- shared CLI and library API.

### Evidence

TypeScript golden, false-positive, project-selection, ambiguity, limit, CLI, and repeated-output tests pass. `npm run smoke:pack` verifies the installed tarball outside the source checkout.

## Phase 2 — JavaScript

**Status: Proposed**

### Outcome

Reuse the TypeScript infrastructure for a documented JavaScript subset, including explicitly tested ESM/CommonJS behavior.

### Dependencies

Phase 1 stability and separate JavaScript capability tests.

### Evidence required

A JavaScript fixture matrix and capability output that distinguishes full, partial, candidate, and unsupported cases. No JavaScript capability is shipped by V1.

## Phase 3 — Python

**Status: Proposed**

### Outcome

Add structured symbols and bounded import/reference heuristics without claiming Python type-checker-level semantics.

### Dependencies

Stable core contract, parser choice, and import-resolution design.

### Evidence required

Python fixtures with `strong`, `candidate`, and `unknown` results; dynamic behavior must never be reported as confirmed.

## Phase 4 — CFML

**Status: Proposed**

### Outcome

Support an explicit tag/script/component subset and honest parser-aware evidence.

### Dependencies

CFML syntax fixture set and parser strategy.

### Evidence required

Tag and script function fixtures, documented unsupported runtime dispatch, and capability output that does not claim implementation resolution.

## Phase 5 — Ecosystem integration

**Status: Proposed**

### Outcome

Allow `agent-code-slice` and future agent tools to consume stable locators through the library API. Consider an optional MCP wrapper without moving reasoning into the core.

### Dependencies

Stable package API and installed-artifact verification.

### Evidence required

An integration workflow test: symbol search → code slice, with no mega-tool behavior.

## Phase 6 — Performance and release readiness

**Status: Completed**

### Outcome

Measure bounded scaling, establish stable release gates, and prepare a public package without claiming an unmeasured performance SLO.

### Delivered

- `BENCHMARK.md` records cold and warm in-memory files, bytes, time, memory, matches, and truncation for generated small, medium, and large fixtures; every fixture is rejected if it reaches `TIMEOUT`.
- Native Node coverage measures product sources only with lines ≥85%, functions ≥80%, and branches ≥75%; normal tests use a 30-second `EngineOptions` budget while production remains 5 seconds.
- GitHub Actions runs Ubuntu Node 22/24/26 quality, Node 24 package smoke on Ubuntu/macOS/Windows, and the Ubuntu/Node 24 benchmark check with `contents: read`.
- Package metadata, `prepack`, `release:check`, `prepublishOnly`, and `RELEASE.md` support the published public unscoped npm releases `agent-symbol-search@0.1.1` and `agent-symbol-search@0.1.2`.

### Remaining evidence

The green CI workflow, npm registry verification, fresh install, annotated tag, and GitHub Release are complete as recorded in `RELEASE.md`. The first local publish does not claim provenance; trusted publishing/provenance is a next-release follow-up.

## Next release follow-up

Adopt npm trusted publishing and provenance for the next release; `v0.1.2` completed the local interactive publication path without claiming provenance.

## Non-commitments

The project does not currently commit to fuzzy search, embeddings, a daemon, a persistent repository database, full call/dependency graphs, runtime tracing, code modification, natural-language queries, or automatic test selection.
