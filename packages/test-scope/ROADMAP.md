# agent-test-scope Roadmap

| Field | Value |
|---|---|
| Status | Active — V0.1 implementation baseline |
| Planning style | Evidence-driven, not date-driven |

## Baseline

The project starts as a focused verification planner in the AI-Agent-Tools ecosystem.

It does not aim to become a test runner, coding agent, or CI orchestrator.

## Phase 0 — Contract Foundation

Goal:

- freeze V0.1 schemas;
- define statuses, diagnostics, confidence, risk, and verification levels;
- establish security/resource boundaries.

Exit evidence:

- schema tests;
- contract fixtures;
- deterministic sample output.

## Phase 1 — JS/TS V0.1

Goal:

- JS/TS/JSX/TSX;
- Vitest;
- Jest;
- Node.js native tests;
- direct mapping;
- static import evidence;
- risk;
- minimum/recommended/release plans.

Exit evidence:

- complete fixture matrix;
- CLI/library parity;
- package smoke;
- coverage and security gates.

## Phase 2 — Workspace Support

Goal:

- stronger npm workspace handling;
- package-boundary-aware planning;
- explicit ambiguity for multi-project repositories.

Future candidates:

- pnpm;
- Yarn workspaces;
- Turborepo;
- Nx.

No ecosystem is marked supported before dedicated fixtures and capability evidence exist.

## Phase 3 — Project Profile Integration

Goal:

Consume versioned `agent-project-profile` evidence for:

- project type;
- package manager;
- scripts;
- workspace boundaries.

The tool must remain standalone.

## Phase 4 — Symbol Search Integration

Goal:

Consume symbol-level evidence where it improves source/test relationship confidence.

Expected flow:

```text
Symbol Search → Test Scope
```

No duplicated semantic symbol engine inside Test Scope.

## Phase 5 — Change Impact Integration

Goal:

Consume bounded downstream impact evidence.

Expected flow:

```text
Change Impact
      ↓
Test Scope
```

This phase should improve risk and verification escalation without turning Test Scope into an impact analyzer.

## Phase 6 — Coverage Evidence

Goal:

Allow optional, pre-generated coverage artifacts to improve recommendations.

Important:

- Test Scope does not run coverage;
- stale or incompatible coverage must be reported honestly;
- absence of coverage remains valid.

## Phase 7 — Python Adapter

Goal:

Add Python test discovery and bounded evidence.

Candidates:

- pytest;
- unittest.

Dynamic Python behavior must not be presented as complete static proof.

## Phase 8 — CFML Adapter

Goal:

Add explicit CFML test/project conventions only after a fixture strategy exists.

No runtime dispatch claims without evidence.

## Phase 9 — Ecosystem / MCP Integration

Goal:

- stable Agent Tool composition;
- optional MCP wrapper;
- agent skill interoperability;
- Context Pack integration.

Reasoning stays outside the deterministic core.

## Future Research

Potential research areas:

- test-history evidence;
- changed-line coverage;
- flaky-test metadata;
- CI-duration-aware planning;
- language adapters;
- repository-scale caching.

These are research topics, not current commitments.

## Non-Commitments

The roadmap does not currently commit to:

- LLM test selection;
- automatic test execution;
- automatic code changes;
- test generation;
- runtime tracing;
- full CI orchestration;
- natural-language queries;
- hidden full-suite execution;
- a persistent repository daemon;
- a monolithic all-in-one Agent Tool.
