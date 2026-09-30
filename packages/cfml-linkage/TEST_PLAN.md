# Test Plan: agent-cfml-linkage

> **Status: PROPOSED / M2–M9 IN PROGRESS.** This plan defines future verification; focused M1 and bounded M2–M9 parser/scanner/Fact/resolution/query/orchestration/robustness/adversarial/check suites exist.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Contract, determinism, safety, linkage, partial-result, and release verification |
| Source of truth | This plan for intended verification; actual test output and CI for evidence |
| Evidence | Initial commit `1b29c0b` contained only `.gitattributes`; current local source includes the verified foundation, bounded extractors, and an explicit host-unverified Tree-sitter backend |
| Verification | T-001–T-006 contract checks, produced Fact/Graph/analysis IR schema validation, and retained T-010–T-014/T-020–T-039/T-040–T-046/T-048–T-051/T-054/T-055/T-056/T-057/T-058 condition-boundary/mixed-node-budget/control-flow/CFScript/SQL/configuration-mapping/generated-directory-policy `npm test` (95/95) plus bounded T-043 Node host evidence passed; T-047 defines a Node CI matrix but has no hosted execution evidence; T-052 records the prompt-to-artifact audit; broader project test suite does not exist |
| Limitations | Native parser fixture/runtime coverage, supported runtimes, and performance targets are not verified or selected |

## 1. Verification principles

- Test the contract independently from implementation details.
- Prefer frozen golden Graph IR fixtures for expected relationships and evidence.
- Include negative cases and preserve unresolved/partial results rather than guessing.
- Repeat identical snapshots/configuration/version to check deterministic semantic JSON.
- Treat build, lint, type checks, and mocks as limited evidence; none alone proves linkage correctness.
- Verify security properties with read-only, out-of-root, symlink, secret-like, and no-execution cases.

## 2. Test layers

| Layer | Purpose | Evidence required |
| --- | --- | --- |
| Unit | IDs, paths, spans, normalization, confidence, limits, and serializers | Focused passing tests |
| Contract/schema | Graph IR, Fact IR, diagnostics, unresolved records, CLI envelope | Schema/fixture assertions; T-001–T-006 cover contracts and layout |
| Golden | End-to-end static linkage for frozen projects | Expected graph/evidence comparison |
| Adversarial | Ambiguity, malformed syntax, dynamic code, cycles, escapes, drift, caps | Explicit safe failure and `complete=false` where applicable |
| Integration | CLI/library boundary, cache, query engine, and explicit parser backend | `test/graph-query.test.js` covers immutable snapshots, exact selectors, operation results, explanations, and bounded traversal; `test/analyzer.test.js` and `test/cli.test.js` cover composed Fact/index/resolver/Graph output, explicit parser selection, drift, private import, bounded `analyze`/`index`, query-command mapping/validation, and bounded query output; `test/tree-sitter-backend.test.js` covers fake-parser normalization, spans, errors, limits, opaque regions, and fail-closed language selection; graph persistence and native parser loading remain open |
| Package smoke | Packed/installable artifact identity and imports | `pack`/offline install/import/CLI evidence; bounded evidence covers package self-import, packed-artifact consumer analysis, and dry-run, while public release remains unavailable |
| Engine matrix | Only if the analyzer has runtime-adjacent claims | Separate, reproducible environment evidence |
| Prompt-to-artifact audit | Verify every explicit task requirement, named artifact, check, gate, and completion criterion is mapped before any completion claim | `docs/audits/prompt-to-artifact-v0.1.json`; current result is explicitly not achieved because required full-product and release evidence is missing |

## 3. Golden fixture matrix

The current inert fixture set covers bounded cases; the full fixture matrix should cover:

1. ordered `cfinclude` with shared page/request/application scope;
2. CFC inheritance, implementation, instantiation, imports, and unique method calls;
3. ambiguous mappings, duplicate component names, and ambiguous receivers;
4. `cfmodule`/custom tags and Application governance/request hooks;
5. HTML forms, `cflocation`, client redirects, XMLHttpRequest, jQuery, `fetch`, and known wrappers;
6. `if`, `switch`, `cfcase`, ternary, and Globe3-style route conditions;
7. `cfquery`/`queryExecute` table reads/writes, datasource expressions, and dynamic identifiers;
8. repository/action calls with structural evidence and filename-only non-evidence;
9. CSS imports and statically visible assets;
10. dynamic `evaluate`, `isDefined`, generated names, dynamic paths, variable-dependent URLs, interpolated SQL identifiers, and dynamic datasources;
11. malformed CFML, embedded-language parse errors, comments/strings resembling syntax, and partial recovery.

Each fixture should assert nodes, edges, confidence, evidence spans, conditions, ordering, unresolved records, diagnostics, and completeness—not just edge counts.

## 4. Safety and robustness cases

- root traversal and symlink escape;
- out-of-root references;
- ignored dependency, generated, cache, and secret-like paths;
- unreadable or invalidly encoded files;
- include and graph cycles;
- snapshot mutation during analysis, including parser-time source drift and a target disappearing before resolution;
- corrupt, stale, or version-mismatched cache;
- file/byte/fact/edge/evidence/traversal/output/time limits and query result/depth/visited-node limits; configured ignore-glob/hidden-file policy matching, the library `max_edges`/`max_evidence`/`max_wall_time_ms` and `serializeAnalysis` output budget, private CLI serialized `max_output_bytes` caps, and bounded cross-budget interaction/parity checks are verified;
- bounded evidence that does not copy full source files;
- proof that source constructs are parsed, never executed;
- deterministic ordering across worker concurrency settings.

## 5. Acceptance gates

A future release must satisfy all required gates:

- schema and public contract tests pass;
- golden and adversarial fixtures pass;
- stable-ID and repeatability assertions pass;
- safety and root-containment tests pass;
- incomplete and exit-code semantics are verified, including bounded CLI output-limit exit `3`;
- cache invalidation tests pass or cache is disabled for that release;
- CLI stdout/stderr separation is verified;
- package/install/library smoke tests pass, including the optional native parser path where a supported toolchain is available;
- documentation matches the released contract;
- engine claims are limited to environments with evidence.

## 6. Planned commands

The current focused commands are `npm test`, the repository's static checks, package self-import, an offline packed-artifact install/import smoke, and `npm pack --dry-run`; Node's built-in test runner supplies the suite. No full build, lint, type, browser, or engine command exists yet. Once those workflows are implemented, the repository must document exact commands; placeholder commands must not be reported as executed checks.

## 7. Current result

**T-001–T-006, T-010–T-014, T-020–T-039, T-040–T-046, T-048–T-051, T-054, T-055, T-056, T-057, and T-058 passed for their bounded scopes; T-053 has implemented fake-parser coverage but remains host-unverified:** contract schemas/examples, identity/order, confidence/completeness, configuration, fixture-manifest, root-guard containment, deterministic discovery, configured ignore-glob/hidden-file policy matching, snapshot fingerprint, symlink, limit, strict decoding, source maps, CLI envelope, stderr separation, cache invalidation/corruption, parser unavailable/partial/failure handling, bounded CFML scanning, common switch/control/transport/mail/interface tag recognition, CFML block-closure diagnostics, switch/case/else structural Fact extraction, file-local condition-state handling, mixed-scanner node limits, literal `cfparam` scope-write extraction, selected return/loop/try/catch/throw/break/continue `CONTROL_FLOW` Facts, static/named-argument CFScript linkage forms, quoted/schema-qualified and CTE-safe SQL table forms, SQL `GO` batch splitting, procedure-call negative cases, and cross-file fallback-Fact Graph linkage, golden expectations, immutable index lookups, literal path resolution, bounded Graph IR construction/validation, reverse adjacency, bounded CFC mapping/inheritance/instantiation/invoke/method resolution, ordered scope production/consumption/override and resource-limit handling, web-flow condition/wrapper resolution, dynamic/generated/SQL-dynamic preservation, bounded `cfquery`/`queryExecute` SQL and structural repository/action resolution, immutable GraphSnapshot queries, exact-selector ambiguity, deterministic explanations, traversal bounds, composed analysis orchestration, parser-time drift, repeatability, content drift, cycle safety, resource limits, inert adversarial safe-failure fixtures, unsupported regions, no-execution checks, and final Graph edge-budget/hidden-file-policy/generated-directory-policy enforcement, configuration-mapping/plugin rejection/single-worker upper-bound semantics, and monotonic wall-time partial-result enforcement pass; current `npm test` reports 95 passed and 0 failed, and the produced Fact/Graph/analysis IR validates against schema. T-037 private-library serialization, T-038 private-library wall-time, and T-039 cross-budget parity are verified in ADR-029. The Tree-sitter backend has not been loaded with its native addon on this host; native installation, real grammar fixtures, script/embedded-language Fact coverage, runtime producer repeatability with the backend, graph persistence, broader Graph linkage behavior, public package publication, Lucee/Adobe/browser, hosted CI, and broader engine checks remain unverified; local private package self-import/CLI smoke, Node host evidence, and bounded release/security/parity audit passed.
