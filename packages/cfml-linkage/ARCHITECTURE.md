# Architecture: agent-cfml-linkage

> **Status: PROPOSED / M2–M9 IN PROGRESS.** The M1 foundation and bounded M2–M9 parser/scanner/Fact/resolver/query/robustness/adversarial/check slices exist; the remaining architecture is not implemented.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Component boundaries, data flow, ownership, and failure behavior |
| Source of truth | This document for proposed architecture; Git history for current code facts |
| Evidence | Initial commit `1b29c0b` contained only `.gitattributes`; current local commits contain the verified foundation, bounded extractors, and an explicit host-unverified Tree-sitter CFML backend |
| Verification | Root-guard/snapshot/decoder/CLI/cache/parser-adapter/scanner/Fact/resolver/dynamic-evidence/SQL-repository/query/serialization/wall-time/cross-budget/robustness/adversarial-fixture/evidence-budget/edge-budget tests pass locally; remaining architecture is unverified |
| Limitations | Native parser loading, runtime compatibility, resource costs, and public package compatibility are unknown; the Tree-sitter dependencies are optional and the default path remains dependency-free |

## 1. Boundary

The planned tool owns deterministic static linkage analysis for a local CFML-first project. The implemented bounded slices currently own root admission, path containment, byte snapshot/discovery, strict source coordinates, bounded CLI/library composition, bounded parser scanners, Fact evidence, immutable indexes, conservative literal resolution, dynamic/generated/SQL-dynamic preservation, bounded SQL/queryExecute extraction, structural repository/action resolution, bounded Graph IR/query production, and inert adversarial safe-failure fixtures; bounded Graph IR production/validation is implemented in `src/graph.js`, bounded CFC resolution is implemented in `src/cfc-resolver.js`, bounded shared-scope resolution is implemented in `src/scope-resolver.js`, bounded web-flow resolution is implemented in `src/web-flow-resolver.js`, bounded repository resolution is implemented in `src/repository-resolver.js`, bounded query/evidence explanations are implemented in `src/graph-query.js`, and T-036 composition is implemented in `src/analyzer.js`; broader linkage resolution and public release remain unimplemented; bounded query-command orchestration is implemented in the private CLI. It does not execute source, perform runtime discovery, connect to services, or make generic impact or test-selection decisions.

```text
Local source + explicit policy
             |
             v
     Linkage analysis boundary
             |
     Graph IR + evidence + diagnostics
             |
             +--> future consumers (query clients, impact tools)
```

All consumers receive facts and evidence rather than hidden runtime assumptions. A consumer may interpret evidence, but may not treat candidate or unresolved relationships as confirmed.

## 2. Ownership model

| Component | Owns | Must not own |
| --- | --- | --- |
| Root guard/policy | canonical root, path containment, configured root-relative ignore-glob and hidden-file policies, and snapshot admission in the implemented M1 slice; config-wide policy freezing remains planned | parsing or confidence upgrades |
| Snapshot/discovery | deterministic file set, configured ignore-glob/hidden-file matching, content fingerprints, metadata, symlink skipping, and drift diagnostics in M1 | source mutation or runtime discovery |
| Decoder/source map | decoding state and coordinate conversion | linkage decisions |
| Parser adapter | explicit backend boundary, bounded CFML/web structural scanners, optional Tree-sitter CFML backend, syntax trees, parser diagnostics, completeness; default backend remains unselected | cross-file resolution |
| Fact extractor | normalized CFML/web Fact IR and extraction evidence | target selection |
| Project index | immutable path, symbol, mapping, application, query, and per-file fact indexes; unique/ambiguous/missing lookup states | mutable resolution state |
| Resolver passes | bounded candidate/target resolution in `src/path-resolver.js`, `src/cfc-resolver.js`, `src/scope-resolver.js`, `src/web-flow-resolver.js`, and `src/repository-resolver.js`; unresolved/ambiguous/dynamic states | index mutation or authoritative guessing |
| Evidence policy | evidence merge and confidence classes | parser-specific parsing |
| Graph builder/validator | Graph IR construction, invariants, serialization readiness, and the bounded global edge/evidence budgets | generic business interpretation |
| Cache | optional derived performance state | source of truth or stale-data authority |
| Query engine | immutable GraphSnapshot, exact selectors, bounded deterministic traversal, evidence slices, and explanations in `src/graph-query.js` | model-written relationships, target guessing, or runtime execution |
| CLI/library | private invocation, stable envelope, stderr separation, bounded `analyze`/`index`, and private `analyzeProject` export | execution of analyzed source, query-command persistence, or public release |

Core owns stable IDs, confidence policy, root safety, validation, and output contracts. T-037 implements the private-library serialization owner with exact UTF-8 output accounting; T-038 assigns monotonic wall-time checkpoints to orchestration and T-039 assigns cross-budget parity to the test/contract layer. Plugins are intentionally subordinate to those invariants.

## 3. Data flow

1. **Context:** validate root and freeze configuration.
2. **Snapshot:** apply configured ignore globs and hidden-file policy, then discover and fingerprint admitted files in sorted order.
3. **Parse:** decode each file and preserve source coordinates.
4. **Facts:** convert syntax into parser-neutral facts.
5. **Index:** `src/project-index.js` builds complete immutable indexes before resolution.
6. **Resolve:** run ordered, read-only resolver passes; T-024 currently covers literal paths and basic Application governance/hooks.
7. **Evidence:** classify each result and retain ambiguity, including dynamic/generated/SQL-dynamic reasons.
8. **Graph:** create nodes, edges, unresolved records, diagnostics, and stats.
9. **Validate:** check schema, references, determinism, completeness, and safety invariants.
10. **Serve:** cache validated derived data and answer bounded queries through the internal GraphSnapshot query engine.

The graph is built from facts plus resolution evidence, never directly from ad hoc parser objects. This allows parser replacement without rewriting graph semantics. `src/analyzer.js` owns the stage order and deterministic merge boundary; individual resolvers remain independently callable and read-only.

## 4. Important ownership boundaries

### Parser versus resolver

Parsing establishes syntax and source spans. Resolvers establish only bounded cross-file relationships. This prevents a parser from silently inventing project semantics and prevents resolvers from depending on unstable AST implementation details.

### Evidence versus confidence

Resolvers submit evidence. A central policy assigns confidence. This prevents a plugin or filename heuristic from promoting its own result to `confirmed`.

### Tree-sitter backend versus bounded scanner

`src/tree-sitter-backend.js` is an explicit parser backend, not a default replacement. It uses the pinned optional Tree-sitter CFML grammar, converts recognized tag nodes to the existing structural tree, and preserves parser errors and script/embedded-language regions as incomplete evidence. If the native addon cannot load, the factory fails closed; the dependency-free scanner remains available. No synchronous parser call is represented as preemptively cancellable by the analyzer wall-time budget.

### Cache versus graph

The graph document and current source snapshot are authoritative. Cache entries are disposable and versioned. Any hash, policy, parser, extractor, or resolver mismatch invalidates the relevant cache scope.

### Linkage versus impact

Linkage answers “what statically relates to what, and why?” Generic impact ranking, change prioritization, and test selection belong to downstream tools such as `agent-change-impact` and `agent-test-scope`.

## 5. Graph model

The Graph IR has semantic nodes such as files, pages, components, methods, forms, JavaScript functions, queries, tables, datasources, repository actions, scopes, route conditions, external targets, and unresolved targets. It has explicit edge families for includes, calls, web flow, SQL, repository/action calls, Application governance, scope flow, and dynamic references.

Every edge includes endpoints, relation type, source span, evidence, resolver identity, confidence, condition/order where relevant, dynamic state, and freshness information. Node and edge IDs remain stable across content changes when semantic identity is unchanged.

## 6. Failure and partial-result model

The architecture treats incomplete analysis as data:

- syntax errors produce partial parse diagnostics where recovery is safe;
- unsupported syntax produces explicit unresolved evidence;
- ambiguous names retain candidate targets;
- dynamic/generated/SQL-dynamic values retain bounded expressions and dependencies;
- out-of-root targets are rejected;
- snapshot drift invalidates completeness;
- resource caps return `complete=false` and identify the exhausted budget; discovery applies configured ignore globs and hidden-file policy before source reads, and the graph stage enforces the configured edge cap in deterministic edge order and evidence-item cap in deterministic edge, unresolved-record, and node order;
- T-037 implements the private-library serialized-output cap; T-038 implements the private-library monotonic wall-time cap with cooperative stage/loop checkpoints and partial results; T-039 verifies the bounded cross-budget regression contract;
- cache corruption causes rebuild, never trusted stale output.

An internal invariant or serialization failure is different: it is an internal error and must not be represented as a clean analysis.

## 7. Security boundaries

The implemented root guard reads filesystem metadata only to canonicalize and contain paths; the snapshot and bounded orchestrator read bounded source bytes without executing them and verify source stability around parsing. The process reads only authorized local paths beneath the canonical root and configured safe metadata. It must not evaluate CFML expressions, execute JavaScript or SQL, spawn application commands, access a database, or make network requests. Diagnostics and graph evidence must be bounded and must not disclose secret contents.

## 8. Extensibility

The initial implementation should keep extension points narrow:

- parser adapter;
- fact extractor;
- resolver;
- SQL adapter;
- ignore policy;
- mapping provider.

Third-party plugins are not required for V1. If added later, enablement, compatibility, and version fingerprints must be explicit. Plugins cannot change root safety, output schema, stable ID rules, or confidence policy.

## 9. Architectural risks and decisions

The major decisions are recorded in [`docs/decisions/ADR-001-project-boundary.md`](docs/decisions/ADR-001-project-boundary.md). The largest open technical risks are CFML grammar coverage, runtime-computed mappings, embedded-language parsing, shared-scope flow, dynamic code, and deterministic incremental invalidation. Each must be covered by fixtures and evidence before release claims are made.
