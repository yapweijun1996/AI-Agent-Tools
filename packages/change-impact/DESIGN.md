# Design

Status: implemented v0.1 draft; declared-scope, artifact, hosted, and registry
gates pass for published package `0.1.1`. The prior `0.1.0` release and this
interactive `0.1.1` release have npm signature metadata and no provenance
attestation because they used interactive authentication.
Current implementation tree: `7cf02d0`.
Latest Windows path-boundary fix: [`0b72a83`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/0b72a83)
Latest documentation line-ending check: [`e85c573`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/e85c573)
Core implementation revision: [`8bb3651`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/8bb3651)
Latest package/verification hardening: [`273a344`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/273a344)
Latest release metadata validation: [`4d770e0`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/4d770e0)
Latest API limit validation: [`74563b1`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/74563b1)
Latest local release evidence: [`17020ad`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/17020ad)
Latest CLI/revision input hardening: [`ab27679`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/ab27679)
Previous documentation/clean-install evidence reconciliation: [`1a57175`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/1a57175)
Latest required API request validation: [`b1f6477`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/b1f6477)
Latest TypeScript compiler hygiene: [`473b4da`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/473b4da)
Latest provider observation bounding: [`32fd01a`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/32fd01a)
Latest diagnostic collection bounding: [`a0f148b`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/a0f148b)
Latest bounded source reads: [`149e0fa`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/149e0fa)
Latest validated real-path reads: [`dd212e4`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/dd212e4)
Latest bounded revision blob reads: [`2f3c482`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/2f3c482)
Latest snapshot diagnostic identity: [`0c8a130`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/0c8a130)
Latest internal symlink coverage: [`f9f904b`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/f9f904b)
Latest provider resolution read boundary: [`ba0538a`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/ba0538a)
Latest CLI formatted-output bound: [`c6296e4`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/c6296e4)
Latest installed artifact output-limit smoke: [`3472b13`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/3472b13)
Latest cross-platform snapshot path handling: [`6b1c9b5`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/6b1c9b5)
Latest platform-aware capture test harness: [`261c47a`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/261c47a)
Latest Git clean-filter isolation: [`c32634e`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/c32634e)
Last reconciled: 2026-09-07

This document owns architecture and design decisions. [SPEC.md](SPEC.md) owns
observable behavior, [TASK.md](TASK.md) owns execution status, and
[VALIDATION.md](VALIDATION.md) owns verification evidence. The implementation
and tests are the source of truth for what is currently supported.

## Implemented architecture

```text
CLI / JavaScript API (src/cli.ts, src/index.ts)
        |
Request parsing and validation (src/cli.ts, src/analysis.ts, src/util.ts, src/errors.ts)
        |
Impact orchestration (src/analysis.ts)
        +-- Immutable snapshots / Git comparison (src/snapshot.ts, src/git.ts)
        +-- Project context and Language Service host (src/project.ts)
        +-- Target/reference/module provider (src/provider.ts)
        +-- Reverse evidence graph (src/graph.ts)
        +-- Candidate-test projection and bounded result envelope
                     |
            TypeScript 5.9.3 Language Service + AST
```

The API builds a working-tree snapshot for `file` and `symbol`, or a base and
head snapshot for `changed`. `project.ts` parses one explicit or unambiguous
`tsconfig.json`/`jsconfig.json` and exposes only its readable source files.
`provider.ts` resolves bindings and module edges. `graph.ts` stores edges from
consumer to dependency and traverses them in reverse. `analysis.ts` combines
the graph, candidate tests, unresolved observations, diagnostics, scope, and
byte limits into the draft schema.

| Component | Owns | Does not own |
| --- | --- | --- |
| CLI/API | Input adaptation, JSON/exit-code behavior, public exports | Language semantics, Git mutation |
| Snapshot/Git | Versioned contents, working-tree inventory, endpoint diff, read boundaries | Symbol meaning or impact conclusions |
| Project context | Config selection/parsing, project membership, permitted local resolution | Runtime execution, dependency installation, test discovery |
| TypeScript provider | Target declarations, aliases, module resolution, references, supported relation classes | CLI formatting, Git comparison, coverage claims |
| Graph engine | Stable node IDs, edge direction, reverse traversal, paths, graph budgets | TypeScript AST or binding decisions |
| Result projection | Direct/transitive summaries, candidate roles, completeness metadata, output bounds | A second dependency model |

## Decisions

### D-01: Keep impact analysis and code extraction separate

The result contains repository-relative locations and relationships, without
source snippets. Code Slice remains an optional downstream reader; integration
is not installed or tested by this repository.

### D-02: Start with one configured project

The provider accepts one selected `tsconfig.json` or `jsconfig.json`, or exactly
one discovered configuration. JavaScript membership follows the config and its
`allowJs` setting. Multiple projects, project references, and configuration-free
workspace inference remain outside the advertised scope. Missing or invalid
configuration is an actionable error.

### D-03: Analyze changes against versioned contexts

`changed` reads Git objects for the base and head, or combines a base revision
with a two-read, content-hashed working-tree capture. A mismatch between the
reads is reported as partial. Deletions use base declarations; additions use
head declarations; modifications and renames retain both source identities.
No checkout or reset occurs. Current local packages may be used to resolve an
old snapshot, so historical dependency fidelity is a reported limitation.

### D-04: Make the evidence graph authoritative

Edges point from consumer to dependency. Reverse traversal produces impact items
with seed attribution, distance, relation classes, evidence levels, and a
retained node path. File requests use module edges; symbol requests use bound
references. Candidate-test lists and direct/transitive lists are projections of
the same retained graph. Visited nodes are tracked per seed, so cycles terminate
without duplicate nodes; depth is partial only when an unvisited frontier still
exists beyond the configured boundary.

### D-05: Separate relationship evidence from completeness

`resolved` means a static binding under the selected project context;
`syntactic` and `heuristic` are schema vocabulary for future providers, while
the current capability advertises only `resolved` and `syntactic`. Dynamic and
missing module targets are unresolved observations, never fabricated edges.
Graph limits, skipped files, config diagnostics, and unresolved observations
make a usable result `partial` while keeping top-level `ok: true`.

### D-06: Treat related tests as candidates

Files named `*.test.*`, `*.spec.*`, or under `__tests__` receive a
`name-pattern-candidate` role when they are reached by retained graph paths.
The result includes the dependency edge IDs and evidence levels. It does not
claim coverage, assertion reachability, or test execution.

### D-07: Separate discovery, resolution, and execution boundaries

Git supplies tracked files and non-ignored untracked files; project membership
then narrows the analysis set. `.git`, `node_modules`, `dist`, and `coverage`
are excluded from source inventory. Repository-relative paths are canonicalized
before lookup; dot and empty segments are removed, while parent segments and
NUL bytes are rejected. Symlink targets that resolve outside the repository
are skipped; targets that resolve inside it remain eligible source inputs.
Snapshot lookups follow the host filesystem's case semantics, and the
Language Service host preserves repository-relative paths for in-root symlinked
sources so lexical aliases remain analyzable on Windows as well as POSIX hosts.
The worktree inventory supplements Git's path list with internal symlink aliases
that are visible to the selected project. Symlink discovery uses `lstat`, skips
known generated/dependency directories and ignored paths, and accepts a target
only when its resolved identity remains inside the repository. On Windows, a
directory-identity fallback handles 8.3 short paths when lexical real-path
strings do not share the same spelling.
TypeScript
standard-library files and local `node_modules` may be read for static
resolution. Project and provider resolution callbacks share the bounded,
real-path-validated reader for permitted external metadata and declarations;
repository modules, config code, plugins, test runners,
automatic type acquisition, external diff drivers, textconv filters, and
`core.fsmonitor` hooks are never executed. Working-tree files are opened through
the real path that passed the root-boundary check, and permitted external
declaration reads re-check their real path before opening. Git commands disable
external diff/textconv, `core.fsmonitor`, and optional locks. Worktree change
collection compares immutable trees and the index, hashes raw working-tree
files with filters disabled, and runs content-only diffs outside the repository
attribute scope, so configured clean filters are not executed.

### D-08: Bound work before serialization

File count/bytes, graph nodes/edges/depth, retained reference results, unresolved
module/dynamic observations, diagnostics, and serialized output have deterministic
caps. Snapshot readers re-check the bytes actually read after the initial file-stat
check, and bounded descriptor reads stop at `maxFileBytes + 1` so a concurrent file
growth cannot force the full file into memory before the input budget rejects it.
Git revision blobs are captured through a bounded binary subprocess buffer capped
at `maxFileBytes + 1`; the byte count is checked before UTF-8 decoding and an
overflow is reported as `FILE_BUDGET_EXCEEDED`. Permitted external TypeScript
declarations and module-resolution metadata use the descriptor reader and the
same per-file budget after a real-path recheck.
The CLI applies the serialized-byte check after optional pretty formatting as
well as before it, so presentation cannot bypass the output budget.
Defaults are depth 2, 100 nodes, 300 edges, one retained path per impact item,
1 MiB output, 10,000 files, 2 MiB per file, 64 MiB total source, and 1,000
diagnostics. Hard graph caps are depth 5, 5,000 nodes, and 15,000 edges; hard
input/output/diagnostic caps are 8 paths, 16 MiB output, 100,000 files, 16 MiB
per file, 512 MiB total source, and 10,000 diagnostics.
Provider unresolved observations are retained within the effective `maxEdges`
budget before result projection; truncation emits
`PROVIDER_OBSERVATION_LIMIT` and keeps the result partial. Snapshot and project
diagnostic collectors retain at most the effective `maxDiagnostics` entries;
truncation emits `DIAGNOSTIC_LIMIT` and keeps the result partial. A stopped
frontier is partial; an output that cannot fit is a structured
`OUTPUT_LIMIT_EXCEEDED` error. The current TypeScript Language Service adapter does not expose
independent cancellation for its reference lookup; worker isolation and
query-time limits remain open CI-08 work.

### D-09: Keep reproducibility conditional and measurable

Snapshot IDs hash sorted repository-relative contents and revision identity.
Paths, one-based positions, edge ordering, path selection, and tie breakers are
stable for identical snapshots, configuration, provider version, and limits.
Timing, absolute paths, and random IDs are omitted from semantic output. Diagnostics
retain snapshot identity and source range when the same warning occurs in both
contexts; snapshot loaders and project parsing attach the producing snapshot
before changed-result diagnostics are deduplicated. The
smoke suite repeats requests and compares complete payloads byte-for-byte at the
object level. The hosted Node 22/24 matrix now passes on Ubuntu, macOS, and
Windows; this verifies the tested platform cases, while a general byte-for-byte
cross-platform equivalence guarantee is still outside the draft contract.

### D-10: Gate expansion on evidence

SCIP, CFML, Python, runtime tracing, full data-flow, workspace-wide indexing,
heuristic matching, and a dedicated `why` command remain deferred. A second
provider must establish its own project, coordinate, completeness, and budget
evidence before the public provider contract is broadened.

### D-11: Keep the v0.1 runtime floor explicit

The package targets Node.js 22 and newer, matching the maintained runtime lines
selected for this release and the configured Node 22/24 matrix. The
earlier proposal's Node 18/20 targets are not advertised by v0.1; lowering the
floor requires separate compatibility evidence and a deliberate support
decision. This keeps the published engine range aligned with tested behavior
instead of implying unverified historical runtime support.

### D-12: Freeze the reviewed draft contract for v0.1.x

The result schema, public TypeScript types, CLI/API operation names, and error
envelope were reviewed together against capabilities, file, symbol, changed, and
error payloads with Ajv 8.20.0. Those fields and enums were frozen for package
`0.1.0` and are carried unchanged by `0.1.1`, so downstream agents can rely on
one documented draft contract. The schema identifier and `schemaVersion` remain `0.1-draft` for compatibility, and
its permissive `additionalProperties` areas remain deliberate forward-compatible
draft behavior. Tightening or renaming the contract requires a new versioned
decision and fixtures.

### D-13: Distribute one host-neutral agent skill

The repository ships one open Agent Skills `SKILL.md` with the npm artifact and
GitHub source. Codex and Claude Code copy that same file into their documented
repository or user skill directories; Codex-only UI metadata stays optional in
`agents/openai.yaml`. The skill teaches agents to install and invoke the local
CLI, parse the draft envelope, and preserve partial-result limits. It does not
start a service or widen the analysis provider boundary. Keeping one
authoritative skill file avoids drift between agent hosts while leaving host
specific discovery paths to each integration.

## Review disposition

The original design review concerns are now covered by implementation and tests
as follows:

| Concern | Decision | Current evidence |
| --- | --- | --- |
| Deleted/renamed targets lose old evidence | D-03 | Changed modification, deletion, and rename cases in `test/smoke.test.cjs` |
| Module/configuration changes disappear | D-03, D-04 | Configuration and unsupported-file projections; unresolved module observations |
| Language Service ownership is overstated | D-02 | Config-bound host and feasibility note in [`spike/PROJECT_HOST_FINDINGS.md`](spike/PROJECT_HOST_FINDINGS.md) |
| Graph loses direction or paths | D-04 | Reverse file/symbol impact assertions, cycle/diamond traversal fixtures, and draft schema validation |
| Location selectors silently cross line boundaries | D-09 | Out-of-range columns return `TARGET_NOT_FOUND`; location disambiguation and boundary regression fixtures |
| Repository paths are not canonical or escape the root | D-07 | Dot/repeated-separator paths normalize to one repository-relative form; parent and NUL segments fail with `FILE_OUTSIDE_ROOT`; case-insensitive Windows snapshot lookup, internal source/root symlink aliases, Windows short-path identity fallback, and external symlink escape fixtures are covered |
| Evidence strength is confused with completeness | D-05 | Dynamic/missing module cases produce `partial` with observations |
| Imports are presented as test coverage | D-06 | Candidate role and dependency edge IDs are separate fields |
| Output caps do not bound work | D-08 | File/graph/provider/diagnostic/output limits are enforced before projection; high-fan-out unresolved observations, oversized external resolution metadata, and 20,000 oversized-file diagnostics emit bounded outcomes; cancellation and memory-isolation measurements remain deferred |
| Scan/read/execution boundaries conflict | D-07 | Git flags disable external diff/textconv/fsmonitor helpers, raw worktree hashing avoids clean filters, and content-only range diffs run outside repository attributes; symlink checks, unchanged-Git assertions, and offline/read-only API |
| Draft schema/API drift between surfaces | D-12 | Ajv 8.20.0 review covers capabilities, file, symbol, changed, and error envelopes; TypeScript types, CLI/API operations, release checks, and `0.1-draft` identifiers agree across the `0.1.x` package line |
| Agent hosts receive different instructions | D-13 | One packaged `skills/agent-change-impact/SKILL.md` is copied into Codex `.agents/skills` or Claude Code `.claude/skills`; the agent guide documents npm and GitHub installation paths |

## Open design questions

These are remaining investigations, not hidden implementation claims:

- Which project-reference and declaration-redirect arrangements can be supported faithfully?
- How should historical external declarations be supplied when the current local environment differs?
- Should a worker boundary be added for cancellation and memory isolation?
- Which additional module-widening rules are useful without inventing symbol callers?
- What cold-start and memory thresholds should become release gates?

The current release status and evidence are maintained in [TASK.md](TASK.md) and
[VALIDATION.md](VALIDATION.md). The bounded local resource observation is
preserved in [`spike/PERFORMANCE_FINDINGS.md`](spike/PERFORMANCE_FINDINGS.md).
