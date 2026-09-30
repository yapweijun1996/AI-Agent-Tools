# Design: agent-cfml-linkage Analysis Pipeline

> **Status: PROPOSED / M2–M9 IN PROGRESS.** This document describes the intended architecture; the M1 foundation, bounded M2 parser/scanner/Fact slices, and bounded M3 resolution/Graph, M4 CFC, M5 scope/web-flow, M6 SQL/repository, M7 graph-query, M8 robustness/adversarial, and M9 check/package-smoke/Node-host-compatibility slices have runtime evidence.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | A deterministic staged compiler-like pipeline for CFML-first web linkage |
| Source of truth | This document for design intent; Git history for current implementation facts |
| Evidence | Initial `main` commit `1b29c0b` contained only `.gitattributes`; current local commits contain the verified foundation and bounded extractors |
| Verification | Graph/Fact/config/analysis checks, produced Fact/Graph/analysis IR schema validation, and 95 foundation/parser/scanner/Fact/index/resolution/Graph/CFC/scope/web-flow/dynamic-evidence/SQL-repository/query/orchestration/serialization/wall-time/robustness/adversarial-fixture/CLI-query/configuration/evidence-budget/edge-budget/ignore-policy/hidden-file-policy/control-flow/CFScript/SQL/configuration-mapping/generated-directory-policy tests pass locally; broader runtime stages below remain unimplemented proposals |
| Limitations | Parser choice, language coverage, performance, and engine compatibility remain unknown |

## 1. Design goals

The analyzer should give coding agents a small, queryable, evidence-backed view of cross-file relationships without executing the application or guessing dynamic behavior. The design favors narrow stages, immutable intermediate data, explicit incompleteness, and stable output.

**Evidence boundary:** most components and flows remain proposed runtime modules. The repository contains root-guard, snapshot, configured ignore-glob/hidden-file policies, decoder, bounded CLI/library orchestration, cache, parser-adapter, bounded CFML/web scanners, bounded Fact extractor, immutable index, literal/CFC/scope/web-flow/repository resolver modules, dynamic/generated/SQL evidence handling, Graph builder, and bounded graph query engine with focused tests, a private `package.json`, and validated contracts; verified full parser runtime, broader Fact IR, caller, hosted CI verification, and release architecture remain unimplemented; the read-only CI workflow is defined, while bounded graph/CFC/scope/web-flow/dynamic-evidence/SQL-repository/query construction, T-036 composition, T-038 wall-time enforcement, T-049 Graph edge-budget enforcement, T-050 ignore-glob enforcement, and T-051 hidden-file-policy enforcement are implemented.

It is CFML-first: CFM/CFC structure, Application governance, includes, CFC typing, and shared scopes receive priority. HTML, JavaScript, CSS, SQL, and repository relations extend that model where static evidence is available. T-037 implements the bounded private-library serialized-output boundary; T-038 implements the bounded cooperative wall-time boundary; T-039 verifies the bounded cross-budget tranche.

## 2. Pipeline

```text
Root Guard / Policy
  -> Snapshot / Discovery
  -> Decode / Source Map
  -> Parser Adapter
  -> Normalized Fact Extraction
  -> Project Index
  -> Multi-pass Resolution
  -> Evidence / Confidence
  -> Graph Builder
  -> Graph Validation
  -> Incremental Cache
  -> Query Engine
  -> CLI / Library / JSON
```

Every stage has a typed input/output boundary. Stages may emit diagnostics but never mutate analyzed source. Downstream stages consume normalized facts, not parser-specific AST nodes.

## 3. Stages

### Stage 0 — Root guard and policy

The planned stage resolves the canonical root, rejects traversal and symlink escapes, loads the explicit v0.1 configuration (`schema/agent-cfml-linkage-config-v0.1.schema.json`), applies ignore globs, hidden/generated-directory policy, mappings, and limits, and freezes the `AnalysisContext`. The implemented M1 root-guard slice covers canonicalization and containment in `src/root-guard.js`; adjacent snapshot and decoder slices are covered by focused tests. The private CLI validates the complete v0.1 configuration shape/value contract before root admission; the analyzer forwards validated project mappings to the bounded CFC resolver, rejects non-empty plugin selections because no plugin loader exists, and treats `max_workers` as an upper bound while the current pipeline remains synchronous with at most one worker. No database, network, or CFML execution is permitted. Globe3-specific mappings are configuration rather than hardcoded rules.

### Stage 1 — Snapshot and discovery

The implemented M1 snapshot walks supported source files deterministically, including visible `.sql`, records root-relative POSIX path, canonical path, bytes, mtime, and content SHA-256, and sorts before later stages. It applies the configured dot-prefixed hidden-file policy, the bounded generated-directory policy, and bounded root-relative `ignoreGlobs` patterns (`*`, `?`, and recursive `**`) before file admission, reading, and hashing; it skips symlinks, reports drift/limits explicitly, and calculates a content-based project fingerprint. The disposable M1 cache consumes that fingerprint with configuration/parser/extractor/resolver fingerprints and never becomes source of truth. A changed file will later invalidate its facts and dependent resolution products; root, configuration, or parser changes invalidate wider scopes.

### Stage 2 — Decode and source map

The implemented M1 decoder accepts strict UTF-8, preserves BOM byte alignment, and maps byte offsets to one-based lines and zero-based UTF-16 columns. Invalid encoding is explicit incomplete evidence, never silently repaired. The M2 parser adapter consumes this result and returns explicit unavailable/partial/failure diagnostics. One source-map owner ensures all resolvers report consistent coordinates.

### Stage 3 — Parser adapter

The implemented adapter in `src/parser-adapter.js` enforces strict decoding handoff, explicit backend selection, normalized diagnostics, and bounded partial/unsupported results. `src/cfml-scanner.js` and `src/web-scanner.js` provide explicit dependency-free structural backends for bounded CFML/web subsets, and `src/tree-sitter-backend.js` provides an explicit Tree-sitter CFML backend using the pinned optional `@cfmleditor/tree-sitter-cfml@0.26.2` grammar with `tree-sitter@0.25.0`. The default adapter still has no selected backend and produces `PARSER_UNAVAILABLE` rather than silently selecting a parser. The Tree-sitter backend is host-unverified, preserves script/embedded-language regions as opaque until Fact adapters exist, and is not a full analyzer claim. The future parser-neutral contract is:

```text
parse(source, path) -> ParseUnit {
  tree,
  diagnostics,
  completeness,
  parserVersion
}
```

The selected Tree-sitter grammar may replace or extend the bounded scanner only when a caller explicitly passes `createTreeSitterCfmlBackend()` to the adapter/orchestrator; parser choice stays behind the adapter. The current scanner covers structural CFML tags and preserves CFScript/embedded script regions as explicit opaque unsupported evidence; the fallback extractor now records bounded return/loop/try/catch/throw/break/continue control-flow Facts without evaluating expressions, and the mixed web scanner recognizes a limited set of static CFScript linkage forms, including bounded `include`/`cfinclude`, positional/named `location`/`queryExecute`, positional/named `createObject`, named `cfobject`/`cfmodule`, and `invoke`/`cfinvoke`, plus bounded semicolon-separated SQL statement nodes, quoted/schema-qualified table identifiers, and declared-CTE exclusion; this is not a general grammar. The Tree-sitter backend normalizes recognized tags, retains parser error spans, bounds node/attribute output, and preserves unsupported script/embedded regions as opaque evidence. Recoverable syntax errors yield partial units; unsupported or catastrophic regions yield explicit diagnostics. Whole-language regex parsing is prohibited.

### Stage 4 — normalized Fact IR

Convert parser output into parser-independent facts. Planned facts include `FileFact`, `IncludeFact`, `CustomTagFact`, `ComponentFact`, `MethodFact`, `InstantiateFact`, `InvokeFact`, `FormFact`, `RedirectFact`, `AjaxFact`, `FetchFact`, `QueryFact`, `RepositoryActionFact`, `ScopeReadFact`, `ScopeWriteFact`, `ConditionFact`, `ControlFlowFact`, `MappingFact`, `ApplicationHookFact`, `DynamicReferenceFact`, and `CssAssetFact`.

Each fact has a stable local `fact_id`, source span, normalized expression, enclosing symbol or condition, and extraction rule ID. The machine-readable Fact IR contract and fixture are `schema/agent-cfml-linkage-fact-v0.1.schema.json` and `examples/facts-v0.1.json`; both validate locally. Fact extraction does not resolve across files.

### Stage 5 — immutable project index

Build indexes before resolution so file order cannot affect output:

- `pathIndex`
- `componentIndex`
- `methodIndex`
- `applicationIndex`
- `mappingIndex`
- `customTagIndex`
- `symbolIndex`
- `queryIndex`
- `factByFile`

`src/project-index.js` builds immutable `pathIndex`, `componentIndex`, `methodIndex`, `applicationIndex`, `mappingIndex`, `customTagIndex`, `symbolIndex`, `queryIndex`, and `factByFile` indexes before resolution. Index lookups retain unique, ambiguous, and missing states. `Application.cfc` mappings are indexed only when statically recoverable; runtime-computed mappings remain unknown.

### Stage 6 — multi-pass resolvers

Resolvers implement a contract like:

```text
resolve(fact, indexes, context) -> Resolution[] | UnresolvedRecord[]
```

They do not mutate indexes. Planned order:

1. **Path:** `src/path-resolver.js` resolves unique literal includes, custom tags, form actions, redirects, AJAX, `fetch`, and CSS asset paths; require an admitted target to exist at resolution time, normalize relative paths and roots, and retain ambiguity, external, missing, vanished, and dynamic states.
2. **Application:** find nearest governing `Application.cfc`/`Application.cfm` and statically applicable request hooks.
3. **CFC type:** resolve `extends`, `implements`, `new`, `createObject`, `cfobject`, `cfinvoke`, imports, and component mappings; configured `analysis.mappings` and explicit CFML import mappings are both treated as non-heuristic aliases.
4. **Method:** infer receiver types from explicit types, instantiated locals, properties, arguments, and unique inheritance chains.
5. **Shared scope:** preserve ordered include context and emit conservative scope-flow relations.
6. **Web flow:** connect forms, JavaScript functions, XMLHttpRequest, jQuery, `fetch`, known wrappers, redirects, and explicit condition containment (bounded T-032).
7. **Dynamic evidence:** preserve generated names, opaque `evaluate(...)`, dynamic URLs/mappings, interpolated SQL identifiers, and dynamic datasources as bounded unresolved records (bounded T-033).
8. **SQL:** parse visible `cfquery`/`queryExecute` SQL; separate table and datasource relations.
9. **Conditional routing:** attach `if`, `switch`, `cfcase`, ternary, and mapping conditions without flattening runtime branches.
10. **Repository:** identify repository/action calls only from structural evidence; the bounded implementation classifies a CFC method only when its Fact evidence contains a visible query, then links unique resolved method calls.
11. **CSS/assets:** record visible imports and asset references without claiming build or browser resolution.

Dynamic URL expressions, `evaluate`, `isDefined`, generated names, dynamic SQL identifiers, ambiguous mappings, and uncertain receivers retain candidates or unresolved records. They are never converted into authoritative edges by filename similarity or LLM inference.

### Stage 7 — evidence and confidence

A central policy combines resolver evidence and assigns `confirmed`, `strong`, `candidate`, or `unresolved`. Confirmed requires exact syntax and a unique deterministic target. Strong permits bounded deterministic mapping or type inference. Numeric scores are telemetry only and cannot upgrade a class. Plugins cannot directly promote confidence. The policy and fixture are [`ADR-003`](docs/decisions/ADR-003-confidence-and-completeness.md) and `examples/confidence-v0.1.json`.

### Stage 8 — graph builder

Transform facts and resolutions into Graph IR nodes, edges, unresolved records, diagnostics, and statistics. Node identity derives from project-relative canonical path plus semantic identity, not source hash. Edge identity derives from relation type, endpoints, source fact, and condition. The exact SHA-256 identity and canonical ordering rules are defined in [`ADR-002`](docs/decisions/ADR-002-deterministic-identity-and-ordering.md) and exercised by `examples/identity-order-v0.1.json`. Deduplication must preserve multiple evidence records, include order, condition, dynamic flags, resolver version, and source fingerprint. `buildGraph` applies the configured `max_edges` cap after deterministic edge ordering, retains the bounded prefix, marks the graph incomplete, and emits `RESOURCE_LIMIT`; reverse adjacency is then derived only from retained edges via `buildReverseAdjacency`, while the serialized Graph IR remains the forward contract.

### Stage 9 — graph validation

Validate schema, referential integrity, unique IDs, deterministic ordering, confidence invariants, root containment, evidence spans, unresolved reason codes, and completeness accounting. A validator failure is an internal error; partial parser/resolver evidence is not. Set `complete=false` when limits, unsupported syntax, snapshot drift, or missing required resolver coverage prevents full analysis.

### Stage 10 — incremental cache

Cache is optional performance state and never the source of truth. Store per-file source hash, parser/extractor versions, and Fact IR, plus project-level index/resolution fingerprints. Reparse changed files and invalidate outgoing edges and reverse dependents whose candidate sets may change. Mapping, Application, or component-identity changes may cause bounded project-wide re-resolution. Corrupt or stale cache is discarded and rebuilt.

### Stage 11 — query engine

The bounded query engine in `src/graph-query.js` operates on an immutable `GraphSnapshot` and returns bounded evidence slices, not model-written explanations. `queryGraph` supports:

`related`, `callers`, `callees`, `includes`, `included-by`, `trace`, `scope-flow`, `tables`, `routes`, `unresolved`, `explain-edge`, `impact-evidence`, and `stats`.

Selectors are exact node IDs or exact path/canonical-name/name values; ambiguous selectors return no target. Traversal and output are cycle-safe, deterministic, and capped by results, depth, and visited-node limits; exhausted limits produce diagnostics and `complete=false`. Explanations are deterministic templates over recorded edge metadata/evidence, never LLM-written relationships or source execution. `agent-change-impact` may later consume linkage evidence, while generic impact reasoning remains its owner.

### Stage 12 — CLI and library boundary

The implemented private CLI boundary emits one stable JSON envelope on stdout and human diagnostics on stderr; it exposes `capabilities`, help, version, input validation, bounded `analyze`/`index` commands, and bounded query commands. `src/analyzer.js` composes the bounded stages and `src/index.js` exports `analyzeProject`, `queryGraph`, `createGraphSnapshot`, `serializeAnalysis`, and the explicit mixed scanner backend under the private package `exports` boundary. The `agent-cfml-linkage-analysis/v0.1` result contains Fact IR, merged resolution evidence, Graph IR, immutable reverse adjacency, diagnostics, and stats. Query commands run a fresh bounded analysis, map their command to the immutable query engine, and return its bounded result under the stable envelope; T-037 provides the bounded private-library serializer and T-038 provides cooperative monotonic wall-time enforcement, while T-039 verifies the bounded cross-budget regression boundary. Graph persistence, full parser coverage, and public release remain open. Proposed commands are `capabilities`, `index`/`analyze`, `related`, `callers`, `callees`, `trace`, `unresolved`, `explain`, and `stats`.

Proposed exit semantics: `0` completed, `1` internal failure, `2` invalid input, `3` incomplete/unsupported/resource limit, and `4` root/path/access rejection. The private CLI uses exit `3` for an exceeded serialized output budget; exit `3` is not a clean result.

## 4. Extension points

Plugins remain narrow and deterministic: `ParserAdapter`, `FactExtractor`, `Resolver`, `SqlAdapter`, `IgnorePolicy`, and `MappingProvider`. Core owns Graph IR, IDs, confidence, safety, validation, and the CLI envelope. V1 should ship built-in CFML resolvers only; third-party plugins require explicit enablement and version fingerprints.

## 5. Performance strategy

Correctness comes first. Parse with bounded worker concurrency and merge facts in sorted path order. Use map/set indexes instead of all-pairs symbol comparison. Cache source hashes and Fact IR. Enforce hard caps for files, bytes, facts, edges, evidence, traversal depth, output bytes, and wall time. The snapshot stage applies the configured ignore-glob and hidden-file policies before source admission; the library graph stage enforces the configured edge and evidence caps with deterministic partial results and explicit incomplete diagnostics; the private library and CLI use the bounded serialized output helper with an explicit incomplete envelope; the analyzer applies a monotonic wall-time deadline with cooperative discovery/parse/Fact checkpoints and resolver stage checkpoints. T-039 verifies the bounded cross-budget regression contract. A cap hit returns partial evidence and identifies the exhausted budget; it never silently truncates.

## 6. Boundary with related tools

- `agent-cfml-check` remains a separate bounded single-file structural checker. Reuse safety and contract lessons only; do not claim its external implementation as local code.
- `agent-code-slice` may later provide precise source slices; it does not own linkage.
- `agent-change-impact` may consume this tool as an evidence provider; this tool does not own generic impact prioritization.
- `agent-test-scope` may consume later impact evidence; it does not belong in the linkage resolver.

## 7. Proposed implementation sequence

The sequence is dependency-aware but not a schedule. M0's contract gate, M1 foundation, bounded T-020–T-022 extraction, T-033 dynamic-evidence preservation, and T-034 SQL/repository linkage are verified; full parser and broader resolver implementation remain open.

| Milestone | Content | Current status |
| --- | --- | --- |
| M0 | Freeze Graph IR, Fact IR, diagnostics, IDs, limits, and golden-fixture contract | Verified — T-001–T-006 |
| M1 | Safe root guard, snapshot, decoder, discovery, cache skeleton, CLI envelope | Verified — T-010–T-014 |
| M2 | Parser adapter and normalized extraction | In progress — T-020–T-022 bounded parser/Fact subset verified; broader coverage open |
| M3 | Basic path/Application/include linkage and graph validation | In progress — T-023–T-025 bounded indexes/resolution/Graph IR verified; broader linkage open |
| M4 | CFC mappings, inheritance, instantiation, and method linkage | In progress — T-030 bounded resolver verified; broader type inference open |
| M5 | Shared scope, AJAX/fetch, conditional routers | In progress — T-031/T-032 bounded scope and web-flow/condition resolvers verified; broader flow open |
| M6 | Dynamic/generated/SQL-dynamic evidence and SQL/repository linkage | In progress — T-033 preservation and bounded T-034 SQL/repository linkage verified; broader SQL semantics remain open |
| M7 | Query engine and bounded impact evidence | In progress — T-035 bounded query/evidence engine, T-036 bounded analysis composition/private entry points, and T-045 bounded query-command CLI and T-046 bounded CLI configuration enforcement verified |
| M8 | Incremental invalidation, workers, budgets, repeatability | In progress — T-040/T-041 bounded robustness/adversarial safe-failure evidence, T-038 library wall-time, T-048 library evidence-budget, T-049 Graph edge-budget, T-050 configured ignore-glob enforcement, T-051 hidden-file-policy enforcement, and private CLI output-budget enforcement; T-039 bounded cross-budget parity is verified |
| M9 | Golden suite, adversarial tests, package/CLI smoke, and separately evidenced engine checks | In progress — T-042 checks/package smoke, T-043 Node host evidence, T-044 bounded release/security/parity audit, and T-047 implemented CI workflow; hosted compatibility/public release remains open |

## 8. Design risks

The principal risks are incomplete CFML grammar coverage, runtime-dependent mappings, dynamic code and URLs, ambiguous component names, shared-scope semantics, embedded language boundaries, and accidental claims of runtime correctness. The design addresses these with adapter boundaries, explicit evidence, conservative resolution, first-class unresolved records, and deterministic verification. Broader mitigations remain unverified until the corresponding implementation and environment evidence exists.
