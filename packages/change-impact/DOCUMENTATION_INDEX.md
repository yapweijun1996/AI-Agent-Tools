# Documentation Index

Last reconciled: 2026-09-07. Current implementation tree: `7cf02d0`.
Latest Windows short-path boundary fix: `0b72a83`.
Latest hosted matrix: [run 34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471).
Latest package/verification hardening: `273a344`.
Latest installed artifact output-limit smoke: `3472b13`.
Latest release metadata validation: `4d770e0`.
Latest API limit validation: `74563b1`.
Latest local release evidence: `17020ad`.
Latest lifecycle-safe CI install policy: `f64fbb6`.
Latest CLI/revision input hardening: `ab27679`.
Previous documentation/clean-install evidence reconciliation: `1a57175`.
Latest required API request validation: `b1f6477`.
Latest TypeScript compiler hygiene: `473b4da`.
Latest provider observation bounding: `32fd01a`.
Latest diagnostic collection bounding: `a0f148b`.
Latest bounded source reads: `149e0fa`.
Latest validated real-path reads: `dd212e4`.
Latest bounded revision blob reads: `2f3c482`.
Latest snapshot diagnostic identity: `0c8a130`.
Latest internal symlink coverage: `f9f904b`.
Latest provider resolution read boundary: `ba0538a`.
Latest CLI formatted-output bound: `c6296e4`.
Latest cross-platform snapshot path handling: `6b1c9b5`.
Latest platform-aware capture test harness: `261c47a`.
Latest Git clean-filter isolation: `c32634e`.

## Reading order and ownership

| Document | Owns | Does not establish |
| --- | --- | --- |
| [README.md](README.md) | Product identity, current availability, entry points, quick usage | Runtime support without evidence |
| [AGENT_GUIDE.md](AGENT_GUIDE.md) | GitHub/npm installation, Codex/Claude Code skill setup, agent workflow, and result interpretation | Claims beyond the executable contract |
| [TASK.md](TASK.md) | Current status, completed/pending work, blockers, next steps | A planned task as implemented behavior |
| [SPEC.md](SPEC.md) | Implemented draft behavior, requirements, and CLI/API/result contracts frozen across 0.1.x | Registry publication or future contract changes |
| [DESIGN.md](DESIGN.md) | Implemented architecture, ownership, decisions, review dispositions | Features outside the advertised provider boundary |
| [EPIC.md](EPIC.md) | Work-package deliverables, dependencies, acceptance scope | Independent duplicate task status |
| [ROADMAP.md](ROADMAP.md) | Milestone/release order and future priorities | Published releases or delivery dates |
| [VALIDATION.md](VALIDATION.md) | Fixture plan, evidence, verification state, release gates | A pass for an unexecuted test or remote workflow |
| [CHANGELOG.md](CHANGELOG.md) | `0.1.1` package change record and `0.1.0` history | Registry publication, tag, or provenance evidence |
| [`skills/agent-change-impact/SKILL.md`](skills/agent-change-impact/SKILL.md) | Portable Agent Skills instructions for Codex and Claude Code | Host-specific configuration outside the documented copy paths |
| [`spike/PROJECT_HOST_FINDINGS.md`](spike/PROJECT_HOST_FINDINGS.md) | Local project-host feasibility observations | Cross-platform or performance guarantees |
| [`spike/PERFORMANCE_FINDINGS.md`](spike/PERFORMANCE_FINDINGS.md) | Reproducible bounded fan-out and diagnostic stress observations | A release performance SLA |

For implementation work, read TASK, SPEC, DESIGN, then the relevant epic and
validation rows. For product orientation, begin with README.

## Source-of-truth rules

Verified source code, executable contracts, and scoped runtime evidence establish
what exists. Git history/tree/status establish repository state. The supplied
proposal and review establish planning context; they do not prove runtime
behavior. External references support technical decisions, not compatibility
claims for this package.

The current source of truth is the TypeScript implementation under `src/`, the
fixture-backed tests under `test/`, `package.json`/`package-lock.json`, the
draft schema under `schemas/`, and the packaged agent guide/skill files. The
changelog records release contents; [VALIDATION.md](VALIDATION.md) establishes
the published npm artifact and its verification evidence.
The core implementation commits are `b57321d`,
`0cdd08f`, `13e9f14`, `6b43c58`, `ca5453e`, `0169580`, `5d29c4c`,
`954f6dc`, `bbfeb58`, `940effd`, `1753c22`, `e55647f`, `e51113d`, `89f5286`, `db809f4`, `143e9f7`, `d385ff5`, `798594c`, `83f398d`, `661cb4d`, and `8bb3651`. Delivery hardening then added `1e61baf`, `0644fda`, `343750a`, `0902d49`, `2a68521`, `1c195af`, `b248f10`, `48f102e`, `273a344`, `c4dca94`, `74563b1`, `2262658`, `13990ce`, `4d770e0`, `17020ad`, `850f106`, `beb003e`, `f64fbb6`, `ab27679`, `b1f6477`, `473b4da`, `32fd01a`, `a0f148b`, `149e0fa`, `dd212e4`, `2f3c482`, `0c8a130`, `f8a580e`, `f9f904b`, `ba0538a`, `c6296e4`, `55a10bb`, and `3472b13`; documentation and evidence reconciliation followed in `3a7bc99`, `079acbd`, `1a57175`, `ad028b6`, and `f032986`, and `c32634e`. Runtime-floor, audit, release metadata, stable-capture, API-validation, lifecycle-safe installation, CLI/revision-input, required-field-validation, TypeScript-unused-code-check, provider-observation-bound, diagnostic-bound, pre-decode source-bound, real-path isolation, revision-blob-bound, snapshot-diagnostic-identity, internal-symlink-source, repository-root-symlink-boundary, provider-resolution-read-boundary, final CLI-formatting-byte-bound, test-fixture-cleanup, installed-artifact-formatting-smoke, Windows path-semantics, Windows short-path identity, and line-ending-normalization evidence are recorded in the current task ledger. Hosted run 34123415471 passes all six Node 22/24 Ubuntu/macOS/Windows jobs. The published package is `agent-change-impact@0.1.1`; registry publication, clean-install, integrity, and signature checks are recorded in `VALIDATION.md`.
TASK owns status; SPEC owns requirements and observable contracts; DESIGN owns
architecture; VALIDATION owns evidence. Links connect these responsibilities
instead of duplicating competing status tables.

Use `complete` only for evidence-backed static scope. `analysis.status: partial`
is a usable result with an explicit limitation; top-level `ok: true` does not
mean runtime safety or workspace-wide coverage. Do not write released, published,
cross-platform verified, or schema frozen without the corresponding evidence.
The v0.1 runtime floor is Node.js 22+ by deliberate decision; Node 18/20 are
not supported without new compatibility evidence.
The documentation validator checks historical commit references, so CI must use
a full Git checkout when running `npm run docs:check`.
Never put credentials or raw secret-bearing logs into documentation.

## Technical references

These primary references informed the implementation and design; they do not
replace local tests:

| Source | Relevant decision |
| --- | --- |
| [TypeScript Language Service API](https://github.com/microsoft/TypeScript-wiki/blob/main/Using-the-Language-Service-API.md) | Host owns input context; a service instance is project-specific |
| [TypeScript project references](https://www.typescriptlang.org/docs/handbook/project-references.html) | Referenced projects and source redirects need explicit handling |
| [TypeScript module resolution](https://www.typescriptlang.org/docs/handbook/modules/reference.html) | Configuration, package metadata, declarations, and links affect resolution |
| [Git diff](https://git-scm.com/docs/git-diff) | Endpoint versus merge-base semantics, external diff/textconv behavior, and safe tree/index comparisons |
| [CodeQL JavaScript call graph](https://codeql.github.com/docs/codeql-language-guides/codeql-library-for-javascript/#call-graph) | Static call analysis can be incomplete or imprecise |
| [Node.js releases](https://nodejs.org/en/about/previous-releases) | Node 22/24 are maintained targets; local verification uses Node 23.10.0 on macOS and Node 22/24 Linux containers |
| [SCIP repository](https://github.com/scip-code/scip) | Future index-provider direction only |
| [Agent Code Slice](https://github.com/yapweijun1996/AI-Agent-Tools/tree/main/packages/code-slice) | Complementary location-to-code workflow; integration remains unverified |
