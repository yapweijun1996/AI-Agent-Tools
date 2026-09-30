# Agent Error Lens Goal

Document status: Draft / Architecture Review
Project: `agent-error-lens`
Lifecycle: MVP / Verification
Last reviewed: 2026-09-13

## Purpose

Agent Error Lens converts bounded, supplied compiler, test, linter, build, and CLI output into small, deterministic, evidence-backed diagnostics for AI coding agents.

The product boundary is deliberately narrow:

> Error Lens owns parsing and evidence normalization. The consuming AI agent owns investigation, reasoning, code changes, and verification.

## Project classification

Agent Error Lens is implemented as one independently installable npm package with two public interfaces:

- a TypeScript/JavaScript library;
- a command-line interface that delegates to the same core library.

It is not a web application, service, database, desktop/mobile application, browser extension, infrastructure project, monorepo, or autonomous AI agent. A private package scaffold, shared entry points, bounded normalization core, approved V0.1 producer adapters, canonical CLI/library output layer, corrected cross-platform verification, and pre-release documentation/workflow now exist; release capability is not yet complete.

## Users and context

Primary users are:

- AI coding agents consuming verification output;
- agent platform engineers integrating deterministic tool results;
- tool developers maintaining producer adapters and downstream contracts.

The primary job is to answer, from supplied evidence only:

- What failed?
- Where was the failure reported?
- Which raw artifact span supports the diagnostic?
- How strong is the parser evidence?
- Was input incomplete, unsupported, or truncated?

## Desired outcomes

1. Reduce raw log volume presented to AI reasoning systems.
2. Preserve exact provenance and raw evidence ranges for every reported diagnostic.
3. Produce byte-stable canonical JSON for identical input and configuration.
4. Keep unsupported or ambiguous information explicit instead of fabricating fields.
5. Prevent supplied logs from causing command execution, network access, repository writes, or instruction following.
6. Give downstream tools reliable file/location candidates for targeted investigation.

## Non-goals

Agent Error Lens will not:

- execute tests, builds, package scripts, installers, or arbitrary commands;
- fetch URLs, load remote schemas, call an LLM, or require an API key;
- modify source code or repositories;
- infer root causes, propose patches, group diagnostics into semantic causes, or declare a project healthy;
- select tests, evaluate patch risk, determine release readiness, or publish releases;
- support every producer or terminal format in V0.1.

## Constraints

- Local-first, stateless, read-only processing.
- No runtime network or subprocess capability.
- One shared parser and result contract for CLI and library use.
- Deterministic work budgets are authoritative; wall-clock timeout is an emergency fuse.
- Input is untrusted data and never an instruction channel.
- V0.1 targets TypeScript, Vitest, ESLint, generic structured diagnostics, and a conservative generic text fallback.
- Jest and Node.js native test specialization are deferred to V0.2 or later.

## Measurable V0.1 success criteria

V0.1 is successful only when all of the following are verified:

1. Golden fixtures for supported producers return the expected diagnostics with zero fabricated locations.
2. Unsupported and insufficient-evidence fixtures return explicit bounded results.
3. Repeated parsing of identical inputs produces byte-identical serialized output.
4. CLI and library results are contract-equivalent.
5. Secret fixtures expose no raw sensitive values, while benign similarly named metrics remain readable.
6. Evidence spans resolve to the original supplied artifact after ANSI normalization.
7. Paths outside an explicit root cannot silently become repository-relative paths.
8. CLI input transport and parser work budgets prevent unbounded bytes, lines, matches, evidence, or diagnostics.
9. Tests demonstrate no network or subprocess operations in the parsing path.
10. A downstream agent-facing test can use a returned location and evidence span to begin targeted investigation.

## Delivery state

| Axis | State | Evidence |
| --- | --- | --- |
| Planned | In progress | Project report, MVP KB specification, and these Core SSOT documents |
| Implemented | Contract, package scaffold, fixture baseline, bounded core, V0.1 producer adapters, canonical output/interfaces, local verification gates, Windows CI-script remediation, bounded UTF-8 CLI input, MIT license decision, cross-platform verification workflow, and release preparation | Validation, normalization, paths, redaction, structured parsing, adapters, stable IDs/dedup/order, serializer, capability/resource checks, shared entry points, CLI, 23-case inventory, `LICENSE`, README, CHANGELOG, ADR, release runbook/workflow, MIT package/contract metadata, repository/publishConfig metadata, cross-platform workflow, and portable test/package commands exist |
| Verified | Implementation, contract/scaffold/core/producer/interface/local-boundary checks, MIT package metadata, pre-release package inspection, and the corrected exact-HEAD cross-platform matrix pass; external release proof remains incomplete | Contract checks, 23-case fixture execution, 29 core/adapter/interface/resource/E2E tests, build, lint, schema validation, repeated-process parity, package allowlist, packed consumer/CLI checks, bounded stdin, structured Unicode/safe-coordinate rejection, strict runtime stream validation, incomplete ANSI sequence fail-closed mapping, provider-token/Authorization-scheme/composite-key/environment-key redaction including JSON-style quoted keys, post-redaction contract bounds, Unicode code-point bounds, same-artifact mixed-producer attribution, Vitest multi-failure/title and ESLint slash-rule attribution, CLI root-injection fail-closed behavior, local Windows-path remediation checks, archived-workspace offline clean-install runs on Node 20.11.0/22/24 Linux containers with strict engine enforcement, 73-file dry-run tarball allowlist/source-map/integrity inspection, and exact-HEAD GitHub Actions run `34731128500` for commit `8a898718cee93c6046f4ec1d59bd7352cd73af8b` across 9 Node/OS jobs pass |
| Released | No | The manifest is private/unreleased at `0.1.0`; no authorized tag, registry package, release, or integrity readback exists |

## Evidence and authority

Current evidence order is:

1. repository code/configuration and verified executable behavior when they exist;
2. passing tests and package/runtime/release readback;
3. explicit user decisions and the 2026-09-13 project report;
4. project KB `agent-error-lens` (`76b1c4bc-b21f-4906-b063-155c5450472b`);
5. company AI-Agent-Tools roadmap KB.

The canonical company ecosystem roadmap remains `queued` as of the 2026-09-07 record, while its standalone tool-status record was synchronized in place on 2026-09-13 to reflect `design_status=draft`, `development_status=complete`, `verification_status=verified`, `release_status=unreleased`, and `evidence_status=verified`. The repository’s local evidence does not authorize changing ecosystem roadmap order or state.
