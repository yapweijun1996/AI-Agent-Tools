# Product Specification

Status: implemented v0.1 draft; the executable schema and API are reviewed and
frozen across the `0.1.x` package line while retaining the `0.1-draft`
compatibility identifier. Package `0.1.1` is the current published
documentation release.
Last updated: 2026-09-07. Core implementation revision: `8bb3651`.
Latest package/verification hardening: `273a344`.
Latest release metadata validation: `4d770e0`.
Latest API limit validation: `74563b1`.
Latest local release evidence: `17020ad`.
Latest CLI/revision input hardening: `ab27679`.
Previous documentation/clean-install evidence reconciliation: `1a57175`.
Latest required API request validation: `b1f6477`.
Latest TypeScript compiler hygiene: `473b4da`.
Latest provider observation bounding: `32fd01a`.
Latest diagnostic collection bounding: `a0f148b`.
Latest bounded source reads: `149e0fa`.
Latest validated real-path reads: `dd212e4`.
Latest bounded revision blob reads: `2f3c482`.
Latest snapshot diagnostic identity: `0c8a130`.
Latest internal symlink coverage: `f9f904b`.
Latest provider resolution read boundary: `ba0538a`.
Latest CLI formatted-output bound: `c6296e4`.
Latest installed artifact output-limit smoke: `3472b13`.
Latest cross-platform snapshot path handling: `6b1c9b5`.
Latest platform-aware capture test harness: `261c47a`.
Latest Git clean-filter isolation: `c32634e`.
Latest Windows short-path boundary fix: `0b72a83`.
Latest documentation line-ending check: `e85c573`.
Runtime evidence is tracked in [VALIDATION.md](VALIDATION.md); task status is
authoritative in [TASK.md](TASK.md).

## Goal and scope

Give an AI coding agent a bounded, evidence-backed set of potentially related
files, symbols, references, dependencies, and candidate tests for a target. The
result explains the evidence and the boundaries of the static analysis.

The current provider supports JavaScript, TypeScript, and TSX in one explicit or
unambiguous `tsconfig.json`/`jsconfig.json` project. Python, CFML, SCIP
ingestion, full data-flow, runtime tracing, heuristic target matching,
workspace-wide indexing, source extraction, editing, test execution, LLM
reasoning, and automatic dependency installation are outside this version.

## Requirements

| ID | Requirement | Current status | Evidence |
| --- | --- | --- | --- |
| R-01 | Discover a repository root and report selected project and source scope | Implemented | V-01, V-02 |
| R-02 | Use declared configuration and permitted resolution inputs; report missing/unsupported context | Implemented with scoped limits | V-02, V-03 |
| R-03 | Resolve file/symbol targets without silently choosing an ambiguous declaration | Implemented | V-04, V-05 |
| R-04 | Return static dependency/reference evidence with precise source locations | Implemented for advertised relations | V-06, V-07 |
| R-05 | Compute direct/transitive reverse impact with stable identity, paths, cycles, and granularity | Implemented with bounded one-path projection | V-08, V-09 |
| R-06 | Analyze Git changes against both snapshots, including deletion and rename | Implemented | V-10, V-11 |
| R-07 | Preserve module/configuration/unsupported changes that cannot map to symbols | Implemented with explicit partial/error limits | V-12 |
| R-08 | Distinguish edge resolution from analysis completeness | Implemented | V-03, V-07, V-13 |
| R-09 | Return candidate tests with separate classification and dependency evidence | Implemented | V-14 |
| R-10 | Bound discovery, provider work, traversal, diagnostics, and serialized bytes | Implemented for declared budgets; broader thresholds pending | V-15, V-16 |
| R-11 | Produce deterministic semantic results for identical declared inputs | Implemented for the tested Node 22/24 Ubuntu, macOS, and Windows matrix; a general byte-for-byte cross-platform guarantee is outside the draft contract | V-09, V-17 |
| R-12 | Keep analysis read-only, offline, and free of repository-code execution | Implemented by design/tests | V-18, V-19 |
| R-13 | Provide one consistent CLI/API contract with machine-readable errors | Implemented and frozen across the 0.1.x package line after Ajv review of all public operation envelopes | V-05, V-16, V-20 |
| R-14 | Verify packaging/platform support before advertising a release | Local artifact/runtime checks and hosted run 34123415471 across all six Node 22/24 Ubuntu/macOS/Windows jobs pass for published `0.1.1`; registry clean-install, integrity, SHA-1 shasum, and npm signature checks pass; provenance is unavailable for interactive publication | V-21, V-22 |
| R-15 | Give AI coding agents an installable, host-neutral usage workflow | Implemented in the GitHub source and published `0.1.1` artifact with `AGENT_GUIDE.md`, a portable Agent Skills file, Codex metadata, npm/GitHub installation paths, and CLI/API/result guidance; a clean registry install verifies the guide and skill | V-23 |

## Draft CLI

The executable name is `agent-impact`. From a checkout, run `npm ci --ignore-scripts` and
`npm run build`, then use:

```sh
node dist/cli.js capabilities --json
node dist/cli.js file src/invoice.ts --root /path/to/repo --project tsconfig.json --json
node dist/cli.js symbol src/invoice.ts calculateTotal --root /path/to/repo --project tsconfig.json --at 20:1 --json
node dist/cli.js changed --root /path/to/repo --base origin/main --head HEAD --project tsconfig.json --json
node dist/cli.js changed --root /path/to/repo --base HEAD --worktree --project tsconfig.json --json
```

The CLI accepts `--root`, `--project`, `--base`, `--head`, `--worktree`,
`--at LINE:COLUMN` (or paired `--line`/`--column`), `--json`, and the limit
flags `--depth`, `--max-nodes`, `--max-edges`, `--max-paths`,
`--max-output-bytes`, `--max-files`, `--max-file-bytes`,
`--max-total-file-bytes`, and `--max-diagnostics`. Unknown flags, missing values,
invalid coordinates, and impossible limits return a machine-readable
`INVALID_ARGUMENT` error.
The output limit is checked on the final serialized body in both JSON and
pretty-printed CLI modes; an over-budget formatted result returns
`OUTPUT_LIMIT_EXCEEDED`.

| Operation | Implemented meaning |
| --- | --- |
| `capabilities` | Reports languages, operations, relations, evidence vocabulary, snapshot modes, read-only/network policy, and draft status |
| `file` | Finds reverse module dependents in the selected project |
| `symbol` | Finds statically bound references and supported relation classifications for a declaration |
| `changed` | Compares two Git revisions, or a revision and the current worktree, maps changed declarations/files/configuration, and returns both snapshot identities |

`--project` is repository-relative. When omitted, exactly one configuration must
be discoverable. Missing or multiple configurations fail with an actionable
error. A project reference or separate test project is outside the selected
context and is disclosed rather than treated as workspace-wide coverage.
Unknown CLI flags and unknown JavaScript API limit fields fail with
`INVALID_ARGUMENT`. Repository-relative paths are canonicalized before lookup: dot and empty
segments are removed, while parent segments and NUL bytes return
`FILE_OUTSIDE_ROOT`.
Inline CLI values preserve embedded `=` characters. Comparison revisions are
trimmed consistently and NUL-containing revisions fail with `INVALID_ARGUMENT`.

## AI agent hosts and distribution

The repository includes [AGENT_GUIDE.md](AGENT_GUIDE.md) and the portable
[`skills/agent-change-impact/SKILL.md`](skills/agent-change-impact/SKILL.md).
The same skill file is intended for both [Codex skills](https://developers.openai.com/codex/skills/)
and [Claude Code skills](https://code.claude.com/docs/en/skills): copy it into
`.agents/skills/agent-change-impact/SKILL.md` or
`.claude/skills/agent-change-impact/SKILL.md` for a project-scoped workflow, or
the corresponding user directory for a personal workflow. The optional
`skills/agent-change-impact/agents/openai.yaml` supplies Codex UI metadata.

GitHub is the source distribution path: clone the repository, install its
lockfile, build, and invoke `node dist/cli.js`. npm is the package distribution
path: install `agent-change-impact` locally or globally and invoke the
`agent-impact` bin; the package also contains the guide and skill files. An
agent should check `npm view agent-change-impact version` when the registry and
GitHub checkout may be at different release stages. Neither distribution path
turns the analysis into a server or hosted service.

## JavaScript API and result model

`dist/index.js` exports `capabilities()`, `analyzeFile(request)`,
`analyzeSymbol(request)`, and `analyzeChanged(request)`, plus TypeScript types.
The draft machine-readable schema is
[`schemas/result-v0.1-draft.schema.json`](schemas/result-v0.1-draft.schema.json).
The smoke suite validates capabilities, success, partial, and error envelopes
with Ajv. JavaScript API entry points validate request objects and return
`INVALID_ARGUMENT` envelopes for malformed runtime inputs, including missing
required fields.

For package `0.1.1`, the schema and public API surface are unchanged from the
reviewed `0.1.0` draft boundary. A review using Ajv 8.20.0 validated
capabilities, file, symbol, changed, and error payloads with all-errors reporting
enabled. The schema `$id` and
`schemaVersion` intentionally remain `0.1-draft`; open `additionalProperties`
areas preserve forward-compatible draft fields. A future tightening or rename
requires a new versioned contract and fixture set.

The envelope contains `schemaVersion`, `ok`, `operation`, context/project and
snapshot identity, changed seeds or requested target, graph nodes/edges, direct
and transitive impact items, candidate tests, unresolved observations, analysis
scope/limits/stop reasons, and diagnostics. `ok: true` means a usable result;
`analysis.status` is independently `complete` or `partial`. A partial result can
contain useful evidence. An operation error is `ok: false` and carries a stable
error code and optional details.

Stored graph edges point from consumer to dependency. Reverse traversal reports
impact paths with seed attribution, distance, relation names, evidence levels,
and retained node IDs. Supported relations are `imports`, `reexports`,
`references`, `calls`, `extends`, and `implements`. `resolved` evidence is a
static binding in the selected context. Dynamic imports, non-literal `require`,
and literal modules that cannot be resolved are unresolved observations, not
invented edges. Candidate tests are filename-pattern classifications linked to
actual retained dependency edges; they never assert coverage or execution.
Provider unresolved observations are capped at the effective `limits.maxEdges`
before result projection. When observations are truncated, the result includes
`PROVIDER_OBSERVATION_LIMIT` and remains `analysis.status: partial` so callers
can distinguish a bounded observation set from a complete dependency inventory.
Diagnostic collection is capped at the effective `limits.maxDiagnostics` before
result projection. When file, project, or analysis diagnostics are truncated,
the result includes `DIAGNOSTIC_LIMIT` and remains `analysis.status: partial`.

Traversal tracks visited nodes per seed. Cycles therefore terminate without
duplicating graph nodes, and a depth limit is reported only when an unvisited
frontier remains beyond the configured depth. A complete result may contain an
empty direct and transitive impact when the requested target has no dependents.

Coordinates use one-based lines and UTF-16 columns with an inclusive start and
exclusive end. Paths are normalized repository-relative paths. Snapshot identity
is included on nodes and evidence so old locations cannot be mistaken for the
current checkout. A location selector must remain within the requested source
line; an out-of-range column returns `TARGET_NOT_FOUND` instead of being clamped
into another line. Diagnostics also retain snapshot identity and source range
when the same warning occurs in both contexts; snapshot-loader and project
configuration diagnostics are tagged before changed-result deduplication. Rename
mapping retains old and new paths; it does not infer semantic identity from a
matching name.

## Git comparison rules

- `changed` requires `--base` and exactly one of `--head` or `--worktree`.
- Endpoint comparison is used; no implicit merge-base calculation occurs.
- `--worktree` compares the base revision with current tracked contents and
  non-ignored untracked files. Staged and unstaged contents are read as one
  current state; ignored files are excluded.
- Base and head files/configuration are read from Git objects or the captured
  working tree. Deleted declarations are resolved in the base context.
- Modified ranges use old/new coordinates. Rename entries retain `oldPath` and
  both snapshot references.
- Configuration (`tsconfig.json`, `jsconfig.json`, `package.json`) changes are
  visible and produce a context-reassessment warning. A deleted or unusable
  selected project configuration is an explicit operation error.
- Missing refs, conflict state, and a worktree status change during capture are
  surfaced as Git errors/partial diagnostics. No fetch, checkout, reset, build,
  install, source write, external diff, textconv, clean-filter, or `core.fsmonitor`
  helper is performed. Worktree changes are collected from immutable tree/index
  diffs and raw file hashes; unstaged ranges use content-only diffs outside the
  repository attribute scope. A symlink is included only when its resolved real
  path remains inside the repository root; an escaping symlink is skipped with a
  diagnostic. Worktree discovery supplements Git's inventory with visible
  in-root symlink aliases, uses `lstat`, and falls back to directory identity on
  Windows when short and long path spellings differ. The API also accepts a
  repository root supplied through an internal symlink.

## Limits, errors, and dependencies

Defaults are depth 2, 100 nodes, 300 edges, one retained path per impact item,
1 MiB serialized output, 10,000 files, 2 MiB per file, 64 MiB total source, and
1,000 diagnostics. Hard graph caps are depth 5, 5,000 nodes, and 15,000 edges.
Hard input/output/diagnostic caps are 8 paths, 16 MiB output, 100,000 files,
16 MiB per file, 512 MiB total source, and 10,000 diagnostics. Retained provider
references, unresolved module observations, file edges, dynamic observations,
and diagnostics are capped before graph/result projection. Working-tree readers
also check the bytes actually read after the initial filesystem-stat check, open
the real path that passed the root-boundary check, and stop at the per-file budget
plus one byte before UTF-8 decoding. Git revision blobs use a bounded binary
subprocess buffer capped at `maxFileBytes + 1`, check the byte count before UTF-8
decoding, and report `FILE_BUDGET_EXCEEDED` on overflow. Permitted external
TypeScript declarations and module-resolution metadata use the descriptor reader
and re-check their real path before opening. The underlying TypeScript Language
Service reference lookup is not
independently cancellable in this adapter, so worker isolation and query-time
limits remain release work.
If a usable result cannot fit the byte limit, the API returns
`OUTPUT_LIMIT_EXCEEDED` rather than malformed JSON. All handled JSON CLI calls
write one JSON document; pretty CLI output is subject to the same final-body
limit. Exit code `0` is usable complete/partial, `2` is an invalid invocation,
and `1` is an operation failure.

Operation error codes defined by the draft API are `INVALID_ARGUMENT`, `ROOT_NOT_FOUND`,
`NOT_A_REPOSITORY`, `FILE_NOT_FOUND`, `FILE_OUTSIDE_ROOT`,
`LANGUAGE_UNSUPPORTED`, `PROJECT_CONFIG_NOT_FOUND`, `PROJECT_CONFIG_INVALID`,
`TARGET_NOT_FOUND`, `TARGET_AMBIGUOUS`, `GIT_ERROR`,
`OUTPUT_LIMIT_EXCEEDED`, `ANALYSIS_LIMIT_EXCEEDED`, and `INTERNAL_ERROR`.
The current implementation reports bounded work as a usable partial result with
diagnostics; `ANALYSIS_LIMIT_EXCEEDED` is reserved in the draft vocabulary and
is not emitted by the current provider.

Runtime dependencies are Node.js `>=22` and TypeScript `5.9.3`; Ajv is a
development-only schema-test dependency. The lockfile is committed. Node 18/20
are outside the v0.1 support contract until a separate compatibility decision
and runtime evidence lower the floor. The maintained Node 22/24 and
Linux/macOS/Windows CI matrix is configured in
`.github/workflows/ci.yml`. Local execution covers Node.js `23.10.0` on macOS
and Node.js 22/24 in Linux containers. Hosted run
[34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471)
passes all six Node 22/24 Ubuntu, macOS, and Windows jobs. The Windows
concurrent-content assertion remains skipped because the test harness cannot
intercept a `.cmd` shim through Node `execFile`. Package
`agent-change-impact@0.1.1` is published on npm; a clean registry install,
integrity, SHA-1 shasum, and npm signature checks pass. No provenance
attestation is present because the release used interactive authentication. See
[DESIGN.md](DESIGN.md) for ownership decisions and
[VALIDATION.md](VALIDATION.md) for release gates.
