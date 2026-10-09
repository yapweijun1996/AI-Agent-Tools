# Agent Change Impact

Agent Change Impact is a local, read-only utility that gives AI coding agents a
bounded, evidence-backed view of what may depend on a file, symbol, or Git
change. It returns repository-relative locations and directed relationships so a
downstream reader such as [Agent Code Slice](https://github.com/yapweijun1996/AI-Agent-Tools/tree/main/packages/code-slice)
can inspect the relevant code.

## Current state

The v0.1 implementation is complete for its declared JavaScript/TypeScript/TSX
scope. The current tree includes bounded snapshot reads, Git endpoint/worktree
comparison, reverse evidence traversal, candidate-test projection, CLI/API
validation, packaged API/CLI smoke, and read-only helper isolation. Internal
symlink aliases are discovered without following escapes; Windows short-path
identity handling and checkout line-ending normalization are covered by the
latest implementation fixes in `0b72a83` and `e85c573`.

The draft result contract was reviewed against capabilities, file, symbol,
changed, and error payloads with Ajv 8.20.0. It remains unchanged across the
`0.1.x` package line while retaining the compatibility identifier `0.1-draft`;
permissive draft fields remain intentional. Hosted workflow run
[34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471)
passed all six Node 22/24 Ubuntu, macOS, and Windows jobs. Package
line `0.1.x` carries the reviewed implementation and `0.1-draft` contract. The
public registry link and exact artifact evidence are recorded in
[VALIDATION.md](VALIDATION.md); the release package version is defined by
`package.json`.

| Surface | Current state |
| --- | --- |
| npm package name | `agent-change-impact` ([public registry](https://www.npmjs.com/package/agent-change-impact)) |
| CLI | `agent-impact` via `dist/cli.js` |
| JavaScript API | `dist/index.js` exports `capabilities`, `analyzeFile`, `analyzeSymbol`, and `analyzeChanged` |
| Supported source | JavaScript, TypeScript, and TSX in one selected `tsconfig.json` or `jsconfig.json` project |
| Provider | TypeScript `5.9.3` Language Service plus AST inspection |
| Runtime floor | Node.js `22` or newer according to `package.json`; Node.js `23.10.0` on macOS and Node.js 22/24 Linux containers have been run locally |
| Release state | `0.1.1` is published on npm; the draft contract is unchanged and bounded artifact checks pass |

## Install and verify from a checkout

```sh
npm ci --ignore-scripts
npm test
npm run typecheck
npm run pack:check
npm run release:check
npm run pack:smoke
npm run docs:check
```

The test suite creates temporary Git repositories from
[`test/fixtures/basic`](test/fixtures/basic), then exercises the CLI and API
without modifying the checkout. `npm test` builds TypeScript before running the
36 smoke/integration cases, including cycle-safe traversal, deterministic
diamond paths, an empty-impact result, malformed JavaScript API request and
out-of-range coordinate handling, snapshot-aware diagnostics, and bounded
high-fan-out unresolved-module and diagnostic observations. The suite also
verifies that an internal symlinked source file and a repository root addressed
through an internal symlink remain within the repository boundary.
The 34-case suite and package checks recorded at `f9f904b` pass in current
Node.js 22 and 24 Linux container copies using fresh lockfile installs. The
latest hosted run `34123415471` adds green Node 22/24 Ubuntu, macOS, and Windows
jobs. The Windows concurrent-content assertion remains intentionally skipped by
the current harness because Node `execFile` cannot intercept Git with a `.cmd`
shim on Windows; this is a test-harness limitation, not an untested product
claim. Worktree comparison avoids configured clean filters by hashing raw files
and deriving unstaged ranges through content-only diffs outside repository
attributes.
The packaged tarball was also installed in temporary directories and its API and
CLI were loaded successfully on the local macOS runtime and Node 22/24 Linux
containers; the smoke prefers the npm cache, permits registry fallback for
missing dependency metadata, disables install scripts, and verifies that the
installed CLI rejects pretty output when formatting would exceed the declared
byte budget.
`npm run release:check` verifies package/lockfile versions, the versioned
changelog heading, draft schema version, required entry points, and the actual
dry-run tarball file set. Set `AGENT_IMPACT_RELEASE_TAG=v<package.version>` when
validating a release tag. It does not publish or create a release.
`npm publish --dry-run --ignore-scripts --access public` passes for the current
package. The authorized `npm publish --access public` completed for
`agent-change-impact@0.1.1`; a clean registry install, API/CLI/skill checks,
integrity/SHA-1 metadata, and npm signature verification pass. No provenance
attestation is present because this release used interactive authentication;
results are recorded in [VALIDATION.md](VALIDATION.md).
The bounded fan-out benchmark in
[`spike/PERFORMANCE_FINDINGS.md`](spike/PERFORMANCE_FINDINGS.md) records local
API/CLI cold-start and limit behavior without making a performance guarantee.
The diagnostic stress command is `node spike/diagnostic-limit.cjs`.

## AI agent integration

This is a server-free (serverless in the sense that no long-running service is
deployed) agent tool. The CLI runs as a local child process and the
JavaScript API runs in the caller's Node.js process; analysis needs no HTTP
server, API key, database, MCP connection, or hosted runtime. npm and GitHub are
distribution channels. An agent may need network access while installing from
one of them, but the analysis itself reports `network: "disabled"` and does not
execute repository code.

### Global installation for Codex CLI

Install the published CLI from any directory; no repository checkout or `cd` is required:

```sh
npm install --global agent-change-impact@latest
agent-impact capabilities --json
```


Read [AGENT_GUIDE.md](AGENT_GUIDE.md) for the install and operating workflow.
The repository also ships the portable Agent Skills file
[`skills/agent-change-impact/SKILL.md`](skills/agent-change-impact/SKILL.md),
which can be copied into Codex's `.agents/skills` directory or Claude Code's
`.claude/skills` directory. Codex can invoke it as `$agent-change-impact` and
Claude Code as `/agent-change-impact`; both hosts can also select it
automatically from its description. The optional
[`agents/openai.yaml`](skills/agent-change-impact/agents/openai.yaml) supplies
Codex UI metadata.

For a GitHub checkout, run `npm ci --ignore-scripts`, `npm run build`, and use
`node dist/cli.js ...`. For an npm install, use `npm install
agent-change-impact`, then `npx --no-install agent-impact ...`; use
`npm view agent-change-impact version` when the registry version and the GitHub
checkout may be at different release stages. The current public `0.1.1`
package includes the guide and skill files so an agent can install the CLI and
its instructions from the same artifact. Check `npm view
agent-change-impact version` before relying on those paths from the public
`latest` tag.

## CLI

The current source supports standalone `--help`/`-h` and operation help, exiting
zero without opening a repository. Analysis and capabilities retain their native
JSON contracts. This source addition has no new npm release.

After `npm run build`, the executable can be invoked directly:

```sh
node dist/cli.js capabilities --json
node dist/cli.js file src/invoice.ts --root /path/to/repo --project tsconfig.json --json
node dist/cli.js symbol src/invoice.ts calculateTotal --root /path/to/repo --project tsconfig.json --at 20:1 --json
node dist/cli.js changed --root /path/to/repo --base origin/main --head HEAD --project tsconfig.json --json
node dist/cli.js changed --root /path/to/repo --base HEAD --worktree --project tsconfig.json --json
```

`--project` is repository-relative. If it is omitted, exactly one
`tsconfig.json` or `jsconfig.json` must be discoverable. `changed` requires a
base revision and exactly one of `--head` or `--worktree`. JSON mode writes one
JSON document to stdout; exit code `0` means a usable complete or partial result,
`2` means invalid invocation, and `1` means an operation failure. Limit flags
include `--depth`, `--max-nodes`, `--max-edges`, `--max-paths`,
`--max-output-bytes`, `--max-files`, `--max-file-bytes`,
`--max-total-file-bytes`, and `--max-diagnostics`.
The output limit is checked on the final serialized body in both JSON and
pretty-printed modes; an over-budget pretty result returns a structured
`OUTPUT_LIMIT_EXCEEDED` error.

The graph stores edges from consumer to dependency and reports reverse impact
paths. `resolved` evidence means a static binding in the selected project;
dynamic or missing module targets are retained as unresolved observations.
`analysis.status` describes completeness of the bounded static analysis and is
separate from the top-level `ok` flag. Candidate tests are filename-based
classifications with their actual graph edges; they do not prove coverage or
test execution.

The default limits are depth 2, 100 nodes, 300 edges, one path per impact item,
1 MiB serialized output, 10,000 files, 2 MiB per file, 64 MiB total source, and
1,000 diagnostics. Hard graph caps are depth 5, 5,000 nodes, and 15,000 edges;
hard input/output/diagnostic caps are 8 paths, 16 MiB output, 100,000 files,
16 MiB per file, 512 MiB total source, and 10,000 diagnostics. Provider
unresolved observations are capped at the effective `maxEdges` value before
projection; truncation is visible as `PROVIDER_OBSERVATION_LIMIT`. File and
project diagnostic collection is capped at the effective `maxDiagnostics` value;
truncation is visible as `DIAGNOSTIC_LIMIT`. Both markers make the analysis
partial. Working-tree reads stop at the effective per-file byte budget plus one
byte before UTF-8 decoding. Git revision blobs use a bounded binary subprocess
buffer capped at `maxFileBytes + 1`, are checked before UTF-8 decoding, and emit
`FILE_BUDGET_EXCEEDED` when the configured file budget is exceeded. Permitted
external TypeScript declarations and module-resolution metadata use the
descriptor reader and re-check their real path before opening. Limits and
partial stop reasons are included in the
result. Diagnostics tied to a revision or working-tree snapshot retain that
snapshot's ID so identical warnings from different contexts remain
distinguishable.

## Boundary and limitations

Analysis reads Git objects and the current working tree; changed worktree mode
compares two bounded content-hashed reads and reports a mismatch as partial. It
never checks out,
resets, writes source, installs dependencies, runs repository code, runs tests,
loads executable configuration, invokes external diff/textconv/fsmonitor or
clean-filter helpers, or uses a network service. Worktree Git comparison hashes
raw files without filters and derives unstaged ranges outside repository
attributes. Historical snapshots may use the current local
`node_modules` and TypeScript standard library for resolution, so historical
dependency fidelity is reported as a limitation. Project references, multiple
workspace projects, full data-flow/runtime dispatch, heuristic matching, Python,
CFML, SCIP, and a dedicated `why` command are outside this draft.

## Documentation

Start with [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md) for document
ownership and reading order.

- [SPEC.md](SPEC.md): implemented draft behavior, requirements, CLI/API, and result semantics.
- [DESIGN.md](DESIGN.md): implemented architecture, decisions, and known boundaries.
- [EPIC.md](EPIC.md): work-package outcomes and release gate status.
- [ROADMAP.md](ROADMAP.md): milestone order and future priorities.
- [TASK.md](TASK.md): authoritative task ledger, evidence, blockers, and next steps.
- [VALIDATION.md](VALIDATION.md): fixture status and exact verification evidence.
- [AGENT_GUIDE.md](AGENT_GUIDE.md): install paths, Codex/Claude Code skill setup, CLI workflow, and result interpretation.
- [CHANGELOG.md](CHANGELOG.md): `0.1.1` release record and `0.1.0` history; publication status is tracked above and in [VALIDATION.md](VALIDATION.md).
- [`spike/PROJECT_HOST_FINDINGS.md`](spike/PROJECT_HOST_FINDINGS.md): local project-host feasibility findings.
- [`spike/PERFORMANCE_FINDINGS.md`](spike/PERFORMANCE_FINDINGS.md): bounded local resource observations.
