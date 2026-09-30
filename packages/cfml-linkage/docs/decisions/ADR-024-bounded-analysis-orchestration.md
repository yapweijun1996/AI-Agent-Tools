# ADR-024: Bounded analysis orchestration and library boundary

- **Status:** Accepted for bounded v0.1 implementation
- **Date:** 2026-09-14
- **Scope:** T-036 composition of the existing static-analysis stages

## Context

The repository had independently verified root, snapshot, parser, Fact, index, resolver, Graph, and query modules, but no single library entry point or CLI command connected them. Calling individual modules left ordering, diagnostic merging, and snapshot-drift handling to each consumer.

## Decision

Implement `analyzeProject` in `src/analyzer.js` as the only bounded composition owner. It runs, in order:

`RootGuard → Snapshot → read/parse → Fact IR → immutable indexes → literal paths → CFC → shared scope → web flow → repository → Graph → reverse adjacency`.

The parser backend remains explicit. The library defaults to the parser adapter's fail-closed unavailable result; the CLI explicitly injects the dependency-free mixed structural scanner and therefore reports incomplete coverage for unsupported syntax. Each snapshot path is re-admitted through the root guard before source reads. Resolutions are merged by deterministic IDs, diagnostics are retained, and the source is checked for metadata/content drift before and after parsing. The result exposes Fact IR, merged resolution evidence, Graph IR, and immutable reverse adjacency under `agent-cfml-linkage-analysis/v0.1`.

`src/index.js` and the package `exports` field provide the private library boundary. The CLI `analyze` and `index` commands use the same bounded pipeline and preserve the existing JSON/stdout and diagnostic/stderr envelope. T-045 maps the recognized query commands to the same fresh bounded pipeline and the immutable Graph query engine; graphs are not persisted between invocations.

## Consequences

- Consumers no longer need to reproduce resolver ordering or merge behavior.
- A missing parser backend remains explicit and cannot be silently replaced.
- The current CLI is useful for bounded structural analysis but may return exit code `3` for unsupported or partial coverage.
- This does not establish full CFML grammar coverage, runtime inference, all configuration limits, graph persistence, public-release compatibility, or application execution.
