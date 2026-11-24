# Tool features map

Use this map to choose a tool by the question it can answer and to find the code that makes that decision. It describes the checked-in source at `a18ab98`: 19 implemented tool packages, the separate Hub CLI `ait`, and one planned registry entry. It is not a release inventory or a claim that every feature was run on every host. Use the [registry](../TOOL_REGISTRY.json) for lifecycle and recorded releases, package READMEs for invocation, and [validation](../VALIDATION.md) for dated observations.

## Choose by question

| When you need to know… | Start here |
| --- | --- |
| What does the repo declare? What files relate? What local instructions apply? | [Project Profile](#project-profile) for manifests; [Project Tree](#project-tree) for file relationships; [Rules Resolve](#rules-resolve) for directory precedence |
| Where is a declaration, what is its exact source, and who depends on it? | [Symbol Search](#symbol-search) for TypeScript locations; [Code Slice](#code-slice) for source text; [Change Impact](#change-impact) for reverse dependency paths |
| Is this CFML structurally supported, what does it link to, or does its markup follow our rules? | [CFML Check](#cfml-check) for nesting; [CFML Linkage](#cfml-linkage) for cross-file edges; [CFML Policy Check](#cfml-policy-check) for profile violations |
| What should I test? What went wrong? Do the recorded runs satisfy my requirements? | [Test Scope](#test-scope) recommends; [Error Lens](#error-lens) parses diagnostics; [Test Evidence](#test-evidence) checks acceptance |
| Does this patch meet policy? Does the new schema still accept old inputs? | [Patch Guard](#patch-guard) for the supplied diff; [Contract Check](#contract-check) for directional schema comparison |
| Is the host suitable? Does the deployment match the build? Did the observed UI meet its checks? | [Environment Doctor](#environment-doctor), [Release Guard](#release-guard), [Runtime Trace](#runtime-trace) |
| Which evidence fits my budget? Where can I persist it? | [Context Pack](#context-pack) selects from supplied artifacts; [Result Store](#result-store) is planned, not a storage backend you can call |
| How do I launch a tool or coordinate a foreground Git task? | [AIT](#ait) installs/dispatches a selected CLI; [Agent-Native-Git](#agent-native-git) owns stateful Git tasks |

**Read the result at the right level.** A process exit, a completed analysis, and a passing verdict are three different facts. For example, Patch Guard can exit `0` with `data.verdict: "violations"`; Test Scope can exit `0` with a partial plan. The [Hub JSON standard](JSON_STANDARD.md) withholds data on incomplete analysis, but it is not the native contract of every tool. No row above implies automatic chaining or permission to execute the next step.

## Repository discovery

### Project Profile

`agent-project-profile <root>` answers what the repository **declares**. It reads manifests, lockfiles, workspace declarations, and recognized config/CI/instruction markers. For Node it attaches scripts, entrypoints, manager and engine evidence to their owning directory. Python, Go, Rust, and Java markers identify ecosystems, not inferred run commands.

A declaration such as `agentProjectProfile.independentPackages: ["packages/*"]` yields a member inventory without inventing a workspace or inheriting the root package manager. Competing package-manager evidence can give a partial profile and exit `2`. Follow the evidence references and coverage fields; a discovered `test` script is not a successful run. [Profiler](../packages/project-profile/src/core/profiler.ts) · [Independent-package cases](../packages/project-profile/test/independent-packages.test.ts)

### Project Tree

`aptree` builds a file-level graph from a bounded root scan: file paths and digests, package/config markers, lexical local JS/TS imports, and test filename relationships. `context` returns the graph; `evidence` selects evidence nodes. `impact` walks **backwards** from the requested path through import/test edges; `tests-for` keeps the test nodes reached. `goals` and `progress` locate named documents; `path-to-done` supplies fixed suggested steps, not a computed completion verdict.

`changed` compares captured paths with Git HEAD objects without spawning Git. It does not inspect the staging index, and an incomplete HEAD capture cannot establish that a file is untracked. Use Change Impact rather than this lexical graph for a symbol-level change. [Queries](../packages/project-tree/src/query.js) · [Git adapter](../packages/project-tree/src/git.js) · [Scope tests](../packages/project-tree/test/git-scope.test.js)

### Rules Resolve

`agent-rules-resolve resolve` takes a root, target, target kind, and `agents-chain-v1`. It walks **every ancestor** from the root through the target directory. At each level the first nonempty file wins: `AGENTS.override.md` before `AGENTS.md`. An empty override falls back to the ordinary file; a nonempty override does not suppress instructions in other directories.

The result orders selected files from broadest to most specific, records hashes and ignored candidates, and includes text only on request. A new target file may be absent if its parent exists. References are not followed; an empty chain does not mean there are no host instructions. [Discovery](../packages/rules-resolve/src/input.js) · [Result logic](../packages/rules-resolve/src/index.js) · [Precedence tests](../packages/rules-resolve/test/rules-resolve.test.js)

## Source navigation and impact

### Symbol Search

`agent-symbol-search` takes a root and a name, file, or source position. It builds a TypeScript compiler project from an explicit config, the sole discovered config, or fixed fallback options if none exists. Multiple configs require selection. `search` ranks exact/prefix/substring names; `symbols` lists declarations in one file. `definition` and `references` use checker identity, including aliases, rather than matching every occurrence of the spelling.

`implementations` looks for explicit `implements`/`extends` and supported abstract-member overrides, not all structurally assignable values. Results are ranked **locators**, not source bodies. Inspect diagnostics and truncation: blocked dependencies or exhausted bounds can leave usable but partial matches. [Engine](../packages/symbol-search/src/core/engine.ts) · [TypeScript cases](../packages/symbol-search/test/typescript.test.ts)

### Code Slice

`code-slice` starts with **one known file**. A language adapter turns parser nodes into named units and original-source ranges for JavaScript, TypeScript/TSX, Python, or CFML, including supported embedded regions. `outline` lists units (optionally compact and paginated); `symbol` selects by name, with kind, occurrence, or `Owner.member` to disambiguate. Multiple matches without disambiguation yield candidates, not an arbitrary body.

`line` selects an enclosing unit, potentially the file; `range` is literal unless expansion or smallest-node selection is requested. Read `result.code` for the exact text and check recovery warnings and page metadata. A successful bounded outline need not list every symbol. This is extraction, not repository-wide search or semantic validation. [Selector logic](../packages/code-slice/src/core/slice-engine.ts) · [Adapter registry](../packages/code-slice/src/languages/registry.ts) · [Selector tests](../packages/code-slice/test/unit/slice-engine.test.ts)

### Change Impact

`agent-impact file|symbol|changed` finds static consumers in one selected JS/TS project. The provider records consumer-to-dependency edges; traversal reverses them to report direct/transitive dependents and evidence paths. For `changed`, Git supplies old and new ranges. The tool finds intersecting declarations in **both** snapshots, falls back to file seeds where appropriate, traverses each side, then merges the results. This keeps removed declarations from disappearing from consideration.

The output separates resolved edges, unresolved observations, candidate test files, and `analysis.status`. Dynamic targets, budgets, worktree drift, and historical resolution against current local dependencies limit the conclusion. Exit `0` can mean usable partial evidence; a reached test file does not prove coverage. [Snapshot analysis](../packages/change-impact/src/analysis.ts) · [Traversal](../packages/change-impact/src/graph.ts) · [Project filtering tests](../packages/change-impact/test/project-filtering.test.cjs)

## CFML analysis

### CFML Check

`agent-cfml-check check` reads one rooted `.cfm` or `.cfc`. A lexical scanner distinguishes code from strings and comments, tracks supported paired and standalone tags, checks branch ownership, and balances delimiters in supported script regions. For example, recognizing standalone `cfsetting` lets scanning continue; it does not validate the attributes. V1 returns located findings and a source digest on completion, including `violations` at exit `0`. Unsupported structure or exhausted bounds withhold v1 findings.

`inspect` has a **different v2 contract**: multiple explicit files, provisional findings, line filters, and before/after comparison. It still scans the whole file for context. If either side is incomplete, comparison cannot establish a new regression. Neither mode follows includes or executes CFML. [Checker](../packages/cfml-check/src/core/checker.ts) · [Comparison logic](../packages/cfml-check/src/core/inspect.ts) · [Inspection tests](../packages/cfml-check/test/inspect.test.ts)

### CFML Linkage

`agent-cfml-linkage analyze|index` admits a configured root, snapshots selected files, extracts facts with source spans, builds indexes, then resolves bounded relationships into a graph. Literal includes, CFC identities/calls, shared scopes, repository/action references, and selected web-flow or query facts have different resolution rules. Queries (`related`, `callers`, `callees`, `trace`, `unresolved`, `explain`, `stats`) operate on fresh analysis; `explain` looks up evidence for an edge.

Default `mixed` mode includes supported literal HTML structure. `--mode cfml-structural` restricts discovery to CFML sources and excludes ordinary HTML/web-flow analysis; it does not turn a dynamic include into a confirmed path. Inspect scope, unresolved records and diagnostics. The optional native Tree-sitter backend is not a prerequisite or proof of full grammar support. [Analysis stages](../packages/cfml-linkage/src/analyzer.js) · [Graph queries](../packages/cfml-linkage/src/graph-query.js) · [Analyzer tests](../packages/cfml-linkage/test/analyzer.test.js)

### CFML Policy Check

`agent-cfml-policy-check check` takes one root-relative `.cfm`/`.cfc` plus a local JSON profile. `checkSource` first decides whether the markup structure is knowable, then evaluates enabled direct-child rules: a table needs a direct `colgroup`; a `colgroup` needs a direct `col`. Comments and transparent `cfoutput` are handled explicitly. A nested descendant is not a substitute for a direct child.

An include or interpolated fragment can generate a table that is not visible in the source. The checker therefore returns `incomplete` even when no literal table was found, with a bounded cause and coordinates, not a false pass. Complete findings carry rule ID, severity, line and column; they say nothing about browser layout. [Parser and evaluator](../packages/cfml-policy-check/src/cli.js) · [Profile examples](../packages/cfml-policy-check/profiles) · [Policy tests](../packages/cfml-policy-check/test/policy-check.test.js)

## Test planning, diagnosis and acceptance

### Test Scope

`agent-test-scope discover|plan|explain` reads a root and, for planning, changed paths. It discovers candidate tests, package owners, runner conventions and scripts; maps changes using bounded imports and naming evidence; then ranks candidates and assesses risk. A helper under `tests/` can lead to its importing suite without itself being recommended as a test.

`minimum` selects among the strongest mappings; `recommended` adds relevant package commands, typechecking for TS changes when available, and builds for high risk; `release` retains wider gates including discovered root checks. `explain` exposes the evidence behind a recommendation. `--compact` only removes whitespace; `plan --summary` deliberately omits evidence bodies. No command is executed, and a partial result withheld by the output ceiling contains no usable plan. [Planner](../packages/test-scope/src/core/planner.ts) · [Mapping](../packages/test-scope/src/core/mapping.ts) · [Ownership tests](../packages/test-scope/test/import-ownership.test.mjs)

### Error Lens

`agent-error-lens parse --stdin` consumes caller-supplied stdout/stderr or structured artifacts. It validates byte limits, normalizes text while retaining evidence spans, then selects structured or text parsing. TypeScript, ESLint, and Vitest adapters recognize producer-specific diagnostics; generic text produces candidates rather than confirmed diagnoses. The parser deduplicates diagnostics, orders them, and redacts sensitive output fields.

A successfully parsed compiler error is a **parser success**, not a build success. Read `producerOutcome` separately from parser `status`, warnings, and truncation. The tool neither re-runs the command nor opens the cited source file to determine root cause. [Parse pipeline](../packages/error-lens/src/index.ts) · [Adapters](../packages/error-lens/src/core/adapters.ts) · [Normalization tests](../packages/error-lens/test/normalization.test.mjs)

### Test Evidence

`agent-test-evidence summarize|verify` consumes required checks, declared source/environment, selected runs, and Node reporter JSONL or unified JSON artifacts. It validates framing and count arithmetic, binds each artifact to its run, hashes its bytes, and compares source (including a dirty-worktree fingerprint when required) and exact OS/runtime/version. A run for another commit retains provenance but does not count as evidence about this one.

`summarize` explains failed, missing and inapplicable checks. Strict `verify` requires matching, completed, successful runs with nonzero tests and no skip/todo/cancellation. A proven matching failure takes precedence over another missing check; absent a proven failure, insufficient evidence yields incomplete with no data. A supported **failing** verdict still exits `0`. It never runs tests or authenticates the caller's declarations. [Acceptance logic](../packages/test-evidence/src/index.js) · [Normalization](../packages/test-evidence/src/normalize.js) · [Decision cases](../packages/test-evidence/test/core.test.js)

## Patch and interface policy

### Patch Guard

`agent-patch-guard check` reads an explicit Git unified diff and policy, not a working tree. It validates headers and hunk counts, classifies file operations, checks **both** paths of a rename, and tests literal content rules against added lines only. Path-local exceptions are recorded; they cannot waive a global file/line threshold. Findings contain rule IDs and locators rather than matched text.

A threshold violation is a completed finding; a parser limit or truncated hunk means evidence is incomplete. A binary-change marker cannot satisfy a content check even if binary changes are allowed. Inspect `data.verdict` and findings: a warning can coexist with `pass`. No patch is applied. [Diff reader](../packages/patch-guard/src/diff.js) · [Policy evaluation](../packages/patch-guard/src/index.js) · [Behavior tests](../packages/patch-guard/test/patch-guard.test.js)

### Contract Check

`agent-contract-check compare` implements registry ID `agent-contract-diff`. It selects before/after JSON Schemas, optionally by JSON Pointer, and asks **whether inputs accepted before are still accepted after**. It walks a draft-07 subset: types, required fields, properties/items, bounds, enum/const and additional properties. For example, removing a named property can still narrow acceptance if its values now fall under a stricter `additionalProperties` schema.

Supported broadening is compatible; narrowing is potential-breaking. Unsupported semantics such as `$ref` or composition remain unknown, even when textually unchanged. Changed root patterns can use isolated, bounded string samples to find a counterexample, not prove regex equivalence. Results carry constraint pointers and completeness; this is not response compatibility or full API conformance. [Comparator](../packages/contract-check/src/index.js) · [Pattern worker](../packages/contract-check/src/pattern-worker.js) · [Property removal tests](../packages/contract-check/test/property-removal.test.js)

## Host, deployment and UI evidence

### Environment Doctor

`agent-env-doctor check` compares requirements with a sanitized snapshot: Node/npm/Python/Codex presence or version ranges, configuration **names**, and requested path permissions. An optional manifest adds `engines.node`/`engines.npm`. Explicitly absent software fails a presence requirement; present software with no verified version cannot pass a version constraint. Each check cites expected and observed evidence. A known failure wins overall, but unknown evidence still makes the report incomplete.

Offline comparison runs no target program. `--live` explicitly enables fixed version probes on a trusted host; `--probe-paths` adds nonmutating access checks. Presence does not reveal a variable's value, and checking write access does not prove a future write will succeed. There is no repair step. [Comparison and collection](../packages/environment-doctor/src/index.js) · [Core tests](../packages/environment-doctor/test/core.test.js)

### Release Guard

`agent-release-guard deploy-verify` compares an expected commit/build/origin and asset hashes with sanitized CI, HTTP/cache, and optional browser observations. For each required check or asset it selects the **latest** observation relative to the caller's cutoff. A fresh mismatch fails. Stale, future, or contradictory same-time evidence is unknown; the verifier does not fall back to an older green observation. Cached responses need evidence about the cached entity, not just an HTTP status.

Results cite a bundle digest and input pointers. Even a matching server and browser leave installed-device update status unknown. Verification is offline; the separate `collect` command can make explicitly scoped GET requests to build a bundle. Neither path deploys, publishes, clears caches, or activates a worker. [Verifier](../packages/release-guard/src/index.js) · [Collector](../packages/release-guard/src/collector.js) · [Verifier tests](../packages/release-guard/test/core.test.js)

### Runtime Trace

`agent-runtime-trace ui-regression-check` evaluates explicit cases against a declared cutoff. It compares scroll width to viewport width plus tolerance; for **declared pairs only**, it measures axis-aligned intersection in both dimensions. Focus requires a complete observed sequence matching expected IDs. Back requires a complete, settled observation matching the expected route. A hidden/missing rectangle or an unsettled Back action is unknown, not a measured failure.

Results identify each check and its evidence pointers. An optional Playwright exporter reads geometry from a caller-owned page; it does not launch a browser or create focus/Back evidence. A pass covers those cases and viewports, not accessibility, backend writes, or general business-event correlation. [UI evaluator](../packages/runtime-trace/src/index.js) · [Geometry exporter](../packages/runtime-trace/src/playwright-export.js) · [UI tests](../packages/runtime-trace/test/core.test.js)

## Evidence assembly and stateful operations

### Context Pack

`agent-context-pack pack` takes a manifest defining one snapshot, priorities, mandatory items, artifact paths, and a UTF-8 byte budget. It checks declared snapshot consistency, tool identities and optional digests, and admits supported Hub major-1 result envelopes. It treats their `data` as opaque: packaging a completed Patch Guard result does **not** imply the patch passed policy. Native formats such as Code Slice's are not automatically adapted.

Selection is greedy: mandatory first, then priority descending, then ID. Exact artifact duplicates are omitted; optional items can also be omitted for exact duplicate locators. If an optional item does not fit, the tool still tries smaller later items. The budget covers the **whole envelope and final newline**, including omission reasons. Mandatory overflow fails without clipping. This is neither token counting nor proof of snapshot identity. [Assembly logic](../packages/context-pack/src/index.js) · [Budget and ordering tests](../packages/context-pack/test/context-pack.test.js)

### Agent-Native-Git

`angit` is a **stateful** Windows x64 package requiring exactly Node `24.21.0`. `init` registers an existing repo against an external owner policy. `Core.execute` checks repo identity, request and capability, then routes reads, idempotent metadata mutations, or a foreground execution session. SQLite stores tasks, events and authority; managed worktrees, leases and native supervision bind execution to approved profiles. An acknowledged stop is not proof that a process has exited.

The 13 implemented leaves are `init`, `doctor`, `status`, `task add/list/show/message/cancel`, `agent start/stop`, `run`, `worktree list`, and `snapshot list`. The five unavailable leaves are `worker start/stop`, `integrate plan/apply`, and `snapshot restore`. Foreground submission is not integration, and local fixture evidence is not provider certification. [Core dispatch](../packages/agent-native-git/src/core.ts) · [Execution session](../packages/agent-native-git/src/core/execution.ts) · [Native CLI contract](../packages/agent-native-git/docs/CLI_REFERENCE.md) · [Execution tests](../packages/agent-native-git/tests/execution.test.mjs)

### AIT

`ait` is the Hub entrypoint, **not a twentieth tool package**. `list` reads the selected registry. `doctor` checks recorded installations against package identity and executable containment without launching them. `install` requires an eligible pinned registry release, disables npm lifecycle scripts, and records state. `dispatch` requires separate `--allow-execution`, rechecks identity, invokes the declared executable without a shell, and wraps bounded native output. Only an exact catalog match selects a native validator; a wrapper is not a universal verdict or an OS sandbox.

Source `install-all` takes a different path: snapshot an explicitly selected source, check all package hosts, build with approval, pack and verify artifacts, and write launchers plus a receipt under a new prefix. It does **not** populate registry install state for `dispatch`, and its presence in source does not imply presence in published AIT `0.1.1`. [Dispatcher](../bin/ait.js) · [Source installer](../bin/install-all.js) · [Boundary tests](../tests/ait-boundaries.test.js)

### Result Store

`agent-result-store` is **planned only**: there is no package or confirmed executable in this checkout. Its [draft design](tools/AGENT_RESULT_STORE.md) proposes explicitly authorized persistence of sanitized immutable results, bounded retrieval and retention. Context Pack assembles supplied evidence for a task; it does not implement this store or recover bytes that a producer already truncated.
