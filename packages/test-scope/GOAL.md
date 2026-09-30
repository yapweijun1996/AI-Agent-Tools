# agent-test-scope Goal

| Field | Value |
|---|---|
| Status | Proposed |
| Product | agent-test-scope |
| Package | `agent-test-scope` |
| CLI | `agent-test-scope` |
| Initial scope | JavaScript / TypeScript / JSX / TSX |
| Initial frameworks | Vitest / Jest / Node.js test runner |

> Given a set of changed files, determine the smallest evidence-backed verification scope an AI coding agent should run.

## 1. Mission

Build a deterministic, local-first, read-only verification planner for AI coding agents.

The tool should help an agent answer:

- Which tests are directly relevant to this change?
- How broad should verification be?
- Which commands are appropriate?
- Why was each test or command selected?
- How confident is the recommendation?
- When should verification escalate from targeted tests to package or release checks?

## 2. Problem

Coding agents often choose verification poorly. They may run too little and miss regressions, or run the entire suite for every small change and waste time, compute, and CI capacity.

`agent-test-scope` should make this decision from bounded repository evidence instead of LLM guessing.

## 3. Target Users

- AI coding agents
- Coding-agent harnesses
- Developer automation
- CI planning tools
- Agent ecosystems such as Pi Company, Codex workflows, Claude Code workflows, and custom agent runtimes

## 4. Product Principles

1. **Deterministic** — identical evidence should produce identical output.
2. **Evidence-backed** — every recommendation must explain why it exists.
3. **Read-only** — analysis must not modify the target repository.
4. **Local-first** — no network or external model is required.
5. **Bounded** — file, byte, result, and time limits must be explicit.
6. **Honest confidence** — heuristics must never be presented as confirmed evidence.
7. **Composable** — remain a focused tool that can consume evidence from other Agent Tools.
8. **Machine-readable first** — stable versioned JSON is the canonical output.

## 5. Ecosystem Position

```text
agent-project-profile
        ↓
agent-symbol-search
        ↓
agent-code-slice
        ↓
agent-change-impact
        ↓
agent-test-scope
        ↓
agent-error-lens
        ↓
agent-patch-guard
        ↓
agent-release-guard
```

Ownership boundaries:

- Project Profile: repository structure and commands
- Symbol Search: symbol navigation
- Code Slice: exact source extraction
- Change Impact: blast radius and affected relationships
- Test Scope: verification selection and escalation
- Error Lens: failure interpretation
- Patch Guard: patch safety review
- Release Guard: release readiness

## 6. Hard Boundaries

The analysis engine must not:

- call an LLM;
- access the network;
- install dependencies;
- execute tests, builds, or package scripts;
- modify project files;
- generate tests;
- claim runtime coverage without runtime evidence;
- replace Symbol Search or Change Impact;
- diagnose failed tests.

Generated commands are recommendations only and must not be executed by the core engine.

## 7. V0.1 Goal

Support JS/TS/JSX/TSX repositories with:

- Vitest;
- Jest;
- Node.js native test runner;
- common `*.test.*`, `*.spec.*`, `test/`, `tests/`, and `__tests__/` conventions;
- direct source-to-test mapping;
- static import evidence;
- bounded risk classification;
- minimum / recommended / release verification levels;
- CLI and library APIs sharing one core engine.

## 8. Definition of Success

V0.1 succeeds when an AI coding agent can provide changed files and receive:

- relevant tests;
- recommended verification commands;
- evidence;
- confidence;
- risk;
- escalation guidance;
- diagnostics;
- truncation/resource information;

without hidden guessing, network access, LLM calls, repository mutation, or automatic test execution.
