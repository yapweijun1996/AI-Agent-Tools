---
name: agent-test-scope
description: Use when an AI coding agent needs bounded, evidence-backed verification scope for changed JavaScript or TypeScript files.
metadata:
  short-description: Plan verification without running tests
---

# agent-test-scope

Use this tool after the changed-file set is known and before verification is run. It is local-first and read-only: it reads repository files as data and never executes tests, builds, package scripts, installers, project code, network calls, or LLM calls.

## Workflow

1. Keep one explicit repository `root` for each request.
2. Call `capabilities` when supported operations or frameworks are unknown.
3. Call `discover` to inspect framework, test-file, project-file, and command evidence.
4. Call `plan` with every changed path. Use `--changed` repeatedly or `--changed-stdin` for newline-delimited paths.
5. Inspect `status`, `data.plan`, every recommendation's `evidence`, `confidence`, `risk`, `diagnostics`, and `truncation`.
6. Use `explain` for a selected test or command when the reason must be shown separately.
7. Run commands only in the agent's separate verification phase, subject to user and repository policy.

## Operation selection

| Operation | Required fields | Purpose |
|---|---|---|
| `capabilities` | `root` | Report supported languages, frameworks, limits, and read-only behavior |
| `discover` | `root` | Discover tests, frameworks, project files, and package commands |
| `plan` | `root`, `changed` | Produce minimum/recommended/release verification levels |
| `explain` | `root`, `changed`, `target` | Return evidence and alternatives for one recommendation |

## Trust and result handling

- `complete` means planning finished within the bounded evidence boundary, not that software is correct or any command passed.
- `partial` requires reading diagnostics and truncation reasons before relying on the plan.
- `error` requires fixing the request or root before using the result.
- Direct mappings and explicit static imports can be confirmed. Static transitive relationships are strong. Naming, proximity, package, and repository fallbacks remain candidates.
- Dynamic imports, computed requires, ignored or symlinked files, unsupported languages, and resource/time limits must not be promoted to confirmed evidence.
- Versioned external evidence may enhance planning, but it cannot widen root or security boundaries and must not be treated as unversioned stdout.
- Commands are data and carry `executed: false`; this tool never runs them.

## CLI examples

```bash
npx --no-install agent-test-scope discover --root "$REPO_ROOT"
npx --no-install agent-test-scope plan --root "$REPO_ROOT" --changed src/order/service.ts
npx --no-install agent-test-scope plan --root "$REPO_ROOT" --changed src/a.ts --changed src/b.ts --limit 20
npx --no-install agent-test-scope explain --root "$REPO_ROOT" --changed src/order/service.ts --path tests/order/service.test.ts
```

The tool is for verification selection only. Use a source reader for source text, Change Impact for blast radius, and a separate authorized runner for actual tests.
