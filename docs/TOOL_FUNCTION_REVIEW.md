# Tool function review

Review date: 2026-09-06. This is an evidence snapshot and design review, not a
replacement for the [roadmap](../ROADMAP.md), a release audit, or a standards amendment.

## Reconciliation notice

The assessment below preserves the earlier review snapshot. Later on 2026-09-06,
Hub reconciliation registered both confirmed repository URLs and Code Slice as
Experimental, resolving the registry-staleness finding for those observed facts.
Change Impact now has an active source/package scaffold; the earlier
documentation-only inventory below is historical, not its current implementation
status. [TASK.md](../TASK.md) owns current Hub work and
[VALIDATION.md](../VALIDATION.md) records the newer bounded source observation.
A subsequent owner notice confirms Code Slice delivery complete; npm metadata
confirms its recorded 0.2.0 release. See VALIDATION for this newer evidence. The
review below remains historical; protocol integration and artifact auditing are
still pending, and other tools await owner completion notices. On 2026-09-07,
Project Profile's current public source and npm artifact history were audited; its
implementation is admissible for `Experimental`, but the published `0.1.1`
executable has a known distribution defect and corrected source `0.1.2` remains
unpublished. See [VALIDATION.md](../VALIDATION.md) for the current evidence.

## Conclusion and evidence boundary

The ten-tool decomposition is useful when each tool owns one transformation from
explicit input to bounded evidence. The workflow diagram is a possible usage flow,
not a mandatory execution pipeline. The Hub must not schedule that flow.

Local inspection found:

- `AI-Agent-Tool-Code-Slice`: implementation present; clean checkout at
  `7f2969ff04540d43c12b13bc863e4a745209ff28`; local package manifest declares
  `agent-code-slice` version `0.2.0` and executable `code-slice`.
- `AI-Agent-Tool-Change-Impact`: documentation only. Initial inspection saw baseline
  `081cb635b7c4ca3ec198ac50f3b80416bf505805` plus eight untracked Markdown files;
  final inspection found those documents committed at `81b9e62` with a clean
  checkout. This review did not create that commit. No package manifest, source,
  CLI, or test harness was found in either inventory.
- `AI-Agent-Tools`: documentation foundation and local validator; no discovery CLI.
- The other eight proposed tool repositories were not present in the inspected
  sibling directory. Their functions below are design recommendations based on
  the supplied proposal, not implementation findings or proof of remote absence.

Git remotes confirm the two local tool repository identities under
`yapweijun1996` on GitHub. npm publication, current remote HEADs, CI run outcomes,
and the proposal's historical release-drift anecdote were not independently audited.
Proposed package and executable names must not be presented as published commands.

## Findings in priority order

| Priority | Finding | Consequence | Recommended action |
| --- | --- | --- | --- |
| P1 | Hub CLI/JSON requirements differ from Code Slice's existing contract and Change Impact's draft | One generic consumer cannot safely interpret all three as the same protocol | Preserve Code Slice compatibility; decide explicit versioned contract profiles or a reviewed migration before implementing composition |
| P1 | Partial evidence can look successful under existing/draft tool semantics | Exit code 0 alone can hide limited coverage | Require consumers to inspect completeness/warnings and refuse unsupported protocol versions; do not attach Hub conformance until mappings are tested |
| P2 | Registry still describes Code Slice as Planned and both local repository links as unknown | Discovery metadata no longer reflects the inspected local state | Register confirmed repository identities; consider Code Slice Experimental under Hub gates pending release/conformance review; keep Change Impact Planned |
| P2 | The proposal promises a minimum safe test set, root-cause understanding, and minimum required context | Deterministic extraction is confused with semantic sufficiency | Describe candidate tests, parsed diagnostics, and budgeted selected context; retain explicit uncertainty |
| P2 | Rules Resolve example omits an intermediate ancestor instruction file | A consumer can miss applicable repository rules | Define an explicit supported rule profile and test the entire ancestor chain |
| P2 | Release checks mix pre-publication requirements with post-publication reconciliation | Missing future tags/releases may incorrectly block preparation, or stale remote evidence may pass | Separate preparation checks from publication verification, with offline core and explicit remote evidence |

### Protocol evidence

The Hub [JSON standard](JSON_STANDARD.md) requires `schema_version`, `tool`,
`status`, `complete`, `data`, `errors`, `warnings`, and `meta`; its
[CLI standard](CLI_STANDARD.md#exit-codes) assigns incomplete analysis exit code 3
and withholds partial `data`.

Code Slice's `src/schema/envelope.ts` uses `schemaVersion: "1.0"`, `ok`,
`operation`, and `result`/`error`; CLI invocation errors use schema `1.1`.
`src/cli/index.ts` assigns ambiguity code 7, unsupported language code 4, and
output-limit code 8. `src/core/index.ts` returns successful outlines with
`OUTLINE_TRUNCATED`, and parse recovery can warn that results may be incomplete.
The bounded-outline success behavior was reproduced during this review.

Change Impact's `SPEC.md`, sections “Draft result model” and “Errors and process
behavior,” permits usable partial results with `ok: true` and exit code 0.
These are intentional local/draft semantics, not demonstrated bugs against those
tools' own contracts. They are integration gaps against the new Hub policy.
No tool contract or Hub standard was changed by this review. Proposed profiles
are not a currently implemented registry feature.

## Per-repository function assessment

### AI-Agent-Tools

**Function:** catalog and govern independent tools. Input is reviewed metadata and
release evidence; output is discoverable registry data and standards.

Keep registration, status, provenance, and discovery here. A future `list` or
`capabilities` command should read metadata. A proposed `doctor` must be explicitly
bounded: registry validation or opt-in local installation checks, not automatic
installation, repair, project execution, or agent orchestration. The dependency-free
Hub validator is maintenance tooling, not an implementation of that discovery CLI.

### AI-Agent-Tool-Code-Slice

**Implemented function:** turn a known file plus symbol/line/range selector into
source context. `capabilities`, `outline`, `symbol`, `line`, and `range` are present;
the JS API exposes `capabilities`, `outline`, and `slice` over the same core.

Host adapters are JavaScript, TypeScript, TSX, Python, and CFML. CFML embeds
CFScript, CFQuery, JavaScript, and CSS; standalone CSS is not a host adapter.
Range extraction is literal unless `--expand` is supplied. A line selects a
containing unit and can widen to the whole file; it does not always identify a
function. Ambiguous symbols return candidates instead of choosing silently.

Keep repository search, call graphs, test selection, and edits outside this tool.
Treat warnings and effective output size as part of consumption. Use explicit
`--root` when a caller requires a workspace boundary; the loader's root restriction
is optional, not a default sandbox. Package manifest identity is verified locally;
publication and Hub standards conformance are not established by this review.

**Acceptance focus:** exact source bytes and coordinates, ambiguity, embedding,
bounds, malformed input, and consistent CLI/API behavior. Existing tests cover
these areas; the results below are limited to this local environment.

### AI-Agent-Tool-Change-Impact

**Planned function:** turn a file, symbol, or explicit Git comparison into static
relationship evidence and reverse impact paths. Its repository already narrows
initial language scope to JS/TS/TSX with a TypeScript provider.

Keep resolved imports/reexports/references and supported call/inheritance edges,
bounded traversal, snapshot identity, and unresolved dynamic observations. A static
call reference does not prove runtime dispatch. Candidate test files may be exposed
with graph evidence, but command selection and runner behavior belong to Test Scope.
Code Slice should consume locations; it must not be a mandatory parser dependency.

**Acceptance focus:** first prove bounded project loading, target resolution, and
reverse module edges. Add richer symbol relations and Git snapshots behind their
own fixtures. Test aliases, cycles, ambiguity, deleted symbols, renames, changed
configuration, and missing dependencies before claiming useful changed-file impact.
All of this remains unimplemented in the inspected checkout.

### AI-Agent-Tool-Project-Profile

**Recommended first function:** inspect declared project metadata and return
observed languages, package manager evidence, scripts, entry points, and config
locations with source paths. Start with one well-defined package ecosystem, then
add data-only format adapters rather than claiming every manifest in the proposal.

A lockfile or `package.json` script is evidence, not authorization to run it.
Do not invent `typecheck`, assume `npm ci` without compatible lockfile evidence,
or choose silently when package managers/configurations conflict. Distinguish
declared commands from tested working commands. Report generated-file status only
from explicit conventions/configuration and label inference.

**Acceptance focus:** missing/contradictory manifests, multiple project roots,
malformed files, and malicious executable configuration. Never evaluate project
configuration or execute discovered scripts to produce a profile.

### AI-Agent-Tool-Test-Scope

**Recommended first function:** map explicit changed targets and declared or supplied
relationship evidence to candidate test files, reasons, and a supported runner's
invocation description. Prefer argument arrays with working directory and provenance
over shell command strings. Change Impact output may be an optional input artifact.

This tool owns selection policy; Change Impact owns relationship evidence. Neither
proves test coverage. Avoid “minimum safe verification”: unknown dependencies,
external consumers, mocks, setup files, or test configuration changes may require
a broader declared suite. Return inconclusive when no supported fallback is known;
do not invent `npm test -- file` for every runner or execute tests automatically.

**Acceptance focus:** runner argument semantics, shared setup changes, deleted tests,
tests outside source config, empty candidate sets, and explicit broader-suite policy.

### AI-Agent-Tool-Error-Lens

**Recommended first function:** parse bounded supplied output into diagnostics with
tool/error code, file, line, column, and supporting log spans. Start with a small
fixture-backed format set; the proposal's full language list is a roadmap.

Separate parsing, deduplication, and deterministic grouping from root-cause inference.
Do not guess a symbol from a line: emit the locator for Code Slice, or retain a symbol
only when the log itself supplies it. Unknown formats remain explicit. Redact secret
material and bound ANSI stripping and multiline handling.

The example pipeline can lose the test process's failure status if only the final
parser exit is checked. The caller must preserve producer and parser outcomes using
its supported shell/process API. Error Lens success means parsing completed, not that
tests passed or the first diagnostic is the cause.

**Acceptance focus:** mixed stdout/stderr, truncated logs, multiline errors, repeated
diagnostics, platform paths, and distinguishing no errors from unrecognized input.

### AI-Agent-Tool-Patch-Guard

**Recommended first function:** compare an explicit diff/snapshot pair against
explicit machine-readable scope and policy. Return policy findings with changed
locations and the exact rule that matched.

Natural-language “fix invoice total” is insufficient to deterministically decide
allowed files. Define allowlists, diff limits, generated/lockfile policy, and staged,
unstaged, untracked, rename, and deletion semantics. Debug/TODO/secret patterns are
policy matches or heuristics, not proof of defects or comprehensive secret detection.
Public export changes may trigger Contract Diff; compatibility analysis belongs there.

**Acceptance focus:** unauthorized paths, binary/renamed/untracked files, deleted
tests, policy exceptions, and redacted secret-like matches. Do not modify the patch.

### AI-Agent-Tool-Contract-Diff

**Recommended first function:** compare two explicit versions of a supported
declarative contract and report structural changes plus rule-based compatibility
classification. Start with one format, such as a documented JSON Schema subset;
defer arbitrary code, CLI, environment, and framework extraction to separate adapters.

Compatibility depends on consumer direction and policy: input/output schemas,
required versus optional fields, and open/closed objects differ. Adding an optional
function parameter is not equivalent to adding a required parameter. Unsupported
constructs need `unknown`/inconclusive classification; a bare `breaking: false`
cannot express missing evidence. Do not execute either revision to discover contracts.

**Acceptance focus:** requiredness, enums, unions, additional properties, input/output
direction, and unsupported schema features. Leave release approval to explicit policy.

### AI-Agent-Tool-Rules-Resolve

**Recommended first function:** enumerate applicable local instruction files for
an explicit target, root, and declared resolution profile, retaining ordering and
provenance. Define supported filenames, ancestor traversal, and reference behavior.

The proposal lists `AGENTS.md`, `src/AGENTS.md`, and `src/backend/AGENTS.md`, but
omits `src/AGENTS.md` from its result. Under the stated ancestor-inheritance model,
all three must be included unless an explicit profile explains the exclusion.
Rules may be relevant before reading or editing, not only late in the workflow.

Do not claim to reconstruct hidden system/developer instructions or universal
Codex/Claude precedence. Discovering rule files is distinct from deciding semantic
conflicts. Never follow referenced paths outside the allowed root automatically.

**Acceptance focus:** complete ancestor chains, nested targets, multiple supported
filenames, cycles, missing files, symlink escapes, and unsupported profile behavior.

### AI-Agent-Tool-Release-Guard

**Recommended first function:** validate release evidence for an explicit package,
source revision, version, phase, and policy. Report individual check outcomes and
missing evidence; readiness is scoped to that policy, not universal certification.

Separate pre-publication checks (manifest/lock consistency, changelog, artifact
inventory, supplied test evidence) from post-publication reconciliation (published
version, tags/releases, artifact identity). Remote npm/GitHub checks must be opt-in
or consume explicitly supplied snapshots with provenance and freshness. Missing
remote evidence is unknown, not a passing offline check.

Do not run lifecycle scripts implicitly through `npm pack`; inspect an existing
artifact or use an explicitly authorized, isolated preparation mode. Evidence must
identify the exact commit and artifact; an unrelated green CI run is insufficient.
Publishing, pushing, tagging, and editing remain outside the default function.

**Acceptance focus:** phase-sensitive requirements, version drift, stale/wrong-commit
CI evidence, mismatched package artifacts, unavailable remote state, and no side effects.

### AI-Agent-Tool-Context-Pack

**Recommended later function:** select, deduplicate, and assemble explicit tool
result artifacts for a caller-specified target and budget. Input must identify tool
versions, schemas, repository/source snapshots, relevance policy, and evidence scope.

Start with supplied artifacts rather than an execution graph. Reject mixed snapshots
or unsupported contracts; report omitted material and reasons. Define whether the
budget counts bytes, characters, or tokens; exact tokens require a pinned tokenizer.
If mandatory material exceeds the budget, fail explicitly rather than clipping it.

This is bounded context selection, not proof of the minimum context needed to solve
a task. Do not add automatic reasoning, persistent memory, parsing duplication, or
mandatory dependencies between all tools.

**Acceptance focus:** deterministic ordering, budget accounting including metadata,
duplicate source spans, mandatory-item overflow, incomplete evidence, and snapshot mismatch.

## Recommended ownership and sequence

Keep the agreed implementation order unchanged. Usage order can differ: Project
Profile and Rules Resolve may run early; Error Lens only matters when diagnostics
exist; Contract Diff and Release Guard depend on the task. No tool is a mandatory
step in every edit.

The key boundaries are relationship discovery → Change Impact; test selection →
Test Scope; source extraction → Code Slice; scope policy → Patch Guard; compatibility
rules → Contract Diff; release evidence policy → Release Guard; artifact selection →
Context Pack. Share versioned evidence contracts before considering shared code.
The existing roughly 3–5 mature-tool infrastructure gate remains appropriate.

Next, reconcile protocol and completeness semantics using executable success,
partial, ambiguity, and error fixtures. Preserve existing consumers through an
explicit compatibility decision. Then register inspected identities and proceed
with the Change Impact feasibility spike. This review does not silently promote
tools, amend standards, or implement the planned repositories.

## Validation performed and limits

- Code Slice `npm test`: 64 passed, zero failures; includes Golden Eval regression,
  JSON schemas, grammar integrity, source coordinates, ambiguity, and limits.
- Code Slice `npm run typecheck`: passed.
- Eight source-CLI smoke scenarios passed: capabilities, symbol, line, literal
  range, ambiguity, bounded outline, invalid invocation, and embedded CFML JavaScript.
  Each stdout parsed as one JSON document; stderr was empty in these fixtures.
- Reproduced ambiguity exit 7/schema 1.0, invalid invocation exit 2/schema 1.1,
  and bounded outline exit 0 with `OUTLINE_TRUNCATED`.
- Execution environment: local macOS, Node `v23.10.0`, existing installed
  dependencies. This is not a rerun of Windows/Linux CI, a supported-runtime matrix,
  a fresh package build, or an npm artifact installation test.
- Change Impact received document/inventory review only; no executable tests exist.
- The other eight tools received scope and contract review only.
- No source, tests, package metadata, or working changes in either tool repository
  were modified. Hub changes are this review and its README navigation link only.

Passing local tests establishes the covered Code Slice behavior. It does not resolve
the cross-repository contract gaps or establish production readiness for the ecosystem.
