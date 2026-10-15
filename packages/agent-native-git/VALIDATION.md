# Validation

## Monorepo migration — 2026-10-15 current source location

The owner authorized importing committed source `46e46123adaea304884f5e0e0c7ef6235426153e` into `AI-Agent-Tools/packages/agent-native-git`, with independent package identity/lock/license/runtime and native CLI contracts preserved. Original workspace receipts below remain historical. [Import provenance](../../docs/migration/AGENT_NATIVE_GIT_IMPORT.json) records original/current bytes and explicit metadata/navigation adapters; [Hub migration observations](../../docs/migration/AGENT_NATIVE_GIT_VERIFICATION.md) record fresh checks and limits. Do not treat the original native helper binary hashes or passing receipts as verification of a rebuilt/moved tree.

This migration does not enable Worker/integration/restore, approve real providers, repair existing ACLs, publish or push. Current availability remains 13/18. The canonical continuation is [HANDOFF](docs/HANDOFF.md) in this package, not the original recovery workspace.

## End-of-day handoff — 2026-10-15 local Git closeout only

The owner requested Markdown handoff and local commit/integration into `main`, superseding the earlier no-Git restriction for this closeout only. The directory had no repository; `29f8a3a` is the initial import. The [handoff](docs/HANDOFF.md) records the remaining assignments and operating boundaries. No production runtime implementation, real-provider/service execution, remote push, publication or Hub change is part of closeout.

Baseline commit checks exercised: Secretlint quick-start 13.0.5 from the existing offline cache scanned all 426 explicit staged files with default recommended rules and masking; all five batches exited 0. Staged whitespace passed after removing one extra EOF blank line from CLI_REFERENCE.md. `/temp/`, caches/dependencies, generated `dist/` and local `tests/.native/` binaries were confirmed ignored. No scanner configuration/dependency was installed or source rewritten by the scan.

Final repository coverage found 43 existing `schemas/` files omitted from the initial staging set. All 43 matched their historical source-manifest hashes; a separate masked Secretlint scan exited 0. They are included through the repository-completeness correction branch without changing schema contents. The initial 426-file scan was not full repository coverage; the separate schema scan closes that gap. The [dated completeness receipt](evidence/end-of-day-schema-completeness.json) preserves this correction without rewriting the first closeout receipt.

This closeout changes Markdown and Git exclusions only. The completed Stage 2 full gate and Stage 3 probes below are prior actual runs, not rerun results. Their manifests remain dated snapshots; `.gitignore` and the CLI-reference whitespace intentionally changed after the preflight consistency receipt. Final handoff verification is recorded separately in [closeout evidence](evidence/end-of-day-handoff.json).

## Stage 3 prerequisites — 2026-10-15 isolated evidence, not product Worker delivery

Authorized scope was A+B+C: isolated startup/handoff mechanics, an English implementation plan and fault/security review. The [preflight observations](docs/STAGE3_PREFLIGHT.md) distinguish every exercised case from the proposed production [acceptance gates](docs/STAGE3_PLAN.md).

- Final positive command exited 0 on actual Node24.21.0/SQLite3.53.4 Windows x64: six cases passed; normal background guard retention, three rejected invalid controls, creator loss before transfer, creator loss at both committed-transfer cutpoints, omitted-reply observation and actual Coordinator-crash root/descendant EOF proof. See [exact receipt](evidence/stage3-worker-preflight.json).
- Existing `readTerminationReceipt` accepted authenticated `parent_eof` writer-tree proof after actual inert root and descendant entry. Guard release was checked separately. No claim about arbitrary ancestor Jobs, Host loss, migration, public Worker authorization or drain follows from this.
- Intentional post-READY graceful-stop failure exited 1; the runner rejected actual Coordinator exit 1 and retained the fixture. Its [negative receipt](evidence/stage3-worker-preflight-negative.json) is expected failure evidence, not a successful shutdown.
- Initial direct-container admission failed with `INSECURE_STATE` at the default Temp anchor before compilation/launch. Corrected only the newly allocated fixture layout by creating a protected private child; no existing ACL repair or admission weakening. Failed/negative fixtures remain preserved.
- Static impact returned `NOT_A_REPOSITORY`; no Git repository was initialized to satisfy it. Bounded direct seams and Stage 2 byte identities are the fallback, not a complete impact graph.

Product runtime remains Stage 2, with 13/18 leaves available. Existing runtime/public contract/SQL/native assets and prior receipts are preserved. The full historical Stage 2 gate below was not rerun for standalone fixture/documentation work. Current source/links/whitespace and receipt preservation observations are recorded in [preflight consistency](evidence/stage3-final-consistency.json).

## Stage 2 — 2026-10-15 scoped local verification completed

### Current local verification

The complete current runtime gate passed under actual Node24.21.0 on Windows x64.
This completes the selected controlled-worktree/foreground-lifecycle stage, not the
whole eighteen-command product, supported-provider certification or a release.

| Check | Exercised result | Receipt |
|---|---|---|
| `npm run verify` | Exit 0, no signal or stderr; build/typecheck, contracts, behavior and installed consumer; 11713933 ms overall | [aggregate](evidence/stage2-verification.json), [summary](evidence/stage2-final-summary.json) |
| Actual behavioral suite | 53 passed, zero failed/cancelled/skipped; 11125994.6198 ms | [aggregate](evidence/stage2-verification.json) |
| Offline contracts and SQL | 42 schemas, 276 fixtures, 18 command contracts; 90 SQL cases and 70 negative rejections | [aggregate](evidence/stage2-verification.json) |
| Offline installed consumer | Installer scripts disabled; 111 packed files, all eighteen help leaves, ten metadata paths, actual `agent start` and submitted capture with owner HEAD preserved | [packed consumer](evidence/stage2-pack.json) |
| Public implementation scope | Thirteen implemented leaves; worker/integration/restore five remain unavailable before effects | [capabilities](evidence/stage2-capabilities.json), [packed consumer](evidence/stage2-pack.json) |
| Historical Hub `/temp/` exclusion checks | Hub verify, validator, whitespace check and actual ignore match passed separately; no product registration implied | [Hub checks](evidence/stage2-hub-ignore-checks.json) |

Actual coverage includes controlled worktrees and owner source/index/ref preservation,
bounded parallel admission/dependency blocking, live brokered additions, stop/cancel
and semantic replay, independent durable start during another capture, native
descendants/EOF/heartbeat/timeout/output/ACL boundaries, exact receipt recovery,
physical artifact quota, strict JSON/history and the Stage 1 metadata regressions.

The successful tarball hash identifies its disposable pre-final-documentation snapshot,
not a published or signed artifact. Runtime source was not changed after this gate;
final status/documentation/byte checks are recorded in the
[source manifest](evidence/stage2-source-manifest.json) and
[final consistency receipt](evidence/stage2-final-consistency.json).
Earlier failed/interrupted runs and unknown owned fixtures remain preserved. They
are not silently adopted, deleted, assigned fake terminal timestamps or retried as
whole commands. The native inspection cost measured below is not a latency guarantee.

No real Codex/Claude/Pi, background worker/service, integration, restore, strong
sandbox, default-host deployment, whole-project backup activation, product Git
initialization/commit/push or publication was performed. The packed run's alternate
runtime probe found Node24 and did not exercise Node25; the separate earlier
[actual Node25 rejection](evidence/stage2-runtime-boundary.json) remains a distinct receipt.

### Earlier Stage 2 observations — historical

The following observations preserve each earlier run's failures, pending state and
review limits. Their pending/failure wording does not override the current completed
gate above; no earlier failed run is rewritten as a success.


Current source adds controlled worktree allocation/capture and foreground agent start/stop/run. Build succeeded. The first lifecycle smoke exposed an invalid `git config --worktree` audit when the deliberately unsupported worktreeConfig extension was disabled; the managed audit now checks effective common local config without editing owner config.

A later clean lifecycle attempt reached durable observed start but failed with NATIVE_EXECUTION_UNKNOWN: the native loss deadline used the 1000 ms heartbeat send interval instead of approved lease duration. The source now separates periodic send cadence from the loss deadline. Its retained native receipt recorded heartbeat termination; no terminal timestamp or submission was fabricated. The owned fixture at `C:/Users/tno/AppData/Local/Temp/angit stage1 ns90oU` remains preserved pending exact reconciliation. An earlier pre-spawn unknown allocation at `C:/Users/tno/AppData/Local/Temp/angit stage1 YFnpAP` is also preserved.

Initial standalone verification passed six of seven cases; wrong launch binding had the wrong error classification. Subsequent native verification passed all seven lifecycle cases, including exact receipt/launch/artifact binding. The native broker challenge proved restricted-token denial; its denial-envelope decoder was corrected. Earlier 60/360-second truncated selections are not acceptance evidence. [Initial failures](evidence/stage2-initial-failures.json), [targeted observations](evidence/stage2-targeted-observations.json) and [failed aggregate verification](evidence/stage2-full-initial.json) remain separate from final acceptance.

The clean actual native lifecycle, create-only submission, immutable replay and owner dirty/untracked/ignored/index/ref preservation scenario passed. A separate [120000 ms lease execution smoke](evidence/stage2-long-lease.json) completed in 295131 ms, retained full writer-tree termination and correctly reported the nonzero fixture as failed/needs_review, never task completion. [Actual Node25.2.1 public API](evidence/stage2-runtime-boundary.json) remained rejected with UNSUPPORTED_RUNTIME/exit 3. These are exercised subsets, not full Stage 2 or default-host deployment approval. No real provider, worker, integration, restore, strong sandbox or release is claimed.

The first full Stage 2 aggregate failed and stopped at its two-hour bound before a complete suite summary or packaging smoke. It included retry/stop/cancel/EOF failures; isolated unchanged-source stop/retry scenarios later passed, so attribution to the source-backed control-write races remains [INFERENCE]. Five actual native control-loss scenarios and eight native lifecycle/receipt/ACL scenarios passed after those transport corrections.

Core parent-loss recovery still failed before supervisor parent-Job separation: its new owned fixture at `C:/Users/tno/AppData/Local/Temp/angit stage1 PsG5r9` retains a running attempt with no ended timestamp or termination receipt. [Node24 Windows libuv source](https://raw.githubusercontent.com/nodejs/node/v24.21.0/deps/uv/src/win/process.c) explicitly assigns non-detached spawned helpers to the Node parent's kill-on-close Job. Only the fixed `--supervisor-v1` helper now bypasses that parent Job; referenced stdio, foreground completion, bounded heartbeat and its own provider Job remain intact. The post-correction [actual Core EOF recovery](evidence/stage2-eof-recovery.json) passed in 325032 ms, including missing-proof preservation and restored-proof recovery with no respawn. Full current-source acceptance remains pending. The developer aggregate bound is five hours with immediate TAP diagnostics; individual scenario/effect deadlines are unchanged.

The [native boundary review](evidence/stage2-native-review.json) reported no material source finding but did not execute checks or certify acceptance. The [Core review](evidence/stage2-core-review-resolution.json) identified target-local admission conflicts stopping unrelated work and unavailable committed stop replay after broker shutdown. Both source corrections passed actual [before](evidence/stage2-consumer-before.json)/[after](evidence/stage2-consumer-after.json) consumer regressions, including cancellation, advisory refresh and post-shutdown stop replay/conflicting-key rejection. These three tests passed in 1173391 ms; full verification remains pending. No post-fix reviewer PASS is claimed.

The [consumer regressions before correction](evidence/stage2-consumer-before.json) reproduced unavailable stop replay and unrelated work entering stopping after queued-target cancellation. A separate actual live-task addition remained queued with zero attempts for the 60000 ms observation bound despite spare parallel capacity. The scheduler now accepts a coalesced wake from committed brokered additions/messages while capacity is available; its direct and full-suite case passed, while aggregate acceptance remains failed/pending.

The next complete [current-source run](evidence/stage2-verification-second-failure.json) finished under actual Node24 with 49 tests: 44 passed and five failed; packaging was not reached. Its first gated parallel failure retained `C:/Users/tno/AppData/Local/Temp/angit stage1 BPqzUG` with two orphaned attempts, no observed process start, prepared worktree intents and exact GIT_TIMEOUT events. Later failures included initial-running observation and foreground cleanup. The spare-slot wake passed both its direct smoke (359506 ms) and this full suite's corresponding case (1195011 ms); that does not convert the aggregate into PASS.

Source investigation found cleanup masking primary failures, a ten-second finally cutoff abandoning an in-process foreground request, and a global completion-count gate that could block unrelated provisioning. Fixture-only corrections preserve the primary error, drain actual foreground completion, and use a project-bound single-use admission gate after the unrelated native root is observed. Specific attribution of each recorded failure is not assumed. A separate [read-only admission-cost observation](evidence/stage2-admission-cost.json) measured 2893 ms of synchronous discovery/policy inspection; actual Git deadline diagnosis and post-correction acceptance remain in progress.

The [actual Git deadline reproduction](evidence/stage2-git-deadline-before.json) independently observed successful native Git exit in 826.6995 ms but delayed Node close observation by 16985 ms; the old main-thread timer incorrectly returned GIT_TIMEOUT. A pending-input control also enforced its 15000 ms budget late, at 17770.0927 ms. The specific earlier suite timeout remains [INFERENCE] because its original Git command/native exit timestamp was not recorded.

Git process/input/capture/deadline handling now runs in one finite internal worker per invocation, retaining all main-thread approval/identity checks and the unchanged native 15000 ms/4194304-byte combined budget. [Post-correction direct smoke](evidence/stage2-git-deadline-after.json) proved early native exit in 648.829 ms still succeeds through a 17000 ms parent block, while genuinely slow input is terminated at native 15002.8949 ms and returns GIT_TIMEOUT. Results settle after actual worker exit. Two permanent real-Git input-delay/binary/overflow regressions passed; the initial new fixture lacked its required private empty hooks directory and was corrected without changing production checks. Full lifecycle acceptance remains pending.

The subsequent [post-deadline targeted lifecycle run](evidence/stage2-post-deadline-lifecycle-failure.json) failed all five cases in 3857789.4385 ms. Four failed while observing initial leased/pre-spawn progress before the intended EOF or broker-conflict path; the parallel case observed zero running roots. Unknown prepared ownership remains preserved. The separate [readonly scheduling comparison](evidence/stage2-heartbeat-progress-before.json) completed all three actual approved Git reads under both fixed-interval and completion-spaced heartbeat inspection. It does not establish timer starvation or justify weakening lifecycle checks; real provisioning progress is under investigation.

Fresh read-only fixture polling retains public CLI assertions and reduces observer work, but the [lightweight-observer selection](evidence/stage2-lightweight-observer-failure.json) still failed its initial submission observation. The [completed two-task trace](evidence/stage2-lifecycle-progress.json), without status polling during execution, recorded 793056.7474/819714.4316 ms worktree provisioning and 427636.6846 ms first capture. Of 1627430.8853 ms overall, 469 live checks consumed 1190238.3469 ms. This proves substantial bounded native inspection cost, not an interval-timer deadlock.

In that trace one task was submitted and the independent suspended process timed out before its durable start record; the run retained unknown ownership at `C:/Users/tno/AppData/Local/Temp/angit stage1 BTKQvf`. Source had queued the synchronous durable-start transaction behind unrelated asynchronous capture on the global mutation tail. It now commits this transaction directly on the single JS thread, preserving every guard/lease/worktree/process check and resume-after-commit ordering. The [new actual-native capture/start regression](evidence/stage2-start-capture-regression.json) passed in 1968499.4786 ms: the independent root resumed before the first capture gate was released, both tasks were then submitted with full termination proof, and owner HEAD remained unchanged. Aggregate verification remains pending; the specific full earlier failure attribution remains [INFERENCE]. Fixture observation/case and package-check ceilings now accommodate the measured preparation/capture duration; production Git deadlines, execution budgets, leases and native loss bounds are unchanged. [Verbatim diagnostic runners](evidence/stage2-progress-runners.json) preserve reproduction sources.

The [next aggregate run](evidence/stage2-verification-five-hour-failure.json) reached its five-hour ceiling after 45 completed tests (43 passed, two failed); no complete suite summary or installed-consumer result was produced. EOF recovery, live admission, queued cancellation/advisory and the finite Git regressions passed in that run. The descendant-slot fixture at `C:/Users/tno/AppData/Local/Temp/angit stage1 M4JNQD` retained its first exact cancelled/terminated attempt and a later durably running attempt interrupted before final capture. Its full foreground observer still had the older fifteen-minute cutoff. The gated parallel fixture at `C:/Users/tno/AppData/Local/Temp/angit stage1 1nfBzj` recorded exact heartbeat termination for the first root, accepted stop for the second and a preserved unstarted third allocation. Neither fixture is deleted or adopted.

A separate [native resume regression](evidence/stage2-resume-heartbeat-regression.json) independently failed before correction: after 1200 ms durable-start work, no periodic pulses and a 2000 ms watchdog, a later authorized stop observed heartbeat termination instead. Resume now sends one authenticated pulse only after the durable-start callback succeeds, before permitting provider execution. With exactly the same watchdog/process budgets, the regression passed and retained the expected exact stop/full-tree/artifact proof. Whole-foreground fixture observation and aggregate ceilings now accommodate actual bounded work without changing production process, lease, Git or loss budgets. Parallel and aggregate acceptance remain pending.

Both previously failing [parallel/descendant-slot scenarios](evidence/stage2-parallel-slot-regressions.json) then passed in 4845443.5307 ms total. They exercised actual separate-consumer stop, surviving-descendant ownership, no duplicate admission, two real gated concurrent roots, later slot reuse, submitted-dependency blocking and owner checkout/ref preservation. Their production process/watchdog/lease/Git budgets were unchanged; full-suite and installed-consumer acceptance still require a new complete run.

The first standalone [installed-consumer attempt](evidence/stage2-pack-interrupted.json) reached its external 1200-second deadline without a final report. It used the pre-worker compiled distribution and is not package acceptance. Its owned interrupted consumer is preserved; a current-source offline consumer run remains required.

The original Hub's requested `/temp/` exclusion remains at `.gitignore:40`. Its separate [required checks](evidence/stage2-hub-ignore-checks.json) passed: `npm run verify`, `python3 scripts/validate_hub.py`, `git diff --check` and actual `git check-ignore -v -- temp/`. The validator reported 19 registry tools, 55 documents and 508 links; its 67 existing external URLs are not new release claims. These checks do not certify the independent product or modify/register its source.

## Stage 1 — 2026-10-14 local metadata acceptance

This section preserves the exercised Stage 1 boundary; its ten/eight command split and metadata-only limits are historical, not current Stage 2 availability.

Implemented scope: ten read/metadata CLI leaves, shared public API and Windows filesystem admission in the independent private `0.0.0` development package. Eight future execution/worker/integration/restore leaves remain unavailable. No provider, service, release, Hub integration or strong-sandbox acceptance is implied.

| Check | Exercised result | Receipt |
|---|---|---|
| `npm run verify` under actual Node24.21.0 | Exit 0; build, typecheck, offline contracts, behavioral suite and installed-consumer smoke | [verification](evidence/stage1-verification.json) |
| Permanent behavioral suite | 16 passed; 0 failed/skipped; parser, CLI framing/output, metadata lifecycle, scope/check/DAG/pins, replay/follow, guard, native admission and missing/future storage | [verification](evidence/stage1-verification.json) |
| Offline contract representation | 42 schemas, 276 fixtures, 18 command contracts; 90 SQL cases/70 negative rejections on Python SQLite3.50.4 | [verification](evidence/stage1-verification.json) |
| Installed private consumer | Offline install, scripts disabled; eighteen help leaves and ten actual metadata command paths; unverified baseline retained | [pack smoke](evidence/stage1-pack.json), [latest verification](evidence/stage1-verification.json) |
| Public API unsupported runtime | Actual Node25.2.1 rejected before native/storage/Git admission | [pack smoke](evidence/stage1-pack.json) |
| Healthy short init lease | 3000 ms lease/1000 ms heartbeat; prepared-to-finalized interval 14062 ms completed | [lease/quota](evidence/stage1-lease-quota.json) |
| Storage quota boundary | Actual checkpointed main DB 471040 bytes; explicit 131072-byte growth reserve; within-bound allowance accepted, two-byte overrun denied | [lease/quota](evidence/stage1-lease-quota.json) |
| Actual public default-host admission | Exit 4, INSECURE_STATE; no default namespace created and owner HEAD unchanged | [default host](evidence/stage1-default-host.json) |
| Independent source reviews | Eight material findings corrected; parent scenarios verify affected boundaries; no reviewer-run or post-fix reviewer PASS claimed | [resolution](evidence/stage1-review-resolution.json) |

The packed tarball hashes identify actual disposable snapshots, not a published artifact or signed release. Its successful metadata scenarios use the sanctioned internal state-root seam and newly allocated owner-private fixtures through the installed CLI/Core; they do not establish default AppData deployment on this host. Native KnownFolder and Temp anchors have non-owner sandbox write/DeleteChild grants. No existing host ACL was repaired or weakened. Native source/binary pairing detects mismatch, not malicious same-owner replacement of both.

Current forward runtime SQL and owner policy/profile bindings are implemented for metadata admission only. `doctor` health is storage/metadata integrity; init content and provider compatibility remain unverified. Same-account cooperative coordination is not hostile same-SID isolation. Synchronous native pauses may expire a grant; it is preserved for reconciliation, not revived. Full execution crash recovery, real providers/reattachment, integration/restore, whole-project backup activation, remote challenges, power-loss durability and other platforms remain unverified.

Initial integration runs exposed safe-integer accumulation, an overly narrow migration commit-tail check and strict conditional schema typing/presence declarations. Those were corrected without changing historical migration bytes, weakening Ajv strict flags or re-pinning source/wording tests. Review findings also fixed task-file normalization, API runtime gating, output completion/framing, dangling symbolic refs, init result preflight/heartbeat and duplicate quota accounting.

After the pipeline run, two unavailable future-command presence predicates received explicit local declarations. All 42 strict Ajv schema compilers then passed; the final [contract/link follow-up](evidence/stage1-contracts-final.json) retained all 276 fixtures and 90 SQL cases. Current owned source bytes and untracked-file whitespace/root-document links are recorded in the [Stage 1 source manifest](evidence/stage1-source-manifest.json). Historical Stage 0 manifests/receipts are not rewritten as current implementation evidence.

## Stage 0 — historical evidence

Date: 2026-10-14. Target: independent Windows x64 development workspace. Evidence uses actual local commands and disposable fixtures; no product or provider scenarios were executed.

### Stage 0 result at acceptance

Stage 0 contract consolidation and local primitive feasibility passed the exercised checks below. This is NOT an angit implementation, Windows product certification, strong sandbox, power-loss guarantee or release approval. No Git repository/remote was initialized and no commit/push/install/publication occurred.

| Category | Actual result | Receipt |
|---|---|---|
| Offline schemas and fixtures | 42 schemas; 276 positive/negative fixture assertions; exit 0 | [contract validator](evidence/contracts-validation.json) |
| Catalog and future acceptance mapping | 18 leaves, 64 baseline scenarios, 18 CR additions and 16 fault boundaries retained; product scenarios NOT RUN | [contract validator](evidence/contracts-validation.json), tests/acceptance-map.json |
| Prospective SQL on Python SQLite 3.50.4 | 90 disposable cases, 70 rejected negative statements; row/integrity assertions passed; exit 0 | [contract validator](evidence/contracts-validation.json) |
| Same logical SQL on Node24 built-in SQLite 3.53.4 | 90 in-memory cases, 70 negatives, unchanged-state and integrity assertions passed; exit 0 | [target driver receipt and inline runner](evidence/node-sql-contracts.json) |
| Node SQLite runtime primitives | Seven required checks passed; exit 0 | [SQLite probe](evidence/sqlite-primitives.json) |
| Unsupported Node25 | Rejected with UNSUPPORTED_NODE_RUNTIME before fixture creation; observed exit 1 | [rejection](evidence/sqlite-node25-rejection.json) |
| Native Windows primitives | 22 required checks passed; exit 0; one optional cross-host challenge unsupported/not run | [Windows probe](evidence/windows-primitives.json) |
| Probe reviews | Two read-only reviews reported no material findings in final probe sources/evidence; neither reviewer executed probes | [reviews](evidence/probe-reviews.json) |
| Contract reviews and corrections | Ten material findings corrected; independent before/after reproductions plus final schema/SQL regression runs | [resolution](evidence/contract-review-resolution.json) |

## Behavioral observations

The Node24.21.0 executable is the existing local runtime at `C:/Users/tno/.omp/ai-agent-tools-20261014/runtime/node.exe`, not a new installation. Built-in SQLite reports 3.53.4. Effective fixture settings were foreign_keys=1, WAL, synchronous=2 (FULL), and busy_timeout=200 ms.

Two separate OS processes proved guard exclusion under BEGIN EXCLUSIVE and admission after rollback. WAL contention rejected a second writer while allowing a 512-row read. Online backup was paused between steps while another OS process committed row 513; the final source and backup had 513 rows with identical row-content SHA-256, foreign-key/integrity checks passed, and the backup file digest was recorded. This is not a whole project DB/Git/artifact backup. A dedicated synchronous DB worker kept the main heartbeat responsive in one bounded schedule.

Windows probes observed equal file/directory IDs through junction/case aliases, actual restricted pipe DACL/owner readback, owner connection and restricted-token denial, actual pipe client PID/start/token and impersonation SID. Suspended fixture creation and job assignment occurred before execution. Native breakaway was denied, a descendant remained after root exit, and both kill-on-close and explicit job termination were observed through retained process handles. A separate inert fixture survived identity-mismatch rejection. Job Objects do not provide filesystem/network sandboxing.

The remote-client rejection flag was accepted by CreateNamedPipeW, but no cross-host or distinct-account challenge was performed. The negative pipe challenge used an actual restricted token, not a second account. No remote service was started. Temporary executors/directories were cleaned in the successful final reports.

## Preserved failures and root corrections

1. [SQLite initial failure](evidence/sqlite-initial-failure.json): the local executable lacked StatementSync.close despite the fetched documentation example. Remove the unsupported assumption; connection-owned statement lifecycle is used, while DatabaseSync.close remains required.
2. [SQLite shutdown failure](evidence/sqlite-shutdown-failure.json): a normal self-disconnect ran an abrupt-disconnect failure handler. Remove that handler only at verified normal completion; abnormal disconnect still fails.
3. [Native compiler failure](evidence/windows-compiler-failure.json): implicit csc response configuration duplicated the explicit System.Web.Extensions reference. Use /noconfig and explicit installed assembly references.
4. [Native invocation failure](evidence/windows-invocation-failure.json): PowerShell PSObject wrappers were incompatible with raw reflection Invoke arguments. Use a typed direct call to the loaded native fixture class.
5. [Native cleanup race](evidence/windows-cleanup-race.json): direct TerminateProcess raced asynchronous kill-on-job-close. Assigned fixtures now wait for retained-handle termination after job close; unassigned owned fixtures retain explicit termination.
6. [Initial contract harness failure](evidence/contracts-initial-failure.json): incidental trigger precedence prevented an intended immutable-intent negative from reaching its semantic context. Establish valid state/observation first and assert constraint rejection plus unchanged stored rows; retain only normative consumer error-code checks.
7. [Schema defect reproduction](evidence/contracts-review-before.json) and [SQL authority reproduction](evidence/contracts-state-review-before.json): contradictions included started submissions claiming no process, stale grant projection, promotion-review failure releasing its slot and incarnation rotation stranding open operations. [Independent after-fix checks](evidence/contracts-review-after.json) deny those paths and accept the history-bound replay shape.

The effective contract also fixes exact frozen membership/ordering, selected acceptance evidence, plan identity and candidate/testing proof. Final review fixtures exercise these boundaries on both SQLite versions. No post-fix independent reviewer PASS is claimed; final acceptance is based on parent runs and source inspection.

## Commands and reproducibility

Run from this directory with the recorded existing runtimes:

```powershell
python scripts/validate-contracts.py
& 'C:/Users/tno/.omp/ai-agent-tools-20261014/runtime/node.exe' scripts/sqlite-primitives.mjs
powershell -NoProfile -File scripts/windows-primitives.ps1
```

The target-driver logical SQL runner is preserved verbatim in its receipt. Structured reports retain actual exits/errors. [Preflight](docs/STAGE0_PREFLIGHT.md) records OS/runtime/compiler/Git observations and primary API sources. [Source manifest](evidence/source-manifest.json) binds effective contract/probe artifacts to their bytes; it is not a signed release or Git commit identity.

## Explicit verification limits

No business CLI, live Coordinator, AIT registration, provider execution, real process reattachment, cross-system recovery, full backup activation drill, remote operation, packed product consumer or production migration was tested. SQLite FULL and OS process-crash primitives do not prove power-loss durability. Native helper packaging, API/driver stability and supported-provider/platform evidence remain later gates. macOS/Linux and sandbox-required execution remain unsupported/unverified. The effective specification requires denial rather than a weaker fallback.
