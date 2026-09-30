# agent-symbol-search Task Plan

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Source of truth | Current repository plus executable evidence |
| Working-tree scope | V1 TypeScript implementation, coverage/CI/release gates, verification artifacts, synchronized documentation, and published npm 0.1.1 and 0.1.2 releases |

## Current repository truth

- `HEAD` is the current V1 implementation line; the historical documentation-only baseline is an ancestor in Git history, not the current repository state. The exact checked-out commit is recorded by `git log --oneline --decorate -5` in the verification evidence.
- The package `agent-symbol-search@0.1.1` is published publicly; registry, fresh-install, tag, and GitHub Release evidence is recorded in `RELEASE.md`.
- The package version is `0.1.2`; it is a published documentation-only patch that adds the npm-distributed agent skill and integration guide, with no runtime or contract changes.
- The `v0.1.2` annotated tag and public GitHub Release point to the green published `main` commit recorded in `RELEASE.md`.
- Supported release Node majors are 22, 24, and 26. Node 20 and the local EOL Node 23 runtime are not release evidence.
- JavaScript, Python, and CFML are proposed future adapters, not current capabilities.
- No task is considered complete from documentation alone; each completed task below has executable evidence.

## Completed documentation baseline

### DOC-001 — Record implementation baseline

**Status:** Complete.

The design, contract, epic, roadmap, task plan, README, documentation standard, and changelog distinguish proposed behavior from shipped/verified behavior and preserve the original documentation changes.

**Evidence:** `git log --oneline --decorate -5` and `git status --short --branch` identify the implementation-bearing checkout; `npm run docs:check` checks current metadata, links, contract markers, runtime claims, and schemas.

## Completed V1 implementation tasks

### CORE-001 — Bootstrap package and toolchain

**Status:** Complete.

**Deliverable:** `package.json`, `package-lock.json`, Node.js 22/24/26 policy, pinned TypeScript/Ajv/discovery dependencies, repository/homepage/bugs/keyword metadata, public npm configuration, compiler configuration, test runner, build output, and CLI/library entrypoints.

**Acceptance evidence:** `npm ci --ignore-scripts --no-audit --no-fund`, `npm run typecheck`, `npm run build`, and `npm run smoke:pack` pass.

**Affected contract:** `SPEC.md` Sections 1–3, 15–16; runtime behavior is recorded in `CHANGELOG.md`.

### RELEASE-001 — Prepare public npm publication

**Status:** Complete.

**Deliverable:** `RELEASE.md`, `prepack`, `release:check`, `prepublishOnly`, package metadata, release recovery rules, and explicit no-provenance/trusted-publishing follow-up.

**Acceptance evidence:** `npm run release:check`, `npm pack --dry-run --json`, `git diff --check`, green hosted CI, registry publication, fresh-install verification, the annotated tag, and GitHub Release are recorded in `RELEASE.md`.

**Affected contract:** `README.md`, `SPEC.md` Section 16, `ROADMAP.md` Phase 6, and `CHANGELOG.md`.

### AGENT-001 — Document npm and skill integration

**Status:** In progress.

**Deliverable:** An npm-distributed `SKILL.md` and README workflow that teach AI coding agents how to install the package, choose operations, pass explicit TypeScript projects, interpret bounded JSON results, and hand locators to source extraction.

**Acceptance evidence:** The skill file has valid frontmatter, README links resolve from a clean checkout, `npm pack --dry-run --json` includes `skills/agent-symbol-search/SKILL.md`, and the documented CLI and library examples pass the existing package smoke and documentation checks.

**Affected contract:** `README.md`, `DOCUMENTATION_STANDARD.md`, `RELEASE.md`, and npm package `files` metadata. Runtime APIs and schemas remain unchanged.

### CONTRACT-001 — Implement versioned schemas

**Status:** Complete.

**Deliverable:** Maintained request/result/capability JSON schemas and Ajv runtime validation for operations, ranges, IDs, enums, diagnostics, truncation, limits, project selection, and result envelopes.

**Acceptance evidence:** `npm run verify` validates all six operations, valid results/capabilities, invalid operation/root/range/limit/enum inputs, and CLI JSON/error behavior.

**Affected contract:** `SPEC.md` Sections 3–6, 11, 14.

### DISCOVERY-001 — Implement bounded read-only discovery

**Status:** Complete.

**Deliverable:** Canonical root validation, explicit symlink containment, deterministic traversal, `.gitignore`, include/exclude precedence, secret exclusions, file/byte/result limits, timeout checks, and parse diagnostics.

**Acceptance evidence:** Security tests cover outside-root paths, external symlinks, directory symlinks, ignored and secret files, outside-root project-file sanitization/partial status, no-write/no-execution behavior, and explicit truncation reasons.

**Affected contract:** `SPEC.md` Sections 12–13.

### TS-001 — Implement TypeScript project selection and symbols

**Status:** Complete.

**Deliverable:** Deterministic one-config/multiple-config/no-config project selection, fixed fallback options, selected-config filtering, path aliases, external-file exclusion, project-reference reporting, normalized declaration kinds, ranges, qualified names, exported state, and versioned IDs.

**Acceptance evidence:** TypeScript tests cover aliases, project references, overloads, default/anonymous exports, declaration merging, namespaces, exported variable/binding declarations, class-expression owners, stable POSIX paths, and UTF-16 range positions.

**Affected contract:** `SPEC.md` Sections 3, 4, 7, 8.

### TS-002 — Implement definitions and references

**Status:** Complete.

**Deliverable:** Compiler/checker-backed definitions, import aliases, source-position resolution, overload/ambiguity reporting, and semantic reference traversal that excludes comments and string literals.

**Acceptance evidence:** Golden tests cover alias and method references, context-free ambiguity, source positions, no-match diagnostics, and false positives.

**Affected contract:** `SPEC.md` Sections 5, 6, 10.

### TS-003 — Implement explicit implementations

**Status:** Complete.

**Deliverable:** Explicit `implements` and `extends` relationships for class declarations and variable-bound class expressions, plus supported abstract-method overrides, with no structural, dynamic, mixin, or runtime-patching claims.

**Acceptance evidence:** Fixtures distinguish implementation from inheritance for declarations and class expressions, cover exported-state regressions, and return partial semantic-unavailable evidence for unsupported structural cases.

**Affected contract:** `SPEC.md` Sections 2, 5, 11.

### API-001 — Implement shared library and CLI

**Status:** Complete.

**Deliverable:** `getCapabilities`, `searchSymbols`, `findDefinition`, `findReferences`, `findImplementations`, `listSymbols`, and `execute` over one core; separate CLI position flags; JSON stdout, stderr diagnostics, and exit codes.

**Acceptance evidence:** CLI/library parity, deterministic repeated output, stdout/stderr separation, complete/partial/error exits, and packaged API tests pass.

**Affected contract:** `SPEC.md` Sections 2, 3, 6, 9, 15.

### VERIFY-001 — Add golden, security, and package tests

**Status:** Complete.

**Deliverable:** TypeScript fixture matrix, malformed/config/ignored/symlink/limit fixtures, stable ordering checks, read-only checks, capability checks, and installed-package smoke coverage.

**Acceptance evidence:** `npm run verify`, `npm run capability:check`, and `npm run smoke:pack` pass; the latter runs outside the source checkout.

**Affected contract:** All implemented `SPEC.md` sections.

### BENCH-001 — Establish performance baseline

**Status:** Complete for baseline measurement.

**Deliverable:** Reproducible generated small, medium, and large fixtures with separate cold and warm in-memory measurements for files, bytes, time, memory, matches, and truncation.

**Acceptance evidence:** `BENCHMARK.md` is checked by `npm run benchmark:check`. It records evidence without claiming an unmeasured latency threshold.

### COVERAGE-001 — Establish stable native coverage gates

**Status:** Complete.

**Deliverable:** A serial native Node coverage script that rebuilds product/test artifacts, excludes tests/fixtures/scripts from the denominator, enforces lines ≥85%, functions ≥80%, and branches ≥75%, and uses a 30-second test `EngineOptions` budget while retaining explicit timeout tests.

**Acceptance evidence:** `npm run coverage` passes and reports only `dist-test/src` product output; the five-second production default is contract-tested.

### CI-001 — Verify supported runtimes and platforms

**Status:** Complete.

**Deliverable:** `.github/workflows/ci.yml` with least-privilege read-only contents permission, Ubuntu Node 22/24/26 quality, Node 24 package smoke on Ubuntu/macOS/Windows, and Ubuntu/Node 24 benchmark verification.

**Acceptance evidence:** Workflow commands are reproducible locally through `npm run release:check`; hosted PR/main execution is required before publication.

### REVIEW-001 — Close the six code-review findings

**Status:** Complete.

**Deliverable:** Guard compiler/configuration reads and dependency budgets; normalize instance-method symbols; scope constructor keyword resolution; honor nested ignore rules; support native TypeScript module/declaration extensions; reject conflicting helper operations through narrow types and runtime validation.

**Acceptance evidence:** `test/review-regressions.test.ts` covers all six findings and additional configuration/read-failure cases. The original seven regression groups failed before the fixes. On Node 24.20.0, `npm ci` and `npm run release:check` pass with 43/43 tests and coverage of 92.91% lines, 84.85% branches, and 91.93% functions. Installed-package smoke checks CommonJS, ESM, `.mts`, method references, and helper rejection; benchmark fixtures have no `TIMEOUT`. Hosted PR and main CI pass for the merged release line.

**CI follow-up:** PR #2 exposed Windows 8.3 short-path aliases in the installed TypeScript location. The compiler host now supplies canonical standard-library paths instead of widening the read policy. A library-location alias regression fails before the fix and passes after it; user-source symlink exclusions remain covered. Temporary fixture tracing was removed after confirming the cause.

## Verification status

The full V1 and release verification commands are:

```bash
npm ci
npm run release:check
npm audit --audit-level=high
npm pack --dry-run --json
git diff --check
git status --short
```

`release:check` runs static safety checks, typecheck, build, tests, native coverage, packaged smoke, capability, benchmark, and documentation checks. `schema:check` is also run by CI. No network, deployment, npm publication, tag, or push is performed by these project commands except dependency installation needed for setup and the package smoke test.

## Release completion

No actionable repository implementation or 0.1.2 publication task remains blocked. The published registry versions, fresh installs, annotated tags, and GitHub Releases are complete. If a future publish command has an uncertain result, query the registry before retrying. Future language adapters and ecosystem integration remain proposed in `ROADMAP.md`.
