# Tasks — MVP Execution Plan

## Mission

Finish the remaining MVP work in `docs/ROADMAP.md` without changing the product boundary.
PIC must continue autonomously through every unchecked item until the **MVP Completion Gate** is fully satisfied or a genuine external blocker makes further safe progress impossible.

**Do not stop after one task, one commit, or one Roadmap phase.** After every completed task, re-read this file, find the next unchecked task, and continue.

## Current Verified Baseline

Already completed and must remain working:

- [x] Package skeleton and `aptree` CLI.
- [x] Deterministic scanner and graph envelope.
- [x] Safety checks and tests.
- [x] Public project documentation.
- [x] Read-only Git `changed` adapter.
- [x] Local JS/TS dependency edge parser.

Product constraints from `AGENTS.md`, `SPEC.md`, and `DESIGN.md`:

- Local-first, deterministic, serverless, read-only by default.
- No server, database, cloud/API key/LLM dependency, telemetry, or required network call.
- Never execute commands/scripts from the scanned target project.
- Preserve bounded scanning and root-relative paths.
- Preserve stable JSON contracts; document necessary contract changes before completion.
- Existing commands (`context`, `impact`, `changed`, `tests-for`, `evidence`, `goals`, `progress`, `path-to-done`) must keep working.
- Existing Git adapter stays read-only and must not invoke Git as product behavior.

## PIC Execution Rules

1. Read `AGENTS.md`, `docs/SPEC.md`, `docs/DESIGN.md`, `docs/ROADMAP.md`, `docs/ACCEPTANCE.md`, then relevant source/tests before implementation.
2. Preserve all existing user changes. Do not reset, discard, overwrite, or clean unrelated work.
3. Work only inside this repository.
4. Use the smallest coherent design; avoid speculative framework-building.
5. Reuse existing graph/evidence conventions before inventing new node/edge shapes.
6. New detection must be static/read-only. Reading files is allowed; running target package-manager/test commands is not.
7. Output must be deterministic for the same filesystem state.
8. Add tests with each behavior change. A feature without tests is incomplete.
9. Run focused tests during development, then full validation at the completion gate.
10. Check a task only after its acceptance criteria are verified.
11. Local commits are allowed after coherent verified milestones. Do **not** push, open PRs, merge, publish npm, release, or deploy.
12. For routine non-destructive uncertainty, inspect code/docs/tests and choose the option most consistent with the current architecture instead of stopping for approval.
13. If a true owner decision is required, record a `BLOCKED` note, continue all independent safe work, and leave owner-required work until last.
14. Before stopping, re-read this file. If any safe unchecked task remains, continue.

---

# Roadmap 4 — Package / Test Evidence Adapters

## R4.1 — Evidence adapter contract

Goal: extend the existing evidence plane without creating a second project-state system.

- [x] Inspect scanner/query output and identify existing node, edge, provenance, ID, freshness, ordering, and path conventions.
- [x] Define a minimal internal adapter contract for static evidence discovery; implement only what Roadmap 4 needs.
- [x] Keep adapter results bounded, deterministic, root-relative where paths exist, and provenance-backed.
- [x] Malformed/unsupported metadata must not crash a full scan; handle it deterministically.

Acceptance:

- Adapter output fits the current graph/envelope rather than adding a competing top-level state model.
- Identical repository state produces stable relevant output.
- No target command execution or required network dependency is introduced.

## R4.2 — Package-manager evidence

Goal: allow agents to understand package metadata by reading repository files only.

Static evidence to consider when present: `package.json`, npm lockfile, pnpm lock/workspace files, Yarn lock/workspace files, Bun lock metadata, `packageManager`, and `engines`.

- [x] Detect package-manager signals from explicit/static evidence. Do not silently guess when signals conflict or are absent.
- [x] Extract useful `package.json` metadata: name/version, module type, engines, workspaces, scripts, dependencies/devDependencies/peerDependencies/optionalDependencies when present.
- [x] Treat script text strictly as inert data; never execute it.
- [x] Record lockfile/workspace evidence and provenance without over-parsing beyond MVP value.
- [x] Define deterministic behavior for conflicting signals, multiple lockfiles, malformed JSON, and missing optional files.
- [x] Do not ingest secrets/environment files into package evidence.

Acceptance:

- An agent can answer: package manager signals, scripts, dependency declarations, runtime constraints, and workspace signals.
- Conflicts are surfaced as evidence instead of hidden behind an unjustified winner.
- Product code invokes no target package-manager executable.

## R4.3 — Test-framework and test-file evidence

Goal: allow agents to find likely tests and understand why they are tests using static evidence only.

- [x] Detect test files with deterministic filename/directory conventions compatible with current `tests-for` behavior.
- [x] Detect framework signals from package declarations, scripts, config filenames, imports, and other reliable static evidence.
- [x] Support this repository's Node built-in test setup first; add common JS/TS framework signals only if small and deterministic.
- [x] Distinguish direct evidence from heuristic filename relationships when the current graph model supports it.
- [x] Never execute test runners from scanned target repositories.
- [x] Do not claim a framework when evidence is ambiguous; expose the supporting signals instead.

Acceptance:

- `tests-for` and/or evidence output can explain which discovered tests relate to a source file through existing deterministic relationships.
- Existing filename-linked/local-import test behavior remains compatible.
- Framework identification is evidence-backed.

## R4.4 — Integrate evidence into public queries

- [x] Integrate package/test evidence into existing `context`/`evidence` output contracts.
- [x] Ensure `tests-for` benefits from new test evidence without breaking current semantics.
- [x] Ensure `impact` still follows existing reverse dependency/test relationships correctly.
- [x] Preserve bounded results and deterministic ordering.
- [x] Unsupported/non-Node repositories must still get a safe generic scan rather than fail.

Acceptance:

- Existing CLI commands remain valid JSON and backward-compatible wherever practical.
- No server/database/state store is needed to consume the evidence.

## R4.5 — Roadmap 4 tests

Add focused coverage for:

- [x] Basic npm/package.json evidence.
- [x] Scripts extracted as inert data.
- [x] Dependency declaration extraction.
- [x] Explicit package-manager signal.
- [x] Lockfile evidence.
- [x] Conflicting package-manager signals.
- [x] Malformed package metadata handled safely.
- [x] Node built-in test evidence.
- [x] At least one common JS/TS framework static signal if implemented.
- [x] Filename/import-linked `tests-for` behavior remains correct.
- [x] Repeated scans produce stable relevant output.
- [x] Safety test proves no target script/package-manager/test command is executed.

Roadmap 4 verification:

- [x] `npm test` passes.
- [x] `npm run smoke` passes and still emits valid `graph` + `meta`.
- [x] `git diff --check` passes.
- [x] Mark Roadmap 4 complete in `docs/ROADMAP.md` only after all R4 acceptance items pass.

---

# Roadmap 5 — JSON Schema / Compatibility Contract

## R5.1 — Identify stable public JSON surfaces

- [x] Inventory JSON envelopes emitted by public CLI/library/query paths.
- [x] Separate stable required fields from optional/command-specific fields.
- [x] Identify existing version/provenance/freshness fields and current compatibility behavior.
- [x] Choose the smallest schema organization that accurately models the existing MVP output.

Acceptance:

- Schema design is derived from real tested output, not a future imagined format.
- Command-specific optional data is not incorrectly made universally required.

## R5.2 — Publish versioned JSON Schema

- [x] Add a clear schema location included in the npm package.
- [x] Use a recognized JSON Schema draft and declare it in the schema.
- [x] Give the public schema an explicit Project Tree schema/version identity.
- [x] Model stable envelope, graph nodes/edges, metadata/provenance, and command-specific optional structures deeply enough to catch real compatibility regressions.
- [x] Keep schema hand-maintainable; do not generate large opaque artifacts.
- [x] Update `package.json` `files` only if required so package consumers receive the schema.

Acceptance:

- A consumer can locate the schema from package/docs without guessing.
- Packed npm artifact contains the schema.
- Schema introduces no runtime network requirement.

## R5.3 — Compatibility/version policy

Document:

- [x] What counts as backward-compatible, including additive optional fields and ignorable new evidence/node kinds where applicable.
- [x] What counts as breaking, including required-field removal/rename, type/meaning changes, and stable identity/path semantic changes.
- [x] How schema versions change for compatible vs breaking evolution.
- [x] Relationship between npm/package version and schema version.
- [x] How agents/consumers should handle unknown optional fields/kinds.
- [x] Minimum guarantees during the `0.x` package phase without over-promising long-term stability.

Acceptance:

- A future contributor can use the policy to determine whether a proposed change is compatible or requires version/compatibility work.

## R5.4 — Schema validation and compatibility tests

- [x] Add representative fixtures/generated outputs for each stable public envelope/command shape requiring coverage.
- [x] Validate representative current output against the published schema.
- [x] Add negative tests proving important malformed/incompatible shapes are rejected.
- [x] Add compatibility fixtures for the earliest schema shape this MVP explicitly promises to support.
- [x] Add tests proving promised additive/optional evolution remains accepted.
- [x] Prefer no runtime dependency for validation. If a dev-only validator is necessary, justify it and keep runtime network-free.

Acceptance:

- Contract regression causes tests to fail.
- Tests validate the actual schema shipped in the package, not a duplicate hidden schema.

## R5.5 — Package/consumer verification

- [x] Run `npm test`.
- [x] Run `npm run smoke`.
- [x] Run `npm pack --dry-run`; confirm expected source/docs/schema files are included and no unwanted large/sensitive files appear.
- [x] When feasible, pack locally and install the tarball into a temporary directory with lifecycle scripts disabled where appropriate.
- [x] Run installed `aptree` against a safe fixture/repository and confirm valid JSON output.
- [x] Confirm no runtime path requires internet access.
- [x] Run `git diff --check`.

## R5.6 — Documentation sync

After code/tests are verified:

- [x] Update `docs/SPEC.md` with package/test evidence and JSON schema behavior.
- [x] Update `docs/DESIGN.md` only for architecture decisions that actually changed.
- [x] Update `docs/ACCEPTANCE.md` with verified MVP criteria/evidence.
- [x] Update `README.md` only where needed for evidence/schema discoverability.
- [x] Update `docs/PROGRESS.md` with factual completed work and verification evidence.
- [x] Mark Roadmap 5 complete in `docs/ROADMAP.md` only after verification passes.
- [x] Do not claim push/publish/release/deployment actions that were not performed.

---

# Independent Self-Review

Before declaring MVP complete, perform one explicit reviewer pass:

- [x] Architecture: no competing state system, unnecessary abstraction, or hidden coupling.
- [x] Agent usability: an AI coding agent can discover package/test/schema evidence without reading implementation internals.
- [x] Determinism: ordering, IDs, paths, and evidence stay stable for identical inputs.
- [x] Safety/security: no target command execution, secret ingestion, telemetry, required network, path escape, or repository mutation introduced.
- [x] Compatibility: existing commands/contracts remain usable and schema tests protect promised behavior.
- [x] Maintainability: adapter/schema code is understandable and tests explain intended behavior.
- [x] Packaging: npm artifact contains required schema/docs and no accidental junk.

If self-review finds a defect, fix it and rerun relevant checks before marking that item complete.

---

# MVP Completion Gate — ALL REQUIRED

PIC may declare the MVP finished only when every item below is true:

- [x] Every Roadmap 4 task above is checked and verified.
- [x] Every Roadmap 5 task above is checked and verified.
- [x] `docs/ROADMAP.md` shows Roadmap 1–5 complete based on evidence.
- [x] `npm test` passes with zero failures.
- [x] `npm run smoke` passes.
- [x] npm package dry-run/local packed-package verification passes.
- [x] Public JSON schema exists, is packaged, and representative real output validates against it.
- [x] Compatibility tests pass.
- [x] Independent self-review has no unresolved P0/P1 issue.
- [x] `git diff --check` passes.
- [x] `docs/PROGRESS.md`, `docs/SPEC.md`, `docs/ACCEPTANCE.md`, and materially affected docs match verified reality.
- [x] No push, PR, merge, npm publish, release, deployment, or unrelated mutation was performed.
- [x] Working tree is understood: all changes are intentional and attributable to this MVP work.

## Final PIC Handoff Required

When all gates pass, report:

1. Roadmap 4 implementation summary.
2. Roadmap 5 implementation summary.
3. Key files changed.
4. Exact test/smoke/package/schema verification results where available.
5. Compatibility/version policy summary.
6. Local commit IDs created.
7. Remaining non-MVP follow-ups, clearly separated from MVP blockers.
8. State `MVP COMPLETE` only if every gate above is satisfied.

If any gate is not satisfied, report `MVP NOT COMPLETE`, identify the exact unchecked blocker, then continue all remaining safe work instead of stopping early.
