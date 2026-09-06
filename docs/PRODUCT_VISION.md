# Product vision

AI coding agents often read too much context, infer unsupported relationships, and act without a precise verification boundary. This ecosystem supplies small tools that turn explicit local inputs into bounded evidence agents can inspect and use.

The primary users are coding agents and developers working with local repositories. A useful tool answers one narrow question clearly, reports what it actually inspected, and exposes unsupported or incomplete analysis instead of guessing.

## Product contract

Core tools work locally without an LLM, API key, backend, or required network service. They offer CLI interfaces and stable machine-readable JSON. The same normalized inputs, configuration, and tool version should yield equivalent results; any nondeterminism must be documented. Resource limits and unsupported inputs are part of the contract.

Read-only operation is the default. Tools distinguish observation from inference, diagnostics from machine output, and successful complete analysis from insufficient evidence. Optional integrations must remain explicit and must not become prerequisites for the core workflow.

## Boundaries

The Hub governs and documents the ecosystem. Individual repositories implement and ship tools. Agents retain responsibility for reasoning, selecting tools, approving actions, and deciding whether evidence is sufficient for their task.

The ecosystem does not redesign Codex, Claude, or AGRUN. It does not provide autonomous planning, agent scheduling, session memory, a hosted control plane, or a unified runtime. A future task-scoped Context Pack is an explicit bounded artifact, not persistent agent memory or a decision engine.

## Evidence of value

Tool repositories should measure representative tasks against a documented baseline: bytes or lines returned, irrelevant context avoided, repeatability, unsupported-case handling, and correctness of the resulting evidence. Record fixture inputs, tool version, commands, environment, and limitations. Never claim token savings, accuracy, safety, or coverage without reproducible measurements.

Success is a smaller, more reliable interface to evidence, not a larger number of tools. [Roadmap](../ROADMAP.md) records priorities; [Tool standard](TOOL_STANDARD.md) defines readiness.
