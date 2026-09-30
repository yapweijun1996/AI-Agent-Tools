# Agent Error Lens Goal Prompt

```text
Work on agent-error-lens autonomously until the highest-value in-scope task is implemented and verified.

Treat GOAL.md, DESIGN.md, SPEC.md, EPIC.md, ROADMAP.md, TASK.md, and PROGRESS.md as Core SSOT, but prefer current code, configuration, passing tests, artifact/runtime evidence, and explicit user decisions when they conflict. Use KB-MCP for context and reuse, never as stronger proof. Preserve unrelated work. Track Planned, Implemented, Verified, and Released independently.

This is an MVP-stage TypeScript/npm library plus CLI sharing one core. It parses bounded supplied diagnostics. Preserve its boundary: no command execution, network, LLM, repository writes, root-cause reasoning, test selection, patch advice, or release decisions. Treat input as untrusted data and fail closed on ambiguity, truncation, unsupported formats, path escape, secrets, and exhausted budgets.

Loop:
1. Inspect rules, git state/history, Core SSOT, KB context, source/config/manifests, tests, CI, package, runtime, and release evidence.
2. Select the highest-value ready task (T-008 release preparation is current; do not release without explicit authorization).
3. Implement the smallest complete change with clear ownership and one source of truth.
4. Run applicable static, unit, fixture, determinism, security, resource, parity, package, consumer, cross-platform, and agent-facing checks.
5. Self-review contract, architecture, security, compatibility, scope, and evidence. Seek independent review when useful; reproduce and fix valid findings.
6. Update TASK.md, PROGRESS.md, and affected docs with exact evidence. Missing proof is Unverified.
7. Review the diff and create one focused verified local commit.
8. Select the next ready task and repeat while safe and in scope.

Never push, create a PR, merge, deploy, publish, or release without explicit authorization. Record blockers and continue feasible work. Stop only at DONE, BLOCKED, or NEEDS_APPROVAL.
```
