# Validation and evidence

## CFScript tag-prefix false-positive repair (2026-10-09)

Three new API/CLI regressions reproduce the false tag-prefix diagnosis before
the fix, then pass with a single explicit `<` guard in `startsCfTag`. Ordinary
prefixed/embedded identifiers, property access, whitespace calls, CRLF, strings
and comments pass; actual paired/bodyless/unknown tag islands remain incomplete
at their source position. Windows Node 24.21.0 package tests pass thirty cases
with three explicit Windows skips and zero failures. Full `npm run verify` exited
zero with `NODE_OPTIONS=--throw-deprecation`: 968 Node tests (944 passed, 24 explicit
platform skips, zero failed/cancelled/todo), twelve Python tests, applicable
build/typecheck/lint gates, eighteen dry-run packs and eight packed consumers.

The documented explicit `install-all` route installed AIT and all eighteen tools
to a new isolated prefix containing spaces and `#`, preserving the old prefix.
Its receipt records HEAD `99a9c641817cc97902f1c7e1e7dce76975a02ed6`, a dirty local
snapshot with the requested fix, 918 source files, 26,005,499 bytes, and snapshot
SHA-256 `49a28eedce68967652b0707071edcd3f9c35a2530a4e154019e96bea449e4789`.
This is an uncommitted source snapshot, not the immutable HEAD alone. All nineteen
artifact/producer-lock/consumer-lock identities and Windows help launchers pass.
The installed compiled lexer matches the local build byte-for-byte.

The unchanged primary CFML matrix passes fifty-six commands and sixty-three
assertions, including actual ContentAdmin access-file read-back. Nine additional
identifier controls pass while the actual tag island remains incomplete. Forty
existing CFML Check/Policy Check JSON results match their pre-fix results exactly.
The access file and ORM bootstrap pass structural checks; the loader remains
incomplete because `cftry` is unsupported. Selected real source hashes and
ContentAdmin status are preserved. No application source was changed.

Final Hub/migration and tracked whitespace checks pass, retaining the immutable
import baseline and fifty-two explicit updates. Logs, new installation receipt,
installed matrix, native-output comparisons and final source/gate identities are
retained under `.cache/cli-usability/`. No wider grammar, Node 22/non-Windows,
optional native parser, publication, global-install repair or live Lucee/browser/
database acceptance is implied. The Windows symlink scenarios remain explicitly
skipped. This repair remains uncommitted; no push or release occurred.

## CLI fixes local commit and isolated installation (2026-10-09)

The owner selected A and B. Before staging, the twenty-three accepted file hashes,
original HEAD and zero staged files matched `.cache/cli-usability/final-acceptance.json`.
The focused local commit is `7645d4c21547f33b7f70809cce4de2eaffd0ff54`; its worktree
was clean before source acquisition. Git may normalize root Markdown line endings;
original executed byte identities remain in the acceptance record.

The documented local `ait install-all --from-path` route completed with explicit
build/experimental approvals in an isolated prefix containing spaces and `#`.
The receipt records that clean source commit, 918 copied files, 26,003,047 source
bytes and snapshot SHA-256 `5ba97db0c4d8e5dffc7f045e3ed13b1d79bdb26eb80dbd84e7acec93b4f1407c`.
Nineteen packages (AIT and eighteen tools) installed under Windows Node 24.21.0;
all nineteen native `.cmd` help launchers passed outside the source package
directories. Artifact SHA-512 integrity, installed producer shrinkwrap SHA-256 and
consumer lock SHA-256 independently matched every receipt entry. The copied Node
runtime executed, temporary installer `.work` was removed, and the receipt reports
no configuration changes or lifecycle-script execution.

Forty retained commands cover installed help, Code Slice exact UTF-8 extraction,
Change Impact import evidence, Project Tree, Project Profile, CFML Linkage JSON
alias equivalence/duplicate rejection, and Test Scope full/fitting/withheld/invalid
results. The fixture plan is 3,287 bytes; its 1,024-byte ceiling returns 475 bytes
with partial status, empty data and explicit RESOURCE_LIMIT. Fitting output and
stderr match uncapped output byte-for-byte. Code Slice's missing-command and
help/JSON rejection exits remain two. The actual installed Patch Guard accepts LF
and CRLF repair metadata and reports the forbidden path as policy violations.
Copied-runtime tests pass all three cases, detect one injected hidden-geometry
defect, then pass all three after restoration. Fixture production code is never
applied to ContentAdmin.

Initial harness attempts used a wrong executable name, resolved a relative Code
Slice path from the wrong working directory, normalized CRLF in a text assertion,
and assumed TAP was the default reporter. The final harness uses receipt/bin names,
an absolute file path, exact byte offsets and explicit TAP. These were corrected
test assumptions, not new product defects; initial logs are retained. Final logs,
commands, receipt identity and acceptance are under `.cache/cli-usability/`.
The isolated installation and fixture remain intentionally available for reuse.

The source-wide acceptance below remains applicable: no tool source changed after
it. This follow-up updates only TASK/VALIDATION, validated by Hub/migration and
whitespace checks. Native optional parsers, published-release AIT dispatch, GitHub
acquisition, global Project Profile repair, Node 22/non-Windows and live ERP are
unverified by this follow-up. No push, npm release, global install, shell profile
edit or ERP source/data change occurred.

## CLI usability and Windows patch framing (2026-10-09)

Local Windows Node 24.21.0 focused checks passed: eighteen package standalone-help
entrypoints, exact LF/CRLF patch policy equivalence, unsafe paths, rename and
no-newline metadata, source-text CR preservation, native JSON alias equivalence,
and Test Scope full/summary/compact output budgets. The smallest supported ceiling
counts UTF-8 and the stdout newline, withholds oversized data and bounds stderr
without mutating API results. Valid fitting output remains byte-identical; invalid
options reject before analysis. Replaying the original CRLF repair artifact now
passes; a 1,024-byte Test Scope ceiling emits an explicit 474-byte partial result
with no plan, while a 65,536-byte ceiling retains its full 3,552-byte fixture result.
These are single-fixture delivery measurements, not scan-time or token savings.

Full `npm run verify` exited zero on Windows Node 24.21.0 with
`NODE_OPTIONS=--throw-deprecation`: 965 Node tests (941 passed, 24 explicit platform
skips, zero failed/cancelled/todo), twelve Python tests, applicable build/typecheck/
lint gates, eighteen dry-run packs and eight packed consumers. Test Scope's four
schema baseline checks and documentation check passed. Final Hub validation passed
nineteen tools, fifty-four documents and 446 links; migration verification passed
698 imported files and forty-nine explicit updates with the import baseline intact.
Tracked/untracked whitespace and final diff checks passed. Logs, replay JSON and
source/gate identities are retained under `.cache/cli-usability/`.

These are local source changes with no new npm release, successful installer/
dispatch verification, Node 22 or non-Windows acceptance, or measured token/latency
benefit. The global Project Profile installation issue from the prior dry run
remains a separate installation problem. No ERP source or global installation was
modified.

## Test Scope summary local commit (2026-10-09)

The owner selected A: commit the verified seventeen-file summary and planning-guidance change locally. All seventeen accepted file hashes, root acceptance/gate logs and ledgers, forty-seven frozen-study/core/API file identities, measurement and cleanup records match the retained final manifest before staging. The original pre-commit manifest is preserved under `.cache/test-scope-summary/run-v7mp_izb/`. Existing full Windows Node 24 acceptance below remains applicable: only TASK/VALIDATION commit-stage prose changes after that readback. Final Hub/migration, staged content and whitespace checks cover this documentation and the exact commit scope. Git owns commit identity; original measured bytes remain in local evidence if Git normalizes text line endings. No push, publication, provider call or KB writeback is included.

## Test Scope planning summary and call guidance (2026-10-09)

The owner selected C: optimize tool calls and output costs. Primary retained command inventories show Test Scope emits 39,381 UTF-8 bytes across its two calls in each of the three math tool sessions. This motivated an explicit CLI presentation view, not a planning heuristic change. The [package contract](packages/test-scope/SPEC.md) owns summary semantics and [portable observations](docs/evaluation/TEST_SCOPE_SUMMARY_2026-10-09.json) retain exact samples, hashes and limitations. Local evidence is `.cache/test-scope-summary/run-v7mp_izb/`; no new provider-backed agent study is run.

- Windows Node 24.19.0: ESM/CJS typecheck and build passed. Six focused regressions cover every tied recommendation, all levels and metadata, immutable full API results, independent compact formatting, limits/deadlines, zero-test planning, boundary errors, invalid flags before analysis and changed-stdin input. An initial new assertion incorrectly expected partial for a zero-test plan; the existing native planner reports complete planning with `TEST_NOT_FOUND`. Only that regression assumption was corrected, preserving core behavior. Original failed test output remains local.
- The summary is CLI-only and declares `view: summary` plus omission of recommendation evidence when a plan exists. IDs, paths, commands, ownership, confidence, changes, risk, escalation, all diagnostics/truncation/statistics and native exits are preserved. Exact evidence counts and sorted unique types replace bodies; locations, details and individual evidence confidence remain in full/API output. A separate strict summary schema is distributed. Default result schema and API request/result types are unchanged.
- A frozen pre-change runtime and retained math trial-01 submitted-source snapshot provide seventy-seven files and one known changed module. Three repetitions of six formats give eighteen valid-schema outputs, stable stdout/stderr hashes, byte-identical old/current default and compact results, and identical decisions/limitations across full/summary views. Five negative schema controls reject wrong view, missing plan/omission, invalid diagnostic severity and commands marked executed. Source files are data; no fixture project code/test/script executes.

| Format | UTF-8 stdout bytes | Median process milliseconds |
| --- | ---: | ---: |
| Pre-change default | 35,214 | 148.26 |
| Pre-change compact | 20,171 | 138.12 |
| Current default | 35,214 | 138.13 |
| Current compact | 20,171 | 144.89 |
| Summary | 22,227 | 141.42 |
| Summary and compact | 13,960 | 139.84 |

Summary/compact removes 30.8% of compact bytes and 60.4% of default bytes on this fixture, retaining 1/10/10 tests and 1/11/12 commands across minimum/recommended/release. Status remains partial with unchanged diagnostics; truncation remains false. Summary is a declared projection; small plans can gain representation overhead. Timings are descriptive from three repetitions, not a general speed, token, billing or productivity benefit. Workflow guidance avoids redundant discovery for known-change planning and refreshes capability/help when executable/source identity or relevant options change; saved agent calls/tokens are unmeasured.

The first packed consumer passed actual tarball installation with `--ignore-scripts` into a directory containing spaces and `#`, with a throwing postinstall sentinel left unexecuted. Installed ESM/full API and summary CLI, extracted CommonJS and canonical/compact CLI compatibility passed. The separate schema, implementation and license are present. Final full `npm run verify` exited 0 on Windows Node 24.19.0 with `NODE_OPTIONS=--throw-deprecation`: 939 Node tests (915 passed, 24 explicit platform skips, zero failed/cancelled/todo), twelve root Python tests, applicable build/typecheck/lint gates, eighteen dry-run packs and eight root packed consumers. Test Scope passed 42 of 43 tests with one explicit POSIX skip. The final separate real installation, four schemas, docs and capability gates passed. Its 160-file benchmark measured 14.1 ms; coverage was 93.96% lines, 85.07% branches and 97.51% functions. Raw final gate logs and root ledger hashes are retained in `root-acceptance.json`; the earlier measurement is preserved separately, and the table above uses the final source run. The first full root run exposed a gate fixture that copied only three old schemas; copying the complete schema directory fixed it, and the original failure log remains retained. Six new summary regressions and both path-gate regressions pass. All 202 preservation checks agree across thirty-two frozen study files, fifteen core/API/package files, seventy-seven fixture files and seventy-eight copied runtime files. The real source repositories and main HEAD remain unchanged, with zero staged files. The verified owned temporary fixture/runtime directory was removed; local raw evidence remains intentionally retained. Hub/migration and tracked/untracked whitespace checks passed; no external documentation links were added. Forty-two explicit migration updates retain the immutable import baseline; six existing source-update records track the changed imported files. Node 22, macOS, Linux-native package storage and hosted CI are unrun for this change. Package identity/version/dependencies and release evidence are unchanged. No automatic commit, push, npm publication, provider call or KB writeback is included.

## Repair research local commit (2026-10-09)

The owner selected A: commit the verified seventeen-file repair research scope locally. Pre-staging SHA-256 readback matched every file in `.cache/repair-math/run-ipz65a88/final-manifest.json`, the original root verification log and all five gate ledgers, independent gate logs, primary audit and final identity/cleanup record. Full root acceptance below remains applicable because implementations, observed samples, frozen criteria and dependencies are unchanged; only TASK/VALIDATION commit-stage prose is appended. Hub/migration and staged whitespace/content checks validate the final documentation and commit scope. Git may normalize text line endings; original executed snapshots and byte hashes remain in the retained raw evidence directories. Prior dated uncommitted statements are preserved. Git owns the new commit identity and post-commit worktree state; no push, publication, provider call, production change or KB writeback is included.

## Isolated interleaved math repair (2026-10-09)

The owner selected B: stronger command read/Skill confinement and a second historical repair case. The [frozen protocol](docs/evaluation/REPAIR_MATH_PROTOCOL.md), [results](docs/evaluation/REPAIR_MATH_RESULTS.md) and [portable observations](docs/evaluation/REPAIR_MATH_OBSERVATION_2026-10-09.json) own registration, exact measurements and primary review. Raw evidence is retained at `.cache/repair-math/run-ipz65a88/`. Preparation failures `run-6q1dohbl/` and `run-a766mofa/` contain zero formal participants and retain their original captures; their owned temporary roots were removed. The initial boundary probe was archived into the successful evidence directory before its working directory was removed.

- Windows Python 3.13.7 controls Ubuntu WSL Node 24.19.0 / official CLI 0.161.0, requesting `gpt-6.1-sol` / `xhigh`. Six distinct fresh threads follow seed 20261011's tool/conventional interleaving; no participant was replaced or selectively repeated. Settings do not attest the backend model snapshot.
- Historical Markdown-Editor source `5214c9554f8b118fe60fa44ac563e5f785c410e4` passes twenty-one native tests but fails eleven of eighteen independent module cases. Selected reference `094478786ca427f82cab977c9f98a1e4cfd5bad6` passes twenty-three native tests and all eighteen cases. Controls exercise the actual module with controlled KaTeX/CSS loading; full browser and asynchronous revision acceptance are outside scope.
- A per-invocation profile denies root and temp reads, grants minimal runtime and explicit read-only dependency/tool paths, and disables command network. Eight enumerated optional local Skills are disabled without reading their bodies. Four native probe assertions and a fresh CLI preflight confirm permitted inside writes and denial of owned outside/ancestor sentinels and the enumerated Skill path. Existing execpolicy and managed controls remain active. Client authentication/service traffic, hidden instructions and other Codex surfaces are outside this command-sandbox claim. Current official permission/configuration documentation was fetched and reviewed; local probes establish the observed enforcement.
- Submitted native pass counts in trial order are 38/68/37/32/34/35, with all eighteen independent cases passing for each. Failures, skips, todo and cancellations are zero in final native and independent execution. Source/artifact bindings agree. Every tool participant invokes all four assigned analyzers, with final Patch Guard/Test Evidence pass; partial Test Scope selection never replaces native execution.
- Primary review covers all 124 completed commands and six submitted sources. Each arm has 3/3 correct repairs, adequate answers and workflows within the registered read/edit boundary. No outside-instruction/Skill/evaluator/history read, network, install, delegation, policy change or unrelated edit is observed. Failed and repeated in-session checks remain included in costs. Tool trial 5's direct import of transitive `entities` is recorded separately as an installation/declaration maintenance warning; frozen scoring is unchanged.
- Conventional/tool medians are calls 18/20, emitted UTF-8 bytes 71,696/97,687, input tokens 684,710/729,137, cached input tokens 632,064/667,392, output tokens 16,998/15,881 and CLI milliseconds 736,737.38/635,211.81. Tool time is 13.8% lower, input accounting 6.5% higher, bytes 36.3% higher and calls 11.1% higher. These are observed CLI accounting and wall times, not billing or full context telemetry. Three repeats, different implementations/tests, tool-first paired order and shared provider/cache state prevent a general or causal benefit claim. The first case remains separate.

All 182 copied tool files, original tool entry points, seven prior replay files and real source HEAD/worktree identities passed readback. Owned source/dependency/tool temporary copies were removed with junction-aware cleanup. Production packages, dependencies, versions, native scripts, registry/release state, migration baseline and earlier frozen studies remain unchanged.

Full `npm run verify` passed on Windows Node 24.19.0 with `NODE_OPTIONS=--throw-deprecation`: 933 Node tests, 909 passed, 24 explicit platform skips, zero failed/cancelled/todo; twelve root Python tests; all applicable build/typecheck/lint gates; eighteen dry-run packs and eight real packed consumers. Sixteen separate offline capture/study controls passed on Windows Python 3.13.7. The raw UTF-8 log and gate ledger hashes are retained in `root-acceptance.json` under the evidence directory. Hub validation passed with nineteen tools, fifty-four documents and 440 links; migration preserves 698 imported files across ten repositories and 42 explicit source updates. Both added external documentation links were manually checked against current primary sources, without treating link validity as execution evidence. Tracked/untracked whitespace and 103 artifact/frozen-input identity checks passed; Markdown-Editor and PWA-Queue-Now remain clean at their recorded HEADs. Node 22, macOS, Linux-native storage, full Linux Hub acceptance and hosted CI remain unrun for this study. This seventeen-file research scope is uncommitted; no push, publication, KB writeback or monitoring is included.

## Complete repair workflow pilot (2026-10-09)

The owner selected the opt-in historical module repair comparison, not a current application change. The [protocol](docs/evaluation/REPAIR_WORKFLOW_PROTOCOL.md), [results](docs/evaluation/REPAIR_WORKFLOW_RESULTS.md) and [portable observation](docs/evaluation/REPAIR_WORKFLOW_OBSERVATION_2026-10-09.json) own registration, measurements and separate primary audit. Local raw evidence is `.cache/repair-workflow/run-gfnnw503/`; failed preparation `.cache/repair-workflow/run-vk6xo4ux/` retains zero repair participants. Both owned temporary fixture/dependency roots were removed, with explicit cleanup readback. Current Markdown-Editor source and the four tool entry points remain unchanged.

- Ubuntu WSL Node 24.19.0 / Codex CLI 0.161.0: requested `gpt-6.1-sol` / `xhigh`, six distinct available participant threads and a separate successful write/test preflight. No backend model attestation is implied.
- Baseline native: 6 passed, zero failed/skipped/todo/cancelled. Independent baseline: 11 cases, 3 passed and 8 failed at the specified behavior boundaries. Historical source repair: 7 native and all 11 independent cases passed. Common producer and Patch Guard/Test Evidence contract controls passed.
- Submitted native counts: tool 16/16/16, conventional 15/18/17; each fully passed. All six submissions passed all eleven independent cases, with complete successful process results and unchanged source before/after. No browser/build, Node 22, macOS, full Linux Hub CI, business or broad security acceptance is claimed.
- Twelve offline Python capture/invariant controls passed on Windows Python 3.13.7: seven retained read-only controls and five writable-study controls. Node syntax checks passed for the independent fixture and producer. The older read-only capture helper is unchanged.
- Exact prompt/event/final-answer/stderr, reported usage, command inventories, submitted source, producer capture/diff and independent stdout/stderr hashes agree. Protected bytes and all file-change paths pass review. Original automatic evidence adequacy is 3/3 per arm. Separate primary review finds outside-instruction discovery in conventional trials 5 and 6; compliant complete-workflow counts are 1/3 conventional and 3/3 tool. No participant was replaced, and this is not a causal correctness improvement.
- Assigned medians: conventional/tool calls 21/26, emitted UTF-8 bytes 63,718/77,741, reported input tokens 308,835/386,757, reported output tokens 10,375/9,671 and participant seconds 267.947/271.422. Global instruction/Skill discovery, all-tool-first randomized order, cache and host/provider load, varying authored tests and a single compliant conventional sample limit efficiency comparison. Counts are executions, not unique tests/coverage; usage is not pricing.

Full Windows Node 24.19.0 root acceptance passed with deprecations configured to throw: 933 Node tests (909 passed, zero failed, 24 explicit platform skips), twelve root Python tests, eighteen dry-run packs and eight real packed consumers. The twelve additional offline capture controls are separate from those root Python tests. Raw verification log and gate hashes are retained in the evidence directory. Hub/migration and tracked/untracked whitespace checks passed, with 698 imported files across ten repositories and 42 explicit source updates unchanged. New links are internal, and no new external claim is inferred from link validity. Final source/tool/frozen-input hash and cleanup readbacks passed. Production packages, package dependencies/versions, native scripts, registry/release state and prior frozen studies remain unchanged. The eleven-file research scope is uncommitted; no push, publication, KB writeback or monitoring is included.

## Research evidence local commit (2026-10-09)

The owner selected a focused fourteen-file local commit of the completed research follow-on. The executed study and capture snapshots, portable/raw hashes, frozen baselines and recorded root-verification log were checked against the retained acceptance evidence before staging. Current development implementations and observations retain the verified content below; only TASK/VALIDATION commit-status wording is added. Git owns the commit identity and clean-tree readback. The earlier uncommitted statements describe the end of their dated verification stages. No native source/version/dependency/release change, push, publication or new provider call is included.

## Ubuntu capture and real-repository research (2026-10-08)

The owner selected A/B/C: retain the verified version, finish the independent CLI collection, and establish reliable real-repository observations. Windows read-only preflight remained policy-rejected. Existing Ubuntu WSL received task-local Node 24.19.0 and Codex CLI 0.161.0 from official checksum/integrity-verified archives without lifecycle scripts or global installation. Initial actual Ubuntu execution returned HTTP 401 despite login-status metadata. After owner login refresh, a separate one-file read completed with one paired command, matching answer/usage and no capture/policy errors. Mac-MCP metadata showed no permitted specified model or shell scope; no Mac workload/config changed. No policy was bypassed, alternate model used or authentication files copied/read by the harness.

The [Ubuntu results](docs/evaluation/CLI_RESULTS.md) and [portable record](docs/evaluation/CLI_OBSERVATION_2026-10-08.json) identify thirty fresh sequential sessions and one separate fresh blind grader at gpt-6.1-sol/xhigh. All source excerpts/path sets and six acceptance count sets are correct. Three assigned source-navigation participants never invoke Code Slice; costs measure assigned access, not actual Code Slice use. Original exact-string facts and 25/30 blind adequacy scores remain intact. A primary post-collection, conditions-known interpretation of the original six-field count/free-string contract records 27/30 adequate answers; it is not an independent replacement grade. Two conventional acceptance answers omit explicit unknown, one incorrectly labels skip FAIL; three tool acceptance answers preserve unknown. Grading ambiguity and treatment nonuse prevent confirmatory accuracy/causality claims. Tool-access medians do not show general input-token or latency savings.

The independently registered [real-repository results](docs/evaluation/REAL_REPOSITORY_RESULTS.md) and [portable record](docs/evaluation/REAL_REPOSITORY_OBSERVATION_2026-10-08.json) identify twelve further fresh sessions and one grader. Markdown source commit 6b74417e28cf31987df10a962e19c3d123e66439 supplies 82 selected files/238,879 bytes; Queue source commit d53054faee4df485211c0a244446b9b3113290cd supplies 21 files/38,511 bytes. Both checkouts were clean; every selected original Git-object byte hash is recorded. All twelve exact suite sets, blind adequate grades and static/runner limitations agree, with no unsupported completion claim. All six tool arms attempt plan; their input/output/time medians are higher on these narrow questions. One root-less capabilities error and nonzero rg outcomes remain captured. No project test/build/config executable was run. These selected subsets and three repeats cannot establish whole-repository generalization, statistical significance, billing cost or full workflow productivity.

Both studies and graders have forty-four distinct thread IDs. Complete emitted JSONL, final answers, stderr and process/argv records are local in .cache/agent-study/run-ks994pxu/ and .cache/agent-study/real-repositories-7t83a8__/. All forty-four prompt/event/answer/stderr identities match recorded hashes; tool/source/subset consistency and owned-fixture cleanup passed. All forty-two command inventories were manually reviewed with no observed tests, writes, installs, Git, network/MCP or outside evaluator/credential access. Emitted events do not authenticate all OS actions, hidden provider context or backend model state. Original Windows-controller CRLF prompt displays remain intact; thirty-one separate LF delivery artifacts match original stdin hashes. Before the second pilot the capture writer changed to exact UTF-8 byte writes. Six offline subprocess controls pass, covering newline identity, zero-exit policy rejection, truncated JSONL, ambiguous turns, unfinished/failed events and answer mismatch.

Auxiliary post-collection command-inventory readback used Windows default decoding for Unicode output text in real-pilot trials 5/8. Raw core captures already use explicit UTF-8, and measurements/command identities/exit fields are unchanged. Original derived inventories remain; a separate UTF-8 inventory has its own recorded hash. Current uptake readback now declares UTF-8, and an added Unicode event/final-answer control passes, bringing offline controls to seven. The six controls executed before that pilot remain part of its archived setup evidence.

Final full npm run verify exited 0 on Windows Node 24.19.0 with NODE_OPTIONS=--throw-deprecation: 933 Node tests (909 passed, 24 explicit platform skips, zero failed/cancelled/todo), twelve Python tests, all applicable build/typecheck/lint gates, eighteen dry-run packs and eight root packed consumers. Seven additional development capture controls passed separately; root native scripts are unchanged. The log is .cache/agent-study/follow-on-verify-node24.log; follow-on-acceptance.json records its SHA-256. Final Hub validation passed with nineteen tools, fifty documents and 415 links; migration preserved 698 imported files/ten repositories/forty-two source updates. Tracked/untracked whitespace, frozen baseline/portable/raw identity readback and owned temporary-input/bytecode cleanup passed. Intentionally retained task-local runtime and raw evidence live under .cache/agent-study/; no project/global install was changed.

Executed harness/design snapshots are retained with their original byte hashes even if Git normalizes source EOLs. Earlier Windows and host artifacts, frozen original manifest/observations and production/release identities are preserved. The added official Vitest include link was verified against its primary documentation; prior official non-interactive CLI documentation and actual installed help/events establish CLI behavior. Node 22, Linux-native storage, full Linux/macOS tool package acceptance, hosted CI and end-to-end implementation workflows are unrun. This section supersedes the old Ubuntu availability blocker, not the dated Windows/host limitations. Prior local commit 3a2ea43 is retained; follow-on changes remain uncommitted. No push, publication or KB writeback is included.

## Independent-agent artifacts and broader naming acceptance (2026-10-08)

The owner selected a local commit, independent-agent comparison and naming regressions. Three added tests bring the focused candidate/compact file to seven tests, all passed on Windows Node 24.19.0. The added examples cover twenty-seven paths (eleven retained, sixteen excluded) and three include/exclude combinations. Mixed Node/Jest/Vitest names, explicit test/spec precedence in support directories, declaration .d.ts/.d.mts/.d.cts exclusion, case-insensitive directory/stem matching with supported lower-case extensions, nested packages and prefix boundaries are exercised. Production source, package version, lockfiles and result schemas are unchanged from the prior refinement.

The [host design](docs/evaluation/HOST_PILOT.md), [answer observations](docs/evaluation/AGENT_RESULTS.md) and [portable artifact audit](docs/evaluation/HOST_PILOT_2026-10-08.json) identify twelve fresh sequential host participants plus a separate blinded grader. Both conditions identify the known five-suite set in all three answers. Conventional known answers use incorrect project-relative path formatting, so factual identification and contract adequacy are recorded separately. Unfamiliar answers identify both suites in three tool and two conventional artifacts. One empty-selection answer has a journal that changes the frozen input root and enumerates evaluator/trial metadata; attribution of its failure is unresolved. No answer claims test execution or pass. All deterministic suite/path checks agree with blind grades; method hints in prose and grading instructions instantiated after collection limit interpretation.

Six participant journals disagree with frozen setup output after line-ending normalization. The audit therefore withholds all aggregate command counts, output bytes, elapsed time and tokens. Registered input/source/runtime/protocol/prompt hashes passed read-back checks; these establish consistency, not authenticated action/transcript completeness. Two earlier setup attempts were excluded before the twelve attempts and retained separately. Owned fixtures were removed after checking the exact input hash. Local evidence is .cache/agent-study/host-pilot-urxbbuf2/; the portable record contains artifact hashes without raw transcripts. Model snapshot, full host sessions and usage are unavailable, and no error-rate, speed, token or repository-generalization claim is supported.

The separate [thirty-session CLI design](docs/evaluation/AGENT_STUDY.md) remains blocked: local execution policy rejected read-only input/analyzer commands. Six completed responses were classified unavailable and contribute zero performance samples; the owned seventh process/controller was terminated. The host injected an unauthorized MCP startup despite the requested ignore-user-config flag; no MCP task call occurred. No execution policy was disabled or relaxed. An offline positive/zero-exit-policy-rejection parser control passed without a provider call; the runner now stops on its first unavailable session, records stderr identity and avoids an accidental positional period in tool examples. Python syntax passed, but the full positive provider-backed runner remains unverified. Retained raw evidence includes the exact earlier harness/protocol snapshots under .cache/agent-study/run-cp6xkyof/.

Final full npm run verify exited 0 on Windows Node 24.19.0: 933 Node tests (909 passed, zero failed, 24 explicit platform skips), twelve Python tests, applicable build/typecheck/lint gates, eighteen dry-run packs and eight root packed consumers. Test Scope's native suite passed 36 of 37 tests with one explicit POSIX command-execution skip; the earlier separate real tarball consumer remains applicable because production source and the smoke harness are unchanged. The complete log is .cache/agent-study/root-verify-node24.log and local acceptance.json records its SHA-256. Final Hub validation passed with nineteen tools and forty-six documents; migration retained 698 imported files, ten repositories and forty-two exact source updates. Tracked diff and all fourteen untracked-file whitespace checks passed. The frozen original protocol/manifest/harness and refinement harness identities still match their records; two scoped .gitattributes entries preserve the original CRLF JSON bytes during staging/checkout. Owned input/experiment bytecode cleanup and source/runtime consistency checks passed. The only added external documentation link was checked against the official non-interactive CLI documentation and installed CLI behavior; it does not prove study completion. Node 22/Linux/macOS execution of this source refinement and agent study remains unverified. This section supersedes earlier statements that independent-agent answers were wholly uncollected, while preserving their dated measurement records. No push, publication or KB writeback is included.


## Test Scope candidate and output refinement (2026-10-08)

The owner selected the measured Test Scope follow-up. Source support-candidate heuristics and optional lossless `--compact` are specified by the [package contract](packages/test-scope/README.md). Four new meaningful regressions cover candidate precedence, ordinary directory tests, helper import reachability, CLI field/diagnostic/exit equivalence across operations, partial/truncated output and invalid compact forms. Windows Node 24.19.0 package checks passed: ESM/CommonJS typecheck, 34 native tests (33 passed, zero failed, one explicit POSIX-shell skip), schema/docs checks, a bounded 160-file benchmark at 49.2 ms, and the real tarball ESM/CommonJS/CLI consumer. No dependency or result-schema changes were required.

The [separate comparison](docs/evaluation/TEST_SCOPE_REFINEMENT.md) and [portable record](docs/evaluation/TEST_SCOPE_REFINEMENT_2026-10-08.json) pin the old source and all forty-three task files to `ef05d9a7cd270a0971dd9caa7fd8e0e52b48c40d`. The rebuilt baseline exactly matched the original measured runtime hash. Three repetitions per arm retained five minimum tests; recommended paths decreased from thirteen to five. Stdout was 57,693 bytes before, 36,947 after and 20,108 with compact formatting (65.1% combined reduction); stderr remained 610 bytes and status remained partial. All nine schema validations, repeated byte stability, compact/default deep equality and before/after source/input consistency assertions passed. Median process times were 112.32/96.79/95.46 ms, without a statistical significance claim; compilation is reported separately. Full evidence is `.cache/test-scope-refinement/run-Ar0vDk/`; the owned temporary fixture directory was removed. The original four-task protocol, manifest, runner and observation were not weakened or rewritten.

Final full `npm run verify` exited 0 on Windows Node 24.19.0: 930 Node tests, 906 passed, zero failed, 24 explicit platform skips; twelve Python tests, all applicable build/typecheck/lint gates, eighteen dry-run packs and eight root packed consumers passed. The log is `.cache/test-scope-refinement/root-verify-node24.log`; Test Scope's additional real tarball consumer gate passed separately. Final Hub validation passed with nineteen tools, forty-three documents and 377 links; migration verification retained the 698-file/ten-repository baseline and forty-two explicit source updates. `git diff --check`, whitespace inspection of all nine untracked files, portable/frozen/current rebuilt-runtime identity read-back and temporary fixture cleanup passed. No implementation changed after these checks; final TASK/VALIDATION synchronization changes evidence prose only. Remaining limits: these are unpublished local source changes with unchanged package version; naming heuristics cannot prove actual execution or exclude every support file. Compact output still repeats evidence and is about 35 times the earlier direct-import search output. Independent agent outcomes, token savings, total development latency and Node 22/Linux/macOS execution of this change remain unmeasured. No external links were added, commit/push/publication/KB writeback/provider call was performed.


## Local task-value evaluation (2026-10-08)

The owner selected a four-task value comparison. The [protocol](docs/evaluation/PROTOCOL.md), [input manifest](docs/evaluation/tasks.json), [observations](docs/evaluation/RESULTS.md) and [portable measurement record](docs/evaluation/OBSERVATION_2026-10-08.json) separate criteria, inputs, measurements and interpretation. Source is pinned to `ef05d9a7cd270a0971dd9caa7fd8e0e52b48c40d`; the real two-file installer patch is pinned to `5aaf567d4f207ef2e8a228d4072c2b26bceeb0e4`. The opt-in script passed on Windows Node 24.19.0: four task comparators, three sequential repetitions per arm, package output schemas, repeated tool byte stability, frozen Git/actual worktree byte identities, three navigation/patch controls and nine evidence controls. Source and evidence inputs were unchanged across analysis, and the temporary fixture directory was removed. Development evaluator corrections for CRLF checkout bytes, `rg` match order and independently mutable declaration objects preceded this recorded complete run; rejected development runs are not measurements.

Local evidence is `.cache/task-value-evaluation/run-GvfFHU/`; the portable observation contains exact samples, hashes and symbolic command locations without raw test logs. The real native collection took 2,185.18 ms and both TAP and JSONL reported 42 tests: 41 passed, one skipped, zero failed. Strict acceptance was unknown; the native zero exit did not establish all-required-tests acceptance. Source navigation reduced complete output from 9,423 to 5,748 bytes versus full reading; known-range `rg` was cheaper. Test Scope retained the five independently inspected direct tests but returned thirteen recommended paths, partial status and 57,693 stdout bytes versus 574 for direct-import `rg`, plus 610 stderr bytes. A historical protected-path finding completed with exit 0; it is a violation of the evaluation policy, not a claim about the historical change's authorization. All competent conventional baselines retained required evidence. Shortcut controls are deliberately defined counterexamples, not measured agent mistakes.

Final full `npm run verify` exited 0 on Windows Node 24.19.0: 926 Node tests, 902 passed, zero failed, 24 explicit platform skips; twelve Python tests, all applicable build/typecheck/lint gates, eighteen dry-run packs and eight packed consumers passed. The log is `.cache/task-value-evaluation/root-verify-node24.log`. Recorded runtime content hashes still matched after rebuilding. Hub validation passed with nineteen tools, forty-two documents and 362 links; migration verification retained the 698-file/ten-repository import baseline and thirty-nine explicit source updates. `git diff --check`, whitespace inspection of all five new files, observation/protocol/manifest/runner hash read-back, and temporary fixture cleanup passed. Superseded development run directories and the exploratory scope-output file were removed. The system-default Node 25.2.1 was explicitly rejected before execution as outside the supported experiment runtime. Final TASK/VALIDATION synchronization changes evidence prose only.

Independent agent trials, token savings, total development latency and error-rate/productivity effects were not measured. Node 22/Linux/macOS task-value replay remains unrun. No external links were added; package implementations/locks, native contracts, registry/release state, publication and monitoring remain unchanged. No commit or push was performed.

## Test Evidence private local MVP (2026-10-08)

The owner-selected plan is implemented in [packages/test-evidence](packages/test-evidence/README.md) as private `ai-agent-tool-test-evidence@0.1.0`, executable `agent-test-evidence`, Apache-2.0, with zero runtime dependencies. The registry is Experimental; npm identity, release version and release verification remain null. This is local implementation evidence, not owner-confirmed delivery completion, producer authentication, business correctness or a published release.

Final owning verification used Windows Node `24.19.0`, npm `11.6.2` and Python `3.13.7`. `npm run verify` exited 0 with 926 Node tests: 902 passed, zero failed, 24 explicit platform skips; twelve Python tests passed. All applicable build/typecheck/lint gates, eighteen dry-run packs and eight root packed consumers passed. The first full run exposed two AIT assertions retaining the previous registry size of eighteen; they now assert nineteen and preserve unpublished/noninstallable metadata checks for Test Evidence. A subsequent complete run passed. Final resource review refined descriptor allocation to admitted file size plus one growth-probe byte, avoiding 4 MiB retained allocations for tiny files; the final complete root run and focused Node 22/24 read regressions passed with that refinement. Existing native test scripts and root exit meanings are unchanged.

| Gate | Windows Node 24.19.0 | Windows Node 22.23.3 |
| --- | --- | --- |
| Test Evidence native, schema, CLI/API and reporter | 42 tests: 41 pass, zero failures, 1 FIFO skip | 42 tests: 41 pass, zero failures, 1 FIFO skip |
| Syntax/build and declarations | Passed | Passed |
| Real tarball installed outside repository under spaces and `#` | Passed | Passed |
| Installed CLI and Windows command shim, ESM API, reporter subpath, schemas, version and LICENSE | Passed | Passed |
| Disabled lifecycle execution | Passed with throwing consumer preinstall marker disabled | Passed with throwing consumer preinstall marker disabled |
| Explicit package-only reporter pilot | Producer and analyzer both 41 pass / 1 skip; strict result incomplete/unknown | Producer and analyzer both 41 pass / 1 skip; strict result incomplete/unknown |

Native evidence covers pass/fail/skip/todo/cancellation/zero tests/not-run/unknown process results; fail with missing checks; source, dirty-fingerprint and environment mismatches; duplicate/conflicting records; unsupported and truncated captures; suites, nested/concurrent same-name tests, file-load and real coverage failure; exact input-byte SHA-256; ordering and repeatability; count/depth/byte/anomaly/output bounds; strict UTF-8/BOM/duplicate-key handling; safe projected output; root traversal, directory/junction/device rejection; and descriptor substitution/read mutation. Case and output overflows withhold data. Frozen capture fixtures and installed draft-2020-12 schemas are independently validated with Ajv. The pilot checks its declared package-scoped source fingerprint before/after execution; no full-repository fingerprint or authenticated environment claim follows.

`python3 scripts/validate_hub.py`, migration coverage and `git diff --check` passed after final documentation reconciliation, together with explicit whitespace inspection of all forty-three untracked package files. Historical migration baselines and dated seventeen-package/eighteen-CLI evidence remain intact. Current inventory is eighteen package folders plus AIT; nineteen tools are registered, including planned Result Store. The new registry URL uses the existing owned monorepo, verified against the configured remote; the new package's hosted directory/CI is not claimed to exist before a separately authorized integration. Node's official cumulative-summary documentation was reviewed; actual Node 22/24 event fixtures establish this adapter's local behavior.

Logs, final source hashes and a compact acceptance summary are retained locally under `.cache/test-evidence-evidence/` (Git-ignored). Packed-consumer/pilot temporary directories, the downloaded Node 22 acceptance runtime and exploratory fixtures were removed. No npm publication, commit, push, deployment, KB writeback, telemetry or monitoring was performed during MVP validation. The owner subsequently selected a focused local commit. Implementation source matched the recorded acceptance hashes before this commit-status documentation update; only TASK/VALIDATION commit-status wording changed.

Limits: Linux/macOS execution and new hosted CI are unrun; the Windows POSIX FIFO fixture is explicitly skipped. The other twenty-three root skips retain their existing declared platform reasons. Node 22 compatibility was executed on 22.23.3, not every engine-range patch version. Root-wide Node 22 verification was not run; the complete new-package compatibility and installed-consumer gates were run on that runtime. Inputs/source/environment/process identities remain caller declarations; observed file consistency checks do not create an OS snapshot or authenticate a producer.

## Installed CLI correction commit (2026-10-08)

The owner selected a focused local commit of all seven installed-CLI corrections and their tests and documentation. Before the commit-status documentation update, the working tree exactly matched the recorded passing source snapshot `d9d3f83c6d80f1d417a3eb342c44d9c64f5dbcd56632bbd09790be930d8db17b`. Implementation files and tests are unchanged since the passing final Windows Node 24 verification below; only Hub commit-status documentation is added. Git owns the commit identity and thirty-file scope. Historical uncommitted states below describe the ends of those verification passes. No push, hosted CI or npm publication is included.

## Remaining P3 CLI corrections (2026-10-08)

Owner-selected P3 corrections are verified locally on Windows Node `24.21.0`, npm `11.19.0` and Python `3.13.7`. Code Slice now packs both maintained schema files. Its seven native E2E tests passed, including a fresh tarball installation under a path containing spaces and `#`; both installed schemas match source bytes and validate the installed CLI's success and JSON usage-error envelopes. No schema contents, JavaScript export subpaths, package versions or dependencies changed.

Change Impact and Symbol Search retain real installed Windows `.cmd` checks through explicit command-processor invocation without `shell: true`; their packed API/CLI and CommonJS/ESM regressions passed. The root verifier invokes npm's JavaScript entrypoint directly. A first strict full verification passed all 884 Node and twelve Python tests but failed seven additional root packed-consumer harnesses when `NODE_OPTIONS=--throw-deprecation` exposed the same DEP0190 pattern. Environment Doctor, Contract Check, Release Guard, Runtime Trace, Patch Guard, Rules Resolve and Context Pack now use the npm JavaScript entrypoint as well. Their existing assertions are preserved and temporary installed-consumer paths now include spaces and `#`. Focused root packing then passed all seventeen dry-run packs and seven consumers.

Final complete `npm run verify` exited 0 with `NODE_OPTIONS=--throw-deprecation`: 884 Node tests (861 passed, zero failed, 23 explicit skips, zero cancelled), twelve Python tests, fourteen applicable builds, fifteen applicable typechecks, six applicable lint gates, seventeen dry-run packs and seven root packed consumers. Final full verification, focused packing, Code Slice E2E and the two supplemental smoke logs contain no DEP0190. Hub validation, migration coverage and tracked/untracked whitespace checks pass; 698 imported files across ten source repositories remain covered by immutable baselines plus 39 explicit source updates. No external links were changed.

Raw strict failure evidence, final passing logs, per-stage results and a source snapshot summary are retained in `C:\Users\tno\AppData\Local\AI-Agent-Tools\p3-fixes-20261008-134124`. The preceding five fixes' 111 installed-CLI and 88 native-schema checks remain historical evidence, not a repeated all-CLI E2E run in this P3 pass. All seven originally reported findings now have verified local source corrections. Existing published Code Slice artifacts are not replaced; no commit, push or publication is included. Other operating systems, Node 22, hosted CI, skipped filesystem scenarios, optional native CFML parsing and live vendor/browser/deployment integrations remain unverified by this task.

## Installed CLI E2E corrections (2026-10-08)

Owner-selected corrections for the first five installed CLI E2E findings are verified on Windows Node `24.21.0`, npm `11.19.0` and Python `3.13.7`. The 29-test focused runtime check passed 27 tests with zero failures and two explicitly skipped filesystem-mutation cases. Full `npm run verify` exited 0 with 884 Node tests (861 passed, zero failed, 23 explicit skips), twelve Python tests, all applicable build/typecheck/lint, seventeen dry-run packs and seven packed consumers. Project Tree formatting and native smoke also passed.

A fresh isolated source installation records base commit `1f36ee3`, a dirty-worktree snapshot SHA-256 `009156631930c8a9426e59c01adf78959ffb3563646081a86d0f5f6db86346c7`, eighteen packages and a true Node-license-copy receipt. All 111 installed CLI E2E assertions passed in paths containing spaces, a hash delimiter and Unicode, from an unrelated working directory. AIT installs without npm_execpath, reports package version `0.1.1`, preserves profile/native findings and rejection exits, and retains the official adjacent Node LICENSE byte-for-byte. Project Tree refusals now produce bounded `aptree.error.v1` JSON; successful graph/query outputs remain unchanged. The installed Error Lens README uses an explicit private local-source installation workflow. All eighteen artifacts, consumer locks and installed identities match their receipt, and copied Node bytes match the verified source. All 88 checked native JSON structures passed their owning schemas; 23 text/usage/AIT/unmatched-envelope outputs are explicitly excluded, and optional format plugins are not loaded. Code Slice schemas still require the source checkout.

Historical import hashes remain unchanged; the explicit source-update manifest records 35 evolved imported files. The Code Slice schema-distribution gap and the two Windows smoke-harness DEP0190 warnings remain outside the selected five fixes. Other operating systems, Node 22, hosted CI, optional CFML Linkage native parsing and vendor-specific live agent/browser/deployment integration remain unverified by this task. These source fixes are uncommitted; no package publication, push or remote integration is included. Detailed local command outputs and receipts are retained under the isolated e2e-fixes validation directory.

## Local CLI validation corrections (2026-10-08)

Baseline: clean source `cbbf5f79b0554e115f742df11728cc1e5a504776`, Windows Node `v24.21.0`, npm `11.19.0` and Python `3.13.7`. AIT and seventeen tool CLIs installed successfully into an isolated prefix. Native root tests reported 848 passed, two failed and 22 skipped out of 872 Node tests; twelve Python tests passed. Both failures occurred while Patch Guard created symlink fixtures (`EPERM`). Separate pack execution passed seventeen dry-run packages and seven packed consumers. Seven additional check failures covered Change Impact historical Git references, Symbol Search engine/Git-path assertions, Project Tree formatting, and four Test Scope Windows path conversions. Code Slice's already-published-version refusal is a publication precondition, not a runtime test failure.

Owner-selected corrections preserve native tool behavior and independent package metadata. Test Scope check scripts use `fileURLToPath`, `pathToFileURL`, the invoking npm JavaScript CLI and Windows junctions. Patch Guard tests retain file-link assertions where creation is permitted, explicitly skip only permission failures on Windows, and exercise directory links and selected roots on this host. Change Impact verifies current Git evidence with repository-relative package paths; missing upstream revisions are accepted only from exact hash-matching immutable imported documents and are explicitly reported as not reverified against upstream Git. New regressions reject changed or unrecorded historical documents and changed package attributes. Symbol Search uses its actual existing Node engine contract and `git ls-tree --full-tree`; Project Tree changes are formatting-only.

Focused checks passed: all seven previously failing supplemental gates, including the real Test Scope packed ESM/CJS/CLI consumer and coverage gate. Twenty-two focused tests reported 21 passed, zero failed and one Windows file-link permission skip. Schema/document checks also execute from temporary package paths containing spaces and URL delimiters. Complete Windows Node `v24.21.0` root acceptance exited 0 with 877 Node tests (854 passed, zero failed, 23 explicit skips), twelve Python tests, all applicable build/typecheck/lint gates, seventeen dry-run packs and seven packed-consumer checks. The refreshed isolated source installation reports the dirty worktree snapshot separately from base commit `cbbf5f7`; all 35 installed CLI checks and eighteen package artifact/consumer-lock/identity integrity checks passed. Test Scope coverage passed at 92.68% lines, 82.88% branches and 96.39% functions. The installer receipt retains its original Node-license discovery status; the verified official distribution license is preserved beside the installed runtime with supplemental provenance. The explicit source update manifest records 31 evolved imported files; historical import hashes are unchanged. Other operating systems, hosted CI and the optional CFML Linkage native parser remain unverified by this local task. No package publication or remote integration is included.

Latest Hub review: 2026-09-16. The original source/release observations below are
dated 2026-09-06 and remain historical. This document owns the Hub's evidence
scope. Individual
tool test plans, dependencies, and release artifacts belong to their repositories.

## Audited source/release snapshots

The table below preserves the immutable source snapshots used for the recorded
implementation and artifact reviews. A changing public `main` branch is not a
replacement for those release-specific observations; the current remote-head and
CI observation is recorded separately below.

| Repository | Observed source state | What it establishes |
| --- | --- | --- |
| AI-Agent-Tools | Initial baseline `2f2d46e`; documentation and AIT runtime commits are recorded in Git history | Documentation foundation, local authoring checks, and the dependency-free `agent-tools@0.1.0` runtime; no independent tool source is copied here |
| AI-Agent-Tool-Code-Slice | Clean local `7f2969f`; manifest `agent-code-slice@0.2.0` | CLI/API and language adapters inspected; local tests from the preceding review apply to this same revision |
| AI-Agent-Tool-Change-Impact | Public `main` commit [`f298328`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/f298328d7035adce57fc57fdc36ac30da70a2a68); clean clone `npm ci`, typecheck and 36 tests passed; published `0.1.1` artifact smoke-tested in V-19 | Inspectable implementation with documented bounded impact analysis, read-only behavior and runnable tests; broader platform evidence and Hub conformance remain unverified |
| AI-Agent-Tool-Project-Profile | Public `main` commit [`c250438`](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/commit/c25043856cb4984e30d0a61672213e51b6c3758d); source manifest `agent-project-profile@0.1.2` | Implementation, tests, packaging, and local security checks inspected; npm `latest` remains published `0.1.1`, so the corrected source is not a released artifact |
| AI-Agent-Tool-CFML-Check | Public `main` commit [`d132a82`](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Check/commit/d132a82de4e2a764710e04968f8a480b8b6153c7); clean clone `npm ci`, typecheck and 22 tests passed; published `0.1.1` artifact audited in V-22 | Inspectable bounded CFML structural checker with fixtures, schema and package-surface tests; engine compatibility and full cross-platform evidence remain unverified |
| AI-Agent-Tool-Symbol-Search | Public `main` commit [`303c3b5`](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/commit/303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14); published `0.1.2` artifact audited in V-23 | TypeScript implementation, schemas, tests, packaging, capability, benchmark, and documentation checks inspected; Hub conformance and broader platform evidence remain unverified |
| AI-Agent-Tool-Test-Scope | Public `main` commit [`e3c4593`](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope/commit/e3c4593fb9b12233280dffd801a3c153ef9b3b1c); clean clone `npm ci`, dual typecheck/build and 17 tests passed; published `0.1.1` artifact audited in V-21 | Inspectable bounded verification planner with shared CLI/library engine and documented limits; Hub protocol conformance and broader platform evidence remain unverified |

At the earlier bounded Change Impact inspection, the scaffold contained `package.json`,
`tsconfig.json`, `.gitignore`, `LICENSE`, and `src/types.ts`, `src/errors.ts`,
`src/util.ts`, `src/snapshot.ts`. The manifest declared CommonJS, Node `>=22`,
TypeScript `5.9.3`, `@types/node` `22.15.30`, and package version `0.1.0`.
These are observed local declarations, not installed versions, tested compatibility,
or publication evidence. Types declare a `0.1-draft` envelope and limit defaults;
those declarations do not prove complete runtime enforcement. Snapshot code exists,
but its correctness/security tests were not executed in this Hub documentation task.
That historical working tree could change independently after inspection; the
current public commit and clean-clone audit are recorded above.

The canonical repository links listed in the audited snapshot table were checked
and opened successfully during their respective reviews. This establishes repository
identity/accessibility, not npm publication or current CI results.

## Current remote-head and CI observation - 2026-09-15

This is a bounded read-only observation of public `main` heads, package manifests,
and the GitHub Actions run associated with each exact head. It is not a release
certificate and does not replace the immutable source or npm artifact evidence above.

| Tool | Current public `main` | Manifest/package observation | Associated CI observation |
| --- | --- | --- | --- |
| Code Slice | `12411e9153282e0304a985c1007e0e4bad4fcf31` | Source package is `0.4.0`; npm `latest` is `0.4.0`, while the Hub's recorded reviewed release remains `0.2.0` | [Run 34551479033](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/34551479033) passed across its Windows/macOS/Linux Node matrix |
| Change Impact | `f298328d7035adce57fc57fdc36ac30da70a2a68` | Source package remains `0.1.1` | [Run 34551478970](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/actions/runs/34551478970) passed on Windows/macOS/Linux with Node 22/24 |
| Project Profile | `b711b7244e369e86038d8a6eb05de7de481c8f20` | Source package remains `0.1.2`; npm `latest` remains `0.1.1` | [Run 34826574214](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/actions/runs/34826574214) passed on Windows/macOS/Linux with Node 18.18/20/22 |
| Test Scope | `aa39505d646d1ddf376c4413f294e8e67d913748` | Source package remains `0.1.1` | [Run 34805729863](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope/actions/runs/34805729863) passed on Node 20/22; workflow matrix is not evidence for all three OS families |
| CFML Check | `afda57d711b8e57e05e4a03a52cf13faa0bbcdfd` | Source package remains `0.1.1` | [Run 34805721849](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Check/actions/runs/34805721849) passed on Node 18.18/20/22; this does not establish CFML engine compatibility |
| Symbol Search | `0e251c786edfd13e38f469289c5939e2acbdd39b` | Source package remains `0.1.2`; npm `latest` remains `0.1.2` | [Run 34805726939](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/actions/runs/34805726939) failed because the Documentation check failed on Ubuntu Node 22/24/26; package-smoke jobs passed on Ubuntu/macOS/Windows |

The Symbol Search CI failure belongs to the current public `main` snapshot; it does
not retroactively invalidate the separately audited published `0.1.2` artifact, but
it prevents treating current source/CI as clean evidence. The Code Slice `0.4.0`
observation likewise does not replace the Hub's exact `0.2.0` release snapshot.

## Code Slice completion and publication update

On 2026-09-06 the owner explicitly confirmed Code Slice completed and supplied its
repository URL. npm's [version metadata](https://registry.npmjs.org/agent-code-slice/0.2.0)
was read directly: `name` is `agent-code-slice`, `version` is `0.2.0`, repository
matches the supplied GitHub repository, executable is `code-slice`, and license is MIT.
The [npm package page](https://www.npmjs.com/package/agent-code-slice/v/0.2.0)
is recorded for discovery. This verifies publication identity; it does not equate
local hardening commit `7f2969f` with that published artifact or rerun package/CI tests.
The npm HTML pages returned HTTP 403 to the browsing tool; their page content was
not verified. Publication identity was verified through the accessible official
npm registry version endpoint above, not inferred from HTML link availability.

Delivery completion is recorded as Done. Hub lifecycle remains Experimental and
`verification` remains null because native/Hub contract conformance is unresolved.
The other nine tools are not marked complete; further updates await the owner.

## Project Profile implementation and release audit

On 2026-09-07, the public [Project Profile commit
`c250438`](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/commit/c25043856cb4984e30d0a61672213e51b6c3758d)
was inspected from a source archive. Its manifest declares `agent-project-profile`
version `0.1.2`, with the executable mapped to `dist/bin.js`; the repository
documents bounded, read-only profiling and a cross-platform CI matrix. The
[npm registry metadata](https://registry.npmjs.org/agent-project-profile) reports
published `latest` version `0.1.1`; version `0.1.2` was not present. A prior audit
installed the exact published `0.1.1` package into a clean consumer and recorded a
P0 distribution behavior: `--version` produced no output and returned exit code 0.
The 2026-09-15 exact-artifact re-audit below did not reproduce that symptom on the
current host; the discrepancy remains a release/platform evidence gap, not a reason
to silently promote the package.

The exact source commit passed `npm ci --ignore-scripts`, `npm run typecheck`,
`npm test` (31 passed), `npm run test:packaged-cli`, and
`npm audit --omit=dev --audit-level=moderate` (zero vulnerabilities). A local
`npm publish --dry-run --ignore-scripts` also produced a valid `0.1.2` artifact;
no publish action was performed. The exact published `0.1.1` tarball declares MIT
but contains no `LICENSE` file, which is a release-packaging gap under the Hub
Release standard. These results establish an Experimental implementation snapshot,
not a published `0.1.2` release or Hub protocol conformance.

## Change Impact published artifact audit

On 2026-09-15, `npm pack --ignore-scripts agent-change-impact@0.1.1` returned the
published tarball with 41 files, unpacked size 326,963 bytes, shasum
`4f3e5102f521e2c6a2830604f6a127d8b84f9554`, and integrity
`sha512-EWR7/JszMR/jswoNXh4kP4kdMrMhmHdQHPSn+NvX9890cp42F1o8ml3T0BZK7vXouYZzrOTRs8uRQKYbl21H3Q==`.
A clean temporary consumer installed that tarball with lifecycle scripts disabled.

The artifact produced `capabilities --json` with exit 0, `ok: true`, schema
`0.1-draft`, and operation `capabilities`. Against a temporary Git-backed
TypeScript fixture, `file --json` returned exit 0, operation `file-impact`, and
`analysis.status: complete`. A missing project configuration returned exit 1 with
`PROJECT_CONFIG_NOT_FOUND`; a missing file returned exit 1 with `FILE_NOT_FOUND`.
The initial non-Git target correctly returned `NOT_A_REPOSITORY` rather than
silently analyzing an unrecognized project. This verifies the package identity and
these bounded native behaviors only; it does not establish all operations, platforms,
Hub target-envelope conformance, or a verification snapshot.

One residual security/robustness concern remains: the scanner reports
`REPOSITORY_CHANGED` when file state differs across a read but still retains the
read buffer. The race itself was not reproduced, so this is recorded as a
fail-closed hardening and coverage item rather than a confirmed exploit. The
package metadata declares MIT, but the repository and dry-run package did not
include a `LICENSE` file; release readiness should address that packaging gap.

## Symbol Search implementation admission review

On 2026-09-08, the public [Symbol Search commit
`303c3b5`](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/commit/303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14)
was inspected from a source archive. Its TypeScript-only V1 implements bounded
`search`, `symbols`, `definition`, `references`, `implementations`, and
`capabilities` operations using the TypeScript compiler API. It documents explicit
non-goals for JavaScript, Python, and CFML adapters, full-source return, code
execution, network access, dependency installation during search, and repository
mutation. The repository includes maintained request/result/capability schemas,
security fixtures, and an MIT `LICENSE` file.

The source archive passed `npm run verify` (lint, typecheck, and 30 tests),
`npm run smoke:pack`, `npm run capability:check`, and
`npm run benchmark:check`. `npm run docs:check` reached its final Git evidence
check but could not inspect `HEAD` because the review used a source archive without
`.git`; this is an evidence-environment limitation, not a reported runtime failure.
The npm registry query for `agent-symbol-search` returned 404, so no npm identity
or release version is recorded. These observations satisfy Experimental admission,
not publication, Hub protocol conformance, or cross-platform certification.

## Hub checks

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-01 | Inventory and preservation | Hub contains no copied independent tool source or workspace; the explicitly authorized private `agent-tools@0.1.0` runtime is present; original `.gitattributes` preserved and sibling source left untouched |
| V-02 | Registry structure and lifecycle | Local validator checks exact authoring fields, unique IDs, lifecycle gates, versions, evidence/release matching, and replacement references; external behavioral evidence requires review |
| V-03 | Roadmap consistency | Validator parses the complete delivery table, rejects malformed rows, compares ordered IDs/names with the registry, and checks lifecycle vocabulary against Tool standard |
| V-04 | Document integrity | Required documents, inline local links/anchors, and fenced JSON syntax checked; task/epic/requirement references reviewed and checked separately |
| V-05 | Architecture and claim review | Human review separates current/target/future contracts, task status/lifecycle, local source/publication, and native/Hub protocol semantics |
| V-06 | Code Slice local evidence | Prior review on unchanged `7f2969f`: 64 tests, typecheck, and eight source-CLI scenarios passed on local macOS/Node `v23.10.0`; not a package install or cross-platform rerun |

Reconciliation checks pass with the current documentation and registry. Run the
commands below to reproduce authoring checks; use their current summary rather than
copying a stale document/link count into multiple files.

```sh
python3 scripts/validate_hub.py
git diff --check
```

`git diff --check` does not cover untracked files. During reconciliation, all Hub
Markdown, registry, and validator files were also checked for trailing whitespace
and final newlines, and `.gitattributes` was compared with HEAD. The validator's
added required-document coverage was exercised with a missing-document fixture.
The preceding review also exercised a valid Stable registry fixture and 15 invalid
registry/link/roadmap cases; those are historical checks, not a checked-in test suite.

## Unverified and pending

- Native-to-Hub profile/migration compatibility remains unverified; HUB-04 target-envelope consumer fixtures and completeness semantics are now checked in and passing.
- Code Slice exact packed artifact behavior, current remote CI, and Hub conformance:
  HUB-05. Its 0.2.0 npm identity is now confirmed, but no Hub verification snapshot
  is populated. Other tools' publication identities remain pending.
- Change Impact: broader platform evidence and Hub protocol conformance remain
  unverified; the clean-clone audit and V-19 published-artifact smoke passed.
- CFML Check: engine compatibility, CF-14 engine comparison, and full cross-platform
  evidence remain unverified; V-22 audits the published artifact.
- Symbol Search: Hub protocol conformance and cross-platform certification remain
  unverified; V-23 audits the published artifact, while the earlier source admission
  docs check limitation remains historical.
- Seven other planned tools: no local repositories inspected; no remote-absence,
  capability, release, or availability conclusion follows.
- Current User-tier KB parity for the reconciled 2026-09-15 records is verified by
  content readback; Company-tier visibility remains unverified and is not claimed.
- AIT remote registry refresh, package signatures, OS-level sandboxing, release automation, and shared tool infrastructure: not implemented.

The CFML Check tests were run in its independent repository; the Hub checks do not
establish an external release or engine compatibility and do not fix the remaining
gaps recorded in [TASK.md](TASK.md).

## Three-tool documentation review - 2026-09-07

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-07 | Expansion design and Hub integrity | Three detailed drafts define CF-01 through CF-14, RS-01 through RS-13 and RT-01 through RT-13; registry/roadmap append three Planned entries while preserving the original ten; local validator and whitespace checks pass |
| V-08 | KB synchronization at explicit User scope | Read existing KB, maintenance skill/rule, status schema, ecosystem and functional map; two Company-tier attempts returned 403 SHARE_TIER_DENIED with retryable=false and write_committed=false; after KB visibility read back as user, four detailed design parents, three new status records, and three existing index records were written at User tier and read back with exact content/digests and 13 status records; company-wide visibility remains unverified |
| V-09 | CFML Check feasibility slice | Independent local commit `9ce90e9b3c6e4ad03ee8171f31ce46c97a0f0837`; `capabilities --json`, `npm run typecheck`, `npm test` (17/17), CLI valid/misnested/unsupported JSON scenarios, and `npm pack --dry-run` passed on Windows 2026-09-07; CF-14 and cross-platform/engine evidence remain pending |

The [expansion review](docs/TOOL_EXPANSION.md) records SCMC design disposition,
cross-tool boundaries, evidence references and the correction to two overbroad
findings in the earlier conversational review. The validator now strictly parses
the roadmap table, and its checked-in standard-library regression suite covers the
current repository and the previously reproduced malformed-row gap.

New external reference links were opened/reviewed: Lucee cfif/tag-island syntax,
Adobe CFML comments, RFC 6901 JSON Pointer and OpenTelemetry trace concepts.
These references support design choices; no dependency was installed and no tool
runtime conformance was established. The retrieved Globe3 exact-draft readback
record is historical evidence; this task did not execute a business write.

The Company KB contains later Code Slice package observations; the Hub's recorded
0.2.0 release remains unchanged because later artifact behavior was not reaudited.
Change Impact and Project Profile status from the KB is explicitly scoped as
knowledge evidence. No additional delivery completion is inferred.

[KB synchronization](docs/KB_SYNC.md) and its pending payload record the exact
User-tier target, historical Company-tier failures, document digests, status record
updates and remaining scope. CFML Check's local tests do not change the Hub registry
lifecycle or the 40-case design evidence boundary.

## Symbol Search registration review - 2026-09-08

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-10 | Symbol Search Experimental admission | Public commit `303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14`; `npm run verify` passed with 30 tests, `npm run smoke:pack`, `npm run capability:check`, and `npm run benchmark:check` passed; npm lookup returned 404 and `npm run docs:check` could not inspect Git `HEAD` from the source archive |

The repository is therefore registered with confirmed GitHub identity and
`status: "Experimental"`, while `npm`, `release_version`, and `verification`
remain `null`. This records inspectable implementation evidence without implying
an npm release, Hub protocol conformance, or delivery completion.

## Validator regression review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-11 | Validator regression suite | `python -m unittest discover -v` passed 7 tests covering the current repository, duplicate/non-finite JSON, and malformed roadmap rows; Python syntax compilation also passed |

The suite is dependency-free and does not establish external URL availability,
external repository behavior, or Company KB synchronization.

## User-tier KB reconciliation review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-12 | KB reconciliation at explicit User scope | Read back the existing records, updated the two affected design parents, five status records (four existing plus the new Symbol Search record), Canonical SSOT, Functional Map and Tool Status Schema; all affected User-tier records read back with current content/statuses and the new ID `a94dac3b-9619-4dcc-89fb-025272afeb09`; Company-tier Code Slice update was denied with `SHARE_TIER_DENIED: above_scope` and was not retried or promoted |

The current normalized hashes read back for `docs/TOOL_EXPANSION.md` and
`docs/tools/AGENT_CFML_CHECK.md` are respectively
`139b0f4b8fdb3db10c833d2991649492f5885b7aa16add531d6920c5f6a81a52` and
`0606cc04dfa93f2891c9ba3289af132fb02881781b5540ee77ebc15938e590f0`.
This is User-tier synchronization only; the historical Company-tier receipt and
later independent package evidence remain separately scoped.

## Test Scope registration review - 2026-09-12

The public [Test Scope repository](https://github.com/yapweijun1996/AI-Agent-Tools/tree/main/packages/test-scope)
was read and its README, specification, design, task board, progress, epic and
roadmap were reviewed. The repository documents a deterministic, read-only V0.1
planner for JavaScript/TypeScript/JSX/TSX repositories with Vitest, Jest and the
Node.js native test runner. It states that `0.1.1` is published with dual ESM/
CommonJS entrypoints and provenance.

The official [npm registry metadata](https://registry.npmjs.org/agent-test-scope)
was queried directly and reports package name `agent-test-scope`, latest version
`0.1.1`, a repository matching the GitHub project, and an MIT license. This is
enough to record the canonical repository and package identities. The entry
is now `Experimental` because its implementation, documented limits and basic
tests were independently audited from a clean clone. The packed artifact,
native/Hub protocol conformance, and broader platform evidence remain unverified;
no `verification` snapshot is recorded.

## Planned-tool implementation admission audit - 2026-09-12

The three remaining Planned entries in the reviewed set were audited from clean
shallow clones. Test Scope commit `e3c4593fb9b12233280dffd801a3c153ef9b3b1c`
passed `npm ci --ignore-scripts`, dual TypeScript typechecks, build and 17/17
tests. CFML Check commit `d132a82de4e2a764710e04968f8a480b8b6153c7` passed
`npm ci --ignore-scripts`, typecheck, build and 22/22 tests. Change Impact
commit `f298328d7035adce57fc57fdc36ac30da70a2a68` passed `npm ci --ignore-scripts`,
typecheck, build and 36/36 tests; its test run took about 65 seconds and produced
no intermediate output, then completed successfully.

Each repository contains an inspectable implementation, documented scope and
limits, and runnable basic tests. These observations satisfy the Hub's
`Experimental` admission gate. They do not establish npm publication, Stable
cross-platform support, or native/Hub protocol conformance, so all three retain
`verification: null`.

## ait-tool/v1 dispatch spike - 2026-09-15

A proposed `ait-tool/v1` plugin contract (Company KB item
`fb9b80fa-bcfd-42d7-a5f4-5a6973ca7b7f`, status `PROPOSED`) describes a future
discovery/dispatch CLI that installs independently owned tools by manifest and
runs them as isolated child processes. A local, unpublished spike repository
(`AI-Agent-Tool-AIT`, first commit `9bebbd9`, outside this Hub and never
registered in [TOOL_REGISTRY.json](TOOL_REGISTRY.json)) exercised that
contract manually against `agent-code-slice` version `0.4.0` from a local
checkout, then was deleted after producing this evidence; the Company KB
record (`19883525-60d6-4fa2-ba74-d3b867a9b1d8`) preserves the same findings.

Observed: manifest schema validation rejects a manifest missing required
`ait-tool/v1` fields with exit `2`; `ait install --from-path` resolves the
package's declared `bin` entry and registers it without executing the tool;
`ait list` and `ait doctor` read that registration back; dispatching
`ait slice outline <file>` spawns `code-slice` as a child process with the
caller's working directory preserved, captures its native JSON on stdout, and
wraps it into an `ait-result/v1` envelope (`protocol`, `tool`, `ok`, `status`,
`data`, `meta`). A file-not-found case produced envelope `status: incomplete`
at exit `3`; an unsupported-language case produced `status: denied` at exit
`4`.

**Correction**: the note originally recorded here said these two exit codes
"happened to already match the `ait-tool/v1` table." Reading `agent-code-slice`'s
own documented exit codes ([CLI_CONTRACT.md](https://github.com/yapweijun1996/AI-Agent-Tools/blob/main/packages/code-slice/docs/CLI_CONTRACT.md)
in that repository) shows this was wrong: its exit `3` is documented as
"file/root/input error" (an invalid-input case) and its exit `4` as
"unsupported/ambiguous language" (an unsupported-input case) — neither matches
what those same numbers mean in the `ait-tool/v1` table (`3` = incomplete/
insufficient evidence, `4` = policy/security denial). The two numbers lined up
by coincidence; the categories they represent do not. See the dated comparison
below for the full picture. Native-to-Hub profile/migration reconciliation remains
unresolved; the target-envelope semantics are covered separately by V-14.

This historical spike established that the proposed dispatch mechanics were
implementable. At that time, `ait` was not approved, published, or conformant.
The Hub has since authorized and implemented a narrower dependency-free
`agent-tools@0.1.0` runtime with explicit install/dispatch approval. The spike did
not exercise real npm-registry installation, any tool other than `agent-code-slice`,
or filesystem/network sandboxing beyond environment-variable filtering.

## AIT runtime implementation review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-13 | AIT runtime acceptance | Local `agent-tools@0.1.0` implements `list`, `doctor`, pinned registry installation, controlled `--from-path` installation, explicit `--allow-experimental`, explicit `--allow-execution` dispatch, reduced environment, no-shell child process invocation, and `ait-result/v1`; the 7 AIT-runtime tests passed, and a temporary local package completed install/dispatch/doctor readback; real npm publication, remote refresh, signatures and OS sandboxing remain unverified |

The implementation keeps independent tool source and release ownership outside the
Hub. The package is private and unlicensed pending a release decision; no network
installation was performed during this validation. AIT remains `HUB-06 In progress`
until publication and the remaining security/compatibility policies are reviewed.

## HUB-04 exit-code comparison - 2026-09-15

To make `HUB-04` ("Resolve native/Hub JSON, exit, and completeness contracts")
concrete, this compares the target [CLI standard](docs/CLI_STANDARD.md#exit-codes)
against the exit codes two `Experimental` tools already document for
themselves, read directly from their own repositories (not inferred):

| Exit | Hub target ([CLI_STANDARD.md](docs/CLI_STANDARD.md#exit-codes)) | `agent-code-slice` ([CLI_CONTRACT.md](https://github.com/yapweijun1996/AI-Agent-Tools/blob/main/packages/code-slice/docs/CLI_CONTRACT.md)) | `agent-project-profile` (repository `README.md`) |
| ---: | --- | --- | --- |
| 0 | Complete supported analysis | Successful operation | Complete, usable profile |
| 1 | Execution or internal failure | Unexpected internal failure | Fatal failure; no usable profile |
| 2 | Invalid invocation, input, or configuration | Invalid CLI arguments | **Overloaded**: partial/unsupported profile, a strict-mode diagnostic, *or* invalid arguments all use this one code |
| 3 | Unsupported input, insufficient evidence, or resource limit | File/root/input error (closer to Hub's `2`) | Not used |
| 4 | Explicit policy or security boundary rejection | Unsupported/ambiguous language (closer to Hub's `3`) | Not used |
| 5-8 | Not defined | Parse/grammar error; selector not found; selector ambiguous; output/resource limit | Not used |

Two concrete, sourced findings, not an inference:

1. **The three schemes disagree on how many exit-code classes exist** (5 for
   the Hub target, 9 for `code-slice`, 3 for `project-profile`), and on what a
   shared number means. A numeric remap table alone cannot reconcile this: at
   least `code-slice`'s `3`/`4` need to swap categories relative to the Hub
   target, and `project-profile`'s single `2` would have to split into the
   Hub's `2` and `3` — but `project-profile`'s own JSON `status` field (not its
   exit code) is what actually distinguishes those cases today.
2. **`project-profile`'s exit `2` conflates "invalid input" and "incomplete
   result."** A caller cannot tell "you typed a bad flag" from "we produced a
   partial profile" by exit code alone; it must read the JSON body's `status`
   field. This means any Hub-conformant consumer (including a future `ait`)
   must treat exit code as a coarse ok/not-ok signal only and use the JSON
   envelope's own status/error fields as the semantic authority — which is
   already what [JSON_STANDARD.md](docs/JSON_STANDARD.md#consumer-rules) says,
   but this is now backed by two real, disagreeing implementations rather than
   the hypothetical fixture in that document.

This comparison remains evidence that native tools need explicit profiles or
migration; no mapping has been adopted and no tool's exit codes have changed. The
target contract is resolved without changing those native tools.

## HUB-04 target completeness review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-14 | Executable target-envelope consumer fixtures | `tests/hub_consumer.test.js` executes `tests/fixtures/hub-contract-tool.js` and verifies complete success with findings, partial/ambiguous/unsupported/limit outcomes, invalid/internal errors, null data for all non-`ok` statuses, malformed/missing/native envelope rejection, and exit/status mismatches; all 4 consumer tests passed as part of the 14-test Node suite. This verifies the Hub target contract only and does not establish external tool adoption or native protocol migration. |

HUB-04 target completeness semantics are therefore complete. Native tool
compatibility remains a separately scoped profile/migration decision under HUB-05
and future integration work.

## Code Slice native consumer profile review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-15 | Explicit Code Slice profile | `docs/profiles/AGENT_CODE_SLICE.md` records the registered `agent-code-slice@0.2.0` / `code-slice` identity, native v1.0/v1.1 envelopes, exit/error-code authority, bounded `outline` pagination, protocol-error conditions, and non-goals. `tests/code_slice_profile.test.js` executes a deterministic native-contract fixture for complete success, bounded success, CLI error, operation error, malformed/unknown output, and exit/status mismatch; all 3 profile tests passed. The source contract was observed at `7f2969ff04540d43c12b13bc863e4a745209ff28`; this does not certify the exact published artifact or promote Hub lifecycle. |
| V-16 | Explicit Project Profile profile | `docs/profiles/AGENT_PROJECT_PROFILE.md` records the source-observed `0.1.2` native contract, the registry/published `0.1.1` release mismatch, `complete`/`partial`/`unsupported`/`error` statuses, `coverage`, strict-mode behavior, and no-execution boundary. `tests/project_profile_profile.test.js` executes deterministic fixtures for complete, partial, unsupported, fatal error, strict rejection, malformed/unknown output, and status/coverage mismatch; all 3 profile tests passed. The source contract was observed at `c25043856cb4984e30d0a61672213e51b6c3758d`; it does not promote Hub lifecycle. |
| V-17 | Exact Project Profile `0.1.1` artifact re-audit | `npm pack agent-project-profile@0.1.1` returned 37 files, shasum `e837507faaa9dcbdfd97b70ddf00456cc985448a`, and the declared `dist/cli.js` binary. A clean temporary consumer installed the tarball with scripts disabled: `--version` exited 0 with `0.1.1\n`; a valid target produced `status: complete`/exit 0, mixed lockfiles produced `status: partial`/exit 2, and a missing root produced `status: error`/exit 1. The previously recorded no-output defect was not reproduced on this host; cross-environment reconciliation and `0.1.2` publication remain unverified. |

## Change Impact native consumer profile review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-18 | Explicit Change Impact profile | `docs/profiles/AGENT_CHANGE_IMPACT.md` records the published `agent-change-impact@0.1.1` / `agent-impact` identity, `0.1-draft` envelope, complete-vs-partial native success, error-code authority, bounded read-only boundary, and non-goals. `tests/change_impact_profile.test.js` executes deterministic fixtures for capabilities, complete/partial usable results, invalid invocation, output failure, malformed/unknown output, and exit/status mismatch; all 3 profile tests passed. The contract was observed at source HEAD `b67c87e277af3a616ec64ff8c1f34992f71aed88`; the sibling worktree was dirty and its uncommitted changes were excluded. V-19 separately audits the published artifact. |
| V-19 | Exact Change Impact `0.1.1` artifact audit | `npm pack --ignore-scripts agent-change-impact@0.1.1` returned 41 files, shasum `4f3e5102f521e2c6a2830604f6a127d8b84f9554`, and the recorded SHA-512 integrity. A clean consumer verified capabilities exit 0, a Git-backed TypeScript fixture's file impact exit 0 with `analysis.status: complete`, and bounded `PROJECT_CONFIG_NOT_FOUND`/`FILE_NOT_FOUND` exit-1 errors. The package identity and these native behaviors are verified; all operations, platforms, and Hub conformance are not. |

## CFML Check and Symbol Search native profile/artifact review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-22 | Exact CFML Check `0.1.1` artifact and profile | `npm pack --ignore-scripts agent-cfml-check@0.1.1` returned 25 files, shasum `a86b3e18c3c156720ed6b34df176fbb03d0b1926`, and the recorded SHA-512 integrity. A clean consumer verified capabilities exit 0, a valid check exit 0 with `status: ok`, and unsupported syntax exit 3 with `UNSUPPORTED_SYNTAX`. `docs/profiles/AGENT_CFML_CHECK.md` and its fixtures preserve the native envelope, structural-violation success, incomplete, and error semantics; the two native profile fixture tests passed; broader engine/platform and Hub conformance remain unverified. |
| V-23 | Exact Symbol Search `0.1.2` artifact and profile | `npm pack --ignore-scripts agent-symbol-search@0.1.2` returned 50 files, shasum `121d996f2fedee187cdfd7b56323ee533246a685`, and the recorded SHA-512 integrity. A clean consumer verified capabilities exit 0, a complete TypeScript symbol search exit 0, and a missing project error exit 1 with `INVALID_REQUEST`. `docs/profiles/AGENT_SYMBOL_SEARCH.md` and its fixtures preserve complete/partial/error native semantics; the two native profile fixture tests passed; broader platform and Hub conformance remain unverified. |

## Published artifact and platform follow-up - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-25 | Unified exact npm packlist audit | Exact published artifacts were packed read-only for Code Slice `0.2.0` (58 files, shasum `73965ce77072b370370555c129fbde7f19499858`), Change Impact `0.1.1` (41 files, `4f3e5102f521e2c6a2830604f6a127d8b84f9554`), Project Profile `0.1.1` (37 files, `e837507faaa9dcbdfd97b70ddf00456cc985448a`), Test Scope `0.1.1` (88 files, `4830019255560757357aace1dbabadcab0a46837`), CFML Check `0.1.1` (25 files, `a86b3e18c3c156720ed6b34df176fbb03d0b1926`), and Symbol Search `0.1.2` (50 files, `121d996f2fedee187cdfd7b56323ee533246a685`). All six exposed a README, declared executable and package contract material (with schema files where the package publishes them); Project Profile's exact artifact declares MIT but omits a `LICENSE` file. Code Slice's extract-only CLI attempt was not treated as a runtime result because its declared `web-tree-sitter` dependency was not installed; dependency-installed artifact smoke remains unrun. This is packlist/identity evidence, not full runtime or security certification. |
| V-26 | Current public source/platform observation | `git ls-remote`, package manifests, and associated GitHub Actions runs were checked for all six published identities. Five current heads had successful associated CI; Symbol Search current `main` failed its Documentation check on Ubuntu Node 22/24/26 while package-smoke jobs passed on all three OS families. Code Slice current `main`/npm latest is `0.4.0`, not the Hub's recorded reviewed `0.2.0`; Project Profile current source remains `0.1.2` while npm latest remains `0.1.1`. Current-head observations do not replace exact release evidence. |
| V-27 | AIT packed-consumer release gate | The initial `agent-tools@0.1.0` dry-run contained five files and an extracted default `ait list --json` failed with exit 1/`READ_FAILED` because `TOOL_REGISTRY.json` was absent. `package.json` now includes that snapshot and a regression test protects the inclusion. A post-edit packed-consumer smoke packed six files and verified `ait list --json` exit 0 with 14 tools plus `ait doctor --json` exit 0. The package remains private/`UNLICENSED`, and no publication was performed. |

| V-28 | Registry signature/provenance boundary | npm registry metadata exposed one `dist.signatures` entry and a `dist.integrity` value for each of the six audited tool versions. `npm audit signatures --json` on the dependency-free Hub returned `found no installed dependencies to audit`; no independent key-trust or provenance verification was claimed. AIT's policy therefore uses registry-native integrity/signature evidence when available and does not introduce a custom signature layer. |

| V-29 | User-tier KB audit follow-up | Project Profile and Symbol Search status records, plus the Canonical SSOT and Functional Map, were updated in place with the current audit facts; the Canonical SSOT Symbol Search publication/current-CI metadata was corrected; readback returned updated content/metadata at User tier. No Company-tier promotion was attempted; `SHARE_TIER_DENIED: above_scope` remains the separate company-scope blocker. |

## AIT public-release candidate audit - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-30 | AIT public-release candidate | `agent-tools@0.1.0` now removes the private flag, declares Apache-2.0, includes `LICENSE`, and records the verified GitHub repository metadata. `npm publish --dry-run --access public --ignore-scripts` passed with seven package files: LICENSE, README, registry snapshot, CLI, runtime documentation, profile catalog, and package manifest. Node tests passed 29/29, the Hub validator passed, the dependency tree is empty, and the CycloneDX SBOM reports no components. Actual npm authentication, publication, and post-publication registry read-back remain unverified. |

## AIT npm package identity update - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-32 | AIT package rename for public publication | The public `agent-tools` name is owned by another npm account. The selected replacement `ai-agent-tools` returned 404 from the public registry, so `package.json` now uses `ai-agent-tools` at version `0.1.0` while retaining the `ait` executable. Apache-2.0 metadata, the seven-file packlist, local tests, and Hub validation remain applicable; publication and post-publication read-back are pending. |

## AIT public npm release - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-33 | Published AIT package and consumer read-back | `ai-agent-tools@0.1.0` published successfully with public access. npm read-back reports `latest: 0.1.0`, Apache-2.0, the verified GitHub repository, and integrity `sha512-RbXH0SApdawfbgsCPpO/R3kCvO93mxeY9naRvPESufYjDXlHkfpDPtUP3JVJtQPpf+O9Xooeo9yZc3O/15ZlFQ==`. A clean temporary consumer installed the package with scripts disabled; its packaged `ait list --json` reported 15 tools and `ait doctor --json` reported registry 15 and installed 0. |

## AIT public npm patch release - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-34 | Published AIT patch release and consumer read-back | `ai-agent-tools@0.1.1` published successfully with public access. npm read-back reports `latest: 0.1.1`, Apache-2.0, the verified GitHub repository, and integrity `sha512-rI/WlF013V6mKdCCVln2xGOa5ApbW7faKHhWRYhu+5QnxY35Ce0nIyg8tOQOeTVGhV83RJjgwSHWzvVOCB/06Q==`. A new temporary consumer installed the published package with scripts disabled; its packaged `ait list --json` reported 15 tools and `ait doctor --json` reported registry 15 and installed 0. |

## CFML Policy Check registration review - 2026-09-16

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-31 | Independent policy-check repository and Hub registration | The owner-supplied local clone for [AI-Agent-Tool-CFML-Policy-Check](https://github.com/yapweijun1996/AI-Agent-Tools/tree/main/packages/cfml-policy-check) points to the confirmed GitHub remote and is at initial commit `24e0889657ac7da0fe752c4fb48c9e7f90fcaa4a`, whose tree contains only `.gitattributes`. The Hub records `agent-cfml-policy-check` as `Planned` with npm, release, verification, and deprecation fields `null`; no implementation, tests, package identity, release, or engine evidence is claimed. After registration, `python scripts/validate_hub.py`, `git diff --check`, the untracked-document whitespace check, and the AIT Node suite passed (29/29). |

## User-tier KB profile and artifact reconciliation - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-24 | User-tier KB readback after profile/artifact updates | Existing User-tier status records for CFML Check, Change Impact, Test Scope and Symbol Search were updated in place; the Canonical SSOT and Functional Map were updated in place. Readback confirmed User visibility, published package versions, artifact/profile evidence and the exact native-profile boundary. No Company-tier write or promotion was attempted; the historical `SHARE_TIER_DENIED: above_scope` blocker remains. |

## AIT profile catalog and exact application review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-20 | Exact catalog-backed profile application | `docs/profiles/PROFILE_INDEX.json` is validated for schema, identities, exact versions, executable names, safe relative evidence paths, duplicate matches, and evidence status. `bin/ait.js` selects only an exact tool/package/version/executable match and applies bounded native validators without rewriting the native payload. Node tests passed 28/28, including local install/dispatch evidence for Code Slice, no-match behavior for Project Profile `0.1.1`, malformed/unknown native fixtures, and profile metadata. The catalog remains local, exact, and non-networked; remote refresh and universal adaptation are not implemented. |

## Test Scope native consumer profile and artifact review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-21 | Exact Test Scope profile and artifact | The published `agent-test-scope@0.1.1` tarball had 88 files, shasum `4830019255560757357aace1dbabadcab0a46837`, and the recorded SHA-512 integrity. Its README, SPEC, schema, and CLI were inspected. `docs/profiles/AGENT_TEST_SCOPE.md` preserves `complete`/`partial` exit-0 semantics, engine-error exit-1, invalid-argument exit-2, and the no-execution boundary; `tests/test_scope_profile.test.js` passed 2/2 native fixture tests. AIT's built-in validator covers the same envelope and exact catalog entry; this does not establish Hub conformance or broader platform evidence. |

## V-32: Owned source consolidation — 2026-09-30

[Migration verification](docs/migration/VERIFICATION.md) records all ten imported heads and hash coverage, 409 passing Node tests plus 7 Python tests, package checks, license preservation and limits. This source import does not promote Hub conformance or imply new npm releases. Older source/CI/npm observations above remain dated snapshots.

## Environment Doctor and Contract Check MVPs (2026-09-30)

See [scoped verification](docs/mvp/VERIFICATION.md) for checks, limits and platform CI scope. These packages remain private and unpublished; exact-head CI evidence is tracked in their draft PR.

## Deploy Verify (2026-09-30)

Deploy Verify validation scope, exact test counts and platform results are recorded in its PR; package fixtures are synthetic, not a production deployment audit. Source/local installation is the distribution path; no npm release or service deployment occurs.

## Agent Patch Guard source MVP — 2026-10-03

[Agent Patch Guard](packages/patch-guard/README.md) implements the existing registry responsibility in a private `agent-patch-guard@0.1.0` source package, with zero runtime dependencies. The registry remains 18 entries; its Patch Guard lifecycle is Experimental with npm identity, release and verification snapshot still `null`. The known monorepo identity matches the configured Git remote; this session did not publish source or verify a new remote package path. Git's [diff format documentation](https://git-scm.com/docs/diff-format) was reviewed for the supported patch subset; it is format evidence, not tool verification.

On macOS with Node `v24.21.0`, 50 package tests passed, covering explicit path/scope rules, rename sides, size thresholds, literal content rules, policy exceptions, exact hunks and locators, real Git fixtures, duplicate/unsafe/unsupported inputs, null configuration, binary evidence limits, redaction, deterministic bounded output, artifact symlinks and a two-phase directory-substitution regression. Ajv 2020 validates the published policy/result schemas against actual outputs. Type declarations and packed-consumer CLI/API, safe fixture, schemas and Apache-2.0 license checks passed. The CLI reads supplied diff/policy artifacts only; it does not collect Git state, inspect changed source, apply patches or execute project commands.

Required root `npm run verify` passed on the same Node version, including build, typecheck, lint, tests, dry-run packs and native packed-consumer smoke checks. Locked dependencies were installed with lifecycle scripts disabled using existing local caches. The first full run lacked original package dependencies; after bootstrap the sandbox denied existing Release Guard loopback-server tests. The final approved verification run allowed their local HTTP fixtures and passed without changing those tests. `python3 scripts/validate_hub.py`, `git diff --check` and explicit untracked-file whitespace checks passed. Source coverage verified 698 imported files across ten original repositories unchanged.

This is local source evidence, not npm publication, owner-confirmed delivery completion, remote CI, cross-platform validation or a universal safety/OS-confinement guarantee. Windows/Linux execution and arbitrary hostile concurrent filesystem mutation remain unverified. Truncated, uninspected or unsupported requested evidence withholds `data`; completed checks may contain violations and require consumers to inspect `data.verdict`.

Commit/merge follow-up: the owner authorized committing and merging this implementation. PR #9's first CI runs passed Ubuntu Node 22/24 and macOS Node 22 but reproduced a Windows fixture failure: POSIX `chmod` did not create the expected Git executable-bit record. The fixture now sets index modes explicitly using `git update-index --chmod`, verifies the exact mode header and retains all seven expected changes. Production parsing and existing assertions are preserved; no check was skipped or relaxed. Final exact-head CI and merge results are tracked in the PR.

## Agent Rules Resolve and install-all source workflow — 2026-10-03

[Rules Resolve](packages/rules-resolve/README.md) implements the existing registry responsibility in private `agent-rules-resolve@0.1.0` source with zero runtime dependencies. It discovers all selected ancestors under the fixed local `agents-chain-v1` profile and reports ordered original-byte provenance, empty/shadowed exclusions and opt-in rule text. It does not read target contents, follow references, interpret semantic conflicts or reconstruct global/hidden instructions. Registry remains 18 entries and source has 16 tool package folders; npm identity/release/verification remain `null`.

On macOS Node `v24.21.0`, 58 package tests passed with no local skips, including actual CLI JSON, complete ancestor chains, strict Ajv 2020 schema checks, opt-in content, source read instrumentation, UTF-8/hash/line evidence, output caps, portable unsafe paths, symlink/FIFO and observed mutation cases. Build, type declarations and packed-consumer checks passed. Windows intentionally cannot exercise the POSIX FIFO or directory-symlink substitution fixtures; symlink permission limitations are explicit. These local checks are not cross-platform CI or npm release evidence.

[Install all](docs/workflow/INSTALL_ALL.md) adds an explicit source installation command to AIT, using local worktree snapshots or the fixed owned GitHub repository. The repository identity/public status/default `main` branch were read back through GitHub. Official [npm exec](https://docs.npmjs.com/cli/v11/commands/npm-exec/), [package spec](https://docs.npmjs.com/cli/v11/using-npm/package-spec/), and [shrinkwrap](https://docs.npmjs.com/cli/v11/configuring-npm/npm-shrinkwrap-json/) documentation was inspected; these describe transport/package semantics, not this installer’s behavior. Root pack allowlist includes its dependency-free module and guide, without tool implementations. Published AIT 0.1.1 was not republished.

Independent review found source-lock drift when consuming tarballs and a copied Homebrew Node shared-library prerequisite. The installer preserves authoritative package locks as temporary packed shrinkwraps, compares installed lock hashes, copies adjacent regular libnode libraries where present, and checks the copied Node version before success. Local source reads are bounded with descriptor/identity checks; process environment and npm/Git configuration are reduced. These are scoped controls rather than OS confinement, generic secret detection or portable-runtime guarantees. The optional workflow skill routes authorized installation to the guide; its standard validator passed using temporary PyYAML, without installing personal instructions or configuration.

Final local acceptance passed on Node `v24.21.0`: complete root `npm run verify`, including every package's checks and packed consumers, plus 11 offline installer regression tests. Installer fixtures cover frozen transitive versions despite a newer range-compatible release, source mutation/growth, reduced credentials/configuration, exact-commit Git extraction, prefix preservation, lifecycle suppression and Windows-style Git root normalization. The original ten imported packages passed source-hash coverage. A single `npm exec` command using the packed AIT bootstrap installed all 16 tool packages plus AIT into a fresh temporary prefix. All 17 native launchers started; three returned their existing help exit code 2 and the rest returned 0. Installed production dependency versions matched source locks, and Rules Resolve capabilities returned complete JSON. This is current-host source-install evidence; GitHub bootstrap and exact-head cross-platform CI are recorded separately in the PR before merge. Optional native backends and npm publication were not verified or performed.

## Agent Context Pack source MVP — 2026-10-03

[Agent Context Pack](packages/context-pack/README.md) implements the existing registry responsibility in a private `agent-context-pack@0.1.0` source package with zero runtime dependencies. The registry remains 18 entries; its lifecycle moved from Planned to Experimental with npm identity, release and verification snapshot still `null`. The package consumes only Hub-envelope `1.0.0` artifacts, as documented in the [function review](docs/TOOL_FUNCTION_REVIEW.md) it follows: supplied artifacts, caller-declared relevance, a byte budget with metadata counted, mandatory-overflow failure instead of clipping, and exact-match deduplication only. No other tool is run and no native contract is adapted. Its source-lock dependency closure (Ajv 8.20.0, TypeScript 5.9.3, dev-only) is identical to Rules Resolve's and was generated offline.

On macOS with Node `v24.21.0` (inside the declared `^22.13.0 || ^24.0.0` range), 41 package tests passed with no skips. They cover canonical and permuted ordering, failure selection independent of manifest order, exact byte accounting at the budget boundary (including that the CLI's `used` equals the bytes written to stdout), greedy skip-and-continue, mandatory and optional overflow, `BUDGET_TOO_SMALL`, digest and locator deduplication, incomplete/native/inconsistent envelopes, snapshot, tool-identity and digest mismatch, manifest shape, unsafe paths and symlinks, a two-phase directory-substitution regression, duplicate JSON keys, non-UTF-8 input, resource and output caps, hostile artifact text including `__proto__`, read-only behavior and CLI flag handling. Ajv 2020 validates the request and result schemas against actual outputs, including every documented failure code and inconsistent-envelope rejections. Type declarations and the packed-consumer CLI/API/example/byte-accounting/license check passed.

Nine hand-applied mutations of the selection logic (budget newline, ordering, snapshot check, digest dedupe, mandatory locator exemption, mandatory overflow, tool-identity check, digest check, canonical item sort) were each caught by the suite. The first run missed the item-sort mutation because the failing items shared an error code; a test with differing failures per item was added and then caught it. The two example artifacts were regenerated from the Rules Resolve and Patch Guard CLIs and compared byte for byte; the error fixture is the real envelope Patch Guard returned for a wrong `--diff` path. A test helper that used `URL.pathname` was replaced with `fileURLToPath` for Windows portability; Windows itself was not run.

Required root `npm run verify` passed on the same Node version, including build, typecheck, lint, every package's tests, dry-run packs and all native packed-consumer checks, including Release Guard's loopback HTTP fixtures without a sandbox denial in this run. Source coverage again verified 698 imported files across ten original repositories. `python3 scripts/validate_hub.py`, its unit tests, `git diff --check` and an untracked-file whitespace scan passed. An earlier package-only run on Node `v23.10.0` (outside the declared range) and an interrupted root run on that version are not used as evidence.

This is local source evidence, not npm publication, owner-confirmed delivery completion, remote CI, cross-platform validation, KB synchronization or a guarantee that a pack is the minimum context for a task. Snapshot identity is caller-declared and checked only for consistency across declarations; Context Pack cannot prove an artifact was produced from that snapshot. Relevance is whatever the caller declares. Only macOS was exercised; Windows and Linux remain unverified.

## AIT dispatch package-root containment — 2026-10-07

The reviewed fallback defect was reproduced using a temporary installed-state fixture with no npm shim. Moving the installed package outside its installation root and replacing its original directory with a symlink allowed the original implementation to launch the external executable. The new regression failed before the fix because that executable created its marker file. [AIT](bin/ait.js) now checks the canonical package directory against the canonical installation root before choosing the shim or fallback executable.

On macOS with Node `v24.19.0`, the [AIT suite](tests/ait.test.js) passed 11/11 with no skips after the fix. The regression verifies normal package fallback and a POSIX executable symlink within the package, then requires the escaped package directory to return exit 4 with `PATH_ESCAPE` and leave the execution marker absent. The Windows escape fixture uses a directory junction; Windows file-symlink acceptance is intentionally not exercised by this fixture because it requires privileges.

Full root `npm run verify` exited 0 on the same runtime, including build, typecheck, lint, 783 Node tests, 7 Python tests, every package dry-run pack and the configured packed-consumer checks. The approved test environment allowed Release Guard's local HTTP fixtures. Imported-source coverage remained unchanged. After these evidence updates, `python3 scripts/validate_hub.py`, `git diff --check` and an untracked-file whitespace scan passed.

This is current local source evidence. Windows/Linux execution, hosted CI and a newly published npm artifact were not verified. The runtime remains dependency-free and does not provide OS-level sandboxing.

## Contract Check removed-property acceptance — 2026-10-07

Before the fix, three new regressions failed because removed properties were reported compatible even when schema-valued `additionalProperties` narrowed their accepted types, nested constraints or unproved patterns. The comparator now reuses its bounded constraint walk at the removed property's logical pointer. Independent Ajv validation proves formerly accepted inputs are rejected by the type/nested/closed-object fixtures and still accepted by equivalent, widened and open-object fixtures.

On macOS Node `v24.19.0`, 50 package tests passed, including nine new regressions, plus build, type declarations and packed-consumer checks. Boolean closed/open behavior, false schemas and incomplete pattern semantics remain covered. Combined root verification passed with the selected Test Scope fix; aggregate results are recorded below. This is local source evidence; package identity/version, publication and registry lifecycle are unchanged.

## Test Scope package script ownership — 2026-10-07

The new monorepo regression failed before the fix because six root/subpackage script recommendations collapsed into two bare npm commands. Discovery and planning now share one command generator. Nested commands include an explicit npm prefix and use the existing POSIX quoting convention; the execution contract and bundled workflow skill now identify the request root and required shell interpretation. No test or project command is executed by the planner.

The regressions cover a root and two nested packages sharing script names, spaces/apostrophes in paths and script names, matching discovery/plan commands, absence of planning side effects and actual execution of each reported command against its declared owner. The explicit execution fixture runs only on POSIX; its command-generation assertions are platform-independent, without claiming Windows execution or CMD compatibility. Malformed script metadata is ignored consistently by discovery and planning. On macOS Node `v24.19.0`, package acceptance passed all 20 tests without skips, ESM/CJS typechecks, dual build and packed-consumer checks.

Combined root `npm run verify` exited 0 on the same runtime with all three selected fixes, including build, typecheck, lint, 795 Node tests without skips, 12 Python tests, all package dry-run packs and configured packed-consumer checks. Release Guard's local HTTP fixtures ran in the approved test environment. After these evidence updates, `python3 scripts/validate_hub.py`, `git diff --check` and an untracked-file whitespace scan passed.

The historical migration manifest remains byte-identical. A separate exact-hash source-update manifest records the five changed imported Test Scope files. Five Python regressions verify unchanged coverage, rejection of unrecorded changes, exact updated-file coverage, rejection of later tampering, original-hash binding and malformed/duplicate/unknown update records. The root test runner includes these regressions; the gate does not ignore edited source or replace its expected hash with an observed hash at runtime. Windows/Linux execution, hosted CI and a newly published artifact remain unverified.

## Hosted verification and follow-up review — 2026-10-07

The owner authorized pushing the three completed fixes and checking Windows/Linux. `git push origin main` succeeded; remote read-back returned `d948566ffdcaa8ec73e58e41edbc6f71e1b2b7cf`. The exact-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37639322549) completed successfully in all four existing matrix jobs. Linux Node 22/24 and macOS Node 22 each passed 795 Node tests without skips; Windows Node 22 passed 785 of 795 tests, skipped ten and failed none. Every job passed all 12 Python tests plus its bootstrap/build/typecheck/lint/pack gates. No workflow change was required.

Windows skips covered two installer mutation fixtures, Change Impact's Git shim fixture, two Context Pack symlink/mutation fixtures, Patch Guard's ancestor mutation fixture, three Rules Resolve FIFO/symlink fixtures and Test Scope's POSIX command-execution fixture. The new AIT package-directory junction regression and Contract Check removed-property regressions ran on Windows. Skipped scenarios and Windows Node 24 remain unverified; no npm publication occurred.

The following additional findings were reproduced locally on macOS Node `v24.19.0` against that head using temporary synthetic files. No reviewed source was edited. Fixtures and timeout-controlled child processes were cleaned up.

1. **P1 — Test Scope explicit import resolution.** [Module candidates](packages/test-scope/src/core/imports.ts), lines 24–29, prefer replacement extensions before an existing explicit `.js` path. A fixture with `src/a.js`, unrelated `test/aaa.test.js` and `test/regression.test.js` importing `../src/a.js` selected the importing test at strong confidence in minimum scope. Adding `src/a.ts` changed minimum scope to the unrelated test at candidate confidence; the actual importing test was downgraded and omitted from minimum scope, while status remained complete with no diagnostics. First fix: honor exact existing runtime paths or report genuine compiler-context ambiguity rather than silently substituting another file. Acceptance: a JS/TS same-stem fixture retains the actual importing test; the supported TypeScript `.js`-specifier fallback when no JS file exists remains covered.

2. **P1 — Release Guard conflicting JSON fields.** [Evidence parsing](packages/release-guard/src/index.js), lines 126–130, uses `JSON.parse` directly. Changing the synthetic server-pass fixture's CI conclusion to one `"conclusion":"fail"` returned fail/exit 1. Supplying `"conclusion":"fail","conclusion":"pass"` in the same row returned pass, complete true and exit 0; the parser discarded contradictory evidence before validation and provenance hashing. First fix: reject duplicate object keys before parsing the evidence, with bounded depth/bytes. Acceptance: both conflicting-key orders and escaped equivalent keys are rejected; existing legitimate pass/fail bundles and output-budget behavior remain unchanged.

3. **P2 — Environment Doctor FIFO hang.** [Input opening](packages/environment-doctor/src/index.js), lines 59–62, calls blocking `openSync(file, "r")` before checking whether the descriptor is a regular file. A supplied `requirements.json` created with POSIX `mkfifo`, with no writer, produced no CLI JSON and exceeded a 1,200 ms child-process timeout; the parent terminated it with SIGTERM. Its byte limit cannot prevent blocking in `open`. First fix: reject nonregular inputs before open and use a nonblocking descriptor plus descriptor validation on POSIX. Acceptance: a FIFO without a writer exits with bounded invalid-input output instead of hanging; ordinary and oversized regular files retain their documented behavior.

These are observed review findings, not fixes or regression-suite additions. The exact-head remote gate proves the existing covered behavior; it does not invalidate defects outside those fixtures. Only TASK/VALIDATION evidence was updated during the follow-up review.

## Follow-up defect fixes — 2026-10-07

The owner selected all three follow-up findings for implementation. Before the fixes, four exact-import fixtures failed, five JSON ambiguity/depth fixtures failed, and two FIFO fixtures exceeded the child-process timeout. The regression expectations were retained after each correction. All source observations below were made locally on macOS with Node `v24.19.0`.

Test Scope tries an existing exact relative file before its previous extension/index candidate list. Eight new tests cover JS/TS, JSX/TSX, MJS/MTS and CJS/CTS pairs: same-stem typed siblings no longer redirect explicit runtime imports or remove the actual importing test from minimum scope; a JavaScript-extension specifier still reaches its typed source when the exact file is absent. Existing candidate-only evidence for the unimported sibling is preserved. All 28 package tests, ESM/CJS typechecks and dual builds passed. The immutable import manifest remains unchanged; the explicit update manifest now binds six evolved imported files to exact current hashes.

Release Guard's package-local file parser checks duplicate object keys, decoded escaped-key equivalence and nesting depth before `JSON.parse`. The existing byte bound and fatal UTF-8 reader remain authoritative; both CLI operations use this reader. Seven new tests cover both conflicting conclusion orders, escaped duplicates, root/array duplicates, depth 32/33, separate-object names and legitimate deployment pass/fail exit codes. All 82 package tests, syntax/schema build and declaration checks passed. No cross-package runtime dependency or public envelope field was added.

Environment Doctor checks canonical file type/size before open, uses nonblocking POSIX flags and still checks the opened descriptor. Four new tests cover FIFO input in every file argument, an actual regular-file-to-FIFO substitution between check and open, directories, oversized files and ordinary offline input. The substitution fixture uses a canonical temporary path and asserts that its hook actually ran; the child-process timeout remains an independent hang guard. Both FIFO scenarios now return bounded invalid-input JSON instead of waiting for a writer. All 30 package tests, syntax/schema build and declaration checks passed. The two POSIX FIFO tests explicitly skip Windows; no Windows FIFO support or OS confinement is claimed.

Test Scope's packaged ESM/CJS consumer smoke passed separately. Combined root `npm run verify` exited 0 with 814 Node tests without skips, all 12 Python tests, applicable build/typecheck/lint checks, all package dry-run packs and the seven configured packed-consumer checks, including Release Guard and Environment Doctor. Migration coverage verified all 698 imported files against the unchanged historical baseline plus six exact source updates. After these evidence updates, `python3 scripts/validate_hub.py`, `git diff --check` and an untracked-file whitespace scan passed.

These current fixes have not yet been pushed or run in hosted CI; the successful remote run above applies only to the earlier `d948566` source head. Package versions, npm publication and registry lifecycle remain unchanged.

## Hosted follow-up verification and continued review — 2026-10-07

The owner authorized pushing the three completed follow-up fixes, checking their hosted CI and continuing source review. `git push origin main` succeeded; remote read-back returned `46f272411bc55535799405b9ee3a1ac1a07853c9`. The exact-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37643127428) completed successfully in all four existing matrix jobs. Linux Node 22/24 and macOS Node 22 each passed all 814 Node tests with zero skips/failures. Windows Node 22 passed 802 of 814, skipped twelve and failed none. All four jobs passed twelve Python tests and their bootstrap/build/typecheck/lint/pack gates. No workflow modification or package publication occurred.

Windows retained the ten platform-dependent skips recorded for the earlier run, plus Environment Doctor's two new POSIX FIFO scenarios. The new Test Scope exact-import/fallback and Release Guard duplicate/depth tests ran on Windows. Skipped scenarios and Windows Node 24 remain unverified. The hosted root verification applies to the pushed source head; subsequent changes in this review are limited to TASK/VALIDATION evidence.

The continued review inspected Project Tree and Error Lens input/output paths, with additional bounded inspection of Rules Resolve, Project Profile, Symbol Search and Change Impact. The following three highest-priority findings were reproduced on macOS Node `v24.19.0` at that source head. This was not a complete audit of every module. Synthetic values were used for redaction checks; no real credentials were read or recorded. Temporary repositories, files and child processes were cleaned up.

1. **P1 — Error Lens multiline credential redaction.** [Key-value patterns](packages/error-lens/src/core/redact.ts), lines 1–2, exclude CR/LF from quoted values and fall back to a whitespace-delimited match. A valid structured diagnostic containing `private_key="FIRST_SYNTHETIC_LINE\nSECOND_SYNTHETIC_A\nTHIRD_SYNTHETIC_LINE"` was accepted by both the public library and CLI. The CLI returned exit 0 with `status: "complete"`; its exported message was `private_key=[REDACTED]\nSECOND_SYNTHETIC_A\nTHIRD_SYNTHETIC_LINE"`. Changing only the second credential line changed the diagnostic ID, so sensitive tails also affect stable identities. The single-line control was fully redacted. This violates the explicitly supported `private_key` family and exported-field/identity redaction contract; it does not rely on universal secret detection. First fix: consume the entire bounded quoted credential or withhold the field when its value boundary cannot be established. Acceptance: LF/CRLF, single/double-quoted and incomplete multiline values cannot export credential tails; differing secret values produce the same sanitized identity, and benign token metrics, idempotence and post-redaction field bounds remain covered.

2. **P1 — Project Tree false Git deletions for excluded files.** [Git classification](packages/project-tree/src/git.js), lines 332–339, treats the absence of a scanned node as proof of deletion. The scanner intentionally excludes `dist` and explicit ignored directories, while the HEAD tree includes them. In a temporary committed repository containing `dist/generated.js` and `src/a.js`, `git status --porcelain` was empty and both files existed. Default `changed` output nevertheless reported `dist/generated.js` as deleted with `available: true`, adapter `truncated: false` and graph `truncated: false`. Supplying `ignore: ["src"]` additionally reported the unchanged `src/a.js` as deleted. A true deletion of `src/a.js` was reported alongside the false generated-file deletion. First fix: distinguish an excluded/uncaptured path from an observed missing file and apply consistent comparison coverage to HEAD and worktree evidence. Acceptance: clean repositories with tracked default/custom ignored files produce no false deletions or untracked classifications; real changes within the comparison scope remain visible, and capped capture cannot claim absence or tracking certainty from omitted evidence.

3. **P2 — Project Tree legal `..`-prefixed paths rejected.** [Containment checks](packages/project-tree/src/safety.js), lines 8–22, reject every relative string beginning with `..`, rather than the parent-directory segment. A root containing an actual `..config.js` file, or a `..cache/a.js` directory, made `buildProjectGraph` throw `Path escapes root`. Querying the existing `..config.js` independently threw `Refusing path outside root`. Neither path traverses outside its root. Normal-name scanning passed, and genuine `..`/`../outside.js` paths were still rejected. First fix: use segment-aware containment with native separator/absolute-path checks in both scanning and query paths. Acceptance: legal names beginning with two dots remain usable in the CLI/library, while genuine parent traversal and absolute escapes remain rejected across supported platforms.

Existing Project Tree tests passed 12/12 and its `aptree` smoke passed. Existing Error Lens acceptance passed 29/29 plus contract/fixture/capability checks, typecheck, lint, build and packaged-consumer checks. The first Error Lens acceptance attempt encountered the inaccessible default npm cache; rerunning with the repository-local npm cache passed without source changes. These suites do not contain the three new reproduction cases. The review did not fix implementation files or add regression-suite fixtures. Final Hub validation and tracked/untracked whitespace checks passed; the newly linked Actions run was verified directly through GitHub run metadata and logs. Historical external claims were not re-audited.

## Error Lens and Project Tree corrections — 2026-10-07

The owner selected all three continued-review findings for fixes. Verification below uses macOS Node `v24.19.0`. The first seven multiline redaction regressions failed against the reviewed reader, all five Git comparison regressions failed, and three of four containment regressions failed; the genuine-escape control already passed. These expectations were retained after correction.

Error Lens's existing key-value patterns now consume LF/CRLF, escaped quotes and unterminated quoted values through their entire bounded value. Seven regressions initially passed after correction; an added trailing-incomplete-escape case then exposed a remaining tail leak and failed. Its corrected escape handling passed all eight new cases. The checks exercise public parsing, exported CLI JSON, producer command fields, secret-independent diagnostic IDs, idempotence and benign neighbors. Full package acceptance passed 37/37 plus contract/fixture/capability checks, typecheck, lint, build and packaged-consumer checks. No credential format beyond the documented key families or universal secret detection is claimed.

Project Tree reuses one package-local directory filter in its filesystem and HEAD walkers, preserving the exported default-ignore Set. Its bounded HEAD capture records whether tracking evidence is complete. Deletion requires observed absence through ordinary ancestor directories; existing uncaptured paths or uncertain ancestors leave the adapter incomplete. Untracked classifications require complete HEAD capture. The comparison takes digests only from filesystem file nodes, so synthetic package evidence no longer overrides the manifest file. Five new regressions cover default/custom exclusions, true modified/deleted/untracked controls, independently capped worktree/HEAD capture and a modified package manifest. The existing loose/packed-object and delta-chain tests remain passing. These checks require no Git execution by the tool; Git only prepares synthetic test repositories.

Containment now tests the exact parent-directory segment with the native separator before formatting relative paths for JSON. Four new regressions cover library scanning/querying and CLI output for `..config.js` and `..cache/a.js`, ordinary/root paths and genuine relative/absolute escapes. Final Project Tree package acceptance passed 21/21 without skips, lint, declarations/typecheck and `aptree` smoke. Windows execution remains unverified for these new tests.

Combined root `npm run verify` exited 0 with all 831 Node tests passing without skips/failures, all twelve Python tests, applicable build/typecheck/lint gates, seventeen package dry-run packs and seven configured packed-consumer checks. The approved environment allowed the existing Release Guard loopback HTTP fixtures. Migration coverage verified all 698 imported files across ten source repositories; historical migration hashes remain unchanged, and fourteen explicit source updates bind the evolved imported files to their original and current hashes. After final evidence updates, Hub validation and tracked/untracked whitespace checks passed. The new source contracts introduce no external URLs; the preceding review's newly linked Actions evidence was read directly. Task-created debugging logs were removed.

The earlier accidental root test invocation was stopped and is not acceptance evidence; final acceptance uses the deliberate full verification run. Package identities, versions, dependencies, module systems and release state remain unchanged. The prior hosted run applies only to `46f2724`; these new fixes have not been pushed or checked remotely. Current verification is local macOS source evidence; Windows/Linux execution of these corrections remains unverified.

Reusable prevention record (project scope): the repeated pattern was treating absent captured evidence as proof of filesystem absence or tracking absence in the two Git classification branches. The former approach compared maps with different filtering and bounds. The corrected rule requires consistent scope plus an actual absence observation or a complete tracking inventory. Future regression checks must pair true changes with existing excluded files, capped worktree capture and capped HEAD capture. Existing repeated-bug and TypeScript skills cover the general workflow; this package-specific rule is retained here and in executable regressions instead of creating a duplicate global skill. Do not infer negative filesystem or tracking facts from an incomplete capture.

## Main integration and hosted correction verification — 2026-10-07

The owner requested commit and integration into main. The worktree was clean and all three correction commits were already on local main. `git push origin main` returned `Everything up-to-date`; subsequent remote read-back confirmed `79ba4d7fff8caec275e7134fe4332aebac6c397e`. No merge commit, pull request, history rewrite or redundant implementation commit was needed.

The exact-source-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37646804459) completed successfully on Linux Node 22/24, macOS Node 22 and Windows Node 22. Linux and macOS each passed all 831 Node tests with zero skips/failures. Windows passed 819 of 831 tests, skipped twelve and failed none. All four jobs passed twelve Python tests and their bootstrap/build/typecheck/lint/pack gates. The eight new Error Lens redaction regressions and nine new Project Tree comparison/containment regressions ran on Windows as well as Linux/macOS.

Windows skips are unchanged from the preceding hosted run: two installer mutation fixtures, Change Impact's Git shim fixture, two Context Pack symlink/mutation fixtures, two Environment Doctor POSIX FIFO fixtures, Patch Guard's ancestor mutation fixture, three Rules Resolve FIFO/symlink fixtures and Test Scope's POSIX command-execution fixture. These skipped scenarios and Windows Node 24 remain unverified.

Final evidence changes are limited to TASK/VALIDATION. Local source coverage still verified 698 imported files across ten repositories with fourteen exact source updates. Hub validation, tracked/untracked whitespace and documentation diff checks passed after the evidence changes. The newly linked Actions URL and counts were read directly from GitHub metadata/logs; historical external claims were not re-audited. The hosted gate above covers the unchanged implementation source; the final documentation update uses these local documentation checks. No registry lifecycle, package identity/version, workflow or npm publication changed. Task-created CI/debugging logs were removed.

## Continued read-only review — 2026-10-08

The owner selected the next read-only source review at main commit `46ad8a2947b955646131f31ac763b1cebc3d1a17`. Source and built public entrypoints were inspected on macOS with Node `v24.19.0`. All reproduction inputs were synthetic and created in temporary directories. Mutation fixtures used test-only Node preload hooks to perform actual filesystem substitutions at the relevant read/open boundary; they did not mock stat results or substitute returned source bytes. Hooks and fixtures were outside the reviewed implementation. The three selected findings remain unfixed.

1. **P1 — Code Slice follows a substituted symlink outside the explicit root.** [File loader](packages/code-slice/src/core/file-loader.ts), lines 84–95, checks the canonical path and regular-file metadata, then reads that pathname again without binding the read to the admitted file. A temporary in-root `input.js` was an ordinary file during both checks. Immediately before `readFileSync`, the fixture moved it aside and created a real symlink to a synthetic sibling file outside the root. The public `slice` API and public `symbol --root ROOT --json` CLI both returned `ok: true` and the exact outside function body containing `SYNTHETIC_OUTSIDE_MARKER`; the CLI exited 0 and attributed the code to the in-root input path. The fixture restored the original file after the actual read. Controls: the ordinary in-root function succeeded, while a pre-existing outside-root symlink failed with `FILE_OUTSIDE_ROOT`. Impact: a repository mutation during the check/read interval can disclose source outside the selected root. First fix: bind admission and bounded reading to a verified regular-file descriptor, reject substituted links or changed identity, and preserve the declared root policy on each supported platform. Acceptance: public CLI/API reject a real leaf-link substitution before reading outside bytes; ordinary files and static escape rejection still behave correctly. Ancestor-link mutation and platform-specific open behavior need their own acceptance evidence before broader containment claims.

2. **P2 — Project Profile can block before validating an opened FIFO.** [Metadata reader](packages/project-profile/src/core/scanner.ts), lines 213–218, opens with `O_RDONLY | O_NOFOLLOW`, then checks `fstatSync`. The fixture replaced a previously probed regular `package.json` with a real POSIX FIFO immediately before the actual `openSync`. With no FIFO writer, the public `dist/bin.js` CLI did not return a profile within 1,500 ms and the reproduction parent terminated it with `SIGKILL`/`ETIMEDOUT`; the fixture marker and final filesystem state confirmed the substitution occurred. The regular manifest control returned `complete`/exit 0. Supplying the same FIFO before probing returned a bounded `partial`/exit 2 without timing out. `O_NOFOLLOW` does not prevent opening a FIFO from waiting for a writer, so descriptor validation is unreachable in this case. First fix: use nonblocking open where supported and validate descriptor type/identity before reading, retaining the package's deterministic coverage semantics. Acceptance: initial and post-probe FIFO inputs return a bounded native result without an external timeout; regular metadata, symlink rejection and byte limits remain correct. This is a local POSIX reproduction; Windows behavior is unverified.

3. **P2 — CFML Policy Check enforces input byte limits after an unbounded full read.** [UTF-8 reader](packages/cfml-policy-check/src/cli.js), lines 146–154, calls `fs.readFileSync(filePath)` without a read bound and only then compares the returned buffer with the selected limit. Separate public CLI runs used an actual 8 MiB regular source file and an actual 8 MiB regular profile file, each with its corresponding byte limit set to 16. A test-only observer delegated to the original filesystem read and recorded all 8,388,608 bytes being returned before both invocations emitted `RESOURCE_LIMIT`, `incomplete`, exit 3. The same behavior was reproduced through exported `runRequest` for source input. A small valid source/profile control passed. The 8 MiB files also exceed the documented hard input caps, but those caps do not bound filesystem allocation. Impact: oversized explicit inputs consume memory and I/O proportional to their full size before rejection; much larger inputs can exhaust the process before it produces a result. Process exhaustion was not induced in this review. First fix: reject observed oversized regular files before reading and use a descriptor reader capped at the permitted bytes plus one for growth detection. Acceptance: oversized source and profile bodies are rejected before a full read, growing files cannot bypass the bound, and ordinary UTF-8 input preserves its verdict and native result contract.

Required root `npm run verify` exited 0: 831 Node tests passed with zero skips/failures, twelve Python tests passed, and all applicable build/typecheck/lint gates, seventeen dry-run package packs and seven configured packed-consumer checks passed. Migration coverage verified 698 imported files across ten source repositories with fourteen explicit source updates. After the review evidence update, Hub validation passed with eighteen tools, forty documents and 318 links; tracked and untracked whitespace checks passed. These existing tests do not cover the three reproduced cases. Corrected reproduction runs passed their diagnostic assertions; the scripts are review evidence, not additions to package regression suites. Task-created fixtures, preload files and verification logs were removed.

This review is local source evidence. The new reproductions have not run on Linux or Windows. It does not certify published npm artifacts, CFML engines, operating-system confinement or new hosted CI results; historical external claims were not re-audited, and the evidence update adds no external URL. No source fix, registry lifecycle change, package identity/version change, dependency change, workflow change, commit or push is included.

## Read boundary corrections — 2026-10-08

The owner selected all three review findings for fixes. The acceptance fixtures perform real filesystem mutations through isolated test-only preload hooks. Before correction, all five Code Slice regressions failed, two of three Project Profile regressions failed, and four of five CFML Policy Check regressions failed. The initial-FIFO and exact-UTF-8 controls already passed. After correction all thirteen targeted tests passed on macOS Node `v24.19.0`; expectations were not relaxed.

Code Slice pins reads to a regular-file descriptor, checks file identity/state and the admitted canonical path before consuming source, and rechecks them after reading. Supported nonfollowing/nonblocking open flags protect the type boundary. Its five regressions exercise public API and CLI leaf-link and ancestor-link substitutions, assert that outside bytes are never read, and check bounded growth rejection plus descriptor cleanup. Existing native error codes, BOM preservation and exact source extraction remain unchanged. Its six built public-entrypoint E2E checks passed without skips; these are built CLI/API checks, not an installed-package certification.

Project Profile uses supported nonblocking flags before `fstatSync`, rejects opened nonregular inputs as `METADATA_UNREADABLE`, and rejects a different identity/state or canonical path as `REPOSITORY_CHANGED` before reading. Its three regressions cover initial FIFO, actual FIFO substitution and regular-file substitution. The mutation cases assert no body bytes or successful metadata reads and verify descriptor closure. Existing partial-profile coverage and ordering remain authoritative. Its existing packed-consumer E2E passed real tarball installation with scripts disabled and checked the installed binary's JSON/version/help behavior.

CFML Policy Check checks regular-file sizes before body reads, then reads an admitted descriptor with one extra byte for growth detection and validates its observed state. Two oversized-file tests confirm that actual 8 MiB source/profile files with 16-byte limits have no body reads. Two growth tests confirm positive reads bounded by the selected limit plus one, `RESOURCE_LIMIT`/incomplete/exit 3 and closed descriptors. An exact-limit multibyte UTF-8 control preserves the verdict; invalid UTF-8 preserves `UNSUPPORTED_ENCODING`/exit 2. Full native package tests passed 20/20. Source and profile read bounds do not imply an audited AIT stdin transport bound.

Required combined root `npm run verify` exited 0 with all 844 Node tests passing, zero skips/failures, twelve Python tests and all applicable build/typecheck/lint gates. Native package suites passed 85 Code Slice, 34 Project Profile and 20 CFML Policy Check tests. All seventeen dry-run package packs and seven configured packed-consumer checks passed; the additional Code Slice E2E and Project Profile installed-consumer checks above also passed. After final documentation updates, Hub validation passed eighteen tools, forty documents and 319 links, source coverage and tracked/untracked whitespace checks passed, and the final diff was reviewed. The evidence update adds no external URLs; historical external claims were not re-audited. Task-created diagnostic logs and temporary mutation inputs were removed; the new test hooks remain as deliberate regression assets.

Historical imported hashes remain unchanged; seven added source-update entries bind changed imported implementation/contracts and the Project Profile test entrypoint to their original and current hashes, for twenty-one explicit updates total. No registry lifecycle, package identity/version, compiler, dependency, license/private flag, shared runtime, workflow or publication changes are included. Current correction evidence is local and uncommitted; Linux/Windows execution and new hosted CI remain unverified. The two Code Slice file-link cases and two Project Profile POSIX FIFO cases are explicitly skipped on Windows.

Reusable prevention record (project scope): pre-read path/type/size metadata is not authority for a later pathname read. Existing Environment Doctor/Rules Resolve/Patch Guard examples already use descriptor validation and supported nonblocking opens; these fixes adapt that pattern within each independent package. New reader regressions should cover an ordinary file, an actual post-probe special-file or link substitution, an oversized input, growth during reading and descriptor cleanup. Observe actual body reads rather than only the eventual error code. The project-specific record and executable fixtures retain this lesson without adding a shared runtime or a duplicate global skill.

## Further read-only findings — 2026-10-08

The owner selected a further read-only review at main source commit `6a49875080105f9c8df479c42438e02c11680c1a`. Reproductions used macOS Node `v24.19.0`, public built CFML Check CLI/API entrypoints and CFML Policy Check's direct CLI/exported `runRequest`. Inputs were synthetic local files in temporary directories. The CFML Check fixture substituted a real filesystem symlink at the read boundary and delegated to the original filesystem read; it did not mock metadata or returned source bytes. The three findings below remain unfixed; this review changes only Hub evidence.

1. **P1 — CFML Check reads a substituted source outside its explicit root.** [Source reader](packages/cfml-check/src/core/source-reader.ts), lines 36–45, admits a canonical regular file and then calls `readFileSync` on that pathname. The reproduction moved an ordinary in-root `input.cfm` aside immediately before the read, created a real symlink to a synthetic sibling file outside the root, read through the actual filesystem and restored the original before the post-read stat. Both public `checkFile` and `check --root ROOT FILE --json` completed with `status: ok`, `complete: true`, exit 0 and `source.path: input.cfm`. Their source SHA-256 and 48-byte size matched the outside file, and the `UNCLOSED_TAG` finding came from its unclosed `cfif`, while the ordinary selected file had no finding. The read observer confirmed all 48 outside bytes were consumed. Controls: the ordinary file passed; a pre-existing outside-root symlink returned `FILE_OUTSIDE_ROOT`. Impact: an observed check/read substitution bypasses the declared root boundary and gives the caller a completed analysis of a different file. The envelope exposes source hash/size/locations rather than a full source excerpt; this is not evidence of exporting the entire outside body. First fix: bind admission and bounded reads to a regular-file descriptor, validate identity/canonical containment before consuming bytes and reject observed mutation. Acceptance: public CLI/API reject actual leaf/ancestor substitutions before outside reads; ordinary files, static escape rejection, growth bounds and descriptor cleanup remain correct on supported platforms.

2. **P2 — CFML Policy Check treats script and textarea contents as active HTML.** [Markup parser](packages/cfml-policy-check/src/cli.js), lines 279–318, consumes every tag-shaped substring without entering an HTML raw-text or escapable-text state. The public CLI returned complete `violations`/exit 0 for `<script>const template = "<table></table>";</script>` with a `requires-colgroup` finding at line 1, column 27, and for `<textarea><table></table></textarea>` at column 11. A JavaScript string containing `<colgroup></colgroup>` also produced `requires-col` at column 27. These strings/text do not introduce the reported HTML elements. Controls: an actual empty table produced its legitimate finding; a table with direct colgroup/col passed; an HTML comment containing a table passed. Impact: ordinary mixed templates receive completed false policy violations. First fix: handle supported raw-text/escapable-text elements as opaque contents, or explicitly return incomplete for unsupported cases instead of a completed conclusion. Acceptance: CLI/API do not emit active table/colgroup findings from script/style/textarea/title text; actual markup rules, source locations, comment behavior and fail-closed malformed/dynamic behavior remain correct. Only the script/textarea cases are reproduced here; the other contexts are proposed acceptance coverage.

3. **P2 — CFML Policy Check comment masking bypasses the processing budget.** [Comment masking](packages/cfml-policy-check/src/cli.js), lines 323–329, reconstructs the full source string separately for every comment after leaving the only deadline-checked loop. Twelve thousand `<!-- x -->` comments form a valid 120,000-byte source under the default file bound. With `max_processing_ms: 30`, three isolated public `runRequest` invocations returned complete `pass`/exit 0 after 81, 88 and 93 ms measured around the API call, excluding process startup. The direct CLI accepted the same case as complete `pass`. A 10,000-byte/1,000-comment control completed in 4 ms. A separate 160,000-byte/16,000-comment probe took 1,301 ms and still returned complete `pass` under the same 30 ms budget. A larger 240,000-byte probe was externally terminated after twelve seconds; that timeout supplies no completed verdict or exact analysis duration. Impact: comment-heavy valid inputs cause repeated work proportional to source length times comment count without checking the configured processing limit, delaying a caller rather than returning a bounded incomplete result. First fix: process visible spans or mask comments in one bounded pass and apply deadline checks to all analysis phases. Acceptance: comment-heavy inputs complete within the supported cooperative budget or return `RESOURCE_LIMIT`/incomplete/exit 3, while comment suppression and escaped/unescaped hash handling retain their semantics. This evidence does not assert operating-system real-time scheduling guarantees.

Corrected reproduction scripts passed their diagnostic assertions. These scripts are temporary review evidence, not new package regression tests. New reproductions have not run on Linux/Windows or CFML engines, and existing hosted regression gates do not cover them. Published artifact behavior and historical external claims were not re-audited. Final source coverage, documentation checks, hosted correction results and cleanup are recorded in the integration evidence accompanying this review.

## Read boundary integration and platform follow-up — 2026-10-08

The owner selected commit/push, cross-platform CI verification and continued read-only review. The sixteen intended fix/test/contract/evidence files were committed as `6a49875080105f9c8df479c42438e02c11680c1a` on main and pushed to origin. Remote branch read-back confirmed that exact SHA. The initial [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37697392663) passed Linux Node 22/24 and macOS Node 22: each passed 844 Node tests without skips/failures, twelve Python tests and the remaining configured root gates. Windows Node 22 reached all 844 Node tests but passed 820, failed eight and skipped sixteen; its root test stage exited 1 and the later pack stage did not run. This failed run is not cross-platform acceptance.

The eight Windows failures came from the new test launchers, which supplied an absolute `D:` pathname to Node's ESM `--import`. The Project Profile child stderr exposed `ERR_UNSUPPORTED_ESM_URL_SCHEME` and `Received protocol 'd:'`. The failed cases were the four CFML Policy Check oversized/growth subprocesses, Code Slice's two ancestor-junction subprocesses plus its growth subprocess, and Project Profile's regular replacement subprocess. All shared the same preload argument pattern. The fix uses `pathToFileURL(hook).href` in each package's launcher; Policy Check also includes child stderr in exit-status assertion messages. Native assertions, mutation hooks and Windows skip conditions are unchanged. Local package suites passed again: 20 Policy Check, 85 Code Slice and 34 Project Profile tests, including the test-source compilation performed by the package scripts. Implementation source was unchanged by this test-launch correction.

The launcher correction was committed as `4f41a649d263aec847810376b3eff0cffd3e4a9d`, pushed to main and confirmed by remote read-back. Its exact-head [follow-up Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37698313445) completed successfully on all four configured jobs. Counts were read from each actual job log, accounting for both TAP and Node 24's summary format:

| Platform | Node | Node passed | Node skipped | Node failed | Python passed |
| --- | ---: | ---: | ---: | ---: | ---: |
| Linux | 22 | 844 | 0 | 0 | 12 |
| Linux | 24 | 844 | 0 | 0 | 12 |
| macOS | 22 | 844 | 0 | 0 | 12 |
| Windows | 22 | 828 | 16 | 0 | 12 |

Each job also passed bootstrap/build/typecheck/lint, seventeen dry-run package packs and seven configured packed-consumer checks. All thirteen new regressions executed and passed on Linux/macOS. Windows executed nine and skipped four: Code Slice's two file-symlink cases and Project Profile's two POSIX FIFO cases. The eight previously failed launcher cases now execute successfully on Windows, including Code Slice's actual ancestor-junction substitutions and Project Profile's regular-file substitution; they were not disabled or weakened.

The current sixteen Windows skips are: two installer mutation fixtures, one Change Impact Git-shim fixture, two Code Slice file-link fixtures, two Context Pack symlink/mutation fixtures, two Environment Doctor FIFO fixtures, one Patch Guard ancestor-mutation fixture, two Project Profile FIFO fixtures, two Rules Resolve FIFO/ancestor fixtures, one Runtime Trace credential-symlink fixture and one Test Scope POSIX command-execution fixture. This current log-based breakdown supersedes the earlier prose attribution of three skips to Rules Resolve; the third belongs to Runtime Trace. Skipped scenarios and Windows Node 24 remain unverified.

Final evidence changes are limited to TASK/VALIDATION. Source coverage still verifies 698 imported files across ten repositories with twenty-one explicit source updates. Hub validation and tracked/untracked whitespace checks passed after the evidence changes; the final diff was reviewed. The two new Actions URLs and their job counts were read directly from GitHub metadata/logs, while historical external claims were not re-audited. Temporary mutation inputs, preload repro scripts and local CI/verification logs were removed. The hosted gate covers the implementation and regression launchers at `4f41a64`; the final documentation update uses local documentation/source-coverage checks. No registry lifecycle, package identity/version, dependency, shared runtime, workflow or npm publication changed. At that integration, the three further read-only findings remained separate unfixed source issues and were not covered by the passing existing regression gates. Their subsequent owner-selected corrections are recorded below.

## CFML reader, text contexts and processing budgets — 2026-10-08

The owner selected all three further-review findings for correction from main `5a5cc0a3961cc54703ab3063cbe24911919e888c`. Regressions were added before implementation: CFML Check failed six of eight new cases, and CFML Policy Check failed fourteen of its first sixteen new cases. Existing-pass controls retained ordinary source/encoding and static path rejection, unclosed text rejection and conservative dynamic-input behavior. Four additional text/hash controls were then added, giving twenty-eight new cases in the completed regression set.

CFML Check now admits and reads through one regular-file descriptor. Device/inode, mode, size, nanosecond modification/change timestamps and current canonical pathname state are checked before bytes are consumed and again after reading. Real leaf and ancestor substitutions were exercised through both public built CLI and API entrypoints; each returned `SOURCE_CHANGED`/incomplete/exit 3 with null data and zero body reads. The ancestor fixtures use directory junctions on Windows. A real POSIX FIFO substituted after admission returned promptly without a body read and closed its descriptor. Oversized input had no body reads; actual growing input returned `LIMIT_EXCEEDED`, read no more than the selected limit plus one byte, and closed its descriptor. Ordinary exact-limit UTF-8/BOM/hash behavior and lexical static-escape rejection passed. Full native acceptance passed 30/30. These are observed-state checks, not an atomic filesystem snapshot or an operating-system path sandbox.

Policy Check public CLI/API cases now suppress table/colgroup-shaped contents inside script/style/textarea/title. Additional API cases cover xmp/iframe/noembed/noframes, opening self-closing slashes, mixed-case and lookalike closing tags, and the original locations of actual HTML findings. Dynamic CFML/hash uncertainty and comment suppression remain conservative. Unclosed text elements, double-escaped script content, plaintext and noscript explicitly return `CFML_STRUCTURE_UNCERTAIN`/incomplete rather than assuming unsupported HTML or scripting-mode semantics. The text-context decision was checked against the primary [WHATWG HTML parsing specification](https://html.spec.whatwg.org/multipage/parsing.html#html-fragment-parsing-algorithm); the package contract explicitly remains a bounded checker rather than a full HTML tokenizer.

Comment handling records ranges and scans visible hash spans once, preserving escaped `##`, unescaped odd hashes, hashes separated by comments, and CFML comments inside text. A single monotonic cooperative deadline covers line indexing, markup/quoted-tag scanning, hashes, direct-child rule evaluation and final sorting. Isolated deadline observers delegated the real operations but advanced the clock to 31 ms during line indexing and after actual final sorting; both 30 ms requests withheld data with `RESOURCE_LIMIT`/incomplete/exit 3. The 240,000-byte/24,000-comment real-input regression either completes within its cooperative tolerance or returns the same incomplete resource result. Three additional public API probes completed as pass in 21.13, 14.20 and 12.42 ms under a 30 ms analysis limit, excluding process startup. This is local measurement, not a universal scheduling guarantee; filesystem I/O, request/profile parsing and result serialization are outside that analysis budget. Full Policy Check native acceptance passed 40/40.

Combined root `npm run verify` exited 0 on macOS with Node `v24.19.0`: all 872 Node tests passed, with zero skips/failures, twelve Python tests, all applicable build/typecheck/lint gates, seventeen dry-run package packs and seven configured packed-consumer checks. All twenty-eight new regressions executed locally. New Linux/Windows execution and CFML engine execution remain unverified. The two new CFML Check leaf-link tests explicitly skip on Windows because file symlink creation requires privileges; its FIFO case explicitly skips because it requires POSIX. Passing earlier hosted gates do not cover these source changes.

Historical import hashes remain unchanged. Four added source-update entries and two refreshed entries bind the six evolved imported implementation/test-entrypoint/contracts to original and exact current hashes, for twenty-five explicit updates; source coverage verifies 698 imported files across ten repositories. Native package identities/versions, compilers, dependencies, license/private flags, registry lifecycle, shared runtime, workflows and release/publication status are unchanged. At local acceptance, the work was uncommitted; its subsequent main integration is recorded below. The new external reference was read as primary semantic evidence; historical external claims were not re-audited. After the evidence update, Hub validation passed eighteen tools, forty documents and 330 links; source coverage and tracked/untracked whitespace checks passed, and the final diff was reviewed. Temporary mutation inputs and verification logs are removed; deliberate regression hooks remain under each package test-support folder.

Reusable prevention record (project scope): descriptor admission must bind the file actually read, including ancestor substitutions; observe consumed bytes and descriptor cleanup, not only final error codes. An analysis deadline must start before the first analysis phase, cover native-operation boundaries and final ordering, and be checked before a complete result. Avoid rebuilding a bounded source once per comment; scan recorded visible spans once. This extends existing project-local reader regressions without adding a shared implementation library or a duplicate global skill. Automatic approval rejected external KB retrieval because it would send repository information to an unconfirmed connector; no external KB evidence was used, and local implementation/contracts supplied the needed context.

## CFML fixes main integration — 2026-10-08

The owner selected commit and push after local acceptance. The final intended thirteen-file diff, including four new regression assets, was reviewed and staged explicitly. Hub validation, source coverage and tracked/untracked whitespace checks passed again; saved verification summaries still showed no failures in build, typecheck, lint, test or pack. Implementation source and regressions were unchanged since the successful 872-Node/twelve-Python root verification recorded above, so the Git integration did not require repeating those unchanged checks.

The source, tests, contracts and existing evidence were committed as `f86a4a9d8c32c3250c5ed83dfbf491082c1a817f` on main. `git push origin main` completed successfully, and a fresh remote branch read-back returned the same exact SHA. This subsequent evidence update changes only TASK/VALIDATION and is validated separately with Hub/source-coverage and whitespace checks. No release, workflow, dependency or registry change is included. New hosted CI acceptance, skipped-platform scenarios and CFML engine behavior remain unverified; the owner selected only commit/push in this step.
