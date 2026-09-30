# ADR-010: Keep parser selection behind a fail-closed adapter

> **Status: IMPLEMENTED / M2 PARTIAL.** The parser adapter boundary and diagnostics are verified; an explicit Tree-sitter CFML backend now exists but native loading and full syntax coverage remain unverified. See ADR-030.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Parser backend injection, strict decoding handoff, partial/unsupported diagnostics, and diagnostic bounds |
| Source of truth | `src/parser-adapter.js`, `src/cfml-scanner.js`, `test/parser-adapter.test.js`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed, including unavailable backend, bounded scanner tags/opaque regions, common switch/control/transport/mail/interface tags, switch/case/else Fact conditions, CFML block closure diagnostics, mixed node limits, static/named-argument CFScript linkage forms including `createObject("component", ...)`/`cfinvoke`, quoted/schema-qualified and CTE-safe SQL table forms, configured mappings, generated-directory policy, invalid encoding, partial output, backend failure, limits, and no-execution cases; the pinned optional Tree-sitter backend is covered by fake-parser contract tests |
| Verification | Adapter behavior, JavaScript syntax, and fake-parser contract tests pass locally; native grammar loading, syntax coverage, and engine compatibility remain unverified |
| Limitations | The default backend is deliberately unselected; the Tree-sitter backend is host-unverified and preserves script/embedded regions as opaque; the scanner is not a general grammar and full Fact IR/CFML linkage coverage is not claimed |

## Decision

Define a parser-neutral adapter that accepts source bytes, delegates only to an explicitly injected synchronous backend, and returns `{file, parser_version, tree, complete, diagnostics, sourceMap}`. The adapter always performs strict UTF-8 decoding first. Invalid bytes stop before backend invocation. With no selected backend it returns `PARSER_UNAVAILABLE` and `complete=false`; the explicit dependency-free `cfml-structural-scanner/v0.1` backend recognizes a bounded CFML tag subset and preserves script regions as opaque; a backend that returns no tree receives `UNSUPPORTED_SYNTAX`; backend errors become bounded `PARSER_FAILURE` diagnostics; partial or diagnostic-limited output remains incomplete.

Backend diagnostics are normalized to known severity/code/message/span fields and capped by `maxDiagnostics`. No raw backend object is treated as Graph IR, no cross-file resolution occurs, and no parser can promote confidence. The Tree-sitter grammar selection is recorded in ADR-030; native loading, syntax coverage, and compatibility environment still require fixture-backed evidence.

## Consequences

The rest of the pipeline can depend on one source-coordinate and failure contract without coupling to Tree-sitter, a CFML engine, or an unverified grammar. The bounded scanner enables fixture-backed structural and selected control-flow extraction without claiming full language support; the default adapter still produces explicit incomplete evidence rather than a guessed parse. The adapter contract makes parser replacement and negative testing reversible.
