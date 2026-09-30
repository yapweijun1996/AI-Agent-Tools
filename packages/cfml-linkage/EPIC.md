# Epic: Build the CFML-first linkage evidence provider

> **Status: PROPOSED / M2–M9 IN PROGRESS.** This epic is planning material; the M1 foundation, configured ignore-glob/hidden-file/generated-directory discovery policies and bounded configuration semantics, bounded M2 parser/scanner/Fact slices, bounded M3 path/Graph slices, bounded M4 CFC, M5 scope/web-flow resolvers, M6 SQL/repository evidence, M7 graph-query/orchestration, M8 robustness/adversarial/evidence/edge-budget/wall-time, and M9 check/package-smoke/Node-host-compatibility slices are verified.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | A local, deterministic static linkage graph for mixed CFML web projects |
| Project type | Planned NPM/library + CLI + AI-agent evidence provider |
| Lifecycle | Prototype / bounded M9 implementation |
| Source of truth | This epic for outcome and milestones; `SPEC.md` for the contract; Git history for actual completion |
| Evidence | Initial `main` commit `1b29c0b` contained only `.gitattributes`; current local commits contain the verified foundation and bounded extractors |
| Verification | M0 contract checks, produced Fact/Graph/analysis IR schema validation, and 95 foundation/parser-adapter/scanner/Fact/index/resolution/Graph/CFC/scope/web-flow/dynamic-evidence/SQL-repository/query/orchestration/serialization/wall-time/cross-budget/robustness/adversarial-fixture/CLI-query/configuration/evidence-budget/edge-budget/ignore-policy/hidden-file-policy/control-flow/CFScript/SQL/configuration-mapping/generated-directory-policy tests pass; broader Graph linkage verification remains open |
| Limitations | Native parser loading, estimates, sequencing, and compatibility are not validated |

## 1. Problem

This epic is the product-level outcome for one planned package boundary. The private package, bounded CLI, and private library entry exist, but complete linkage and downstream integrations are not established; bounded query-command integration is verified.

CFML applications often spread behavior across includes, CFCs, Application files, HTML forms, JavaScript requests, CSS assets, SQL, and shared scopes. A coding agent cannot safely infer those relationships from a single file or from filename similarity. The project needs a bounded, inspectable evidence provider that exposes relationships without running the application or pretending to know dynamic runtime behavior.

## 2. Desired outcome

Deliver a versioned CLI/library that accepts a local project root and emits a deterministic Graph IR document plus bounded queries. It should help an agent answer questions such as:

- Which files include or call this component or method?
- Which form, AJAX, fetch, redirect, or route condition reaches this page?
- Which shared-scope values are produced or consumed across ordered includes?
- Which statically visible tables and datasources are used?
- Which relationships remain ambiguous or unresolved, and what evidence explains that state?

Success means the result is useful, conservative, reproducible, and separately verified—not merely that a parser returns nodes.

## 3. Scope

In scope: CFML/CFC structure and resolution first; HTML forms; JavaScript AJAX/fetch flows; CSS imports/assets; visible SQL; Application governance; shared scope; explicit conditions; evidence/confidence; deterministic graph output; query operations.

Out of scope: source execution, runtime network/database access, browser automation, application semantics, permission or tenant-safety proof, LLM-authoritative edges, unconstrained dynamic resolution, and generic impact/test prioritization.

## 4. Milestones

| Milestone | Outcome | Dependencies | Status |
| --- | --- | --- | --- |
| M0 Contracts | Freeze Graph IR, Fact IR, diagnostics, IDs, limits, and fixture rules | None | Verified — T-001–T-006 |
| M1 Safe foundation | Root guard, snapshot, decoding/source maps, discovery, CLI envelope, cache skeleton | M0 | Verified — T-010–T-014 |
| M2 Parser/extractor | Adapter and normalized facts for priority syntax | M1 | In progress — T-020–T-022 bounded subset, T-054 common CFML scanner/extractor extension, T-056 bounded control-flow Facts, T-057 bounded CFScript/SQL fallback coverage, and T-058 bounded configuration-policy semantics verified; T-053 Tree-sitter backend implemented but host-unverified |
| M3 Basic linkage | Paths, includes, Application governance, unresolved model, graph validator, reverse callers | M2 | In progress — T-023–T-025 bounded indexes/resolution/Graph IR verified |
| M4 CFC linkage | Mappings, inheritance, instantiation, `cfinvoke`, and conservative method resolution | M3 | In progress — T-030 bounded resolver verified |
| M5 Globe3-critical flows | Ordered scope flow, AJAX/fetch, and conditions | M3 | In progress — T-031/T-032 bounded scope and web-flow condition flow verified |
| M6 SQL/repository | Dynamic/generated/SQL-dynamic preservation, query/table/datasource, and structurally evidenced repository edges | M3, M5 | In progress — T-033 preservation and bounded T-034 SQL/repository resolution verified; broader SQL semantics open |
| M7 Query interface | Related/callers/callees/includes/included-by/trace/scope-flow/tables/routes/unresolved/explain-edge/stats/impact-evidence plus bounded analysis composition | M3–M6 | In progress — T-035/T-036/T-045/T-046 verified (bounded) |
| M8 Incremental performance | Dependency-aware invalidation, bounded workers, budgets, repeatability | M7 | In progress — T-040/T-041 bounded robustness/adversarial evidence, T-036 parser-time drift evidence, T-037 private-library serialization, T-038 library wall-time, T-048 library evidence-budget, T-049 Graph edge-budget, T-050 configured ignore-glob enforcement, T-051 hidden-file-policy enforcement, T-058 bounded configuration-policy semantics, and private CLI output-budget enforcement; T-039 verifies the bounded cross-budget regression work |
| M9 Release verification | Golden/adversarial suite, package/import/CLI smoke, engine evidence | M8 | In progress — T-042 checks/package smoke, T-043 Node host evidence, T-044 bounded release/security/parity audit, and T-047 implemented CI workflow; hosted compatibility/public release remains open |

## 5. Epic acceptance criteria

The epic is complete only when all of the following are evidenced:

- the public contract and machine-readable schema are reviewed and versioned;
- the analyzer is read-only, non-executing, root-contained, and network/database-free;
- repeated analysis of the same snapshot/config/version produces stable semantic JSON;
- ambiguous, dynamic, malformed, unsupported, out-of-root, and budget-limited cases fail closed with explicit records;
- priority CFML/CFC, web-flow, scope, SQL, and CSS fixtures have expected golden results;
- CLI and library contracts are tested independently from internals;
- package/install/release evidence matches the source commit;
- engine compatibility claims are published only for environments actually tested.

## 6. Risks and blockers

Current status: M0/M1 work, T-010–T-014/T-020–T-022 bounded parser/scanner/Fact extraction, T-023 immutable indexes, T-024 conservative literal resolution, T-033 dynamic/generated/SQL-dynamic evidence preservation, bounded T-034 SQL/repository linkage, bounded T-035 graph queries/evidence explanations, bounded T-036 analysis orchestration/private library and CLI entry points, bounded T-037 private-library serialization, bounded T-038 private-library wall-time, bounded T-045 query-command CLI, T-046 CLI configuration enforcement, T-040/T-041 robustness/adversarial safe-failure evidence, T-048 library evidence-budget enforcement, T-049 Graph edge-budget enforcement, T-050 configured ignore-glob enforcement, T-051 hidden-file-policy enforcement, T-042 bounded checks/package smoke, T-043 bounded Node host compatibility, T-044 bounded release/security/parity audit, and T-053 explicit Tree-sitter backend integration, T-054 common ContentAdmin scanner/extractor coverage, T-056 bounded control-flow Fact coverage and T-058 bounded configuration-policy semantics are implemented for bounded scopes; T-039 is verified for its bounded regression scope in ADR-029. The root-guard/snapshot/decoder/bounded CLI/library/cache/parser/Fact/index/resolver/query foundation is the only runtime slice; native parser loading, full grammar/Fact coverage, broader language coverage, graph persistence, and broader resolution remain open.

Known technical risks include runtime-computed Application mappings, dynamic `evaluate` and generated names, ambiguous components/method receivers, shared-scope semantics, embedded JavaScript/SQL parsing, and resource exhaustion. These are release risks, not reasons to guess.

## 7. Related work

`agent-cfml-check` is separate external prior art for bounded single-file CFML structural checking. Its publication and tests do not demonstrate this epic. `agent-code-slice`, `agent-change-impact`, and `agent-test-scope` may become integrations later, but each retains its own contract and ownership.
