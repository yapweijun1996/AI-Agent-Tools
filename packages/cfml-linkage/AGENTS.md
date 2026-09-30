# Repository guidance for agent-cfml-linkage

> **Status: ACTIVE project guidance.** This file governs future changes in this repository; it does not claim that the planned analyzer is implemented.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Repository-specific documentation and implementation rules |
| Source of truth | This file for local project conventions; higher-priority host instructions still apply |
| Evidence | Initial `HEAD` contained only `.gitattributes`; current local HEAD includes the verified foundation, bounded extractors, an explicit host-unverified Tree-sitter backend, and this guidance |
| Verification | Guidance is exercised by the private M1 foundation, bounded M2 extraction, bounded M3–M8 resolvers/Graph/query/orchestration/robustness boundary, bounded SQL/repository resolver, bounded private-library serialization/wall-time/cross-budget contracts, and 95 focused Node tests; T-053 fake-parser coverage, bounded common-CFML scanner/extractor coverage, T-056 control-flow Facts, T-057 bounded CFScript/SQL fallback coverage, and T-058 bounded configuration-policy semantics pass, while native parser loading and full analyzer verification are absent |
| Limitations | Native parser loading/full Fact coverage, full resolver, public query-command API, public package/release, hosted CI verification, and released-runtime conventions are not yet established; a read-only CI workflow and optional parser dependency declaration exist |

## Project boundary

- Keep the analyzer CFML-first while allowing bounded HTML, JavaScript, CSS, and SQL linkage.
- Keep analysis local, read-only, deterministic, bounded, and non-executing.
- Do not access databases or networks from the analyzer.
- Do not make LLM output, filename similarity, or guessed dynamic behavior authoritative graph evidence.
- Keep generic impact reasoning and test selection in their owning tools.

## Documentation and status discipline

- Treat `GOAL.md`, `DESIGN.md`, `SPEC.md`, `EPIC.md`, `ROADMAP.md`, `TASK.md`, `PROGRESS.md`, and `GOAL_PROMPT.md` as the Core SSOT set.
- Distinguish **proposed**, **implemented**, **verified**, **partial**, **unknown**, and **blocked** in every material claim.
- Do not copy external `agent-cfml-check` status into this repository's implementation status.
- Update the relevant contract, architecture, roadmap/task, test, security, release, and changelog documents when behavior or decisions change.
- A completion claim requires repository source plus reproducible focused verification. A design note or plan is not completion evidence.
- Keep Planned, Implemented, Verified, and Released states independent; missing proof remains Unverified.
- Record blockers with the missing fact or dependency and the action needed to unblock them.
- Update `PROGRESS.md` with evidence, verification gaps, the next task, and the resume point after meaningful work.

## Source changes

- Preserve stable IDs, evidence spans, confidence classes, unresolved records, deterministic ordering, root containment, and explicit completeness semantics.
- Keep parser adapters, fact extraction, indexes, resolvers, graph construction, validation, cache, query, and CLI responsibilities separate; bounded query implementation must consume immutable GraphSnapshot data only.
- Edit generated artifacts through their source/generator once those exist.
- Avoid unrelated refactors, dependency changes, formatting churn, or scope expansion.
- Use English for source code, identifiers, comments, schemas, and technical documentation.

## Verification

Before reporting implementation work as done:

1. inspect the final diff and affected contracts;
2. run the narrowest relevant tests and required owning-runtime checks;
3. run deterministic, negative, safety, and partial-result checks where applicable;
4. report passed, failed, and unrun checks with limitations;
5. keep documentation synchronized with the evidence.
