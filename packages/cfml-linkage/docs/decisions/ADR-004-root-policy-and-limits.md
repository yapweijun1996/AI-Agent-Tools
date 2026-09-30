# ADR-004: Make root safety and resource limits explicit configuration

> **Status: PROVISIONAL / BOUNDED.** The v0.1 configuration shape/value boundary, root guard, private library edge/evidence/serialized-output/wall-time-limit boundaries, private CLI output-limit boundary, and bounded configuration-policy semantics are implemented for bounded scopes; broader runtime policy enforcement remains open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Analysis root, path safety, ignores, limits, output, prohibited actions, and exit codes |
| Source of truth | This ADR and `SPEC.md`; runtime enforcement must preserve the contract |
| Evidence | `schema/agent-cfml-linkage-config-v0.1.schema.json`, `examples/config-v0.1.json`, `src/cli.js`, `src/analyzer.js`, `src/graph.js`, `test/cli.test.js`, `test/analyzer.test.js`, and local schema/policy check |
| Verification | Configuration schema, shape/value, and safety invariant checks pass; `test/cli.test.js` verifies invalid configuration, including absolute ignore globs, is rejected before root admission/analysis, `test/analyzer.test.js` verifies the bounded library edge/evidence/serialization/wall-time limits and configuration forwarding, `test/snapshot.test.js` verifies deterministic ignore/generated-directory matching, `test/cfc-resolver.test.js` verifies explicit mapping forwarding, and bounded CLI output-limit/plugin-rejection tests pass; broader runtime policy enforcement remains unverified |
| Limitations | Platform-specific permission behavior, glob semantics, and operational defaults require implementation tests |

## Context

The analyzer will inspect source that may contain executable-looking code, secret-like content, path escapes, or resource-exhaustion inputs. Hidden defaults make safety and incomplete output difficult to audit. The boundary must be explicit in a versioned configuration contract.

## Decision

The v0.1 configuration requires:

- an explicit local `root`;
- rejection of out-of-root references;
- no symlink following and no absolute reference acceptance;
- explicit ignore globs for dependency, generated, cache, and secret-like paths; `generated_files` additionally controls the bounded directory named `generated`, while explicit ignore globs remain authoritative;
- an allowlist of analyzed languages and explicit mappings; non-empty plugin selections are rejected until a bounded plugin loader exists;
- hard positive limits for files, bytes, facts, edges, evidence, traversal depth, output, wall time, and workers; the current synchronous implementation uses at most one worker, so `max_workers` is an upper bound rather than a request for parallel execution; the stable CLI envelope requires `max_output_bytes >= 300` so an output-limit diagnostic can itself fit within the cap;
- JSON output with diagnostics on stderr and only bounded/optional raw evidence;
- immutable prohibited-action flags: source execution, network, database, shell, and browser are all false;
- fixed exit meanings `0` completed, `1` internal failure, `2` invalid input, `3` incomplete/unsupported/limited, and `4` path/access rejection.

The machine-readable contract is `schema/agent-cfml-linkage-config-v0.1.schema.json`; its example is `examples/config-v0.1.json`. `src/cli.js` now enforces the complete v0.1 object shape and bounded value contract, including root-relative ignore-glob validation and query-request validation, before root admission/analysis. This validation does not imply that every configured library/runtime budget is implemented: the snapshot stage applies `ignore.globs` and the `hidden_files` policy, the library graph stage enforces `max_edges` and `max_evidence`, the private library and CLI enforce the bounded serialized output-byte limit, and `analyzeProject` enforces the cooperative monotonic wall-time limit; bounded cross-budget behavior is covered by analyzer/CLI regression tests, the analyzer forwards `analysis.mappings`, rejects non-empty `enabled_plugins`, applies the bounded `generated_files` directory policy, and validates the `max_workers` upper bound; other limits remain open or are delegated to bounded stages.

## Consequences

A caller can review the complete safety policy before analysis starts, and output can distinguish incomplete analysis from invalid or rejected input. Strict defaults may reduce coverage for unusual projects, but callers can make approved mappings and ignore behavior explicit rather than relying on hidden heuristics.

The implementation must freeze validated configuration before discovery. Any change in root, mapping, ignore policy, parser, resolver, or limits must invalidate affected derived state.
