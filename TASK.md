# Task status

## Local CLI validation corrections (2026-10-08)

The owner selected correction and retesting of five issue groups found during Windows Node 24 CLI installation and validation. Test Scope check scripts now use file URL conversions, a Node-based npm invocation and Windows junctions for the packaged consumer. Patch Guard separates file-link permission coverage from always-running directory-link and selected-root checks. Change Impact keeps missing upstream revisions only when their entire imported document matches the immutable source manifest, and reports that upstream Git existence was not reverified. Symbol Search reconciles its current engine declaration and package-scoped Git listing. Four Project Tree files receive formatting-only corrections. Package identities, versions, dependencies, native contracts and publication guards are preserved.

Focused acceptance passed: seven previously failing supplemental gates; 21 of 22 focused tests with one explicitly reported Windows file-symlink permission skip. Complete Windows Node 24 root verification exited 0: 877 Node tests (854 passed, zero failed, 23 explicit platform skips), twelve Python tests, all applicable build/typecheck/lint gates, seventeen dry-run packs and seven packed consumers. A fresh isolated source installation passed all 35 installed CLI startup and representative-input checks plus integrity read-back for eighteen packages. Evidence is owned by [Validation](VALIDATION.md#local-cli-validation-corrections-2026-10-08); local commit is owner-authorized; no push or npm publication is included.

## CFML fixes main integration — 2026-10-08

The owner selected commit and push. All thirteen intended CFML fix, regression, contract and evidence files were committed on main as `f86a4a9d8c32c3250c5ed83dfbf491082c1a817f` and pushed to origin. Remote branch read-back confirmed that exact SHA. The local acceptance remains 872 Node and twelve Python tests, all configured verification gates, seventeen dry-run packs and seven packed-consumer checks. The subsequent evidence update changes only TASK/VALIDATION; implementation source and regressions are unchanged. Current integration evidence is recorded in [Validation](VALIDATION.md#cfml-fixes-main-integration--2026-10-08). New hosted Linux/Windows acceptance remains unverified.

## CFML reader, text contexts and processing budgets — 2026-10-08

The owner selected all three further-review findings for correction. CFML Check now binds bounded source reads to an admitted regular-file descriptor and rejects observed leaf/ancestor or nonregular substitutions before body reads. CFML Policy Check treats supported HTML text contents as opaque, explicitly withholds conclusions for unsupported text states, and applies one monotonic deadline across all analysis phases. Comment/hash processing scans visible spans once instead of repeatedly rebuilding the source.

All twenty-eight new regressions passed locally. Native suites passed 30 CFML Check and 40 CFML Policy Check tests. Combined root verification exited 0 with 872 Node and twelve Python tests, no skips/failures, seventeen dry-run packs, seven packed-consumer checks and all applicable build/typecheck/lint gates. Current evidence and platform limits are recorded in [Validation](VALIDATION.md#cfml-reader-text-contexts-and-processing-budgets--2026-10-08). Historical import hashes remain unchanged; [explicit source updates](docs/migration/SOURCE_UPDATES.json) now record twenty-five evolved imported files. The subsequent owner-selected main integration is recorded above; new hosted Linux/Windows execution remains unverified.

## Read boundary integration and platform follow-up — 2026-10-08

The owner selected commit/push, hosted verification and continued review. The read-boundary fix commit `6a49875` and subsequent Windows test-launch correction `4f41a64` are confirmed on `origin/main`. The exact-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37698313445) passed Linux Node 22/24, macOS Node 22 and Windows Node 22. Linux/macOS each passed 844 Node tests without skips; Windows passed 828 and explicitly skipped sixteen, with zero failures. All four jobs passed twelve Python tests and remaining configured root gates, including seventeen dry-run packs and seven packed-consumer checks. The Windows launcher correction preserves the native assertions and skip conditions. Current evidence and limits are recorded in [Validation](VALIDATION.md#read-boundary-integration-and-platform-follow-up--2026-10-08). The final evidence update changes only Hub documentation; the next three read-only findings are recorded below.

## Further read-only findings — 2026-10-08

The owner selected continued source review alongside commit/push and hosted verification. At main source commit `6a49875080105f9c8df479c42438e02c11680c1a`, synthetic public-entrypoint reproductions confirmed three new unfixed findings: P1 CFML Check follows a post-check outside-root symlink and attributes the outside analysis to the selected input; P2 CFML Policy Check reports tags inside script/textarea text as active policy elements; P2 its comment masking performs repeated whole-source copies outside the processing-time checks. Ordinary-file, static-escape, real-markup, comment and small-input controls passed. The review leaves package implementations unchanged. Evidence and proposed acceptance checks are recorded in [Validation](VALIDATION.md#further-read-only-findings--2026-10-08).

## Read boundary corrections — 2026-10-08

The owner selected all three continued-review findings for correction. Code Slice binds bounded source reads to an admitted regular-file descriptor and rejects observed leaf/ancestor substitutions. Project Profile opens nonblocking where supported and rejects substituted nonregular or different metadata before reading. CFML Policy Check rejects observed oversized source/profile files before body reads and bounds descriptor reads with growth detection. All thirteen targeted regressions passed locally. Full native suites passed 85 Code Slice, 34 Project Profile and 20 CFML Policy Check tests; Code Slice's six public-entrypoint E2E checks and Project Profile's installed packaged-CLI check also passed. Combined root verification passed 844 Node and twelve Python tests, with all remaining configured gates. Evidence and platform limits are recorded in [Validation](VALIDATION.md#read-boundary-corrections--2026-10-08). Package identities, native result fields, dependencies and release status are unchanged. The subsequent commit/push and hosted verification are recorded above.

## Continued read-only review — 2026-10-08

The owner selected further source review. At main commit `46ad8a2947b955646131f31ac763b1cebc3d1a17`, three unfixed findings were reproduced with synthetic local inputs: P1 Code Slice returns source outside an explicit root when a checked file is replaced with a symlink before the read; P2 Project Profile blocks opening a real FIFO substituted after its regular-file probe; P2 CFML Policy Check reads entire oversized source/profile files before enforcing their byte limits. Ordinary-input and rejection controls passed. The implementation remains unchanged; evidence and proposed acceptance checks are recorded in [Validation](VALIDATION.md#continued-read-only-review--2026-10-08). This review does not authorize fixes, a new package release or a new remote integration.

## Main integration and hosted correction verification — 2026-10-07

The owner requested commit and integration into main. The three focused correction commits (`2e6b9f4`, `afd8a76`, `79ba4d7`) were already committed on local main and are confirmed on `origin/main`. The exact-source-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37646804459) passed Linux Node 22/24, macOS Node 22 and Windows Node 22 at `79ba4d7fff8caec275e7134fe4332aebac6c397e`. All seventeen new regressions ran on all four jobs. Current platform counts and limits are recorded in [Validation](VALIDATION.md#main-integration-and-hosted-correction-verification--2026-10-07). This final evidence update changes only Hub documentation; no package release or workflow change is included.

## Error Lens and Project Tree corrections — 2026-10-07

The owner selected all three continued-review findings for correction. Error Lens consumes complete quoted multiline credential values before redaction and identity construction. Project Tree aligns HEAD/worktree directory scope, requires observed absence for deletion, withholds unproved untracked classifications and uses filesystem file evidence for digests. Its containment checks now distinguish a parent segment from legal names beginning with two dots. Package acceptance passed locally: 37 Error Lens tests and 21 Project Tree tests, with their configured checks and the `aptree` smoke. Combined root verification passed with 831 Node tests and twelve Python tests; current source updates and regression evidence are recorded in [Validation](VALIDATION.md#error-lens-and-project-tree-corrections--2026-10-07). Subsequent main integration and hosted verification are recorded above.

## Hosted follow-up verification and continued review — 2026-10-07

The owner selected push, hosted verification and continued read-only review. The three follow-up fix commits are on `origin/main` at `46f272411bc55535799405b9ee3a1ac1a07853c9`; the exact-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37643127428) passed all four existing Linux/macOS/Windows jobs. Linux and macOS each passed 814 Node tests; Windows passed 802 and explicitly skipped twelve. Every job passed twelve Python tests and the remaining root verification gates. Skipped scenarios and Windows Node 24 remain unverified.

The continued review recorded three findings at that head: P1 Error Lens exported the remaining lines of a quoted multiline `private_key`; P1 Project Tree reported ignored, existing tracked files as deleted; P2 Project Tree rejected legal in-root filenames/directories beginning with `..`. Proposed acceptance checks and the observed controls are recorded in [Validation](VALIDATION.md#hosted-follow-up-verification-and-continued-review--2026-10-07). The original review only updated Hub evidence; the subsequent owner-selected corrections are recorded above.

## Follow-up defect fixes — 2026-10-07

The owner selected all three follow-up findings for correction. Test Scope now tries the exact relative module path before source-extension fallback; Release Guard rejects duplicate JSON object keys and over-depth file evidence before parsing; Environment Doctor rejects nonregular inputs before opening and uses POSIX nonblocking descriptor validation. Native package identities, result fields, dependencies and release status remain unchanged. Package tests passed locally: 28 Test Scope, 82 Release Guard and 30 Environment Doctor tests. Packed consumers and combined root verification also passed; current regression, aggregate evidence and platform limits are recorded in [Validation](VALIDATION.md#follow-up-defect-fixes--2026-10-07). Subsequent push and hosted verification are recorded above.

## Hosted verification and follow-up review — 2026-10-07

The owner selected push, cross-platform verification and a further read-only source review. The three fix commits are on `origin/main` at `d948566ffdcaa8ec73e58e41edbc6f71e1b2b7cf`; the exact-head [Actions run](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/37639322549) passed Linux Node 22/24, macOS Node 22 and Windows Node 22. Windows explicitly skipped ten platform-dependent tests; this is not coverage of those scenarios. Current counts, skips and reproduction evidence are recorded in [Validation](VALIDATION.md#hosted-verification-and-follow-up-review--2026-10-07).

The review recorded three findings at that head: P1 Test Scope resolved an explicit JavaScript import to a same-stem TypeScript file and could omit the actual importing test from minimum scope; P1 Release Guard silently resolved conflicting duplicate JSON fields into a passing deployment result; P2 Environment Doctor blocked opening a supplied POSIX FIFO before its regular-file check. Proposed acceptance checks were recorded with each finding in Validation. The subsequent owner-selected fixes are recorded above; the original review itself did not change those implementations or add package releases.

## Test Scope package script ownership — 2026-10-07

The owner selected the reviewed monorepo command fix. Discovery and planning now share package command generation; nested scripts include an explicit npm prefix, same-name scripts retain every owning package and POSIX argument quoting preserves spaces/apostrophes. Commands remain unexecuted recommendations interpreted from the request root. Package acceptance and combined root verification passed locally; evidence is recorded in [Validation](VALIDATION.md#test-scope-package-script-ownership--2026-10-07). Historical import hashes remain unchanged; [explicit source updates](docs/migration/SOURCE_UPDATES.json) record the five evolved imported files with exact current hashes.

## Contract Check removed-property acceptance — 2026-10-07

The owner selected the reviewed false-compatibility fix. Removed explicit properties are now compared with the resulting schema-valued `additionalProperties` using the existing constraint comparator. Type and nested narrowing remain potential-breaking; unproved pattern acceptance remains unknown. Package acceptance passed locally with 50 tests, build, type declarations and packed-consumer checks. Combined monorepo verification also passed; evidence is recorded in [Validation](VALIDATION.md#contract-check-removed-property-acceptance--2026-10-07).

## AIT dispatch package-root containment — 2026-10-07

The owner selected the reviewed AIT path-containment fix. Dispatch now checks the canonical installed package directory against its installation root before resolving either the npm shim or the package executable fallback. A relocated package directory is rejected with `PATH_ESCAPE` before its executable starts. The focused regression covers ordinary fallback, a POSIX executable symlink within the package and an escaped package directory; the AIT suite passed 11/11 locally. Full root `npm run verify` passed locally; current evidence and platform limits are recorded in [Validation](VALIDATION.md#ait-dispatch-package-root-containment--2026-10-07).

## Agent Context Pack — 2026-10-03

The owner requested implementation of the existing `agent-context-pack` registry responsibility. It is implemented in [packages/context-pack](packages/context-pack/README.md) as a private, dependency-free source MVP. Scope: explicit supplied Hub-envelope artifacts and one JSON manifest declaring snapshot, tool identity, optional digests, `mandatory`/`priority` and a UTF-8 byte budget; deterministic ordering, exact artifact-digest and exact-locator deduplication, mandatory-overflow failure and stable omission reasons. Out of scope: running other tools, execution graphs, relevance scoring, span merging, native-contract adapters, Result Store locators, persistent memory and any network/LLM use. Snapshot identity is caller-declared and verified only for consistency. Registry remains 18 entries; source now has 17 package folders. Lifecycle is Experimental; npm identity, release and published verification remain `null`. Current check results are recorded in [Validation](VALIDATION.md). KB synchronization, npm publication and owner-confirmed delivery completion are not part of this change.

Local acceptance passed on macOS Node `v24.21.0`: 41 package tests, strict schemas, declarations, packed consumer, nine selection mutations caught, byte-reproducible example artifacts and the complete root `npm run verify` gate, plus Hub validation and whitespace checks. Windows/Linux, remote CI and the owner's commit/merge decision are pending.

## Rules Resolve and explicit install-all — 2026-10-03

The owner selected Rules Resolve and requested agent-readable GitHub onboarding plus a single npm command to install all implemented CLIs. [Rules Resolve](packages/rules-resolve/README.md) implements bounded local ancestor discovery under the fixed `agents-chain-v1` profile in a private, dependency-free source package. Registry remains 18 entries; source now has 16 tool packages. Its lifecycle is Experimental; npm identity, release and published verification remain `null`. It discovers rule provenance, not semantic conflicts or hidden/global instructions.

[Install all](docs/workflow/INSTALL_ALL.md) adds an explicit source-install route to dependency-free AIT, retaining the existing individual registry install/dispatch contracts. Local checkout or the fixed owned GitHub repository is copied to an isolated build snapshot, then all implemented CLIs are installed into a new prefix. Build/Experimental approval flags are required; private tools are not represented as published packages. The workflow skill now routes agents to this guide and native contracts. Current validation is recorded in [Validation](VALIDATION.md); remote availability and cross-platform CI remain separate from local implementation.

Local acceptance passed on macOS Node `v24.21.0`: 58 Rules Resolve tests, 11 installer regressions, complete root verification and packed consumers. One packed-bootstrap npm command installed all 17 CLIs into an isolated prefix; every launcher started and installed production versions matched source locks. GitHub bootstrap, exact-head CI and the authorized merge are verified in the PR before completion. No npm publication or personal/global configuration change is part of this delivery.

## Agent Patch Guard — 2026-10-03

The owner requested a new Patch Guard implementation in this project. The existing `agent-patch-guard` registry responsibility is implemented in [packages/patch-guard](packages/patch-guard/README.md) as a private source MVP with no runtime dependencies. Its scope is explicit supplied Git patch artifacts plus JSON policy; no worktree collection, patch application or project-command execution. Root verification includes the new package and its packed-consumer smoke check. Registry remains 18 tools and source now has 15 package folders. Lifecycle is Experimental; npm identity/release/evidence remain `null`. Current check results are recorded in [Validation](VALIDATION.md); historical entries below retain their dates and scope.

Local acceptance passed on macOS Node `v24.21.0`: 50 package tests, schemas/declarations, packed consumers and the complete root `npm run verify` gate. Root verification needed execution approval for existing Release Guard loopback HTTP fixtures. Source coverage and final documentation/whitespace checks passed. The owner subsequently authorized commit and merge; exact-head remote CI and merge evidence are tracked in the pull request. npm publication and global CLI installation remain separate, unperformed actions.

## Optional workflow, deployment collection and UI evidence — 2026-09-30

Owner authorizes scoped implementation/install/merge. Acceptance matrix: [TKT-20260930-004](tickets/TKT-20260930-004-evidence-ui-workflow.md). Existing Release Guard and Runtime Trace responsibilities are reused. Personal configurations and Shop remain untouched; legacy repository audit is read-only. No npm publication.


## Deploy Verify — 2026-09-30

Owner authorizes implementation through merge after exact-head required CI/review gates. Release Guard now owns the offline Deploy Verify profile in `packages/release-guard`; no duplicate registry entry or live deployment/publishing service is introduced. Source/local CLI installation is documented. Implementation and checks are tracked in ticket TKT-20260930-003 and the PR. Registry stays 18 entries; source now contains 13 tool folders. Original imported ten packages remain unchanged.


## Environment Doctor and Contract Check — 2026-09-30

Implementation and local package/root verification are complete in the feature branch, awaiting draft PR review and exact-head CI evidence tracked in the PR. [Usage and limits](docs/mvp/VERIFICATION.md), [Doctor](packages/environment-doctor/README.md), [Contract Check](packages/contract-check/README.md). Both are private source MVPs, no npm publication. Contract Check implements the existing Contract Diff responsibility; registry now has 18 entries and source has 12 package folders. Existing ten packages and source provenance remain unchanged.

## Consolidation checkpoint — 2026-09-30

All ten owned source heads are imported with hashes, local recovery bundles and preserved contracts/licenses/private flags. Root package orchestration retains per-package locks and compilers. See [migration](docs/migration/README.md) and [verification](docs/migration/VERIFICATION.md) for measured results and blockers. No original repository was changed/deleted; no npm publication or merge occurred. Prior entries below remain historical evidence.


Status date: 2026-09-16. Scope: AI-Agent-Tools Hub. This is the authoritative Hub
execution ledger; package folders own their implementation tasks.

## Current situation

The Hub documentation, registry, local Python validator, and dependency-free AIT
runtime now exist. The initial tracked baseline was `2f2d46e`; Git history records
subsequent Hub documentation and runtime commits. A commit is not a tool release or
a push. AIT package `ai-agent-tools@0.1.1` is publicly published under Apache-2.0;
npm registry read-back and clean consumer installation are verified.
The published AIT artifact does not contain tool implementations; the source repository now contains twelve independent package folders.

**Code Slice delivery is Done**, confirmed by the owner on 2026-09-06. Published
`agent-code-slice@0.2.0` metadata matches its repository and `code-slice` executable.
Prior local tests at `7f2969f` remain separately scoped source evidence. Its Hub
lifecycles stay Experimental only because protocol conformance is still pending.
Change Impact now has an inspectable implementation and is Experimental after the
implementation/test admission audit, but is not delivery Done. See [VALIDATION.md](VALIDATION.md)
for snapshot scope; a manifest or type definition is not an implemented capability.
Project Profile now has an inspectable implementation and published npm identity,
but its corrected source release `0.1.2` is not published. A prior audit recorded a
registry `0.1.1` distribution defect; the current exact-artifact re-audit did not
reproduce it on this host, but the exact artifact omits its declared MIT `LICENSE`
file. The release/platform discrepancy remains unresolved. Its current public main
is `b711b724`, with a successful CI run; this does not publish `0.1.2`. It remains
Experimental and is not delivery Done.

Three owner-requested tools are now registered, with detailed draft
specifications: CFML Check, Result Store and Runtime Trace. CFML Check is now
Experimental after the implementation admission audit. Symbol Search was
appended as an Experimental implementation admission on 2026-09-08. CFML Policy
Check was appended on 2026-09-16 as a separate Planned repository for configurable
CFML/HTML/project rules. The registry contains fifteen entries with one
owner-confirmed completion. The original ten-tool order and the prior appended
sequence are unchanged. Company KB knowledge retrieved on 2026-09-07 records Change Impact
in progress and Project Profile next with an approved V1 boundary; those records
are knowledge evidence, not a new source/release audit by this Hub. The current
Symbol Search main CI run fails its Documentation check on Ubuntu Node 22/24/26
while package-smoke jobs pass; the published `0.1.2` artifact remains separately
audited.

Option A has now produced a public independent CFML Check implementation at
`AI-Agent-Tool-CFML-Check` commit `d132a82de4e2a764710e04968f8a480b8b6153c7`.
Its implementation, capabilities response, typecheck, 22/22 test run, and
package-surface checks are evidence for an Experimental implementation only.
Engine compatibility, maintainer release evidence and Hub protocol conformance
remain unverified.

## Task vocabulary

| Status | Meaning |
| --- | --- |
| Done | The scoped deliverable exists and the applicable check is recorded |
| In progress | Work has started but acceptance is incomplete |
| Planned | Identified work with no completed acceptance evidence |
| Blocked | A concrete unavailable input, resource, access, or approval prevents the next required action |
| Deferred | Outside current delivery scope; no release commitment |

These task states are distinct from registry lifecycle. An unmet task dependency
or an unimplemented feature is not automatically an external blocker.

## Work ledger

| ID | Work | Status | Depends on | Evidence / remaining acceptance |
| --- | --- | --- | --- | --- |
| HUB-01 | Establish Hub standards, registry, roadmap, and validator | Done | None | Existing foundation; V-01 through V-05 |
| HUB-02 | Review all ten tool functions and Hub boundaries | Done | None | Dated function review; Code Slice local evidence V-06; planned tools assessed as designs |
| HUB-03 | Reconcile document ownership, task state, and confirmed registry facts | Done | HUB-01, HUB-02 | DESIGN/SPEC/EPIC/TASK/index/validation added; confirmed repository links and Code Slice Experimental; V-01 through V-05 |
| HUB-04 | Resolve native/Hub JSON, exit, and completeness contracts | In progress | HUB-02 | E-02; target envelope semantics are locked by executable consumer fixtures under `tests/hub_consumer.test.js`. Code Slice, Project Profile, Change Impact, Test Scope, CFML Check, and Symbol Search now have explicit native profiles under `docs/profiles/`, including bounded/partial semantics and native error authority. Other native tools still require separate profiles or migration; no contract is inferred |
| HUB-05 | Audit published identities/artifacts and collect Hub conformance evidence | In progress | HUB-03; HUB-04 for conformance | E-03; exact packlists for six published versions and current remote-head/CI observations are recorded in V-25/V-26; Project Profile license/release gap, Symbol Search current-main CI failure, independent artifact/remote reconciliation, and Hub conformance remain pending |
| HUB-06 | Implement the AIT discovery, installation, and dispatch runtime | In progress | HUB-03, HUB-04 | E-04; local `ai-agent-tools@0.1.1` implements list/doctor/pinned install/local-path install/explicit dispatch, `ait-result/v1`, and exact catalog-backed native profile selection/application; the packed default-registry omission was corrected and is recorded in V-27, while remote refresh, sandboxing, and provenance policy remain pending |
| HUB-07 | Hand off bounded first-version contracts in roadmap order | Planned | HUB-02 | E-05; independent owners implement and validate tools |
| HUB-08 | Evaluate shared infrastructure only at the maturity gate | Deferred | None | E-06; roughly 3–5 mature maintained tools and concrete duplication not evidenced |
| HUB-09 | Specify three additions, reconcile Hub documents/registry, and synchronize Company KB | Done | Owner request; HUB-03 | Local design/registry handoff verified under V-07; User-tier KB synchronization and exact readback verified under V-08 and current reconciliation V-12; company-wide visibility remains separate because the KB is intentionally User-visible |
| HUB-10 | Hand off CFML Check lexical/structural feasibility | In progress | HUB-09; independent owner/repository | E-08; public implementation, capabilities, typecheck, 22/22 tests, package-surface checks, and published 0.1.1 artifact smoke are recorded; CF-14 engine trial, broader platform, and Hub protocol evidence remain pending |
| HUB-11 | Hand off Result Store persistence and producer integration | Planned | HUB-09; independent owner/repository | E-08; RS-01 through RS-13 proposed; no store or connector implemented |
| HUB-12 | Hand off Runtime Trace event/readback correlation | Planned | HUB-09; independent owner/repository | E-08; RT-01 through RT-13 proposed; no instrumentation or runtime trial |
| HUB-13 | Register CFML Policy Check policy-linting handoff and independent repository boundary | Done | Owner request; HUB-03 | Registry, roadmap, expansion boundary, and detailed handoff added; repository identity confirmed, while implementation/package/test/release evidence remains pending; V-31 |

## Delivery completion notices

- Code Slice: **Done**, owner-confirmed 2026-09-06; recorded published version `0.2.0`.
- Remaining fourteen tools: awaiting owner completion notices. The owner will provide
  updates; no background polling or inferred completion is requested. Project
  Profile has review evidence but no delivery completion notice; it remains
  outside the completed count.
- On each notice, verify identity/evidence, synchronize Hub documentation and registry,
  run validation, and commit the resulting Hub documentation changes. Keep native
  delivery and Hub protocol conformance separate.

## Decisions and pending work

- Accepted boundaries and rationale are in [DESIGN.md](DESIGN.md); existing target
  standards and registry versions stay `1.0.0`.
- The Hub target envelope and completeness matrix are resolved by executable
  fixtures. Code Slice, Project Profile, Change Impact, Test Scope, CFML Check, and
  Symbol Search have explicit consumer profiles; profiles for other native tools or explicit migration remain
  engineering decisions, not an automatic compatibility layer. Preserve current
  consumers.
- Code Slice npm publication identity for `0.2.0` is confirmed; its exact artifact
  behavior and Hub conformance remain unaudited here. Other package fields stay `null`.
- Project Profile repository and npm identity are confirmed, and its source commit
  passed the local implementation checks recorded in [VALIDATION.md](VALIDATION.md).
  A prior audit recorded a published `0.1.1` CLI distribution defect, while the
  current exact-artifact re-audit did not reproduce it on this host. The exact
  published artifact omits its declared MIT `LICENSE` file; the source `0.1.2`
  correction remains unpublished, so the release/platform discrepancy is unresolved
  and its registry lifecycle remains `Experimental`, with no verification snapshot.
- Symbol Search repository identity and current source commit are confirmed. Its
  TypeScript implementation passed the recorded repository verification suite, and
  the published `0.1.2` artifact is audited for native profile evidence. The current
  public main CI run fails its Documentation check on Ubuntu Node 22/24/26 while
  package smoke passes on Ubuntu/macOS/Windows; Hub protocol conformance and a
  verification snapshot remain unverified.
- Confirm later tools' repository identities, first formats/languages, budgets,
  test scope, and maintainers before expanding claims.
- AIT package distribution has completed its public-release step. The Apache-2.0
  license decision is recorded, the packed-consumer gate exposed and corrected
  omission of the default `TOOL_REGISTRY.json`, and the published package passed
  registry read-back and clean consumer installation. Remote refresh, provenance,
  and sandbox policies remain separate runtime work.
  Exact-version native profile selection/application is implemented only for the
  checked-in catalog and bounded validators; it is not a universal compatibility
  layer. CFML Check and Symbol Search can now match the catalog only after their
  registry identities are confirmed in the selected snapshot.
- Within the three additions, CFML Check's bounded feasibility work is now the
  active first spike. Preserve the existing Change Impact / Project Profile
  sequence. Detailed contracts and current evidence are linked from [the expansion
  review](docs/TOOL_EXPANSION.md).
- CFML Policy Check is a separate Planned tool for configurable CFML/HTML/project
  rules. Freeze its rule-profile schema and fixture-backed V1 in its independent
  repository; keep missing `#` expression delimiters and other language-structural
  findings owned by CFML Check.
- Checked-in validator regression tests now cover the current repository, JSON
  parsing and malformed roadmap rows. Executable Hub consumer fixtures now cover
  success-with-findings, partial/ambiguous/unsupported/limited incomplete outcomes,
  invalid/internal errors, native-envelope rejection, and exit/status mismatches.
  The prior review's Planned-release and
  evidence-URL acceptance cases are not established bugs against the current
  human-reviewed registry contract.

## Blockers and risk

No external blocker prevents current Hub documentation maintenance. There is an
unresolved native-profile dependency before cross-tool composition and external Hub
conformance; the target Hub envelope semantics are now executable and verified.
User-tier synchronization for HUB-09 was completed and read back successfully at
its 2026-09-15 reconciliation. The affected design, status, SSOT, functional-map
and schema records were updated in place; the new Symbol Search status record was
read back with its returned ID. The KB visibility is intentionally `user`, so
company-tier sharing remains a separate follow-up rather than an unreported
assumption. The earlier Company-tier attempts were correctly rejected with
`SHARE_TIER_DENIED: above_scope`.
Active sibling working-tree development can stale observations quickly; dated
evidence must not be mistaken for a released or continuously monitored state.
CFML Check's public repository identity and Experimental lifecycle admission are
now confirmed; its engine compatibility claim remains unverified.
Release credentials, CI availability, and publication permissions are unassessed,
not reported as failed or granted.
Project Profile's source and registry versions are currently split: current public
source is `0.1.2`, while npm `latest` is `0.1.1`; the published artifact also omits
its declared MIT license file. Code Slice's current public/npm latest is `0.4.0`,
while the Hub retains the separately reviewed `0.2.0` release snapshot. Symbol
Search current-main CI has a documentation-check failure despite published-artifact
smoke evidence.

## Next steps

Keep the 2026-09-15 User-tier reconciliation receipt and returned item IDs with
this working-tree state. If company-wide collaboration is later required, change
visibility and authorization deliberately, then run a separate Company-tier
readback. The existing ecosystem work below keeps its original order.

1. Extend explicit native profiles only when cross-tool composition is requested;
   preserve existing consumers and do not infer migration from the existing profiles.
2. Audit exact published artifacts and identities under HUB-05; update registry
   release/evidence fields only when their meaning is satisfied. Resolve the Project
   Profile package/license gap and current Symbol Search CI failure before any
   promotion claim.
3. Review and harden the three Experimental implementations, then obtain
   engine/package/protocol evidence before considering further promotion.
   The owner still reports tool delivery completion; do not infer it from this spike.
4. Complete HUB-06 runtime acceptance, then decide whether to publish `agent-tools`
   only after the packed-consumer gate, license/ownership decision, and explicit
   provenance policy are satisfied. Keep remote refresh and OS sandboxing out of
   the current runtime; document them as separate future decisions. Keep shared
   tool implementation consolidation behind the existing maturity gate.
5. Build the CFML Policy Check vertical slice in its independent repository only
   after its rule profile, dynamic-source incomplete behavior, and path/resource
   limits are frozen. Do not add its implementation to the Hub.
