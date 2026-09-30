# Validation Plan and Evidence

Last updated: 2026-09-07. This document owns verification evidence and release
gates; implementation status is authoritative in [TASK.md](TASK.md).
Current implementation tree: `7cf02d0`; latest Windows short-path boundary fix:
`0b72a83`; latest hosted matrix: [run
34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471).

## Current evidence

Core implementation revisions: `b57321d`, `0cdd08f`, `13e9f14`, `6b43c58`, `ca5453e`, `0169580`, `5d29c4c`, `954f6dc`, `bbfeb58`, `940effd`, `1753c22`, `e55647f`, `e51113d`, `89f5286`, `db809f4`, `143e9f7`, `d385ff5`, `798594c`, `83f398d`, and `8bb3651`; path normalization is in `661cb4d`, its NUL-byte regression is in `1e61baf`, installed API/CLI artifact smoke is in `0902d49`, Windows `.cmd` invocation hardening is in `2a68521`, the space-containing path fixture is in `1c195af`, install scripts are disabled in `b248f10`, cache-preferred dependency resolution is in `48f102e`, packaged API/CLI analysis is in `273a344`, stable two-read worktree capture is in `c4dca94`, unknown API limit fields are rejected in `74563b1`, release metadata validation is in `2262658`, optional tag validation is in `13990ce`, schema metadata validation is in `4d770e0`, repeated resource observations are recorded in `aeef862`, Linux release checks are recorded in `17020ad`, the CI dependency audit is in `850f106`, the limit evidence reconciliation is in `beb003e`, lifecycle-safe CI installs are in `f64fbb6`, CLI/revision input hardening is in `ab27679`, required API field validation is in `b1f6477`, TypeScript unused-code checks are in `473b4da`, provider unresolved-observation bounding is in `32fd01a`, and diagnostic collection bounding is in `a0f148b`.
Bounded source/Git/external reads are in `149e0fa`.
Validated real-path reads are in `dd212e4`.
Bounded revision-blob buffers and oversized-blob diagnostics are in `2f3c482`.
Snapshot-loader and project-diagnostic identity preservation are in `0c8a130`.
Repository-internal source and repository-root symlink boundary coverage is in
`f9f904b`.
Provider module-resolution reads now reuse bounded, real-path-validated input in
`ba0538a`, with an oversized package-metadata regression.
CLI formatted output is checked against the final serialized-byte budget in
`c6296e4`, with a regression covering pretty-print expansion.
Installed package smoke repeats the compact-versus-pretty assertion through the
packaged CLI in `3472b13`.
Cross-platform snapshot path handling and repository-path preservation are in
`6b1c9b5`; the deletion fixture now accepts CRLF checkouts, and the Windows
capture mutation harness limitation is recorded in `261c47a`. Worktree Git
comparison avoids clean filters through raw hashing and content-only range
comparison in `c32634e`.

The latest local macOS full gate ran on 2026-09-07 with Node.js `v23.10.0` on
macOS `Darwin 25.6.0 arm64`. After a fresh `npm ci --ignore-scripts`, the 36-case
suite, typecheck, package/release checks, dependency audit (zero
vulnerabilities), installed API/CLI smoke, documentation check, workflow YAML
parse, and `git diff --check` all passed. The current Node 22/24 Linux container
copies recorded at `f9f904b` also pass their 34-case package gates.

Hosted workflow run
[34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471)
uses the current tree at `7cf02d0`. All six Node 22/24 Ubuntu, macOS, and Windows
jobs pass typecheck, tests, package checks, pack smoke, dependency audit, and
documentation checks. The Windows concurrent-content assertion is intentionally
skipped because the harness cannot intercept a `.cmd` shim through Node
`execFile`; this limitation is documented and does not represent a product
success claim.

The post-publication documentation and skill reconciliation is in local commit
`c2eb1c2` and has not been pushed, so no hosted run covers that documentation-
only commit. Its local checks and the public registry installation evidence below
cover the added guide and skill paths.

The earlier hosted run 34083270577 is retained as historical diagnostic evidence:
it exposed the CRLF, Windows path, and `.cmd` harness issues that were fixed in
`0b72a83` and `e85c573`. It is superseded by the green run above.

The schema/API review on 2026-09-07 used Ajv 8.20.0 with all-errors reporting
against capabilities, file, symbol, changed, and error envelopes. Every payload
class validated successfully. The result contract was frozen for `0.1.0` and is
carried unchanged by `0.1.1`, while keeping the schema `$id` and `schemaVersion`
identifier `0.1-draft`; open draft fields remain intentional.

Package `agent-change-impact@0.1.1` is published to the public npm registry and
`npm view` reports `latest: 0.1.1`. A fresh temporary-directory install loads
the API and CLI, confirms the 41-file package and the server-free
`AGENT_GUIDE.md`, portable `skills/agent-change-impact/SKILL.md`, and optional
Codex metadata, and matches the registry integrity and SHA-1 shasum. npm
reports `fileCount: 41` and `unpackedSize: 326,963`; an independent download
hash check matches shasum
`4f3e5102f521e2c6a2830604f6a127d8b84f9554` and integrity
`sha512-EWR7/JszMR/jswoNXh4kP4kdMrMhmHdQHPSn+NvX9890cp42F1o8ml3T0BZK7vXouYZzrOTRs8uRQKYbl21H3Q==`.
The tarball is 66,585 bytes. npm
signature metadata is present under key ID
`SHA256:DhQ8wR5APBvFHLF/+Tc+AYvPOdTpcIDqOhxsBHRwC7U`; no provenance attestation
is present because publication used interactive authentication. The published
tarball is immutable, so its embedded README retains the pre-publication status
wording from the source at publish time; the repository documentation below is
the current post-publication record, and a future patch can refresh the npm
README if desired.

The `0.1.1` artifact contains the guide and skill for Codex and Claude Code.
Release-check and pack-smoke require those paths, and the clean registry install
verifies them. The guide documents GitHub and npm distribution plus the Codex
`.agents/skills` and Claude Code `.claude/skills` copy paths; live host menus are
outside repository automation.

| Area | Evidence | Result |
| --- | --- | --- |
| Build and type safety | `npm run typecheck`; `npm test` builds with strict `tsc -p tsconfig.json`, including unused locals/parameters checks | Pass |
| Runtime smoke/integration | `npm test` on Node.js `v23.10.0`, macOS `Darwin 25.6.0 arm64`, plus fresh clean copies at `f9f904b` using Node.js `v22.23.2` and `v24.20.0` Alpine runtimes | Pass: 36 tests on the latest macOS gate; 34 tests on each current Linux runtime at `f9f904b`, with installed API/CLI smoke and clean lockfile installs |
| Draft contract | Ajv `8.20.0` all-errors review validates capabilities, file, symbol, changed, success/partial, and error envelopes, including effective `analysis.limits` | Pass and frozen across the `0.1.x` package line; the schema identifier remains `0.1-draft` |
| Dependency audit | `npm audit --json` (production and development dependency graph) | Pass: 0 vulnerabilities |
| Package contents | `npm pack --dry-run --ignore-scripts`; `npm publish --dry-run --ignore-scripts --access public`; `npm run release:check`; `npm run pack:smoke`; Node 22/24 Linux tarball checks | Pass for published `0.1.1`: release metadata and 41-file tarball set agree, packaged API/CLI smoke passes, pretty output is bounded, guide/skill files install correctly, and development sources are excluded |
| Bounded resource observation | `node spike/performance-benchmark.cjs` on temporary 21-, 121-, 241-, and 501-file fan-out/depth repositories on macOS, plus the 241-file fixture on Node 22/24 Linux containers; three repeated 241-file cold starts on macOS; 12,000-missing-import and 20,000-oversized-file reproductions under default limits; direct pre-decode bounded-reader assertion in the diagnostic-limit test | Pass locally: default node cap stops at 100 nodes for larger fixtures; hard caps complete; semantic counts and stop reasons remain stable across three repeated runs; the high-fan-out provider reproduction returns 299 unresolved observations with `PROVIDER_OBSERVATION_LIMIT` in a 163,378-byte envelope, `node spike/diagnostic-limit.cjs` returns 1,000 warnings with `DIAGNOSTIC_LIMIT` in a 154,605-byte envelope, and the bounded reader rejects a 4 KiB file after 513 bytes under a 512-byte budget; API/CLI child-process timings and RSS across macOS/Linux are recorded in [`spike/PERFORMANCE_FINDINGS.md`](spike/PERFORMANCE_FINDINGS.md) |
| Git/read-only behavior | Temporary repositories, revision/worktree cases, unchanged Git assertions, internal source/root and escaping symlink paths, configured clean filters/external helpers, and an oversized revision blob under a tight `maxFileBytes` limit | Pass for tested cases; oversized Git output is rejected before UTF-8 decoding and reported as `FILE_BUDGET_EXCEEDED`, duplicate base/head loader warnings retain distinct snapshot IDs, internal source/root symlinks remain in-root, escaping symlinks are skipped, and configured external diff/textconv/fsmonitor/clean-filter helpers are not executed |
| Cross-platform workflow | `.github/workflows/ci.yml` with Node 22/24 × Ubuntu/macOS/Windows, full Git history, read-only contents, and low-severity audit | Pass in hosted run [34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471): all six jobs pass typecheck, tests, package checks, pack smoke, audit, and docs check; the Windows capture-mutation test is intentionally skipped because `execFile` cannot launch a `.cmd` shim |
| Registry release | Authorized `npm publish --access public`; `npm view`; clean temporary-directory install with `npm install --ignore-scripts --omit=dev` | Pass for `0.1.1`: `latest: 0.1.1`, clean install, API/CLI/schema, 41-file guide/skill contents, integrity, SHA-1 shasum, and npm signature checks pass. No provenance attestation is present for the interactive release |

The local suite covers the core vertical slice on macOS and Linux container
runtimes, and hosted run 34123415471 verifies the declared CI matrix across
Ubuntu, macOS, and Windows. The evidence does not establish exact byte-for-byte
cross-platform equivalence, release performance thresholds, cancellation latency,
memory isolation, project-reference support, or registry provenance. The Windows
concurrent-content assertion remains a documented harness skip.

An initial fresh Node 22 cache-only artifact-smoke attempt failed with npm
`ENOTCACHED` because the temporary install could not reuse the container's
registry metadata. That attempt is not counted as a package failure; the smoke
was changed in `48f102e` to prefer the cache and allow normal registry fallback,
then packaged API/CLI analysis was added in `273a344`; both passed after clean
Node 22 and Node 24 lockfile installs.

## Documentation checks

`npm run docs:check` runs a dependency-free Node validator for:

- Required-document presence and all relative links/anchors.
- Consistent requirement (`R-*`), fixture (`V-*`), task (`CI-*`/`DOC-*`),
  decision (`D-*`), and epic (`E-*`) definitions/references.
- Acyclic task prerequisites, balanced fenced blocks, final newlines, and no
  whitespace errors.
- Consistent scope, graph direction, snapshot semantics, evidence/completeness
  separation, candidate-test terminology, dependencies, and release status.
- Byte-identical preservation of `.gitattributes`; CI uses a full-history checkout
  because the validator verifies historical commit references.

Result: **Pass** on 2026-09-07. It checked all 12 Markdown files, relative
links/anchors, identifier definitions/references, an acyclic CI dependency graph,
balanced fences, final newlines, whitespace, and byte-identical `.gitattributes`.
A depth-1 clone reproducibly fails the historical commit check, while a full
history clone passes; this confirms the workflow `fetch-depth: 0` requirement.

## Fixture status

The executable cases live in [`test/smoke.test.cjs`](test/smoke.test.cjs) and use
temporary Git repositories copied from [`test/fixtures/basic`](test/fixtures/basic).
“Pass” below means the scoped behavior was exercised locally. “Partial” means
some behavior is implemented or covered but the full fixture scenario remains
open. “Not run” means no evidence is available.

| ID | Scenario | Status | Current evidence/limitation |
| --- | --- | --- | --- |
| V-01 | Repository root, nested invocation, tracked/untracked/ignored inventory | Partial | Worktree test covers untracked/ignored and canonical dot/repeated-separator paths; parent/NUL paths fail closed; nested invocation and large inventory are untested |
| V-02 | Configured TS, JS/allowJs, TSX; production/test split; project references | Partial | JS/TS/TSX and test split pass; project references remain deferred |
| V-03 | Missing/invalid configuration, absent declarations, parse failures, unsupported arrangement | Partial | Structured missing-root/target/endpoint errors pass; config parse/reference matrix is untested |
| V-04 | Same-named methods, aliases, overloads, merged declarations, anonymous export | Partial | Ambiguous name and `--at` disambiguation pass; overload/merge cases remain open |
| V-05 | Missing target, invalid/mismatched selector, unsupported language, invalid flags | Pass for tested cases | Invalid CLI invocation, missing target, selector, and root/endpoint validation pass |
| V-06 | Named/default/namespace imports, re-export chains, literal require, calls, JSX, type-only edges, extends/implements | Partial | Imports/re-exports/calls/JSX/implements pass; full construct matrix remains open |
| V-07 | Dynamic import, computed property, callback forwarding, dispatch ambiguity, unrelated same-named symbol | Partial | Dynamic and missing literal modules become unresolved; data-flow/dispatch cases are not implemented |
| V-08 | Direct/transitive dependencies, widening, multiple changed seeds | Pass for tested cases | File/symbol direct/transitive paths and changed seeds pass; widening policy is intentionally conservative |
| V-09 | Cycles, diamond paths, duplicate aliases, tied sort keys, repeated requests | Pass for tested cases | Cycle and diamond fixtures terminate with unique nodes and deterministic payloads; duplicate-alias and tied-key matrices remain |
| V-10 | Two commits, non-current head, deleted symbol/file, removed export, rename/move | Pass for tested cases | Modification, deleted symbol, and rename old/new snapshot tests pass; removed-file/export matrix remains |
| V-11 | Staged/unstaged edits, untracked files, missing ref, conflict, concurrent edit | Pass for tested cases | Worktree/untracked/read-only, two-read content-hashed capture, staged plus unstaged edits, missing endpoint, conflict, and concurrent-content-change checks pass on macOS/Linux; the Windows concurrent-content test is harness-skipped because `execFile` cannot intercept `.cmd`, and broader repository-state combinations remain |
| V-12 | Top-level side effects, tsconfig/package changes, unsupported asset | Partial | `tsconfig.json` and `package.json` configuration changes plus unsupported-file projection pass; side-effect and broader package matrix remain |
| V-13 | Empty complete, partial, unresolved observations elsewhere in scope | Pass for tested cases | Complete empty isolated-target, dynamic partial, unresolved-module observations, and dual-snapshot loader/project diagnostic identity pass; broader irrelevant-observation combinations remain |
| V-14 | Test imports/type-only/unused/mock/skipped/unrelated/external test project | Partial | Filename candidate and dependency separation pass; negative test matrix remains |
| V-15 | Large files/projects, fan-out/deep graph, cancellation, repeated sessions | Partial | Four fan-out/depth sizes (21–501 files) on macOS plus current 34-case Node 22/24 Linux checks confirm default versus hard-cap behavior; bounded source/external/module-resolution reads stop before decoding beyond the per-file budget and Git revision blobs classify oversized output as `FILE_BUDGET_EXCEEDED`; 12,000-missing-import and 20,000-oversized-file reproductions stay within the 300-observation and 1,000-diagnostic default budgets and emit explicit truncation markers; three repeated macOS cold starts preserve counts/stop reasons; cancellation and memory-isolation evidence remain |
| V-16 | Long paths, many diagnostics, tight byte budget, invalid budget, oversized graph | Pass for tested cases | API and CLI output/argument limits, including final pretty-format byte enforcement, explicit diagnostic-cap behavior, high-diagnostic stress, and valid JSON error behavior pass; long-path stress remains |
| V-17 | Identical snapshots/config/dependencies/provider; changed provider/resolution input | Partial | Repeated identical API payloads compare equal; cross-provider/input invalidation is untested |
| V-18 | External diff/textconv/fsmonitor/clean filters, executable plugin/config, automatic type acquisition | Pass for tested cases | Marker-based external diff/textconv/fsmonitor/clean-filter fixture confirms configured helpers are not executed on macOS; raw worktree hashing and content-only range diffs stay outside repository attributes; broader executable-config and automatic-type-acquisition matrix remains |
| V-19 | Symlink escape, workspace symlink, external declarations, source/Git snapshots | Pass for tested cases | Internal workspace source symlinks and repository roots addressed through internal symlinks are analyzed, while symlink escapes are skipped and reported; Windows short-path identity handling passes in hosted run 34123415471; snapshot IDs, old/new evidence, bounded provider module-resolution reads, and read boundaries pass; broader external-input matrix remains |
| V-20 | CLI/API success, partial, validation/operation errors, malformed requests, coordinate handoff | Pass for tested cases | CLI JSON/exit behavior, API parity, malformed JavaScript API requests including missing required fields and unknown limits, line-bounded `--at`, inline values containing `=`, trimmed/NUL-rejected revisions, partials, and coordinate handoff pass; UTF-16/old-coordinate cases remain |
| V-21 | Packaged artifact outside checkout on Node 22/24 and Linux/macOS/Windows | Pass for tested cases | Node 23/macOS and Node 22/24 Linux pass tests, typecheck, pack checks, and installed API/CLI end-to-end analysis smoke; hosted run 34123415471 passes package checks on all six Node 22/24 Ubuntu/macOS/Windows jobs; the Windows capture-mutation test remains harness-skipped |
| V-22 | Authorized publication and clean registry installation | Pass for `0.1.1` | `0.1.1` is published with `latest: 0.1.1`; a fresh install verifies the API/CLI/schema, 41-file artifact, integrity/SHA-1 metadata, and npm signature. Provenance is unavailable for the interactive release |
| V-23 | Agent guide, portable skill, and Codex/Claude Code installation paths | Pass for GitHub source, local artifact, and public npm artifact | `AGENT_GUIDE.md`, `skills/agent-change-impact/SKILL.md`, and optional Codex `agents/openai.yaml` are present; release-check, pack-smoke, and a fresh registry install require and verify them. Live host discovery is not simulated |

Fixtures for callbacks and dynamic dispatch should continue to verify honest
limitations. Unsupported features must remain absent from capability claims and
visible in scope/diagnostics rather than counted as complete coverage.

## Measurement and regression policy

Measure CLI cold start separately from any reused Language Service session. Record
repository size, project configuration, dependency state, provider/Node versions,
hardware, and limits with each benchmark. Select practical release thresholds
only after CI-01/CI-08 measurements; no latency or memory guarantee exists yet.

Graph, diagnostic, and output-byte checks include diagnostics and errors. Test
where selection stops, not only the final JSON size. Deterministic work caps provide
reproducible cutoffs; process deadlines and worker cancellation are separate
resource-failure behavior.

Before expanding languages or project modes, compare manually reviewed expected
relationships with representative real changes and record missed and extraneous
candidates. Smaller context alone does not prove safer impact decisions.

## Release evidence

Store concise evidence tied to the implementation revision and package artifact:
commands/workflow IDs, fixture versions, environment, pass/partial outcomes, and
known limitations. Do not retain secrets or large raw logs. Local package
installation, remote CI, registry installation, and publication are separate
gates.

The schema was frozen for package `0.1.0` at its reviewed draft boundary and is
carried unchanged by `0.1.1`; the identifier remains `0.1-draft` and permissive
draft fields are intentional. Any future tightening or unsupported requirement
must be versioned and backed by new fixtures before changing the public contract.
Registry publication and clean installation are separate evidence gates: they
pass for both `0.1.0` and `0.1.1`. The `0.1.1` registry signature is present,
while provenance is unavailable for this interactive release.
