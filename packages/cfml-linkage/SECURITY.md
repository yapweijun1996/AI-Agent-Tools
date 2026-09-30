# Security: agent-cfml-linkage

> **Status: PROPOSED / FOUNDATION AND BOUNDED QUERY CONTROLS VERIFIED.** These are security requirements for the complete analyzer; the bounded foundation/scanner/query controls listed below have local evidence.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Threat boundaries for local static analysis |
| Source of truth | This document for proposed security requirements; implementation and tests for actual controls |
| Evidence | Current local source contains root guard, snapshot, decoder, parser/scanner, an explicit optional Tree-sitter backend, Fact extraction, bounded resolvers, dynamic-evidence, SQL, repository/action, query, orchestration, and adversarial safe-failure controls; full runtime code does not exist |
| Verification | Root-guard containment/symlink, snapshot no-execution and configured ignore-glob/hidden-file handling, strict-decoding, CLI safety, recognized query-command mapping/validation behavior, serialized output-byte bounds, cache path/corruption, parser/scanner no-execution, bounded Fact extraction, dynamic/generated/SQL-dynamic preservation, bounded SQL/repository linkage, vanished-snapshot-target rejection, validated/copied immutable query snapshots, query bounds, composed orchestration, re-admission, parser-time drift, library edge/evidence budgets, and diagnostic-bound tests pass; the prompt-to-artifact audit, refreshed against audited source baseline `3de60e2`, records the evidence boundaries; broader security test suite does not exist |
| Limitations | Threat model, platform sandbox, dependency policy, and disclosure process require implementation-specific review |

## Security objectives

The future analyzer must minimize risk while inspecting untrusted or legacy source:

- read only explicitly authorized local paths beneath a canonical root;
- never execute application source or embedded code;
- never access databases, browsers, remote repositories, or networks;
- prevent traversal and symlink escape;
- bound CPU, memory, file count, output, evidence, and wall-clock use;
- avoid exposing secrets through logs, diagnostics, graph evidence, cache, or fixtures;
- make uncertainty and incomplete coverage visible rather than hiding it.

## Threat boundaries

### Source is input, not instructions

CFML, JavaScript, CSS, SQL, comments, strings, and generated content must be treated as data. The analyzer must not evaluate expressions, spawn commands, honor embedded instructions, or load runtime configuration as executable policy.

### Filesystem containment

Canonicalize the requested root and every discovered/reference path. Reject traversal, symlink escapes, and out-of-root targets, and do not confirm a target that disappears after snapshot admission. Apply bounded root-relative ignore globs and the explicit dot-prefixed hidden-file policy before source admission, reading, and hashing; ignore dependency, generated, cache, and secret-like paths by explicit policy. Path rejection must be distinguishable from an unresolved dynamic relationship.

### Resource exhaustion

Use hard limits for file size/count, bytes, facts, edges, evidence, traversal depth, output bytes, concurrency, and wall time. The bounded library graph stage enforces `max_edges` and `max_evidence`, the private library/CLI serializer enforces serialized output bytes, and the analyzer applies a monotonic wall-time budget through cooperative stage and bounded-loop checkpoints. On exhaustion, return an explicit incomplete result and budget diagnostic; never silently truncate or continue with an implied complete graph. Bounded cross-budget regression coverage verifies combined partial-result behavior, and synchronous parser calls are not preemptively cancellable.

### Sensitive data

Evidence must be bounded and preferably normalized. Do not include full source bodies, credentials, tokens, private keys, database passwords, or unrelated personal data in JSON, logs, fixtures, caches, documentation, or releases. Secret-like matches should be redacted or represented only by location and reason.

### Dependency and plugin risk

V1 should avoid third-party plugins. The selected Tree-sitter parser and CFML grammar are explicitly pinned optional dependencies, loaded only when the caller selects the backend. Any future plugin must be explicitly enabled, versioned, bounded, and unable to override root safety, stable identity, schema validation, or confidence policy. Dependencies require provenance, license, installation, native-ABI, and vulnerability review before release.

## Static-analysis limitations

Static SQL relationships do not prove authorization, tenant isolation, transaction correctness, or business semantics. Static routes do not prove runtime reachability. Candidate and unresolved edges must remain visibly non-authoritative. Graph queries return bounded evidence slices and deterministic templates; they do not perform generic impact ranking or create authoritative relationships. LLM-generated suggestions may assist investigation outside the graph contract but cannot create confirmed relationships.

## Required security verification

Before release, test:

- traversal, absolute path, and symlink escape attempts;
- unreadable files and invalid encodings;
- secret-like source and bounded/redacted diagnostics;
- maliciously large files and graph explosions;
- dynamic expressions, generated names, interpolated SQL identifiers, query expressions, embedded code, and graph-query traversal bounds that must not execute or escape declared limits;
- network/database/process instrumentation showing no prohibited access;
- cache isolation, corruption handling, and stale-data invalidation;
- optional Tree-sitter dependency provenance/license, native-addon installation/ABI behavior, parser-load failure, and package-boundary review;
- plugin rejection or containment if plugins exist;
- CI workflow permissions and action scope remain read-only with no publish/deploy step.

The root-admission, non-execution, configured ignore-glob/hidden-file, dynamic-evidence, SQL, repository/action, bounded query, validated/copied snapshots, composed-orchestration, recognized query-command mapping/validation, complete v0.1 CLI configuration shape/value validation, library edge/evidence/wall-time budgets, serialized output-byte bound, and adversarial safe-failure boundaries are verified by focused Node tests. The current prompt-to-artifact audit is retained at `docs/audits/prompt-to-artifact-v0.1.json`; its historical source baseline records the then-remaining library budget/full analyzer, hosted CI, compatibility, and release gaps without executing project source in the audit pass. T-047 records a least-privilege workflow definition with `contents: read` and no publish/deploy step; hosted CI execution remains unverified. T-044 records a bounded local credential/file/documentation audit in `docs/audits/release-security-parity-v0.1.json`; no complete analyzer security review, dependency audit, runtime instrumentation, or public release security verification exists.

## Reporting

Security issues should be reported privately to the repository owner before public disclosure. Do not include secrets or exploit payloads in ordinary issues, tests, or documentation.
