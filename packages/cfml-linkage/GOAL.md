# Goal: agent-cfml-linkage

> **Status: PROPOSED / M2–M9 IN PROGRESS.** This goal describes the intended product outcome; the M1 safety foundation, configured ignore-glob/hidden-file discovery policies, bounded M2 parser/scanner/Fact slices including selected control-flow and CFScript/SQL fallback forms, bounded M3 path/Graph slices, bounded M4 CFC, M5 scope/web-flow, M6 dynamic/generated/SQL/repository linkage, bounded M7 graph queries, bounded M8 robustness/adversarial safe-failure/evidence/edge-budget/wall-time enforcement, and bounded M9 checks/package smoke/Node host compatibility/release-parity audit are implemented/verified. T-039 is verified for bounded cross-budget regression coverage; T-037/T-038 are implemented for their bounded private-library output/time scopes; full linkage resolution is not implemented.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Project type | Planned NPM/library + CLI + AI-agent evidence provider; CFML-first static analyzer |
| Lifecycle | Prototype / safe-foundation implementation |
| Source of truth | This repository's Core SSOT documents for intent; Git, tests, runtime checks, and release artifacts for state |
| Evidence | Initial `main` commit `1b29c0b` contained only `.gitattributes`; subsequent local commits add the verified foundation, bounded extractors, and `docs/audits/prompt-to-artifact-v0.1.json` |
| Verification | M1 foundation, configured ignore-glob/hidden-file/generated-directory discovery policies and mapping/plugin/worker configuration semantics, bounded M2 CFML/web parser/scanner/Fact extraction including common switch/case control-flow evidence, bounded M3 resolution/Graph IR, bounded M4 CFC resolution, bounded M5 scope/web-flow resolution, bounded M6 dynamic/generated/SQL/repository linkage, bounded M7 graph queries/orchestration, bounded M8 robustness/edge-budget/wall-time evidence, and 95 focused Node tests pass locally; a least-privilege CI workflow is defined but has no hosted run; full linkage/runtime/package-release verification is absent |
| Limitations | Graph persistence, full parser/resolver, full runtime matrix, deployment model, and release compatibility are not established; the bounded analysis/library entry and query APIs remain private, and the prompt-to-artifact audit records the overall goal as not achieved until the gaps are closed |

## Purpose

Enable a coding agent to inspect a CFML-first web project through a small, deterministic, evidence-backed linkage graph instead of loading or executing the whole application.

## Users and problem

Primary users are coding agents and maintainers of legacy or mixed CFML web applications. Their problem is that relationships are distributed across CFM/CFML pages, CFCs, Application files, includes, HTML forms, JavaScript requests, CSS assets, SQL, and shared scopes. Filename guesses and single-file checks are insufficient and can create unsafe false links.

## Desired outcome

Produce a versioned local library/CLI that accepts an explicitly authorized project root and returns a queryable Graph IR/JSON document. It should answer related-file, caller/callee, include, route, scope-flow, table, unresolved, and evidence-explanation questions while preserving ambiguity and incomplete coverage.

## Constraints

- Read-only, local-first, deterministic, bounded, and non-executing.
- No CFML, JavaScript, SQL, shell, browser, database, or application execution.
- No network access, guessed dynamic targets, filename-authority, or LLM-authoritative edges.
- Enforce root containment, bounded evidence, explicit confidence, unresolved records, and `complete=false` when coverage is incomplete.
- Keep generic impact reasoning and test selection in separate owning tools.

## Scope and non-goals

Scope is CFML/CFC linkage first, followed by bounded HTML forms/redirects, JavaScript AJAX/fetch, CSS imports/assets, visible SQL, Application governance, shared scope, conditions, and query operations.

Non-goals are runtime tracing, browser automation, business/security correctness proofs, unconstrained dynamic resolution, and replacement of `agent-change-impact` or `agent-test-scope`.

## Measurable success criteria

The goal is achieved only when a release has:

1. reviewed and versioned Graph IR, Fact IR, CLI/library, diagnostics, and configuration contracts;
2. deterministic golden output for the priority CFML/CFC, web-flow, scope, SQL, CSS, ambiguity, dynamic, malformed, and safety fixtures;
3. stable IDs/order across repeat runs and explicit partial/unresolved behavior;
4. verified root containment, no-execution, no-network/database, resource-limit, cache, and bounded-output behavior;
5. package/library/CLI artifact smoke evidence tied to the exact source commit;
6. compatibility claims limited to tested engines/platforms.

## State model

The project must track **Planned → Implemented → Verified → Released** independently. M0/M1, configured ignore-glob/hidden-file discovery policies, bounded M2 parser/scanner/Fact extraction, bounded M3–M6 linkage, bounded M7 queries/orchestration, bounded M8 robustness/adversarial safe-failure/edge-budget/wall-time evidence, and bounded M9 checks/package smoke/Node host compatibility/release-parity audit and the T-047 CI workflow and T-048–T-051 library/discovery policies are implemented; T-039 is verified for the bounded cross-budget boundary; T-037/T-038 are verified for bounded private-library serialization/wall-time behavior; full parser coverage, graph persistence, public package, and release remain incomplete/unreleased; bounded query-command integration is verified.
