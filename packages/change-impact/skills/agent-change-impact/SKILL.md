---
name: agent-change-impact
description: Use when a coding agent needs bounded static impact evidence for a JavaScript, TypeScript, or TSX file, symbol, or Git change before editing or testing. It explains complete versus partial results and does not execute repository code.
---

# Agent Change Impact

Use `agent-impact` to find statically related files, symbols, dependency edges,
and candidate tests before changing code. The tool is a local, read-only process:
it does not start a server, require an API key, call an MCP service, install
dependencies, execute repository code, or run tests. npm and GitHub are only
distribution channels; an install may use the network, but analysis has
`network: "disabled"` in its capabilities response.

## Start safely

1. Work from the repository root or pass the repository explicitly with
   `--root`. Confirm Node.js `>=22`, Git, and one explicit or unambiguous
   `tsconfig.json`/`jsconfig.json` project are available.
2. Check the executable with `agent-impact capabilities --json`. If it is not
   installed, use the installation commands in `AGENT_GUIDE.md`; do not run a
   network install silently. When the user has authorized a temporary install,
   `npx --yes --package agent-change-impact agent-impact ...` is acceptable.
3. Pass `--project tsconfig.json` when a repository has more than one possible
   configuration. Project paths and target files are repository-relative.
4. Use `--json` and parse the single JSON document. Preserve the exit status:
   `0` is a usable complete or partial result, `2` is invalid invocation, and
   `1` is an operation or output failure.

## Choose an operation

- `file <path>`: broad impact for a project file.
- `symbol <path> <name>`: impact for one declaration. Add `--at LINE:COLUMN`
  (1-based) when the name is ambiguous or overloaded.
- `changed --base <revision> --head <revision>`: compare two Git revisions.
- `changed --base <revision> --worktree`: compare a revision with the current
  worktree; do not also pass `--head`.

Examples:

```sh
agent-impact capabilities --json
agent-impact file src/invoice.ts --root "$PWD" --project tsconfig.json --json
agent-impact symbol src/invoice.ts calculateTotal --project tsconfig.json --at 20:1 --json
agent-impact changed --root "$PWD" --base origin/main --head HEAD --project tsconfig.json --json
agent-impact changed --root "$PWD" --base HEAD --worktree --project tsconfig.json --json
```

Use the limit flags only when the repository needs a different bounded query:
`--depth`, `--max-nodes`, `--max-edges`, `--max-paths`, `--max-output-bytes`,
`--max-files`, `--max-file-bytes`, `--max-total-file-bytes`, and
`--max-diagnostics`. Keep the limits within the hard caps reported by the
result.

## Interpret and act on the result

1. If `ok` is `false`, stop and report `error.code` and `error.message`. Fix
   the invocation or project context before retrying; do not treat an error as
   an empty impact result.
2. If `ok` is `true`, inspect `impact.direct`, `impact.transitive`, and
   `graph.nodes`/`graph.edges`. Follow each edge's `evidence` and snapshot
   location before editing a file.
3. Treat `analysis.status: "partial"`, `analysis.stopReasons`, `warnings`, and
   `unresolved` as part of the answer. A partial result is useful bounded
   evidence, not proof that unrelated code is safe.
4. Candidate tests in `tests` are filename/dependency classifications. They do
   not prove coverage and do not authorize test execution; run tests only when
   the user or the task explicitly calls for it.
5. An empty complete impact means no retained relation was found inside the
   selected project and limits. It is not a guarantee that runtime, dynamic,
   data-flow, or external-project effects do not exist.
6. Summarize the target, direct and transitive candidates, candidate tests,
   unresolved observations, warnings, and any partial stop reason. Then use a
   code reader such as the repository's normal file tools or Code Slice to
   inspect the small set of evidence-backed locations.

The JavaScript API is synchronous and returns the same envelope as the CLI:

```js
const { analyzeChanged } = require("agent-change-impact");

const result = analyzeChanged({
  root: process.cwd(),
  project: "tsconfig.json",
  base: "HEAD~1",
  head: "HEAD",
});
```

The advertised provider covers JavaScript, TypeScript, and TSX in one selected
project. Python, CFML, project references, workspace-wide indexing, runtime or
full data-flow dispatch, source extraction, editing, dependency installation,
and test execution remain outside this skill and the v0.1 contract.
