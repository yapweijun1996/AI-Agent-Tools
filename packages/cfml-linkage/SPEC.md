# Specification: agent-cfml-linkage

> **Status: PROPOSED.** This is a forward-looking contract, not evidence of implemented functionality.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Static cross-file linkage analysis for CFML-first mixed web projects |
| Source of truth | This document for the proposed contract; Git history for current code facts |
| Evidence | Initial repository commit `1b29c0b` contained only `.gitattributes`; current local source contains the verified foundation and bounded extractors |
| Verification | Graph/Fact/config/analysis contract checks, produced Fact/Graph/analysis IR schema validation, and `npm test` foundation/parser/scanner/Fact/index/resolution/Graph/CFC/scope/web-flow/dynamic-evidence/SQL-repository/query/orchestration/serialization/robustness/adversarial-fixture/evidence-budget/edge-budget/ignore-policy/hidden-file-policy/generated-directory-policy/configuration-mapping/plugin-rejection/control-flow/CFScript/SQL tests (95/95) pass; full linkage contract/runtime verification is incomplete |
| Limitations | Parser coverage, resolver accuracy, performance, compatibility, and release status are unverified |

## 1. Objective

Given a local project root and explicit analysis policy, produce an evidence-first graph of statically recoverable relationships among CFML/CFC, HTML, JavaScript, CSS, SQL, and related web artifacts. The result must be useful to coding agents while remaining conservative about dynamic behavior.

The analyzer is a **read-only, deterministic, local-first, non-executing** static analysis tool. It is not an application runtime, security proof, database model validator, or general-purpose impact engine.

## 2. Terminology and status language

- **Implemented:** present in repository source and covered by a passing focused test.
- **Verified:** implemented behavior supported by reproducible local or CI evidence.
- **Proposed:** intended behavior described here but not yet implemented.
- **Candidate:** one or more statically plausible targets remain.
- **Unresolved:** available evidence is insufficient to identify a target.
- **Incomplete:** analysis could not safely cover the full requested input due to limits, unsupported syntax, parse problems, or snapshot drift.

In this version, the product remains **proposed**, while the bounded safety, parser, scanner, and Fact extraction slices identified below are implemented and verified locally. The full linkage requirements are not complete.

## 3. Inputs and policy

The future API accepts:

- an explicit local root directory;
- optional configuration for ignore rules, file limits, mappings, parser selection, and resolver policy;
- an optional target or query after graph construction.

The implementation MUST canonicalize the root, reject traversal and symlink escapes, enforce root containment, freeze policy before discovery, and report rejected paths explicitly. The v0.1 configuration contract is `schema/agent-cfml-linkage-config-v0.1.schema.json` with example `examples/config-v0.1.json`; its root-safety, prohibited-action, limit, output, and exit-code invariants validate locally, and the private CLI enforces the complete object shape/value boundary before root admission. The M1 root guard in `src/root-guard.js`, byte snapshot in `src/snapshot.js`, and strict decoder/map in `src/source-map.js` now implement and test the initial boundary; configured root-relative ignore globs and the dot-prefixed hidden-file policy are normalized and applied deterministically before source admission, and project-specific mappings remain configuration rather than hardcoded Globe3 behavior; configured mappings are forwarded to the bounded CFC resolver, non-empty plugins are rejected, and the generated-file policy has bounded generated-directory semantics.

The M1 snapshot currently discovers `.cfm`, `.cfml`, `.cfc`, `.html`, `.htm`, `.js`, `.mjs`, `.css`, and `.sql` deterministically. The M1 decoder accepts strict UTF-8 only and maps byte offsets to one-based lines and zero-based UTF-16 columns. The M2 parser adapter now owns a fail-closed backend boundary and explicit partial/unsupported diagnostics. Dependency-free bounded CFML/web structural scanners and a fixture-backed Fact extractor are available as explicit components, while the default adapter remains unselected and full grammar coverage/resolution are unresolved. Visible SQL table extraction and literal `queryExecute` extraction are bounded; quoted/schema-qualified identifiers are normalized and declared CTE names are excluded, while T-033 preserves interpolated SQL identifiers and dynamic datasources as unresolved evidence, and T-034 links only structurally evidenced repository actions. SQL semantics, target resolution, and broader cross-file linkage remain later concerns.

### 3.1 Current repository contract evidence

The repository now has a private `package.json` with Node `>=20`, an `npm test` script, a private `bin/agent-cfml-linkage.js` entry point, package `exports`, a private `src/index.js` library entry, and internal root-guard, snapshot, source-map, CLI, cache, parser-adapter, bounded CFML/web scanner, Fact extractor, bounded SQL/repository resolver, analysis orchestrator, bounded output serializer, and bounded graph-query modules with focused tests. It has an explicit but host-unverified Tree-sitter CFML backend in `src/tree-sitter-backend.js`, declared through pinned optional dependencies `@cfmleditor/tree-sitter-cfml@0.26.2` and `tree-sitter@0.25.0`; it has no released CLI/API, runtime linkage implementation, verified native parser installation, or release artifact. A read-only CI workflow is defined but has no hosted run, and bounded query-command CLI wiring plus library evidence, Graph edge, and serialized-output enforcement are implemented. API and public package metadata below remain proposed contracts.

## 4. Analysis contract

The proposed pipeline is:

`Root Guard → Snapshot/Discovery → Decode/Source Map → Parse → Fact Extraction → Project Index → Resolution Passes → Evidence/Confidence → Graph Build → Validate → Cache → Query → CLI/JSON`.

Each stage has typed boundaries and may emit diagnostics. Cross-file stages consume normalized Fact IR rather than parser-specific AST nodes. No stage mutates source files. The implemented parser adapter and bounded Fact extractor do not resolve across files; they normalize parser state, preserve bounded dynamic/generated/SQL-dynamic evidence, and emit fixture-backed structural facts only. The internal T-023 index builder creates immutable lookup indexes; T-024 provides conservative literal path/Application resolution; T-025 builds/validates bounded Graph IR; T-030 resolves bounded literal CFC relationships; T-031/T-032 resolve bounded ordered scope and web-flow condition relationships; T-033 preserves bounded dynamic/generated/SQL-dynamic evidence; T-034 extracts bounded `queryExecute` SQL and resolves structurally evidenced repository/action calls; T-035 provides bounded immutable graph queries/evidence explanations; T-036 composes these stages behind a private analysis result; T-045 maps the recognized query commands to fresh bounded analysis graphs without broader cross-file inference; and T-046 enforces the v0.1 CLI configuration shape/value contract before analysis.

### 4.0 Fact IR contract

The parser-independent Fact IR bundle is defined by `schema/agent-cfml-linkage-fact-v0.1.schema.json` with a representative fixture at `examples/facts-v0.1.json`. It records source files, parser identity/completeness, normalized facts, source spans, enclosing symbols, conditions, extraction rule IDs, diagnostics, and counts. The schema, representative fixture, and produced bounded fixture bundle validate locally; T-034 adds bounded `REPOSITORY_ACTION` facts only when a CFC method contains query evidence, and T-056 adds structural `CONTROL_FLOW` facts for selected fallback tags without expression evaluation, while T-057 adds bounded static/named-argument CFScript linkage and quoted/CTE-safe SQL table forms; broader parser and Fact IR coverage remains unimplemented.

### 4.1 Planned linkage families

| Family | Planned relationships |
| --- | --- |
| CFML structure | include, custom tag, Application governance, request hooks |
| CFC | extends, implements, instantiates, invokes, method calls |
| Web flow | form submit, redirect, AJAX, `fetch`, known wrappers |
| Shared state | scope produces, consumes, overrides |
| SQL | query reads/writes table, uses datasource |
| Repository | structurally evidenced repository/action calls |
| Styling/assets | CSS imports and statically visible asset references |
| Dynamic behavior | explicit candidate/unresolved records, never guessed edges |

CSS support is intentionally bounded and secondary to CFML/CFC linkage. It must not expand into browser rendering or runtime asset resolution.

### 4.2 Graph document

The Graph IR document contains:

```text
schema_version
 tool { name, version }
 project { root_id, root_name }
 snapshot { created_at, source_fingerprint, file_count }
 capabilities
 nodes[]
 edges[]
 unresolved[]
 diagnostics[]
 stats
```

Required planned node kinds include `FILE`, `CFM_PAGE`, `CFC_COMPONENT`, `CFC_METHOD`, `CUSTOM_TAG`, `APPLICATION`, `FORM`, `JS_FUNCTION`, `QUERY`, `DATABASE_TABLE`, `DATASOURCE`, `REPOSITORY_ACTION`, `SCOPE_VARIABLE`, `ROUTE_CONDITION`, `CONTROL_FLOW`, `EXTERNAL_TARGET`, and `UNRESOLVED_TARGET`.

Required planned edge families include `INCLUDES`, `CUSTOM_TAG_CALL`, `EXTENDS`, `IMPLEMENTS`, `INSTANTIATES`, `CFINVOKES`, `CALLS_METHOD`, `FORM_SUBMITS_TO`, `REDIRECTS_TO`, `AJAX_CALLS`, `FETCHES`, `QUERY_READS_TABLE`, `QUERY_WRITES_TABLE`, `QUERY_USES_DATASOURCE`, `CALLS_REPOSITORY`, `APPLICATION_GOVERNS`, `REQUEST_HOOK_APPLIES_TO`, `ROUTES_WHEN`, `SCOPE_PRODUCES`, `SCOPE_CONSUMES`, `SCOPE_OVERRIDES`, `DYNAMIC_REFERENCE`, and `CSS_ASSET_REFERENCES`.

This list is the proposed v0.1 contract. The machine-readable Graph IR schema and representative example are now present at `schema/agent-cfml-linkage-graph-v0.1.schema.json` and `examples/graph-v0.1.json`; the bounded runtime graph builder/validator is implemented in `src/graph.js`; broader cross-file resolvers remain unimplemented.

### 4.3 Identity and evidence

Node identity MUST be independent of source content changes and derive from project-relative canonical path plus semantic symbol identity. Source hashes and revisions are freshness fields, not identity. The exact canonical path, node ID, edge ID, duplicate-evidence merge, and output ordering rules are defined in [`ADR-002`](docs/decisions/ADR-002-deterministic-identity-and-ordering.md) and exercised by `examples/identity-order-v0.1.json`.

For v0.1, node IDs use the versioned SHA-256 identity tuple `(kind, canonical_path, canonical_symbol_or_semantic_name)`. Edge IDs use `(type, from, to, sorted source_fact_ids, condition_key)` after semantic duplicate grouping. Arrays and evidence use specified canonical sort keys; volatile snapshot time is excluded from canonical comparison.

Evidence SHOULD include:

- evidence kind (`syntax`, `path_resolution`, `symbol_resolution`, `scope_flow`, `sql_parse`, `mapping`, `condition`, or `corroboration`);
- project-relative file and bounded source span;
- bounded raw text only where necessary;
- normalized expression and extractor rule ID.

Every graph relationship must be explainable by bounded source evidence. Full source bodies MUST NOT be placed in graph output.

### 4.4 Confidence and unresolved results

The central policy, not individual plugins, assigns confidence:

- `confirmed`: exact syntax and a unique deterministic target;
- `strong`: deterministic target with bounded mapping or type inference;
- `candidate`: plausible static target but ambiguity remains;
- `unresolved`: insufficient evidence.

Numeric scores are optional telemetry and never promote a confidence class. Filename similarity, LLM output, and intuition cannot create a confirmed edge. The exact evidence gates, completeness semantics, diagnostic codes, and policy cases are defined in [`ADR-003`](docs/decisions/ADR-003-confidence-and-completeness.md) and exercised by `examples/confidence-v0.1.json`.

Unresolved records are successful analysis output, not internal errors. Planned reason codes include `DYNAMIC_EXPRESSION`, `AMBIGUOUS_PATH`, `AMBIGUOUS_COMPONENT`, `AMBIGUOUS_METHOD`, `MAPPING_UNKNOWN`, `OUTSIDE_ROOT`, `PATH_NOT_FOUND`, `EXTERNAL_TARGET`, `GENERATED_SYMBOL`, `SQL_DYNAMIC_IDENTIFIER`, `UNSUPPORTED_SYNTAX`, and `PARSE_PARTIAL`. A complete result may contain unresolved dynamic relationships; completeness instead reports whether the declared source and enabled analysis stages were safely covered.

### 4.5 Bounded query contract

`src/graph-query.js` provides the bounded internal `createGraphSnapshot` and `queryGraph` contract. A snapshot deep-copies and freezes a validated Graph IR document. Queries select nodes only by exact `node_id`, `path`, `canonical_name`, or `name` (with optional exact `kind`); ambiguous selectors return no target and a diagnostic. `explain-edge` requires an exact `edge_id`. T-036 exposes this query boundary through the private package entry, and T-045 wires the recognized CLI query names to a fresh bounded analysis graph. The CLI query commands do not persist graphs or broaden the query operation set; they return the `agent-cfml-linkage-query/v0.1` result inside the stable CLI envelope and fail closed on invalid selectors/options.

The supported operations are `related`, `callers`, `callees`, `includes`, `included-by`, `trace`, `scope-flow`, `tables`, `routes`, `unresolved`, `explain-edge`, `impact-evidence`, and `stats`. The private CLI exposes the bounded subset `related`, `callers`, `callees`, `trace`, `unresolved`, `explain` (mapped to `explain-edge`), and `stats`; request selectors and bounds are supplied under the optional `query` object in `schema/agent-cfml-linkage-config-v0.1.schema.json`. Results are deterministic and bounded by `max_results`, `max_depth`, and `max_visited`; traversal is cycle-safe. Exhausted limits return diagnostics and `complete=false`. Query explanations are deterministic templates over edge confidence, metadata, spans, and evidence; they do not execute source or invent targets. The query envelope is `agent-cfml-linkage-query/v0.1`; public package integration and graph persistence remain later contracts.

## 4.6 Composed analysis result

T-036 exposes `analyzeProject({ rootPath, config, parserBackend | parserAdapter, ...options })` through the private package entry. It creates the root guard, discovers a deterministic snapshot, reads and parses each admitted file, extracts Fact IR, builds immutable indexes, runs the bounded path/CFC/scope/web-flow/repository passes, merges resolution and diagnostic evidence by stable IDs, builds Graph IR, and returns immutable reverse adjacency. The default parser backend remains unselected and therefore returns `PARSER_UNAVAILABLE`; the CLI explicitly injects `mixed-structural-scanner/v0.1`. Callers may explicitly inject `createTreeSitterCfmlBackend()` from `src/index.js` for `.cfm`/`.cfml`/`.cfc`/`.cfs` parsing, but its native loading and full Fact coverage are host-unverified. Source metadata/content is checked after parsing, and drift makes the result incomplete. The result contract is `schema/agent-cfml-linkage-analysis-v0.1.schema.json`.

The orchestrator currently applies configured language, file/fact/resolver/traversal, edge, evidence, ignore-glob, hidden-file, and wall-time policies that are supported by the underlying bounded stages. The optional Tree-sitter backend is explicit and fail-closed; its unsupported script/embedded-language regions remain opaque rather than becoming guessed Facts. `buildGraph` enforces the library `limits.max_edges` budget on the final deterministically ordered edge set and the `limits.max_evidence` budget in deterministic edge/unresolved/node order; either cap returns `complete=false` with `RESOURCE_LIMIT` details while preserving a valid Graph IR and reverse adjacency. The private library `serializeAnalysis` and CLI enforce `limits.max_output_bytes` for serialized results, returning `complete=false`/`OUTPUT_LIMIT` evidence without arbitrary JSON truncation; values below 300 bytes are rejected at the CLI boundary because the stable fallback envelope cannot fit. `analyzeProject` enforces `limits.max_wall_time_ms` with a monotonic clock, cooperative discovery/parse/Fact checkpoints, and resolver stage checkpoints; a deadline preserves completed partial evidence, returns `complete=false`, and adds deterministic `TIME_LIMIT` details including the configured limit and stage. Synchronous parser calls are not preemptively cancellable. T-039 verifies the bounded cross-budget regression boundary in ADR-029. The bounded ignore matcher supports root-relative literal, `*`, `?`, and recursive `**` patterns, while hidden-file policy covers dot-prefixed entry names; broader glob semantics, generated-file detection, query-command persistence, full parser coverage, and public release remain open and are not implied by this API. Query-command CLI output is bounded by the configured serialized output cap.

### 4.7 Planned private-library budget tranche

T-037 is verified for its bounded private-library serialization boundary: `serializeAnalysis` uses exact UTF-8 byte accounting, shares the helper with the CLI, and returns explicit `OUTPUT_LIMIT` incomplete evidence without arbitrary JSON truncation. T-038 is verified for bounded monotonic wall-time enforcement with discovery/parse/Fact checkpoints and resolver stage checkpoints, preserving partial evidence and emitting deterministic `TIME_LIMIT` diagnostics; synchronous parser calls are not claimed to be preemptively cancellable. T-039 verifies bounded budget ownership, multi-limit behavior, schema-valid partial-result shape, CLI/library boundary behavior, and safety invariants. ADR-029 is the decision record; T-039 is verified for its bounded contract, not for the complete analyzer/release gate.

## 5. Resolution rules

1. **Path resolver:** resolve literal normalized paths for includes, custom tags, form actions, redirects, AJAX, and `fetch`; require the admitted target to still exist and remain root-contained before confirming an edge.
2. **Application resolver:** identify the nearest governing `Application.cfc`/`Application.cfm` when statically recoverable; preserve conditional filename exceptions.
3. **CFC resolver:** resolve explicit imports/mappings, component paths, `extends`, `implements`, `cfobject`, and `cfinvoke` conservatively; bounded T-030 does not claim `new`, `createObject`, or runtime type inference.
4. **Method resolver:** infer receiver types only from bounded evidence such as explicit types, instantiation, properties, arguments, and unique inheritance chains.
5. **Scope resolver:** preserve ordered `cfinclude` context and emit scope-flow edges only when variable identity and order are supported; T-031 implements bounded produces/consumes/overrides evidence. `evaluate`, `isDefined`, generated names, and unscoped page variables remain dynamic unless exactly foldable.
6. **Web-flow resolver:** connect explicit conditions to unique supplied literal form/AJAX/fetch/redirect targets; retain dynamic URL expressions and variable dependencies rather than guessing endpoints.
7. **Dynamic evidence:** preserve generated names, opaque `evaluate(...)`, interpolated SQL identifiers, and dynamic datasources as unresolved records with bounded expressions; never infer targets.
8. **SQL resolver:** parse statically visible `cfquery` and literal-`queryExecute` SQL and keep datasource expressions separate. SQL edges describe syntax only; dynamic identifiers/datasources remain unresolved.
9. **Conditional router resolver:** attach `if`, `switch`, `cfcase`, ternary, and mapping conditions; do not flatten runtime branches into unconditional calls.
10. **Repository resolver:** require an explicit CFC method resolution plus query evidence within that method; filename-only or naming-convention inference is insufficient.
11. **CSS resolver:** record statically visible imports/assets without claiming browser or build-tool resolution.

## 6. Determinism, limits, and failure

The future implementation MUST:

- sort discovered files and merged facts before resolution;
- use deterministic IDs, ordering, serialization, and resolver versions;
- detect source snapshot drift before final output;
- enforce file count/size, fact, edge, evidence, traversal-depth, output-size, and wall-time limits; the library edge/evidence/serialized-output/wall-time budgets, configured ignore-glob/hidden-file policies, and private CLI output-size enforcement are bounded, while T-039 verifies bounded cross-budget enforcement and parity;
- return `complete=false` with the exact exhausted budget when a limit prevents complete coverage;
- treat cache corruption or version mismatch as a rebuild condition;
- emit machine-readable JSON on stdout and human diagnostics on stderr.

Proposed CLI exit meanings are:

| Code | Meaning |
| ---: | --- |
| 0 | Analysis completed, including findings or unresolved records |
| 1 | Internal failure |
| 2 | Invalid input or configuration |
| 3 | Incomplete, unsupported, or resource-limited analysis |
| 4 | Root/path/access rejection |

Exit code `3` must never be interpreted as clean or fully verified.

## 7. Safety and non-goals

The analyzer MUST NOT execute CFML, JavaScript, SQL, shell commands, or application code. It MUST NOT access databases or networks. It MUST not expose secrets in diagnostics or output and SHOULD ignore dependency, generated, secret, and cache paths by policy.

Static SQL does not establish tenant isolation, authorization, transaction correctness, joins, or business intent. Static web-flow edges do not prove that an endpoint exists or is reachable at runtime.

## 8. Acceptance criteria for the first implementation

The first releasable implementation must have:

- a frozen Graph IR and Fact IR contract;
- deterministic root guard, discovery, parsing, extraction, resolution, graph validation, and JSON output;
- the versioned fixture baseline at `fixtures/manifest-v0.1.json`, followed by golden fixtures for ordered includes/shared scope, CFC inheritance and calls, custom tags, forms, AJAX/fetch, redirects, SQL, Application governance, conditional routers, dynamic/generated symbols, ambiguous mappings, out-of-root paths, and malformed CFML;
- negative tests for strings/comments resembling syntax, cycles, cache corruption, snapshot mutation, and every resource limit;
- reproducible package, library-import, and CLI smoke checks;
- separately evidenced engine compatibility claims before any Lucee or Adobe ColdFusion claim is published.

## 9. Traceability

The proposed contract is derived from the project Graph IR / node-edge design and the staged pipeline design recorded in the project knowledge base on 2026-09-14. Those records are design inputs, not implementation evidence. This repository becomes the authoritative maintained copy once contracts are implemented and reviewed.
