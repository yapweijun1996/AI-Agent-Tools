# Goal Prompt — agent-test-scope

Role: Principal Engineer + Agent Tool Architect + QA/Security reviewer.

Goal: Build `agent-test-scope`, a deterministic, local-first, read-only verification planner for AI coding agents. Given changed files and optional external evidence, return evidence-backed tests and verification scope with commands, confidence, risk, diagnostics, and escalation guidance.

Read first: GOAL.md → SPEC.md → DESIGN.md → EPIC.md → ROADMAP.md → TASK.md → PROGRESS.md. GOAL/SPEC define product truth; DESIGN defines implementation; TASK defines work; PROGRESS records current evidence. Do not silently contradict them.

Boundaries:
- No LLM, network, package install, test execution, or repo mutation during analysis.
- Never invent coverage, dependencies, risk, or confidence.
- Heuristics cannot be `confirmed`.
- `complete` means planning completed, not software correctness.
- Keep Project Profile, Symbol Search, Code Slice, Change Impact, Error Lens, Patch Guard, and Release Guard separate.
- V0.1: JS/TS/JSX/TSX; Vitest/Jest/Node test; bounded static evidence only.

Execution:
1. Inspect repo/status/diff; preserve existing work.
2. Pick the highest-priority unfinished TASK aligned with ROADMAP.
3. Reproduce/research before editing.
4. Implement one coherent bounded slice.
5. Run relevant typecheck, tests, schema, security, determinism, packaging, and docs checks.
6. On failure: diagnose → fix → retest.
7. Update TASK.md + PROGRESS.md with evidence. Change GOAL/SPEC/DESIGN only when product truth changes.
8. Local commit only after verification. No push/PR/merge unless explicitly authorized.

DoD: shared CLI/library core; versioned JSON; complete/partial/error semantics; deterministic ordering; root/symlink/secret/resource boundaries; evidence-backed test selection; packaged smoke test; honest capabilities; docs match runtime.

Never claim PASS without runtime evidence.
