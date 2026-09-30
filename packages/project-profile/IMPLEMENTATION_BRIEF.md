# agent-project-profile V1 Implementation Brief

Status: implementation handoff updated for the owner-authorized V1 build. This document does not authorize committing, pushing, publication, or automatic KB roadmap promotion by its presence.

## Activation and source of truth

Use this handoff when the owner starts an implementation task. First read Company KB `AI Agent Tools`, KBID `ai-agent-tools`, including the Canonical Ecosystem SSOT, Project Profile approved V1 boundary, canonical tool status, tool-status schema, and maintenance rule/skill. Exact item locators are in [DECISIONS.md](DECISIONS.md).

The last readback places Project Profile after standalone `agent-change-impact`. The current owner instruction explicitly authorizes implementation despite that sequencing note; record the exception and keep the ecosystem roadmap unchanged unless the owner separately changes it. It is sequencing, not a requirement to call or depend on Change Impact at runtime. Do not substitute chat/Brain memory or historic Codeloom completion for current standalone evidence.

Inspect existing repository instructions, working-tree changes, and current `agent-code-slice` conventions where directly useful. Reuse verified CLI/JSON, error, path, packaging, and test patterns without importing unrelated AST architecture or creating a premature shared core.

## Goal and ownership

Build the next standalone repository profiler that answers:

> How does this repository declare that it should be operated?

Deliver a standalone npm tool, independently versioned/tested/released, with CLI and JSON as its primary interface. Keep registry/standards/compatibility/roadmap ownership in the ecosystem hub, project knowledge/status in Company KB, and reasoning/orchestration in Codex/Claude/AGRUN. No hosted backend is required or permitted for normal profiling.

## Required product boundary

Follow [SPEC.md](SPEC.md) for the detailed local contract and [DECISIONS.md](DECISIONS.md) for what is approved by the KB versus selected locally. The `0.1.2` corrective release line preserves the frozen executable contract while fixing npm executable packaging; performance evidence and publication remain separate lifecycle steps.

- First-class Node.js/JavaScript/TypeScript; generic repository and detection-only ecosystem inventory.
- Repository identity/root, single-package/workspace structure, npm/pnpm/Yarn selection and explicitly declared versions, runtime declarations, packages, scripts, and declared entrypoints.
- All seven command purposes: build, test, lint, typecheck, dev, start, format.
- Common config, AGENTS.md/CLAUDE.md/Copilot instruction, and CI file inventories.
- Traceable evidence, diagnostics, bounded/truncated output, stable ordering, and cross-platform normalized paths.
- Confidence states `confirmed | strong | weak | unknown`; result statuses `complete | partial | unsupported | error`.
- Fail closed on ambiguity. Preserve unknowns rather than inventing commands or facts.

Never execute target scripts/build/tests/lint/dev, install target dependencies, read secrets, modify the target repository/Git state, make network calls, or invoke an LLM while profiling. Every discovered command is project-declared with `execution: "not_run"`; its existence does not certify safety or success.

Keep AST/graphs, change impact, test selection, error parsing, diff/contract risk, instruction precedence, repository summarization, context packing, and interactive UI outside V1. See README for the complete tool boundary map.

## Deliverables

1. The smallest coherent implementation following [DESIGN.md](DESIGN.md), using inert structured parsers where available, not a framework or repository-specific exception collection.
2. CLI behavior for `agent-project-profile .`, `--format json`, `--format text`, and `--strict`, with documented stdout/stderr, exit, and limit semantics. Retain optional `--pretty` only as defined in the reviewed contract. A public JavaScript API is not an additional V1 requirement.
3. A versioned JSON Schema with target `schemaVersion: "1.0"`, schema-valid examples, and semantic reference/coverage checks. Internal types alone are not a replacement for JSON Schema.
4. Frozen synthetic fixtures, deterministic golden expectations, safety instrumentation, and the verification evidence required by [TEST_PLAN.md](TEST_PLAN.md).
5. Updated current-behavior documentation, limitations, compatibility information, and accurate lifecycle evidence.

## Verification and completion

Execute the profiler project's own inspected typecheck/build/unit/golden/CLI smoke checks in the authorized development environment. Do not execute operations discovered in target fixtures. Verify unchanged targets and zero profiler network/subprocess/secret access using observable boundaries.

Cover at least the 16 golden fixture categories in TEST_PLAN, schema validation, evidence integrity, stable ordering, bounded workspaces/output, and Windows/macOS/Linux behavior. Record unsupported or unavailable validation environments as unverified. Do not claim complete cross-platform verification from a subset of platforms.

A completed implementation requires sufficient evidence and passed independent verification. Publishing a package is a separate action and lifecycle state.

Report implemented scope, architecture, files changed, actual CLI examples, schema location/version, checks and results, platform coverage, limitations, exact tested commit/worktree identity, package/release state, and remaining uncertainty. Include API examples only if an API was actually delivered. Do not invent a commit or create one merely to fill a report field.

For meaningful lifecycle/design changes, apply the [KB maintenance workflow](DECISIONS.md) to the existing canonical record, preserving independent axes and updating the ecosystem only when roadmap state/order changes. Read back persisted records after any write. Never create a duplicate status record or promote unknown verification to passed.
