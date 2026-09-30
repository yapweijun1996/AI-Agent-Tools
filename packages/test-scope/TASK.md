# agent-test-scope Task Board

| Field | Value |
|---|---|
| Milestone | V0.1 |
| Status | ACTIVE |
| Current task | TS-068–TS-069 |
| Execution rule | One coherent verified slice at a time |

Status values:

```text
TODO
ACTIVE
BLOCKED
PASS
```

## P0 — Contract and Safety

- [x] **TS-001** Scaffold package and repository structure
- [x] **TS-002** Define request/result TypeScript types
- [x] **TS-003** Add JSON schemas and runtime validation
- [x] **TS-004** Implement canonical root handling
- [x] **TS-005** Implement path containment checks
- [x] **TS-006** Implement ignore/generated/vendor filtering
- [x] **TS-007** Implement secret-file exclusion
- [x] **TS-008** Implement symlink safety
- [x] **TS-009** Add file/byte/result/deadline limits
- [x] **TS-010** Add deterministic discovery ordering

## P1 — Framework Discovery

- [x] **TS-011** Detect Vitest
- [x] **TS-012** Detect Jest
- [x] **TS-013** Detect Node.js native test runner
- [x] **TS-014** Detect test scripts
- [x] **TS-015** Detect typecheck/build scripts
- [x] **TS-016** Discover `*.test.*`
- [x] **TS-017** Discover `*.spec.*`
- [x] **TS-018** Discover `test/`, `tests/`, `__tests__/`

## P1 — Mapping and Evidence

- [x] **TS-019** Implement direct basename mapping
- [x] **TS-020** Implement co-located mapping
- [x] **TS-021** Parse bounded static ESM imports
- [x] **TS-022** Parse bounded static CommonJS require
- [x] **TS-023** Build repository-local static relationship graph
- [x] **TS-024** Normalize evidence model
- [x] **TS-025** Assign confidence by evidence class
- [x] **TS-026** Implement deterministic ranking
- [x] **TS-027** Report ambiguity explicitly

## P1 — Risk and Planning

- [x] **TS-028** Define policy-based risk signals
- [x] **TS-029** Implement low/medium/high/critical/unknown classifier
- [x] **TS-030** Generate minimum verification
- [x] **TS-031** Generate recommended verification
- [x] **TS-032** Generate release verification
- [x] **TS-033** Generate commands with provenance
- [x] **TS-034** Ensure commands are never executed

## P1 — Public Interfaces

- [x] **TS-035** Implement `capabilities`
- [x] **TS-036** Implement `discover`
- [x] **TS-037** Implement `plan`
- [x] **TS-038** Implement `explain`
- [x] **TS-039** Implement shared library API
- [x] **TS-040** Implement CLI
- [x] **TS-041** Add CLI/library parity tests

## P2 — External Evidence

- [ ] **TS-042** Define versioned external evidence adapter contract
- [ ] **TS-043** Add Project Profile adapter
- [ ] **TS-044** Add Symbol Search adapter
- [ ] **TS-045** Add Change Impact adapter

These may move after V0.1 if standalone quality is not yet proven.

## P0 — Verification and Release

- [x] **TS-046** Contract tests
- [x] **TS-047** Framework fixture matrix
- [x] **TS-048** Mapping fixture matrix
- [x] **TS-049** Static import fixtures
- [x] **TS-050** Security/root/symlink fixtures
- [x] **TS-051** Resource-limit and timeout fixtures
- [x] **TS-052** Repeated-output determinism tests
- [x] **TS-053** Coverage gates
- [x] **TS-054** Schema check
- [x] **TS-055** Package tarball smoke
- [x] **TS-056** Capability check
- [x] **TS-057** Benchmark check
- [x] **TS-058** Documentation consistency check
- [x] **TS-059** Add `skills/agent-test-scope/SKILL.md`
- [x] **TS-060** Release-readiness review

## P0 — Release Hardening

- [x] **TS-061** Add npm metadata and automatic prepack/publish gates
- [x] **TS-062** Add GitHub CI verification workflow
- [x] **TS-063** Add tag-triggered npm Trusted Publishing workflow
- [x] **TS-064** Choose and add project license
- [x] **TS-065** Run clean-install verification in authorized CI/GitHub environment
- [x] **TS-066** Commit and verify npm lockfile
- [x] **TS-067** Rerun GitHub CI after the Node 20 coverage workaround
- [x] **TS-068** Add dual ESM/CommonJS package entrypoints
- [x] **TS-069** Run a controlled pilot with the published package and agent Skill
- [x] **TS-070** Publish `0.1.1` through npm Trusted Publishing

## Task Completion Template

For each completed task record:

```text
ID:
Status:
Goal:
Files changed:
Acceptance criteria:
Validation:
Evidence:
Known limitations:
Commit:
```

## TS-001 Completion

ID: TS-001
Status: PASS
Goal: Establish the npm/TypeScript package scaffold and the bounded repository layout for the shared CLI/library architecture.
Files changed: `package.json`, `tsconfig.json`, `.gitignore`, `.npmignore`, `src/`, `schemas/`, `fixtures/`, `test/`, `scripts/`, `skills/`.
Acceptance criteria: Package metadata, Node.js engine requirement, CLI/library entrypoint declarations, TypeScript build configuration, package hygiene, and design-specified directories are present.
Validation: JSON parse, scaffold path assertions, `git diff --check`, repeated sorted enumeration, and `npm pack --dry-run --json` passed. Typecheck and tests were not run because TypeScript and Vitest are not installed; package installation is prohibited.
Evidence: `npm pack --dry-run --json` produced `agent-test-scope@0.1.0` with the explicitly packaged `schemas/` and `skills/` directories.
Known limitations: Runtime APIs, schemas, tests, and verification scripts are intentionally not implemented by TS-001.
Commit: `d1348982aea9b4780f9eb419103346e8438c2a7b`.

A task cannot be marked `PASS` from source inspection alone when runtime verification is applicable.

## TS-060 Release-readiness Review

ID: TS-060
Status: PASS — review complete; release remains NOT READY until the dependency-backed clean-install gate is run in an authorized environment.
Goal: Review V0.1 implementation evidence against the release checklist without weakening the no-install boundary.
Files changed: `TASK.md`, `PROGRESS.md`, `EPIC.md`, `ROADMAP.md`.
Acceptance criteria: Product DoD checks are inventoried, the remaining environment limitation is explicit, and no unverified release claim is made.
Validation: Direct strict TypeScript compilation, 17 native Node tests, coverage, schema, capability, extracted tarball CLI/library smoke, benchmark, documentation, determinism, security/bounds, and CLI/library parity checks passed. The declared `npm run verify` was attempted and stopped before tests because `@types/node` is not installed.
Evidence: Latest local commit contains the V0.1 implementation and verification gates; the working tree contains no product changes after the review.
Known limitations: A clean dependency-backed `npm install`/`npm run verify` was not performed because package installation is outside the task boundary. P2 external adapters remain intentionally deferred.
Commit: latest local commit.

## TS-061–TS-063 Release Hardening

ID: TS-061–TS-063
Status: PASS — technical release configuration and MIT licensing staged; lockfile and CI execution gates remain pending.
Goal: Make packaging fail closed when build/release prerequisites are missing and provide reproducible GitHub CI and tag-based npm publishing workflows.
Files changed: `package.json`, `README.md`, `DESIGN.md`, `.github/workflows/ci.yml`, `.github/workflows/publish.yml`, `scripts/release-check.mjs`.
Acceptance criteria: npm metadata and lifecycle gates are declared; `dist/` is built before packaging; CI uses locked installs; publishing requires a matching version tag, protected environment, OIDC permission, and provenance-enabled npm publish.
Validation: JSON and YAML parsing passed; package dry-run contained `dist`, `skills/agent-test-scope/SKILL.md`, and `LICENSE`; existing 17-test suite, direct typecheck, tarball smoke, benchmark, and documentation checks passed. The release check passes the MIT license/file checks and correctly fails closed on the currently missing lockfile.
Evidence: npm Trusted Publishing workflow is `push`-tag only and has `contents: read` plus `id-token: write`; no long-lived npm token is stored in the repository.
Known limitations: GitHub CI and publish workflow execution require GitHub and npm authorization; the local clean-install gate is now complete.
Commit: `7b63c10`.

## TS-064 Project License

ID: TS-064
Status: PASS — MIT license selected and packaged.
Goal: Add an explicit open-source license to the npm metadata and published artifact.
Files changed: `package.json`, `LICENSE`, `README.md`, `TASK.md`, `PROGRESS.md`, `scripts/release-check.mjs`.
Acceptance criteria: `package.json` declares `MIT`, the standard MIT notice is present in `LICENSE`, the file is included in the npm package, and the release check validates both metadata and file presence.
Validation: JSON parsing, `git diff --check`, and static release-configuration inspection passed; the release check now passes the license gates and stops at the still-missing `package-lock.json` gate.
Evidence: `package.json` declares `license: MIT`, `LICENSE` is included in `files`, and README links to the license.
Known limitations: Copyright holder is currently recorded as `yapweijun1996`; replace it if the legal copyright owner should be a different person or organization. The lockfile and dependency-backed CI execution remain pending.
Commit: `1c287c8` (follow-up npm metadata normalization: `8b8c409`).

## TS-065–TS-066 Clean Install and Lockfile

ID: TS-065–TS-066
Status: PASS — reproducible dependency installation and local release gates verified; TS-067 tracks the separate remote CI rerun.
Goal: Commit a reproducible npm lockfile and prove the package from a clean dependency installation.
Files changed: `package-lock.json`, `package.json`, `src/core/discovery.ts`, `scripts/smoke-pack.mjs`, `TASK.md`, `PROGRESS.md`.
Acceptance criteria: `npm ci` succeeds from the committed lockfile; `npm run verify`, coverage, schema, capability, packaged-artifact smoke, benchmark, docs, release, and audit gates pass; no runtime dependency vulnerabilities remain.
Validation: Local `npm ci --ignore-scripts`, `npm run verify`, `npm run coverage`, `npm run schema:check`, `npm run capability:check`, `npm run smoke:pack`, `npm run benchmark:check`, `npm run docs:check`, `npm run release:check`, `npm audit`, and `npm audit --omit=dev` all passed. Remote CI run `34664358843` passed the full Node 22.x job and Node 20.x Verify, but Node 20.x Coverage failed in Node's built-in source-map coverage reporter after all 17 tests passed.
Evidence: The lockfile resolves only `@types/node`, `typescript`, and `undici-types` for development; runtime dependency tree is empty and both audit modes report zero vulnerabilities. The type fix makes directory discovery compatible with the locked Node declarations without changing runtime behavior. The CI workflow now scopes coverage to Node 22.x while retaining Node 20.x verification because Node.js tracks this coverage regression in the Node 20 line.
Known limitations: npm Trusted Publisher/environment configuration and a real tagged registry publish remain external gates.
Commit: `33feb45` for the lockfile/clean-install slice; `923b051` for the CI workaround.

## TS-067 GitHub CI Rerun

ID: TS-067
Status: PASS — both supported Node jobs are green on the pushed workflow workaround.
Goal: Confirm both supported Node 20.x and Node 22.x CI jobs are green after scoping built-in coverage to Node 22.x.
Files changed: `.github/workflows/ci.yml`, `TASK.md`, `PROGRESS.md`.
Acceptance criteria: Node 20.x Verify and contract checks pass, Node 22.x full verification and coverage pass, and the workflow completes successfully on the pushed commit.
Validation: GitHub Actions run `34666708939` completed successfully. Node 20.x Verify and contract/release checks passed with coverage intentionally skipped; Node 22.x Verify, coverage, and contract/release checks passed.
Known limitations: Built-in coverage remains enforced on Node 22.x because Node 20.x has the known source-map coverage regression. A new package release still requires its own CI run.
Commit: `923b051`.

## TS-068 Dual Package Compatibility

ID: TS-068
Status: PASS — version `0.1.1` is published and registry-verified as a dual ESM/CommonJS package.
Goal: Allow modern ESM consumers and CommonJS consumers to load the same public library API without changing the CLI contract.
Files changed: `package.json`, `package-lock.json`, `tsconfig.cjs.json`, `scripts/build-cjs.mjs`, `scripts/smoke-pack.mjs`, `scripts/release-check.mjs`, `README.md`, `DESIGN.md`.
Acceptance criteria: ESM `import` and CommonJS `require` resolve the public API; both outputs are packaged; the CLI remains executable; typecheck/build/release metadata checks cover both outputs.
Validation: `npm run verify`, coverage, schema, capability, packaged tarball smoke, benchmark, documentation, release, audit, and production publish dry-run checks passed. GitHub Actions runs `34691041706` and `34691118451` passed on Node 20.x and Node 22.x. The tarball smoke loaded ESM directly and resolved the package through `require('agent-test-scope')` from an extracted package. The publish workflow later repeated the full release checks successfully.
Evidence: `package.json` maps `import` to `dist/index.js`, `require` and `main` to `dist/cjs/index.js`, and the package includes the nested CommonJS package marker required by the root ESM package boundary.
Known limitations: Future releases require a new version and matching tag; the package's P2 external evidence adapters remain intentionally deferred.
Commit: `0629f9b`.

## TS-069 Controlled Published-Package Pilot

ID: TS-069
Status: PASS — published `0.1.0` and `0.1.1` passed host-like isolated pilots.
Goal: Exercise published npm artifacts as an AI-agent tool with explicit Skill loading and a read-only target repository.
Files changed: `scripts/pilot-published.mjs`.
Acceptance criteria: The published artifact loads its Skill, executes `capabilities`, `discover`, and `plan` against an isolated fixture, returns bounded results, keeps commands unexecuted, and does not mutate the fixture.
Validation: `npm pack agent-test-scope@0.1.0` and `npm pack agent-test-scope@0.1.1` were extracted into temporary directories and `node scripts/pilot-published.mjs` passed for both. The fixture snapshot before and after each pilot was identical.
Evidence: The pilot reported package version `0.1.1`, `skillLoaded: true`, `targetRepositoryMutated: false`, and successful results for all three operations; the published package was also resolved through both ESM `import` and CommonJS `require`.
Known limitations: This is a controlled host-like pilot, not an integration with a specific LLM or agent runtime because none was supplied. It validates the package/Skill/tool boundary, not model quality or an external host's sandbox policy.
Commit: `0629f9b`.

## TS-070 npm Trusted Publishing Release

ID: TS-070
Status: PASS — `0.1.1` was published from the matching `v0.1.1` tag through GitHub OIDC Trusted Publishing.
Goal: Release the verified dual-module package through the protected tag workflow and confirm the actual registry artifact.
Files changed: npm package registry state, Git tag `v0.1.1`, `TASK.md`, `PROGRESS.md`, `README.md`.
Acceptance criteria: npm Trusted Publisher matches the repository, workflow, and environment; the tag matches `package.json`; the workflow's verification and publish steps pass; npm reports `0.1.1` as `latest`; the registry exposes provenance and the expected package entrypoints.
Validation: GitHub Actions run `34695091122` completed successfully, including Verify, Coverage, package checks, and `npm publish --provenance --access public`. `npm view` reports `latest: 0.1.1`, 88 packaged files, both ESM/CJS outputs, a tarball integrity, and a SLSA provenance attestation. The downloaded registry tarball passed ESM import, CommonJS require, CLI, and agent pilot checks.
Evidence: [npm package version 0.1.1](https://www.npmjs.com/package/agent-test-scope/v/0.1.1), [publish workflow run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34695091122), and tag `v0.1.1`.
Known limitations: This release proves the package and Skill boundary, not model quality or every external agent host's sandbox and execution policy.
Commit: `455c3cc` source commit; tag `v0.1.1`.
