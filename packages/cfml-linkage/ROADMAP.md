# Roadmap: agent-cfml-linkage

> **Status: PROPOSED / M2–M9 IN PROGRESS.** The roadmap describes intended delivery and records verified bounded slices; it is not a release plan.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Ordered delivery of the planned linkage analyzer |
| Source of truth | This roadmap for sequencing; Git history and tests for completion evidence |
| Evidence | Initial commit `1b29c0b` contained only `.gitattributes`; current local commits contain the verified foundation, bounded extractors, indexes, resolvers, and Graph builder |
| Verification | M0 contract gate, T-010–T-038/T-040/T-041/T-045/T-046/T-048/T-049/T-050/T-051/T-054/T-056/T-057/T-058 foundation/scanner/Fact/index/resolution/Graph/CFC/scope/web-flow/dynamic-evidence/SQL-repository/query/orchestration/serialization/wall-time/cross-budget/robustness/adversarial-fixture/CLI-query/configuration/evidence-budget/edge-budget/ignore-policy/hidden-file-policy/common-CFML/control-flow/CFScript/SQL/configuration-mapping/generated-directory-policy tests, T-042 bounded contract/check/package smoke, T-043 bounded Node host compatibility, and produced Fact/Graph/analysis IR schema validation are verified; T-039 is verified for its bounded regression scope; later milestones have no evidence |
| Limitations | Native parser loading, dates, estimates, runtime compatibility, and release targets remain unverified or intentionally not committed |

## Current state

| Area | State | Evidence |
| --- | --- | --- |
| Repository | Private prototype with verified foundation and bounded extractors | Git `main` at the current local commit; no remote publication |
| Source implementation | M1 foundation, configured ignore-glob/hidden-file discovery policies, M2 parser-adapter/bounded CFML/web scanner/Fact extractors plus verified common ContentAdmin scanner/extractor coverage and an explicit host-unverified Tree-sitter CFML backend, M3 immutable indexes/literal resolver/bounded Graph builder, M4 bounded CFC resolver, M5 bounded scope/web-flow resolvers, M6 bounded dynamic/SQL/repository linkage, M7 bounded graph query/evidence engine and query-command CLI, M8 bounded adversarial safe-failure fixtures and T-037 private-library serialization/T-038 wall-time enforcement, and M9 bounded check/package smoke/Node host evidence plus T-046 CLI configuration enforcement, T-047 CI workflow, T-048 library evidence-budget enforcement, T-049 Graph edge-budget enforcement, T-050 ignore-glob enforcement, and T-051 hidden-file-policy enforcement, and T-058 bounded configuration-policy semantics implemented; T-039 cross-budget regression is verified for its bounded scope; broader Graph runtime not started | `src/`, `bin/`, focused tests |
| Contracts/schema | Graph IR, Fact IR, identity/order, confidence/completeness, and configuration artifacts implemented and validated; T-037/T-038/T-039 are implemented and verified for bounded output/wall-time/cross-budget behavior in ADR-029, while broader runtime producers remain absent | `schema/`, `examples/`, `SPEC.md`, ADR-002–ADR-004, ADR-025–ADR-030 |
| Fixture layout/manifest | Implemented and validated | `fixtures/`, `fixtures/manifest-v0.1.json`, inert golden/negative/adversarial inputs, and bounded expectations |
| Focused tests | T-010–T-014/T-020–T-038/T-040/T-041/T-045/T-046/T-048/T-049/T-050/T-051/T-054/T-055/T-056/T-057/T-058 verified | `npm test`: 95 passed |
| CI/package/release | Private package/CLI foundation and CI workflow implemented; hosted CI/release not verified | `package.json`, `bin/`, `.github/workflows/ci.yml`; no hosted run, tag, or release |
| Runtime compatibility | Partial | Node `v25.2.1` on `win32`/`x64` is evidenced for the bounded test suite; Lucee/Adobe/browser/database/network/application-runtime compatibility remains unknown |
| Core SSOT documentation | Synchronized planning baseline plus prompt-to-artifact completion audit | `GOAL.md`, `DESIGN.md`, `SPEC.md`, `EPIC.md`, `ROADMAP.md`, `TASK.md`, `PROGRESS.md`, `GOAL_PROMPT.md`, `docs/audits/prompt-to-artifact-v0.1.json` |

## Delivery sequence

The current pass advances M0 to a verified gate, completes M1/T-010–T-014 plus configured ignore-glob discovery at T-050 and hidden-file policy at T-051, verifies bounded M2 parser/scanner/Fact extraction at T-020–T-022, M3 index/literal resolution/Graph IR boundaries at T-023–T-025, bounded M4 CFC resolution at T-030, M5 scope/web-flow resolution at T-031–T-032, M6 dynamic-evidence preservation at T-033 and bounded SQL/repository linkage at T-034, M7 bounded graph queries/evidence explanations at T-035, bounded analysis orchestration/private entry points at T-036, and query-command CLI at T-045 plus CLI configuration enforcement at T-046 and CI workflow at T-047, and bounded configuration-policy semantics at T-058, and M8 bounded robustness and adversarial safe-failure evidence at T-040/T-041 plus T-037 library serialization, T-038 library wall-time enforcement, library evidence-budget enforcement at T-048, and Graph edge-budget enforcement at T-049, and M9 bounded checks/package smoke at T-042 plus bounded Node host compatibility at T-043. T-039 completes the bounded cross-budget regression tranche; this does not establish full grammar coverage or advance broader compatibility/release work.

### Phase 0 — Contract and safety foundation

**Goal:** make the boundary testable before implementing language behavior.

- M0: Graph IR, Fact IR, diagnostics, confidence, unresolved reasons, IDs, limits, and stable JSON envelope. T-001–T-006 contract slices are verified; remaining M0 contract extensions are open.
- M1: canonical root guard, path containment, ignore policy, deterministic snapshot/discovery, decoding, source maps, and CLI input validation.

**Exit evidence:** reviewed contracts, verified contract fixtures/manifest, T-010 containment tests, T-011 deterministic snapshot tests, T-012 strict decoding/source-map tests, T-013 CLI envelope tests, planned remaining negative safety tests, and no-execution proof at the process boundary.

### Phase 1 — CFML extraction and basic linkage

- M2: parser adapter/bounded CFML/web scanners and normalized CFML/CFC/web facts (T-020–T-022 verified), common ContentAdmin CFML tag/condition coverage (T-054 verified), bounded control-flow Facts (T-056 verified), bounded CFScript/SQL fallback coverage, including named arguments, quoted/CTE-safe table forms, SQL `GO` batches, and cross-file fallback-Fact Graph checks (T-057 verified), bounded configuration-policy semantics (T-058 verified), plus an explicit Tree-sitter CFML backend (T-053 implemented, host-unverified); full grammar, script Fact extraction, and resolution remain open.
- M3: immutable indexes, bounded literal paths, includes, custom tags, Application governance, conditions, unresolved records, Graph construction/validation, and reverse adjacency (T-023–T-025 verified); broader linkage remains open.

**Exit evidence:** golden fixtures for basic CFML flow, malformed/partial input, ambiguity, and stable IDs/order.

### Phase 2 — CFC and Globe3-critical relationships

- M4: component mappings, `extends`/`implements`, instantiation, `cfinvoke`, imports, and conservative method calls (T-030 bounded resolver verified; broader type inference remains open).
- M5: ordered include scope flow, form/AJAX/`fetch`/redirect relations, and conditional routers (T-031–T-032 bounded scope/web-flow resolver verified; broader flow remains open).
- M6: preserve dynamic/generated/SQL-dynamic relationships as explicit unresolved evidence, then add bounded SQL/queryExecute and structural repository/action resolution (T-033/T-034 verified; broader SQL semantics remain open).

**Exit evidence:** unique and ambiguous type/method fixtures, include-order fixtures, browser-facing flow fixtures, and fail-closed dynamic cases.

### Phase 3 — SQL, repository, and query interface

- M6: preserve dynamic/generated/SQL-dynamic evidence first, then add statically visible `cfquery`/`queryExecute` table/datasource and structural repository/action edges (T-033/T-034 verified; broader SQL semantics remain open).
- M7: bounded `related`, `callers`, `callees`, `includes`, `included-by`, `trace`, `scope-flow`, `tables`, `routes`, `unresolved`, `explain-edge`, `impact-evidence`, and `stats` queries plus composed analysis output; T-035/T-036/T-045/T-046 are verified for the immutable query engine, bounded private composition, query-command CLI, and CLI configuration contract.

**Exit evidence:** query contract tests, evidence explanations backed by spans, traversal bounds, cycles, and SQL limitation tests; `test/graph-query.test.js` provides the bounded query evidence.

### Phase 4 — Incremental operation and release

- M8: cache invalidation, bounded concurrency, hard resource limits, repeatability, and snapshot drift handling; T-040/T-041 verify the bounded repeat/drift/cache/cycle/limit and adversarial safe-failure subset, T-037 verifies the private-library serialized-output budget, T-038 verifies cooperative library wall-time enforcement, T-048 verifies the library evidence budget, T-049 verifies the final Graph edge budget, T-050 verifies configured ignore-glob discovery policy, T-051 verifies the configured hidden-file policy, and the private CLI enforces serialized output limits; T-058 verifies bounded configuration-policy semantics. T-039 verifies the bounded cross-budget regression work.
- M9: package/library/CLI smoke, golden and adversarial suites, documentation synchronization, and separately evidenced Lucee/Adobe compatibility; T-042 verifies local checks/package smoke, T-043 records Node host evidence, and T-036/T-045/T-046 provide bounded composition, query-command integration, and CLI configuration enforcement; T-047 provides the unverified CI workflow, T-049 adds bounded Graph edge-budget evidence, T-050 adds bounded ignore-glob policy evidence, T-051 adds bounded hidden-file policy evidence, and T-053 adds the explicit Tree-sitter backend without native-load verification. T-039 is verified for its bounded regression scope in ADR-029; broader compatibility and graph persistence remain open.

**Exit evidence:** release checklist in `RELEASE.md`, reproducible artifact readback, CI results, a versioned release note, and the prompt-to-artifact audit; the current audit records the project as not achieved because required release/runtime evidence is missing.

## Ordering constraints

- Do not implement resolver logic before the Fact IR and Graph IR contracts are frozen.
- Do not add runtime-dependent resolution to compensate for static uncertainty.
- Do not claim a language or engine as supported without fixtures and runtime evidence where applicable.
- Do not make downstream impact/test tools a dependency of the core analyzer.
- Do not publish a package until source, schema, tests, and artifact identity are traceable.

## Status policy

A milestone changes from **Not started** only when its source changes are present and its owning verification evidence passes. A design note, similar external project, or planned task is not completion evidence. Partial coverage must remain visible as partial.
