# Stage 3 plan: background Coordinator lifecycle

## 1. Status, scope and evidence boundaries

This is an implementation plan, not an enabled Worker, a changed contract, or a verification receipt. The prerequisite authorization covered an isolated Windows startup/handoff demonstrator, this plan and a fault/security review. Later owner instructions authorized local Git closeout, then migration into the canonical `AI-Agent-Tools/packages/agent-native-git` package and Hub integration. Neither authorization grants production Worker/runtime changes, real providers, services, login hooks, network access, publishing or deployment. Historical receipts remain unchanged and do not verify the migrated tree.

**Current availability is 13/18 public leaves. Proposed Stage 3 availability is 15/18 only after all production acceptance gates below pass.** The two proposed additions are `worker start` and `worker stop`. `integrate plan`, `integrate apply` and `snapshot restore` remain unavailable before effects; `autoIntegrate=true` must remain denied before startup effects. There is no nineteenth public command or new release identity. The current package is private `0.0.0`; its owning repository is AI-Agent-Tools, without claiming a push, public npm availability or release version.

### Evidence ledger

| Claim | Actual source and limit |
|---|---|
| Stage 2 implements metadata/read operations and foreground `agent start`, `agent stop`, `run` | [CLI reference](CLI_REFERENCE.md#cli-reference), [Stage 2](STAGE2.md#current-scope). Worker leaves remain explicitly unavailable. |
| Completed scoped local Stage 2 gate | [stage2-final-summary.json](../evidence/stage2-final-summary.json), lines 1–22: 53/53 behavioral tests, 42 schemas, 276 schema fixtures, 18 public command contracts, 90 SQL fixture cases and 70 negative SQL rejections. This records a prior run, not a run performed while writing this plan. |
| Offline installed-consumer evidence | Same receipt, lines 23–97: Node 24.21.0, scripts disabled, unpublished `0.0.0`, inert native execution, owner-private injected fixture. Its `utilityLeaves:18` is catalog coverage, not eighteen implemented product leaves. |
| Required platform | [README](../README.md), lines 5–9: Windows x64, exactly Node 24.21.0 and built-in SQLite 3.53.4. `node:sqlite` remains a release-candidate API. |
| Prerequisite demonstrator | [Observed preflight and review](STAGE3_PREFLIGHT.md), [six-case receipt](../evidence/stage3-worker-preflight.json) and [expected shutdown-failure receipt](../evidence/stage3-worker-preflight-negative.json). These prove only their explicitly listed isolated mechanics, not production Gate B–E acceptance. |

Stage 2 receipts, historical SQL/checksums and historical contract/evidence text remain unchanged by this document. Production acceptance, default-host ACL admission, provider compatibility and sandbox certification are separate claims. Successful disposable fixtures cannot make the currently denied Local AppData/Temp anchors safe ([Stage 2, approval and runtime](STAGE2.md#approval-and-runtime)).

## 2. Authoritative constraints and concrete design gaps

The effective normative source is [CONTRACT](CONTRACT.md), especially sections [1](CONTRACT.md#1-identity-platform-and-unchanged-requirements), [4](CONTRACT.md#4-authority-leases-and-backup-continuity), [5](CONTRACT.md#5-durable-operation-journal) and [6](CONTRACT.md#6-local-ipc-authority). Its opening Stage 0 delivery description is historical scope, not evidence that today's foreground Core is absent; current implementation scope is documented in README/Stage 2 and exercised by the Stage 2 receipt. Conversely, a future command contract is not evidence its implementation exists. Disagreements between normative requirements and representations block adoption rather than selecting a permissive interpretation.

| Source-backed gap | Required production resolution |
|---|---|
| `contracts/commands.json:408–475` and the [Worker CLI sections](CLI_REFERENCE.md#worker-start) require verified startup and reconciled stop, but `src/cli.ts:56–58` and `src/core.ts:37–40` reject unavailable leaves | Change dispatch and static availability only at the final cutover, with the lifecycle implementation behind both CLI and direct Core entry paths. Help/catalog recognition alone is not availability. |
| `sql/001_initial.sql:249–267` and `schemas/operation-journal.schema.json:23–33` admit only existing operation kinds | Add explicitly typed Coordinator lifecycle variants through a forward migration and reviewed schema/contract evolution. Do not label a Coordinator start as an attempt `spawn` or invent a task/worktree. |
| The existing journal `stop` variant requires `attemptId`, exact supervisor/process/descendant scope and provider stop modes (`schemas/operation-journal.schema.json:492–579`) | Keep attempt stop distinct from Worker drain/cancel. Add a closed Worker-stop intent, lifecycle projection and receipts; do not loosen `additionalProperties` or hide required identity in arbitrary JSON. |
| `src/core/store.ts:41–68,170–174` initializes new DBs and verifies an exact migration list; opening an older DB is not a forward-upgrade API | Design guarded existing-store migration, prefix verification, registry/workflow schema bindings and interruption recovery before enabling Worker. Merely appending an SQL file makes old stores incomplete under the present verifier. |
| `startAuthority`/`startSessionAuthority`, `unresolved` and `releaseLease` (`src/core/store.ts:253–326`) reject or retain unfinished effects | Explicitly model the one exact pending handoff and lifecycle shutdown obligations. A durable Worker-start intent must not deadlock its own child authority acquisition; a broad exemption of unresolved effects would admit unknown old writers. Preserve all attempt/worktree blockers. |
| `CONTROL_METHODS` contains only task add/message/cancel and agent stop (`src/core/execution.ts:36,493–548`) | Extend owner-approved control method/resource scopes for Worker stop and exact lifecycle observation. A nonce or an OS identity alone is not a capability. Start bootstrap also needs durable owner-approved scope provenance before the live broker exists. |
| `stopping` currently rejects admission, cancels reserved/provisioning launches, calls `stopAll`, affects capture and triggers cleanup stop (`src/core/execution.ts:137–157,339–350,380,429–443,590–651`) | Separate admission closure, explicit stop mode and liveness failure. A rename at the outer loop cannot implement drain; every reserved-slot and finalization path must retain drain semantics. |
| `semanticOptions` excludes observation fields but not `timeoutSeconds` (`src/core/values.ts:39–42`), while CONTRACT section 5.1 says observation timeout is not semantic identity | Define Worker stop timeout as an observation bound, exclude it from the Worker semantic hash, and test replay with a changed timeout. Keep immutable native stop budgets separate. Do not change other command semantics accidentally. |
| Existing native supervisors detach only to survive the Node parent's Windows Job; referenced stdio keeps foreground ownership (`src/execution-native.ts:143–162`; [Stage 2](STAGE2.md#managed-worktrees-and-native-lifecycle)) | Do not interpret that seam as a durable background Coordinator. Add a fixed native Lifecycle Host without placing all per-attempt supervisors in a new parent kill-on-close Job. |

## 3. Process, authority and trust model

Use the same Core, canonical repository admission, policy checks, scheduler, workflow store and lifetime guard in foreground and background. There is exactly one Coordinator mutation authority per canonical repository/common-directory OS file identity, including junction/case/path aliases. Worker slots are execution slots, never DB writers. No second scheduler or DB-writing native agent is introduced.

Proposed process roles:

1. **Short-lived CLI:** validates bounded public input, resolves the registered canonical repository, authenticates the owner and bootstraps the lifecycle intent under the existing guard. After handoff it observes/replays the durable result; it is not a second writer.
2. **Fixed native Lifecycle Host:** launches only the pinned Node executable with a fixed packaged Worker entrypoint. Retains exact process handles and records bounded OS launch/start/exit facts. It does not open registry/workflow DBs for mutation, mint leases, schedule tasks, authorize policy or report provider-tree termination. It has no arbitrary executable, command, shell or environment forwarding interface.
3. **Background Coordinator:** the pinned Node process running the same Core after acquiring the same guard itself and committing its own current authority. It owns all workflow mutations and the authenticated broker. It survives normal creator CLI exit after durable handoff.
4. **Existing per-attempt native supervisors:** retain their independent provider Jobs and exact control channels. Coordinator death closes their control input or stops authenticated heartbeats; they must survive long enough to attempt full-tree proof persistence. Providers inherit neither owner broker handles nor Host/bootstrap control handles.

Host receipts are OS observations, not workflow authority. Bind them to launch identity, role, process creation/start identity, owner SID, canonical executable file identity/hash and fixed entrypoint identity/hash. The current task's standalone Host is only a fixture demonstrator, not this production interface. Exact production packaging names/version identifiers must be defined when implemented; none are invented here.

Use owner-private, bounded, strict UTF-8/closed-schema control and receipt channels with minimal inherited environment. Revalidate directory/file identity and ACL admission on use; do not trust a path, stale descriptor, pidfile, process name or PID alone. Retain handles when managing a newly created child; never kill or adopt a process by a persisted PID. On restart, absent independently verified reattachment, accept only exact final receipts or leave the instance unresolved.

This remains same-owner cooperative coordination. Same-account malicious replacement of both source/binary or owner files, strong filesystem/network isolation and hostile-provider safety are not certified by hashes, Job Objects or private ACLs.

## 4. Durable startup and authority handoff

### 4.1 Closed lifecycle contract to add

The following are **proposed fields and states**, not existing APIs. Adopt them together in the normative contract, closed schemas, SQL constraints and Core transitions before runtime cutover.

Keep the existing closed operation envelope: schema version; project/repository identity; operation ID/kind; immutable originating authority tuple; principal scope ID; request-key and semantic-request hashes; policy/profile hashes; creation time; immutable intent hash; versioned projection and append-only observations. Recovery records current observer/execution authority separately and never rewrites the origin.

Add typed `worker_start` and `worker_stop` operation variants, with the existing small `prepared -> effect_observed -> finalized` graph plus `needs_review`/safe terminal failures. Record intermediate facts as typed observations, not a premature `effect_observed`. A lifecycle projection can expose more detailed states without silently broadening the operation phase enum.

| Proposed closed type | Required identity and facts |
|---|---|
| Start intent | Canonical registration/guard/workflow identities, generated Worker instance and launch identities, fixed Host/Node/entrypoint file identities and digests, controlled argv/cwd/environment-profile digest, requested/effective parallel budget, `recover`, `autoIntegrate=false`, approved bootstrap scope provenance, expected origin authority and handoff protocol version. Process identities observed only after launch are append-only facts, never retroactively inserted into immutable intent. |
| Handoff observation | Exact start operation/intent hash, launch/target identity, origin epoch/fence, durable release-to-child decision and evidence that the bootstrap write phase ended. A committed handoff authorizes only that target to attempt guard acquisition; it does not transfer an open DB connection or bypass the guard. |
| Instance projection | Project/instance/launch, foreground versus background ownership role, current authority tuple, Host and Coordinator observed process identities, lifecycle state, `admissionsClosed`, nullable `stopMode`, unresolved-attempt count/proofs, policy/profile identity, version and last observation. Derive liveness from authenticated observations, not a boolean saved PID flag. |
| Startup receipt | Start operation and semantic identity, immutable origin plus current Coordinator authority, exact observed Host/Coordinator/Node/entrypoint identities, recovery outcome, durable scope issuance/broker readiness evidence and event watermark, version/digest. No credentials, scope handles or raw environment values. READY proves readiness at its committed observation, not perpetual health. |
| Stop intent | Exact frozen background instance/launch and target authority, initiating authority/scope/principal, mode, current policy binding, accepted reservation barrier, bounded approved per-attempt cancellation budget references and parent/start operation binding. A no-background-target result is explicit and cannot later acquire a target. |
| Stop observations/result | Durable admission closure, selected mode, accepted/cancelled/remaining exact slots, exact attempt termination receipts, capture/reconciliation outcomes, scope revocation/quiescence, exact Coordinator/Host OS exit evidence and guard release observation. Distinguish accepted, still draining/cancelling, timed out, unresolved and completed. |

Add one unresolved background instance/handoff slot per project with uniqueness/transition constraints, version-checked projection updates, append-only observations, relational equality between operation/instance/launch and artifact digest/length checks. Numbers are bounded safe integers; epochs/fences never wrap. Keep scope handles secret and only digests in durable evidence. Enumerate safe reason codes and all nullable fields; do not use an untyped extension bag.

### 4.2 Startup sequence

1. **Before effects:** reject unsupported flags, `autoIntegrate=true`, unapproved policy/profile/process budgets, unsafe storage or executable identities and unsupported schema/runtime. Normalize defaults once into an immutable effective configuration. Resolve idempotency by stable principal/project/command/key, not connection epoch or request ID. Identical replay observes the old launch; changed semantic configuration conflicts. A different key against a live foreground/background owner returns the appropriate busy/already-running outcome and never starts another Coordinator.
2. **Bootstrap under the existing guard:** revalidate registry/workflow/incarnation/policy and obtain current bootstrap authority with durable scope provenance. Reconcile prior lifecycle/attempt effects first; unknown old writers block ordinary admission. In one transaction reserve the semantic key, freeze the generated target instance/launch and typed start intent, and persist intent/event/artifact bindings before creating the Host or child. No task is reserved during bootstrap.
3. **Launch-only child:** the fixed Host creates the fixed child and retains its exact process handle. Record observed starts bound to the durable intent. The child can perform bounded identity/bootstrap reads and wait, but cannot mutate workflow state, issue scopes, reserve tasks or publish READY before its own guard acquisition. A child whose creator disappears before a committed handoff exits without workflow mutation; missing creator/control is not permission to infer handoff.
4. **Commit the handoff:** while still the only writer, the parent durably records an explicit transfer decision for that exact launch. Finish bootstrap leases with typed handoff proof, not the generic `noUnresolvedEffect` assertion. End all parent DB-writing activity, close writable workflow connections and release the guard. The committed transfer record is the recovery source if the creator dies after commit but before sending a reply/control acknowledgement. No OS effect is enclosed in a DB transaction.
5. **Child becomes authority:** only the named child acquires the same identity-checked guard, revalidates the committed handoff and registry/workflow agreement, preserves incarnation, and durably advances epoch/new fences before mutation. Origin remains the parent's immutable tuple. Old scopes/timers are revoked; startup does not rotate incarnation or erase counters. If a contender wins the guard gap, its Core must observe the pending exact handoff and not create a replacement or ordinary mutation authority. Guard availability alone does not prove old providers stopped.
6. **Recover and publish readiness:** reconcile exact old native receipts and lifecycle effects under current authority. Unknown attempts remain owned/orphaned and block ordinary admission. Establish heartbeat bookkeeping, owner-approved scope and authenticated local broker. Persist complete READY observation and semantic startup result before a success response. The child must be able to serve an authenticated, identity-bound readiness round trip; a listening pipe, PID, process exit or JSON READY string alone is insufficient.
7. **Continue background ownership:** after READY, the creator may exit without cancelling the Coordinator or closing per-attempt control channels. Empty queues do not end a background session; keep the existing admission wake/parallel semantics. Foreground `agent start` and `run` retain foreground behavior and the same exclusion guard.

The parent/child guard gap, pending-start exception and startup scope provenance are required design work, not solved by calling existing `execute()` twice or setting `detached:true`.

### 4.3 Startup replay and readiness acceptance

- A lost reply at any boundary reconciles the same operation/launch. Do not spawn again from a key whose state is reserved/unknown; recorded absence requires exact no-process/exit proof before a safe failure can be finalized. Retrying that terminal key returns its old result, not a restart. A new launch requires a new semantic request key and resolved prior instance.
- Same-key observations after success return the immutable startup receipt plus separately labelled current liveness, even if the original instance has since exited. A stored READY receipt must not imply a replacement is that instance.
- Test concurrent creators, a live foreground owner, aliases of the same common directory, child-before-transfer attempts, stale transfer messages and a third contender in the guard gap. Count actual launches and committed authority intervals: never overlapping DB writers, never duplicate launch from lost reply.
- READY acceptance requires exact target identity, current guard/authority, durable epoch, completed recovery, current policy/profile agreement, durable scope issuance, broker round trip and stored bounded receipt. Reject wrong project/incarnation/epoch/fence/launch/process/entrypoint/peer/scope without effects.

## 5. Drain, cancel, timeout and stop replay

### State separation

Replace the overloaded stop flag with independently represented admission closure, explicit mode and liveness/authority validity. Admission closure blocks **new reservations**. It does not invalidate already accepted slots. Liveness failure closes admission and invokes the existing fail-closed recovery/heartbeat behavior; it is not a clean drain or completed cancellation.

`worker stop` applies only to the exact background instance. It must not terminate a foreground `run`/`agent start` owner or convert its role. Authenticate the current owner scope, authorize `coordinator.stop`, serialize acceptance with task reservation/capture and persist the stop intent/barrier before its effects. Recheck current policy and exact authority at every effect.

### Drain

After the durable reservation barrier, no new slot is reserved. Every already reserved, provisioning, suspended-start, running or capture-in-progress slot may complete under its exact accepted ownership, with normal policy/identity/storage checks and heartbeats. Reserved work must not take `finishNoProcess` merely because admission is closed. Successful capture remains permitted; new queued tasks remain queued. Brokered task additions do not reopen reservation. Scope/policy revocation still denies unauthorized new effects and may produce unresolved review; drain cannot bypass safety checks.

Keep lease renewal, native heartbeat delivery, completion capture, cancellation serialization and control/observation service alive until all accepted obligations reconcile. Drain does not call `stopAll`. No idle-loop shortcut releases the guard while provisioning/capture promises or durable effects remain unresolved.

### Cancel

Persist cancellation for the exact instance and each owned accepted slot before invoking its exact native stop control. Slots with no process require proven no-process completion; an observed or ambiguous start cannot use that shortcut. Generic executables retain the Stage 2 zero-grace owned-Job behavior; no provider-specific graceful protocol is claimed. Do not synthesize clean exit or success. Cancellation accepted before capture prevents new submission; already pinned history remains ([CONTRACT section 3.3](CONTRACT.md#33-submission-and-cancellation-ordering)).

A new explicitly authorized request may escalate `drain -> cancel`, with a new key and linked operation. Reusing the drain key with mode cancel conflicts. `cancel -> drain` is not allowed. Timeout, disconnect or Host loss never silently escalates mode.

### Timeouts and terminal completion

`timeoutSeconds` bounds caller observation only (current public range 1–86400). Document a deterministic default in the future contract; it is not a process-kill deadline, identity proof, lease expiry or permission to release slots/delete workspaces. At a drain timeout return `DRAIN_TIMEOUT` with the same target/operation and remaining obligations; leave draining active. Cancel wait expiry likewise reports incomplete cancellation, not termination. A new observation may use a different timeout with the same semantic key.

Quiescence requires all accepted slots/effects reconciled, durable attempt proofs/capture outcomes, native heartbeat obligations finished and old scope revoked. Persist a typed quiesced state before DB close/guard release and Coordinator exit. The Host then records exact retained-handle exit evidence. **A pre-exit DB record cannot honestly prove a future OS exit.** A short caller/recovery observer may acquire the now-released same guard, verify exact quiescence/exit evidence and append completion under its own current reconciliation authority, without starting a scheduler. It must not write concurrently with the live child. If it cannot obtain complete proof, report pending/recovery-required. Lifecycle-aware lease release must distinguish this terminal completion obligation from unknown writers; do not bypass generic unresolved checks wholesale.

Full Worker-stop completion requires both reconciled provider/attempt obligations and exact Coordinator exit/guard release evidence. Host/Coordinator death alone cannot prove provider-tree death. If Host evidence is lost but Coordinator is still live, close admissions through its authenticated channel and record unresolved lifecycle evidence; do not PID-kill it. Unknown cleanup preserves state/evidence.

### Frozen target and replay

Freeze stop target on first semantic acceptance, including project/incarnation/instance/launch/epoch and exact process identity. The public request need not gain an arbitrary caller-supplied PID. Maintain two bindings: caller semantic hash excludes observation timeout, while immutable accepted intent freezes the server-resolved target. On replay find the key before resolving today's active instance.

An old key for instance A returns A's stored result/observations after replacement B starts; it cannot signal B. Same-key changed mode conflicts. An accepted no-target result stays no-target when B later appears. New key during an existing stop binds only the current exact target and either observes the same mode or explicitly requests allowed escalation. Different project/principal, stale scope/epoch, revoked authorization or forged launch cannot reuse an operation to mutate a new target. Authenticated read-only replay after broker closure follows existing committed-receipt patterns, not a new permission to stop anything.

## 6. Forward migration and production integration

Do not modify `001_initial.sql`, `002_runtime_metadata.sql`, their recorded digests, historical fixtures or Stage 2 evidence to make the new design fit. Add a subsequent migration with deterministic checksum receipts. Plan its exact filename/version when implementing against the then-current migration inventory.

1. Verify the entire historical prefix and old schema/registry/workflow identities before taking upgrade action. Future schemas stay observation-only; checksum mismatch or missing prefix receipts fail closed.
2. Upgrade only under the canonical guard and explicit approved recovery/upgrade path. Read commands never repair schema. A new binary must have a bounded pre-upgrade opener; the present `workflow()` insists on the full migration list before returning a writable DB.
3. Require a quiescent proven namespace for upgrade. Unknown old Coordinators/providers or pending unrelated effects block it. Preserve DB/WAL/artifacts, incarnation, counters and all existing rows/relationships; do not replace workflow/guard file identities silently.
4. Add lifecycle discriminants and relational projections/uniqueness/transition constraints. SQLite CHECK changes may require table rebuild; preserve foreign keys, dependent triggers/indexes, append-only history, event links and retained operation identities. Inventory dependencies before choosing SQL; validate old-row and negative fixtures against the actual migration.
5. Commit schema receipt/user version atomically with the upgrade. If registry bindings also evolve, use durable intent/readback/finalization across stores; never claim SQLite atomicity across registry/workflow/OS effects. Interruption or disagreement blocks admission. Guard identity is not copied or recreated.
6. New stores apply the same ordered chain; existing stores upgrade once; repeat upgrade is observation/idempotent. Old binaries deny future schema rather than mutate it. No downgrade or destructive rollback is introduced.

Affected production interfaces, to be changed together in a later authorized implementation:

| Boundary | Planned integration |
|---|---|
| `src/core/execution.ts` | Shared Core/session lifecycle, drain-aware slot admission/provisioning/capture, background keepalive, stop serialization, scope methods, readiness and handoff/terminal reconciliation. Preserve foreground interrupt and exact attempt recovery behavior. |
| `src/core/store.ts` and SQL | Forward upgrader, pending-start/current-authority rules, exact handoff/stop release proofs, instance uniqueness, semantic key/result transitions and migration verification. |
| `src/core.ts`, `src/cli.ts`, shared command availability | Validate/route both leaves through the same Core; bounded output, stop-mode normalization, startup/stop observation and signal behavior. Preserve all three unavailable integration/restore leaves. |
| `src/core/values.ts` | Command-aware semantic normalization for Worker observation timeout/defaults, without broad changes to other requests. |
| `src/execution-native.ts`, native boundary and packaging | Add a narrow fixed Host transport/paired identity contract. Preserve independent per-attempt `NativeSession`, exact native receipt reconciliation and no-PID-adoption rules. A fixture Host is not a packaged product helper. |
| `contracts/commands.json`, Worker schemas, operation/observation/receipt/scope schemas, CONTRACT | Resolve proposed lifecycle types, fields, reason codes, defaults, state graphs and permission/resource bindings before claiming adoption. Keep shapes closed. |
| Existing tests, package checks and user docs | Add lifecycle/migration/fault coverage and current availability only after implementation. Link fresh evidence; do not rewrite prior results. |

## 7. Fault and security acceptance matrix

Every row below is a **required production test**, not a result. Inject failures at durable boundaries and preserve operation/launch/evidence identities. Use inert owner-private fixtures only until separately authorized. Negative tests assert no extra process launch, reservation, epoch grant, side effect or deletion, not merely an error string.

| Failure / adversarial input | Required observation and safe behavior |
|---|---|
| Creator dies before intent commit | No authorized launch; rollback is not permission. If OS creation nevertheless occurred, fail the ordering test and retain exact handles/evidence. |
| Creator dies after launch but before handoff commit | Bootstrap child exits; no READY, workflow child mutation, task reservation or provider launch. Preserve start/exit evidence; missing proof blocks replacement. |
| Creator dies after committed handoff, before release/reply | Guard release follows creator death/close; only the frozen child may acquire authority. Same-key retry observes one launch/intent and current outcome, never spawns a duplicate. |
| Two creators / foreground owner / alias / contender in transfer gap | One canonical guard and durable handoff slot; no overlapping DB-write intervals or second scheduler. Worker stop never signals the foreground owner. |
| Coordinator crashes with active root and descendant | Existing native supervisor survives Coordinator loss, detects EOF/control loss/heartbeat, terminates its owned Job and attempts durable authenticated full-tree receipt. Reconcile using `readTerminationReceipt`, not root exit or guard availability. Missing receipt retains orphaned ownership. |
| Lifecycle Host dies before READY | No startup success. Child uses a bounded authenticated Host/control-health boundary to close admission or exit before work; do not assume the child died with the Host. Reconcile exact surviving child and existing provider obligations, without saved-PID adoption. |
| Lifecycle Host dies after READY | Coordinator detects loss and closes new admission; explicit fault state is neither drain completion nor proof of exit. Keep independent supervisors alive to finish/persist proof; if graceful fault reconciliation cannot finish, their EOF/watchdog path remains fail-closed. No outer Job kills them before receipt persistence. |
| Native supervisor crashes / Host or Coordinator exits but provider tree is unknown | OS root/Host evidence is insufficient. Retain orphaned attempts, null terminal timestamp and uniqueness slots; deny replacement/retry until exact proof. Job closure may stop a tree but is not a durable authenticated receipt by itself. |
| Missing/partial/forged receipt, wrong launch/epoch/executable/entrypoint, stale control file, PID reuse | Reject identity/proof; do not attach, terminate, rewrite history or delete unknown files. Preserve bounded diagnostics without secret values. |
| Wrong owner SID/peer identity, missing/revoked/expired scope, cross-project/incarnation replay, forged report | Deny before effect. Fresh nonce binds a connection only; require current policy intersected with trusted method/resource scope. Provider reports cannot request owner methods. |
| Policy/profile/executable/ACL drift between acceptance and effect | Revalidate exact approved bytes/OS identity at effect. Stop admission; persist or preserve uncertainty. Prior connection/READY does not authorize new effects after revocation. No policy-based reinterpretation of historical outcome. |
| Wall-clock jump, suspend/resume, reboot, lease/epoch/fence exhaustion | Monotonic live timing and bounded arithmetic; invalidate timing assumptions and reconcile. Expiry is not process death; ordinary restart preserves incarnation and advances epoch without wrap. |
| Disk full, quota exceeded, DB/WAL lock/corruption, failed artifact/receipt flush, registry mismatch | No false READY/completed stop; stop admission and preserve prior intent/effects. Native watchdog/EOF may stop owned Jobs without successful receipt storage, in which case proof remains unknown. No unjournaled new cancellation effect is justified by DB failure. |
| Drain during reservation/provisioning/suspended start/running/capture, brokered addition, dependency change | Exact barrier: no later reservations; all pre-barrier slots progress under normal authorization/heartbeat; no implicit cancellation or premature lease/guard release. |
| Cancel races native start/capture | Durable intent precedes exact stop; no-process shortcut cannot contradict observed start. Pre-capture cancellation prevents a new submission; pinned history survives. |
| Drain/cancel timeout, lost acknowledgement, repeated or changed request | Timeout changes observation only. Same key retains target/mode/launch; no escalation, new launch or false terminal proof. Drain-to-cancel requires a new explicit request; reverse denied. |
| Old stop key after restart/replacement, including accepted no-target key | Return only old target/no-target result. Replacement receives no stop signal and admits no effect from stale scope. Conflict checks work with broker closed. |
| Power loss during migration/handoff/quiescence/final completion | Reopen yields either committed state or a preserved recoverable obligation. Exact old checksums and counters remain; no read-side repair, double finalization, duplicate spawn or invented end time. |
| Unsupported/default-host storage and filesystem, unsafe permissions or reparse change | Fail admission before effects; internal fixture success does not bypass production ACL/local-disk/canonical-identity requirements. |

Native proof anchors: `src/execution-native.ts:273–288,358–403` validates exact receipt/process/authority/output bindings and invokes the native verifier. `native/Execution.cs:162–172` verifies private MAC and helper absence; `240–267` waits for root exit **and zero active Job processes**, flushes output and a create-only final receipt before best-effort delivery. These are existing attempt-level boundaries, not proof that a future Host or Worker migration works. Review/tests must not expose `receipt.key` or token material.

## 8. Sequenced implementation and verification gates

Each gate has observable completion criteria. Until the production gates finish, keep availability at 13/18 and retain explicit unavailable-before-effects behavior. The integration owner runs all builds/tests/checks after integration; writing this plan executed none.

### Gate A — isolated prerequisite mechanics (authorized now)

Use a fresh owner-private fixture root, pinned Node 24, fixed Framework64 compiler/Host source and hashed fixed fixture entrypoint. No services, network, product DBs, public state-root override or existing fixture adoption. The native fixture retains only exact newly created process objects/handles; cleanup retains unknown evidence and never broad-scans/kills by PID/name. Record bounded actual identities/timestamps/digests without secrets.

Exercise real SQLite `BEGIN EXCLUSIVE` guard/epoch/events in separate probe stores: creator exit after READY; contender rejection; wrong launch/epoch/control denial; creator loss before transfer; reply loss after durable transfer with same-key single-launch observation; Coordinator crash with the real existing per-attempt native supervisor and inert provider/descendant, followed by actual `readTerminationReceipt` acceptance. Observe guard release separately from provider termination proof. Include Host-loss cases where supported and explicitly list every unexercised matrix row.

Acceptance is a scoped receipt for each actually exercised case, including command, environment, input hashes, observed processes/events, exit status, retained fixture/evidence and negative assertions. The probe can demonstrate mechanics and an existing native seam. It cannot establish production Core authorization, migration correctness, Worker API compatibility or the entire matrix. Failed/incomplete cases remain visible; do not write a generic PASS for unrun boundaries.

Observed 2026-10-15 subset: six isolated cases passed, including both committed-transfer creator-death cutpoints and actual root/descendant EOF reconciliation; the injected nonzero graceful shutdown was rejected with its fixture retained. [Preflight observations](STAGE3_PREFLIGHT.md) list limits. Wrong-token denial was exercised; stale epoch, Host loss, restrictive ancestor Job, delayed/corrupt/missing receipt and the remaining production matrix were not. This evidence does not close production Gate B–E or enable either Worker command.

### Gate B — contract and migration closure (future production work)

Adopt the lifecycle types/defaults/graphs and current-versus-origin authority rules; implement guarded prefix-verified upgrades and exact lifecycle release/handoff proof. Add positive/negative contract and SQL fixtures for all variants, cross-project/instance/launch relational mismatches, immutable intent, observation authority, projection version, unknown properties and duplicate unresolved instance. Test fresh and existing Stage 2 stores, old-row preservation, checksum mismatch, future schema, interrupted upgrade and replay. Completion requires evidence that upgrade does not need historical SQL edits or read-side repair.

### Gate C — shared Core handoff and fixed Host (future production work)

Implement launch-only bootstrap, durable transfer, child guard/epoch/recovery and bounded Host transport/readiness. Test every startup cutpoint, alias/foreground contention, transfer-gap contender, lost reply, exact target mismatches and Host loss. Verify actual write-interval exclusion and committed-key single-launch behavior, not just log order. Preserve Stage 2 suspended-start authorization/pre-resume liveness pulse and native supervisor survival.

### Gate D — Worker stop and scheduling semantics (future production work)

Implement admission/liveness/mode separation through reservation, provisioning, native start, heartbeat, capture, shutdown and cleanup; implement exact-target stop/explicit escalation, observer timeouts and terminal exit reconciliation. Run deterministic race fixtures for each matrix row, especially old-target/no-target replay after replacement, drain with already-reserved work and cancel-before-capture. Completion requires zero post-barrier reservations, preserved accepted drain work, durable exact cancellation before stop effect and no terminal result without complete provider plus lifecycle proof.

### Gate E — integrated regression and installed consumer (future production work)

After all changes land, run the full existing contract/SQL/behavioral gate plus the new lifecycle/migration/fault cases on the pinned Windows/Node runtime, then an offline scripts-disabled packed installed-consumer check. Verify fixed Host/source/binary pairing and entrypoint packaging, inclusion/exclusion, no install/build/download/service hooks, creator CLI exit with a live exact background owner, authenticated metadata mutation, contenders, drain/cancel and restart/replay. Confirm original checkout/index/protected refs and unrelated files unchanged; exercise inert native profiles only. Record failures and actual receipts in new evidence, not by editing Stage 2 receipts.

Only then change both CLI/Core availability and current docs to 15/18. Recheck `autoIntegrate=true`, integrate plan/apply and restore are denied before effects. Help, version and capabilities remain static utilities without provider probing. New docs must explain operational timeouts, pending/recovery-required outcomes, role-target restrictions and private-development limits.

## 9. Explicitly unproven and excluded

No production Worker, schema migration, fixed packaged Lifecycle Host, startup/stop receipt API or drain implementation is delivered by this plan. Planned names/types above are design targets, not callable existing APIs. A probe result, even if later successful, does not upgrade that claim.

Not certified here: real Codex/Claude/Pi versions or graceful protocols; arbitrary/native provider compatibility; hostile same-account sandboxing; filesystem/network isolation; services/login persistence; reboot auto-start; all Windows variants; default-host ACL safety; distributed/network/cloud scheduling; integration/CAS/check acceptance; restore/content-epoch activation; complete backup activation; production durability under every storage/power-loss fault; publication/deployment/release readiness. None is silently replaced with a fake provider, PID fallback, exception suppression, new incarnation or permissive schema.

The next authorized production change must close the source-backed gaps in section 2 and pass its stated gates. Historical proof remains historical; new behavior requires new, scoped evidence.
