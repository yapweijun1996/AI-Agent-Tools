# Changelog

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |

All entries are user-visible changes. Package `0.1.2` adds an agent-facing skill and npm integration documentation without changing runtime behavior. Packages `0.1.1` and `0.1.2` were published publicly to npm on 2026-09-08; their matching tags and GitHub Releases are recorded in `RELEASE.md`.

## 0.1.2 — 2026-09-08

### Documentation

- Added `skills/agent-symbol-search/SKILL.md` with npm installation, operation selection, JSON result handling, and safety boundaries for AI coding agents.
- Documented npm package installation, `npx --no-install` CLI usage, CommonJS/ESM examples, project selection, and the handoff from symbol locators to source extraction.
- Added the agent skill to the npm package file list; no runtime, API, schema, dependency, or performance behavior changes are included in this patch.

### Release

- Published `agent-symbol-search@0.1.2` publicly with `latest` pointing to `0.1.2`.
- Created annotated Git tag `v0.1.2` and the matching public GitHub Release from the green `main` commit.
- This local interactive publish intentionally does not claim npm provenance.

## 0.1.1 — 2026-09-08

### Documentation

- Removed stale release-candidate wording from the public README and aligned package metadata with the documentation-only patch version.
- Added an explicit 0.1.1 publication checklist while preserving the completed 0.1.0 release record.
- No runtime, API, schema, dependency, or performance behavior changes are included in this patch.

## 0.1.0 — 2026-09-08

### Runtime

- Added a shared TypeScript compiler/checker-backed library and `agent-symbol-search` CLI.
- Added `capabilities`, exact/prefix/substring `search`, `symbols`, `definition`, `references`, and explicit `implements`/`extends`/abstract-method `implementations` operations.
- Added versioned JSON schemas and runtime validation for requests, results, capabilities, ranges, IDs, diagnostics, truncation, and limits.
- Added deterministic TypeScript project selection, fixed no-config fallback behavior, path-alias support, ambiguity diagnostics, normalized kinds including stable explicit/implicit constructors, effective export-specifier/re-export state, exported variable/binding state, variable-bound class-expression relationships, POSIX paths, UTF-16 ranges, and SHA-256 symbol identities.
- Added bounded read-only discovery with root/symlink containment, `.gitignore`, nested include-glob reachability, non-overridable `node_modules` exclusion, include/exclude precedence, secret exclusions, file/byte/result budgets, adversarial glob timeout coverage, and cooperative timeout diagnostics.
- Added optional `search.project` selection with deterministic multiple-config recovery, repository-boundary validation, regular-file tsconfig enforcement, and project-scoped search file sets.
- Added injectable CLI stdout/stderr streams for in-process JSON, diagnostics, and exit-code coverage.
- Fixed transitive compiler imports bypassing discovery boundaries and resource budgets; configuration, package metadata, and type dependencies now use a guarded reader with separate compiler read metrics.
- Fixed Windows short-path installations incorrectly excluding TypeScript standard libraries by using the canonical library location in the compiler host.
- Fixed instance-method symbol normalization, literal element-access references, and definition/reference positions inside constructor bodies and parameter types.
- Fixed nested `.gitignore` matching/negation, added `.mts`/`.cts` and declaration-file support, and rejected conflicting operations in dedicated library helpers at compile time and runtime.

### Verification

- Added TypeScript golden fixtures, shorthand-reference and constructor coverage, Base → abstract Mid → concrete Child relationship coverage, ambient `.d.ts` and namespace/module false-positive coverage, effective-export and outside-root diagnostic regressions, false-positive, project-selection, security, limit, read-only, CLI/library parity, and installed-artifact smoke tests.
- Added `BENCHMARK.md` with reproducible cold/warm small, medium, and large fixture measurements without a latency guarantee.
- Added documentation, schema, capability, packaging, benchmark-evidence, and verification scripts; docs and benchmark checks compare claims with runtime output and fresh deterministic fixture measurements. Direct Ajv and minimatch dependencies are pinned to audited non-vulnerable releases.
- Added serial native Node coverage for product sources with lines ≥85%, functions ≥80%, and branches ≥75%; ordinary tests use a 30-second `EngineOptions` budget while the product default remains 5 seconds.
- Added review regression tests for imported secret/excluded/symlink/outside-root files, dependency budgets, configuration inheritance, bounded readers, nested ignore rules, instance methods, constructor positions, native module extensions, and helper operation conflicts; installed-artifact smoke now also exercises ESM and native-module method navigation.
- Added least-privilege GitHub Actions coverage for Node 22/24/26 on Ubuntu, Node 24 package smoke on Ubuntu/macOS/Windows, and an Ubuntu/Node 24 benchmark gate. Updated package metadata, public npm configuration, `prepack`, `release:check`, `prepublishOnly`, and `RELEASE.md`.

### Documentation

- Reconciled README, DESIGN, SPEC, EPIC, ROADMAP, TASK, and documentation-governance status with the verified working-tree implementation.
- Recorded supported Node majors 22, 24, and 26, the v0.1.0 no-public-latency-SLO decision, interactive local publication without provenance, and next-release trusted publishing/provenance follow-up. JavaScript, Python, CFML, structural typing, dynamic dispatch, persistent cache, MCP, code slicing, impact analysis, and test selection remain outside this V1 scope.
- Published `agent-symbol-search@0.1.0` publicly from the verified release commit; this local interactive release intentionally does not claim npm provenance.
