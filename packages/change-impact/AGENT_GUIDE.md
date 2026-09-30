# AI Agent Guide

This guide is for a coding agent that needs to decide which files or tests to
inspect before editing a JavaScript, TypeScript, or TSX project.

## Operating model

Agent Change Impact is a local CLI and JavaScript API. It is server-free
(serverless in the sense that no long-running service is deployed): no HTTP
server, database, API key, MCP connection, or hosted service is required while
an analysis runs. The process reads the selected repository, Git objects,
and permitted local TypeScript inputs; it is read-only, offline, and does not
execute repository code or tests. GitHub and npm provide download and
installation channels only. Installing from either channel can use the
network, so an agent should do that only when installation is part of the
authorized task.

The package supports JavaScript, TypeScript, and TSX in one explicit or
unambiguous `tsconfig.json`/`jsconfig.json` project. It reports static evidence,
not a guarantee of runtime, dynamic-dispatch, data-flow, external-project, or
test coverage impact.

The public npm `latest` tag currently points to `agent-change-impact@0.1.1`.
Verify the version with `npm view agent-change-impact version` before relying on
the registry artifact; the GitHub checkout may contain a newer unreleased
revision.

## Install the CLI

### From npm

Use a project-local install when the repository should pin the tool:

```sh
npm install --save-dev agent-change-impact
npx --no-install agent-impact capabilities --json
```

Use a global install for a personal command-line workflow:

```sh
npm install --global agent-change-impact
agent-impact capabilities --json
```

For a one-off authorized install, `npx --yes --package agent-change-impact
agent-impact ...` avoids editing the project manifest. Check the selected
package version first with `npm view agent-change-impact version`; the public
registry and this GitHub checkout may be at different release stages.

### From GitHub

Use the source checkout when an agent needs a specific repository revision or
the latest committed documentation and skill:

```sh
git clone https://github.com/yapweijun1996/AI-Agent-Tools/tree/main/packages/change-impact.git
cd AI-Agent-Tool-Change-Impact
npm ci --ignore-scripts
npm run build
node dist/cli.js capabilities --json
```

The checkout and release npm package expose the same `agent-impact` CLI
contract. Check the registry version before assuming the public `latest` tag
contains the newest guide and skill files. A GitHub Actions job should use a
full checkout when comparing revisions:

```yaml
- uses: actions/checkout@v4
  with:
    fetch-depth: 0
- run: npm ci --ignore-scripts
- run: npm run build
- run: node dist/cli.js changed --root "$GITHUB_WORKSPACE" --base origin/main --head "$GITHUB_SHA" --project tsconfig.json --json
```

## Install the agent skill

The distributable skill is [`skills/agent-change-impact/SKILL.md`](skills/agent-change-impact/SKILL.md).
It follows the open Agent Skills format and is usable by both Codex and Claude
Code. The optional [`agents/openai.yaml`](skills/agent-change-impact/agents/openai.yaml)
adds Codex display metadata; Claude Code ignores that optional file.

### Codex

For a personal skill available in every repository, copy the skill to
`$HOME/.agents/skills/agent-change-impact/SKILL.md`. For a repository-scoped
skill, use `.agents/skills/agent-change-impact/SKILL.md` under that repository.
Codex discovers repository skills from `.agents/skills`; use `/skills` to check
availability and mention it explicitly as `$agent-change-impact` when needed.

From a GitHub checkout:

```sh
mkdir -p "$HOME/.agents/skills/agent-change-impact"
cp skills/agent-change-impact/SKILL.md "$HOME/.agents/skills/agent-change-impact/SKILL.md"
```

From an installed npm package, copy the packaged file instead:

```sh
mkdir -p "$HOME/.agents/skills/agent-change-impact"
cp node_modules/agent-change-impact/skills/agent-change-impact/SKILL.md "$HOME/.agents/skills/agent-change-impact/SKILL.md"
```

If the package is only downloaded as a tarball, extract it first with
`npm pack agent-change-impact@<version>` and copy from
`package/skills/agent-change-impact/SKILL.md`. On Windows PowerShell, use
`New-Item -ItemType Directory` and `Copy-Item` for the same paths.

### Claude Code

For a personal skill, copy the same `SKILL.md` to
`$HOME/.claude/skills/agent-change-impact/SKILL.md`. For a project-scoped skill,
use `.claude/skills/agent-change-impact/SKILL.md` in the repository. Start
Claude Code in the repository, run `/skills` to confirm discovery, or invoke it
directly with `/agent-change-impact`.

The Codex and Claude Code files intentionally share one source. Keep the
instructions in `skills/agent-change-impact/SKILL.md` authoritative and copy it
to host-specific directories rather than maintaining divergent variants.

Official host references: [Codex skills](https://developers.openai.com/codex/skills/)
and [Claude Code skills](https://code.claude.com/docs/en/skills).

## Ask the tool for impact

Always begin with capabilities when the executable or contract is unfamiliar:

```sh
agent-impact capabilities --json
```

Choose the narrowest operation that answers the question:

```sh
# A file and its reverse dependants
agent-impact file src/invoice.ts --root "$PWD" --project tsconfig.json --json

# One declaration; --at is 1-based LINE:COLUMN when a name is ambiguous
agent-impact symbol src/invoice.ts calculateTotal --root "$PWD" --project tsconfig.json --at 20:1 --json

# Two immutable Git revisions
agent-impact changed --root "$PWD" --base origin/main --head HEAD --project tsconfig.json --json

# A revision compared with the current worktree
agent-impact changed --root "$PWD" --base HEAD --worktree --project tsconfig.json --json
```

If `--project` is omitted, exactly one discoverable TypeScript configuration
must exist. `changed` requires `--base` and exactly one of `--head` or
`--worktree`. Pass limits such as `--depth`, `--max-nodes`, `--max-edges`,
`--max-output-bytes`, and `--max-diagnostics` only when the default bounded
query is insufficient; the result reports the effective limits.

## Read the JSON contract

Parse the one JSON document and keep its exit status:

- `ok: false` is an error. Use `error.code` and `error.message` to correct the
  invocation or project context; never convert an error into an empty result.
- `ok: true` with `analysis.status: "complete"` means the selected bounded
  scope finished. An empty impact is still limited to that scope.
- `analysis.status: "partial"` means a usable result was bounded or a
  limitation was observed. Report `analysis.stopReasons`, `warnings`, and
  `unresolved` with the candidates.
- `impact.direct` and `impact.transitive` contain candidates. Use each item's
  node ID to join `graph.nodes`, then follow `graph.edges[].evidence` to the
  repository-relative source location and snapshot.
- `tests` contains filename/dependency candidates. It does not prove test
  coverage or authorize running tests.

Exit code `0` means a usable complete or partial result, `2` means invalid
invocation, and `1` means an operation or output failure. The schema identifier
is `0.1-draft`; validate it before relying on fields from automation.

## Recommended agent workflow

1. Run the smallest relevant operation with `--json`.
2. Summarize the target, direct candidates, transitive candidates, candidate
   tests, unresolved observations, warnings, and partial stop reasons.
3. Inspect the returned evidence locations with the normal file reader or Code
   Slice before editing.
4. Treat results as static evidence. Keep dynamic dispatch, runtime behavior,
   external projects, project references, and uncovered tests as explicit
   uncertainty.
5. Run tests and make edits only when the user's task or the approved plan
   calls for those actions.

The API exposes the same envelope for agents that prefer JavaScript:

```js
const { analyzeFile } = require("agent-change-impact");

const result = analyzeFile({
  root: process.cwd(),
  project: "tsconfig.json",
  file: "src/invoice.ts",
});
```

For the complete behavior and boundaries, read [README.md](README.md),
[SPEC.md](SPEC.md), and [VALIDATION.md](VALIDATION.md).
