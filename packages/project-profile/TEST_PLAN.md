# V1 Verification and Acceptance Plan

Status: implementation verification in progress for corrective release `0.1.2`. The worktree contains 16 frozen synthetic fixture definitions, a versioned JSON Schema, unit/golden/edge tests, a packaged-consumer CLI E2E, and a cross-platform CI matrix. GitHub Actions run `34096395160` records successful Windows, Linux, and macOS jobs on Node 18.18, 20, and 22; the corrective release must additionally prove the npm-installed executable path.

## Verification principle

A frozen fixture establishes the expected facts for a known input tree. A passing result proves only the covered behavior. Missing or unverifiable evidence remains unknown; it never becomes a passing assertion about a repository.

Use synthetic repositories. Do not copy private repositories, real credentials, or live project secret values into fixtures. Security canaries must be synthetic nonsecret markers.

## Tool verification versus target execution

Run the profiler project's own typecheck, build, unit/golden tests, CLI smoke checks, JSON Schema validation, and semantic consistency checks using the package's development commands. These validate the tool being built. They do not authorize running scripts declared by inspected target or fixture repositories.

The test harness may prepare synthetic fixture trees before profiling. During profiling, target contents remain unchanged, and the profiler must perform no project-code execution, network access, installation, or secret-body reads. Observe the profiler's boundary separately from test setup and the harness process launching the CLI.

Independent verification means comparing observable behavior with independently reviewed expectations and safety instrumentation, not treating an implementation's own success message or another tool's passing tests as proof. It does not require additional agents.

## Packaged consumer distribution gate

The old CI smoke used `node dist/cli.js . --format json`. That verified the implementation file directly, but bypassed package metadata, the `bin` mapping, npm-created symlink/shim behavior, the packed tarball, consumer installation, and normal executable invocation. That gap allowed `0.1.1` to publish with a silent npm CLI failure.

Permanent rule: **any package exposing `bin` MUST have a packaged-consumer E2E that executes the installed binary from a clean project.** The gate must perform `npm pack`, install the generated tarball into a fresh consumer, invoke `node_modules/.bin/agent-project-profile` (or its Windows shim), require non-empty JSON stdout with the expected schema/tool version and profile fields, and verify `--version` and `--help`. Direct `node dist/*.js` smoke checks may remain as implementation checks but never substitute for this distribution gate.

## Required golden matrix

| Fixture | Key assertions |
| --- | --- |
| `01-npm-single-package` | npm declaration/lockfile, scoped scripts, expected argv |
| `02-pnpm-single-package` | pnpm declaration and version evidence |
| `03-yarn-single-package` | Yarn declaration/lockfile and script invocation |
| `04-npm-workspace` | Manifest patterns, packages, scoped command paths |
| `05-pnpm-workspace` | Safe YAML package discovery and exclusions |
| `06-typescript-vite` | Config inventory without config evaluation |
| `07-vitest` | Exact test script recognized; no dependency-derived invocation |
| `08-jest` | Declared test preserved without running Jest |
| `09-conflicting-lockfiles` | Unknown manager, unavailable argv, partial, exit `2` |
| `10-missing-package-manager` | Confirmed script facts, unknown invocation, partial |
| `11-invalid-package-json` | Sanitized invalid-manifest diagnostic; generic inventory survives |
| `12-no-test-script` | Informational absence only after complete valid inspection |
| `13-nested-agents` | Root, member, and intermediate-ancestor inventory; no precedence resolution |
| `14-github-actions` | Workflow path inventory without reading/executing pipeline bodies |
| `15-huge-workspace` | Deterministic caps, consistent returned count, nullable unknown total |
| `16-unsupported-python` | Detection-only ecosystem, generic inventory, unsupported, exit `2` |

Each fixture is a frozen input tree plus an independently reviewed expected projection in `test/fixtures.ts`. The test harness materializes the tree in a temporary directory; it never generates expectations from the current profiler. An intentional behavior change requires a reviewed expected-projection diff. This keeps the fixture contract versioned without storing generated machine-specific paths.

Freeze one test build's tool version or replace only `toolVersion` with a documented sentinel during comparison. No profile timestamps are planned. Never normalize away status, diagnostics, evidence, paths, counters, or unknowns to make a test pass.

## Contract edge cases

- Yarn workspaces, both manifest workspace forms, exclusions, recursive patterns, malformed YAML, unsupported pattern syntax, and disagreeing dual declarations.
- Declaration/lockfile contradiction; malformed/unsupported manager declarations; integrity suffix handling; two npm lockfiles; member-local manager disagreement.
- Supported Node constraint versus development pin; malformed pins; no installed runtime probing.
- Script names colliding across scopes; non-string scripts; custom names such as `test:unit`; script bodies containing synthetic sensitive data never appearing in output or logs.
- Conditional and wildcard exports; string/object `bin`; null export mappings; escaped JSON Pointer property names; missing generated targets; external targets.
- Generic empty directory, `.git` directory marker, Git worktree marker file, absent marker, invalid root, unreadable metadata, mixed ecosystems, and malformed metadata in a detection-only repository.
- Duplicate package names, excluded directories, member links, oversized manifests, excessive workspace depth, long strings, per-file/aggregate/output caps.
- Complete profile with warning (`MULTIPLE_LOCKFILES` from the same family), info-only profile, partial profile, unsupported profile, and fatal profile in both default and strict mode.
- Compact JSON, pretty JSON, and text carry equivalent facts; pretty output also respects the byte cap.
- Every evidence reference resolves after truncation; all exact totals and returned counts are consistent; partial scans never emit false absence notices.

## Safety verification

Use instrumented filesystem/process/network boundaries and observable output checks. Freeze input tree hashes before/after execution, ignoring only filesystem-managed read-access timestamps. The profiler must not create, delete, or alter inspected files.

Place synthetic canaries in excluded secret files and in executable scripts/configuration. Assert no reads of forbidden bodies, no canary output, no child-process execution, and no outbound requests. Add a `package.json` symlink to a synthetic forbidden file and a workspace link outside the selected root; neither target may be opened.

Test Windows junction/reparse behavior as well as POSIX symlinks. Exercise permission failures, malformed input, links replaced during access, concurrent file mutation, YAML aliases/custom tags, and oversized inputs. Boundary checks must be tested at file access, not just pattern validation.

A fixture whose script body would fail if run is insufficient proof of no execution. Instrument the actual process boundary and assert zero invocations.

## Determinism and performance

Run fixtures repeatedly with randomized directory enumeration order and changed irrelevant file creation order. Equivalent supported trees must produce byte-identical normalized JSON. Vary locale and path separators; do not vary the contract's fixed sort rules.

Use a synthetic tree with at least 100,000 source/generated files. Measure directory entries inspected, metadata files read, and bytes read. The scanner must follow allowed sentinel/pattern routes rather than read every source file. Confirm bounded behavior when matching workspace directories themselves exceed limits.

Record timing as external benchmark evidence; do not add timing fields to the profile. Set release latency targets only after collecting representative measurements.

## Verification snapshot — 2026-09-07

The historical local Windows/Linux results below were recorded from implementation commit `4e892862d20711e6e5837c10a29edf312c8100a0`. Later upstream commit `d5f5b0ce6b32ba24150a91a663d842e864ea1e6b` completed GitHub Actions run `34096395160` successfully across all nine OS/Node jobs. The current `0.1.2` corrective branch changes only executable packaging/release verification and is verified separately before commit.

| Environment | Evidence | Result |
| --- | --- | --- |
| Windows | Node `v25.2.1`, npm `11.6.2`; `npm run typecheck`; `npm test` | 31/31 tests passed |
| Linux (WSL2 Ubuntu) | Kernel `6.6.87.2-microsoft-standard-WSL2`, Node `v18.19.1`, npm `9.2.0`; `npm --prefix /mnt/c/Users/tno/Documents/GitHub/AI-Agent-Tool-Project-Profile test` | 31/31 tests passed |
| macOS | GitHub Actions run `34096395160`; Node `18.18.0`, `20.x`, `22.x` | All three jobs passed |

The suite includes all 16 golden fixture categories, four schema examples, CLI/strict/fatal behavior, stable ordering, bounded workspaces, metadata-file/source-string/depth/output caps, hostile paths/links, target hash preservation, evidence integrity, and source-level process/network boundary checks. GitHub Actions run `34096395160` covers Windows, macOS, and Linux on Node `18.18.0`, `20.x`, and `22.x`; all nine jobs passed. That historical run still used the direct `node dist/cli.js` smoke, so it proves platform behavior of the implementation but not npm package executable behavior. The `0.1.2` corrective CI adds the packaged-consumer gate.

The workspace-cap test exercises the fixed 10,000-entry limit and the suite exercises the other fixed caps. The tracked `npm run test:benchmark` harness also profiles a synthetic tree containing 100,000 generated files. On Windows in this worktree it returned `status: partial`, `directoryEntries: 10000`, `metadataFiles: 1`, `metadataBytes: 79`, `workspaceReturned: 0`, `workspaceTotal: null`, `workspaceTruncated: true`, and `profilingMs: 90` (file creation and cleanup are outside that timing). This confirms bounded behavior; no release latency target is set from one machine.

## Platform evidence

Run the same applicable contract fixtures on Windows, macOS, and Linux using available CI or equivalent reproducible environments. Record OS, tool build/runtime, fixture revision, commands used, pass/fail counts, and explicit skips. An unavailable platform is unverified, not passed; limited CI coverage cannot establish full cross-platform completion. Platform-specific link tests may differ, but equivalent safe inputs must agree on normalized facts.

## V1 release checklist

- [x] Node/JS/TS first-class detection.
- [x] npm, pnpm, and Yarn declarations/lockfiles and conflict behavior.
- [x] Scoped script inventory and all seven exact command purposes.
- [x] Invocation suppression on unknown or conflicting package-manager evidence.
- [x] npm/pnpm/Yarn workspaces, exclusions, scoped manager handling, and unresolved patterns.
- [x] Runtime constraints and development pins preserve their roles.
- [x] Declared entrypoints without inferred source entrypoints.
- [x] Common configuration, instruction, and CI inventories.
- [x] No instruction precedence or conflict inference.
- [x] Evidence references, confidence states, diagnostics, and coverage are valid.
- [x] Workspace totals, truncation, and all fixed resource budgets are verified.
- [x] Versioned JSON Schema and semantic consistency validation.
- [x] Profiler's own typecheck, build, unit/golden tests, and CLI smoke checks pass on Windows.
- [x] Stable ordering, stable evidence IDs, normalized cross-platform paths.
- [x] CLI stdout/stderr, formatting, strict mode, and exit codes.
- [x] Zero profiler writes and zero target/subprocess execution in the instrumented tests.
- [x] Zero network, LLM/API access, or dependency installation during profiling.
- [x] Secret-sensitive bodies excluded and hostile links cannot escape the root.
- [x] Frozen golden fixture projections pass with reviewed expectations.
- [x] Windows, macOS, and Linux results recorded (GitHub Actions run `34096395160`).
- [x] Independent 100,000-file bounded measurement recorded; release latency target remains deferred.
- [x] Packaged-consumer E2E exists and passes locally against the generated `0.1.2` tarball.
- [ ] Packaged-consumer E2E passes the full GitHub Actions matrix for the corrective release source.
- [ ] Registry-installed `agent-project-profile@0.1.2` binary, `--version`, `--help`, and npm `latest=0.1.2` are verified after publication.

Do not mark the corrective release done from documentation review or direct `dist` execution alone. `0.1.2` completion requires packaged-consumer CI evidence plus registry readback and a clean registry-installed executable smoke; publication and verification remain separate lifecycle facts.

## Implementation verification report

Report implemented scope, architecture boundaries, changed files, runnable CLI examples, JSON Schema location/version, exact checks and results, platform coverage, limitations/deferred scope, and remaining uncertainty. Include API examples only if an API was deliberately included and delivered; CLI/JSON-first does not require an additional public JavaScript API.

Identify the exact commit SHA tested and any uncommitted changes included in verification. If changes are uncommitted, say so; a base commit SHA alone is not the identity of the tested worktree. This reporting requirement does not authorize an automatic commit, push, package publication, or release.

Report package/version/tag/registry state separately using available readback evidence. An unreleased implementation can be development-complete when its required evidence is sufficient and verification has passed. A released package is not automatically a verified implementation.

For any KB update, include the canonical record reference and persisted readback result. Never present documentation checks as runtime tests or report a KB update that was not performed.
