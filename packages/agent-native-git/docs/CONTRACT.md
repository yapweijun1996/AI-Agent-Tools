# Effective Stage 0 contract

Status: adopted design and executable offline contract fixtures only. No Core, CLI,
provider integration, service, production migration or release exists in this delivery.
This file is the single current normative source. Machine schemas, SQL and catalogs are
representations of it; disagreements block adoption, never select the permissive form.
Historical inputs remain unchanged in the sibling AI-Agent-Tools temp source bundle.
Their old manifest/reports are not current evidence and are not copied here.

## 1. Identity, platform and unchanged requirements

Agent-Native-Git is the project; angit is the planned executable with exactly eighteen
public leaves. Windows-first, MIT, private development only; no public package identity,
product release version or repository remote is assigned. See
[private metadata](../contracts/identity.json). Node.js 24.x is the target runtime line.
No installation, network, real provider execution, Git init/commit/push or publication is
part of these contract fixtures. Source and contract text are English.

| ID | Requirement |
|---|---|
| INV-01 | One active mutation authority per canonical local project; Worker slots never open state.sqlite for writes. |
| INV-02 | Each attempt gets a unique branch and worktree; retries never reuse an unresolved worktree. |
| INV-03 | The original checkout, its index and protected refs are not application mutation targets. |
| INV-04 | Remote writes, hard reset, forced cleanup and destructive history rewriting are absent from v1 authority. |
| INV-05 | An unexpired lease is not permission; an expired lease is not proof that a process stopped. |
| INV-06 | Git promotion uses the expected old full OID; stale workers and stale content epochs are rejected. |
| INV-07 | Required evidence binds the exact candidate, tree, policy, runtime profiles and environment. |
| INV-08 | A completed task has a finalized verified integration record; process exit 0 alone cannot complete it. |
| INV-09 | Git and SQLite do not share a transaction; each external side effect has a durable recoverable intent. |
| INV-10 | Restore preserves history, increments content epoch and invalidates unfinished stale work. |
| INV-11 | Dirty, missing or identity-unknown workspaces are preserved rather than silently repaired or deleted. |
| INV-12 | CLI output is bounded, schema-versioned and distinguishable from NDJSON events. |
| INV-13 | No profile, repository instruction, model output or CLI flag grants itself authority. |
| INV-14 | Snapshots are pinned by Git refs; backup includes consistent DB, refs, artifacts and identity metadata. |
| INV-15 | Documentation tests, primitive probes, product tests and release evidence are separate claims. |

One canonical local repository/common-directory file identity has one registry entry,
separate lifetime guard and Coordinator mutation authority. Foreground and background
share one Core and the same guard. Worker slots never write the workflow DB. Windows
state belongs under the owner's LOCALAPPDATA; only harnesses inject disposable paths.
Network/cloud-sync/unknown filesystems are denied. Resolve junctions/reparse points,
case and path aliases by OS file identity, not normalized strings alone. Guard loss,
identity mismatch or persistence uncertainty stops admission without deleting lock files.

Each attempt owns a unique branch/worktree and new attempts use fresh identities. Never
modify the owner checkout/index/protected refs, remotely fetch/push, hard reset, force
cleanup or install services/dependencies/providers. Reject shallow/sparse/unborn repos,
submodules, unapproved LFS/filter/merge drivers, case collisions, source symlink mutation
and unsupported object formats. Full SHA-1/SHA-256 OIDs must match the repository's
actual format and object type. This is same-account cooperative coordination, NOT a
hostile-process sandbox. Sandbox-required denies execution without a verified backend.
No MCP/HTTP/TCP/cloud scheduler or embedded model-reasoning framework is introduced.

## 2. Resolution ledger

| ID | Baseline problem | Selected resolution |
|---|---|---|
| CR-01 | Attempt `needs_review` appears in prose but not enums; `succeeded` has no defined milestone | Review is task/operation state. An unknown attempt is `orphaned`. Remove unused attempt `succeeded`; `submitted` is the successful execution endpoint, not integration success. |
| CR-02 | Attempts have enums without a transition graph | Use section 3, with termination and submission proofs enforced on every entry path. |
| CR-03 | Recovery requires fields absent from the closed journal schema | Use one typed, kind-discriminated journal with complete immutable intent and separately append-only observations. |
| CR-04 | Non-integration operations inherit integration-specific phases | Use a small effect lifecycle for init/provision/spawn/stop/backup; retain the detailed integration pipeline. |
| CR-05 | Lease grant and renewal can be confused | New grant increments the fence; renewal preserves it and verifies exact owner/authority. Expiry never permits replacement by itself. |
| CR-06 | IPC hello describes nonce but not trusted scope issuance | Nonce binds a session, not authority. Coordinator-issued, owner-approved scope handles authenticate control; worker reports use a distinct supervised channel. |
| CR-07 | An older backup can repeat numeric epochs and fences | Introduce a fresh authority incarnation on backup activation, and compare the full authority tuple. Ordinary restart preserves incarnation and advances epoch. |
| CR-08 | Snapshot/task links can join different operations | Require equality of operation identities across plan, evidence, snapshot and task membership; initial task creation cannot insert a completed state. |

Sources: Coordinator/Worker (historical source), data model (historical source), workflow SQL (historical source), attempt schema (historical source), journal schema (historical source).

## 3. Task and attempt lifecycle

### 3.1 Task rules

Use the following task-state graph; no other task transition is allowed and attempt exit never completes a task. Initial creation MUST use `queued`, followed by an eligibility projection/transition to `blocked` or `needs_review` where necessary. Every task update increments its version exactly once and checks the expected version. Specification, dependency edges and base identity remain immutable.

| From | Allowed destinations |
|---|---|
| queued | blocked, leased, cancelled, needs_review |
| blocked | queued, cancelled, needs_review |
| leased | running, failed, cancelled, needs_review |
| running | submitted, failed, cancelled, needs_review |
| submitted | validating, cancelled, needs_review |
| validating | integrating, needs_review, cancelled |
| integrating | completed, needs_review |
| failed | queued, cancelled, needs_review |
| needs_review | queued, submitted, cancelled |
| completed, cancelled | none |

`completed` and `cancelled` are terminal task statuses. Completion history and effectiveness in the current snapshot remain distinct. Restoration does not reopen completed tasks. Requeue from failed/review requires current content/authority applicability, valid requirements, remaining approved attempts and no unresolved process. Changed requirements or obsolete base requires a new task.

Task `needs_review -> submitted` is permitted only for an already terminated attempt with a valid pinned submission under the same immutable requirements. It cannot manufacture a submission or rewrite a dirty attempt. A repair uses a new task/worktree and plan.

### 3.2 Attempt states and transitions

Allowed states: `reserved`, `starting`, `running`, `stopping`, `orphaned`, `submitted`, `failed`, `cancelled`. Do not add attempt `needs_review`; remove `succeeded` without retaining an alias.

| From | Allowed destinations | Additional proof |
|---|---|---|
| reserved | starting, failed, cancelled, orphaned | Starting has durable spawn intent. Failure/cancellation proves no spawned writer remains; ambiguous allocation/spawn becomes orphaned. |
| starting | running, stopping, failed, cancelled, orphaned | Running requires observed process-start identity. Even a fast exit records the observed start before capture. Unknown start is not failed. |
| running | stopping, submitted, failed, cancelled, orphaned | Submission requires section 3.3. All terminal destinations require full termination proof. |
| stopping | cancelled, failed, orphaned | Cancellation is terminal only after all writers stop. A stop deadline/unknown descendant becomes orphaned. |
| orphaned | running, stopping, submitted, failed, cancelled | Reattachment is allowed only through an independently verified adapter, to the SAME execution identity; otherwise preserve and stop/reconcile. Terminal destinations still need proof. |
| submitted, failed, cancelled | none | Retries are new attempts, never transitions of a terminal attempt. |

Same-state observation updates may append facts but cannot mutate immutable attempt identity. Guard state/expected row identity in the Core and database boundary; enums alone are not transition enforcement.

`ended_at_ms` MUST remain null while any writer may remain. Set it only after proof that no process was created, or that the supervised process and descendants terminated. `submitted`, `failed`, `cancelled` always have termination proof. Orphaned attempts occupy the unterminated-attempt uniqueness slot.

`no_process_created` is permitted only for failed/cancelled attempts with no observed PID,
process-start identity or start timestamp. Any observed start requires writer_tree_terminated;
submitted ALWAYS requires writer_tree_terminated. A no-process assertion cannot contradict
recorded start facts or release their unterminated ownership slot.

External isolation alone is NOT enough to retry in v1. This deliberately chooses the stricter recovery rule over the baseline's ambiguous isolation exception. An isolation-based replacement would require a separately reviewed ownership model.

### 3.3 Submission and cancellation ordering

Capture is serialized with cancellation under current authority and attempt ownership. Before publishing a submission, prove termination, branch/worktree identity, permitted base ancestry, clean tracked/untracked source state and approved scope. Create the submission ref with create-only semantics; bind its full OID and tree to the attempt. Dirty or invalid output ends the execution as failed with preserved workspace and task `needs_review`; it is not a successful submission.

A cancellation accepted before capture prevents a new submission and yields cancelled after termination. A submission already pinned is retained as history; cancellation can still cancel the task before promotion. Task cancellation after the promotion commit point cannot undo integration: finalize the integration and report already-integrated. Explicit undo is a separate authorized operation.

### 3.4 Completion provenance

Within one finalization transaction, prove:

- task membership belongs to this operation's immutable plan sources;
- operation, evidence and snapshot share project AND operation identity;
- snapshot points to the exact promoted candidate/tree and matching policy/profile/environment evidence;
- required evidence passes and observed refs match the durable intent;
- operation is finalized before task status becomes completed;
- events and task version changes commit with the completion records.

Reject a pass from another operation even if its candidate/tree/policy are identical. Enforce task initial state, legal updates and relational equality in the schema as well as Core proof checks. Direct malicious same-account SQL access remains outside the security claim.

## 4. Authority, leases and backup continuity

### 4.1 Authority identity

Every broker call and supervised report binds:

`project identity + authorityIncarnation + coordinatorEpoch + resourceKey + fencingToken + owner identity`.

`authorityIncarnation` is a 256-bit cryptographically random lowercase hex identifier. It is an identity discriminator, NOT a secret or permission. Store it in the canonical registry and workflow project identity. Bind it to attempts, plans, operation intent, caller scopes and the IPC hello. Historical observations retain their original incarnation.

Normal start acquires the same lifetime guard, verifies registry/workflow agreement, preserves incarnation and increments Coordinator epoch durably before admission. Never reuse a rolled-back or uncommitted epoch grant. Epoch/fence exhaustion fails closed; numbers do not wrap.

Every effect compares the entire tuple to the current authority record, then current content epoch, policy and expected OID where applicable. A matching number with a different incarnation is stale. A lease token is never permission.

### 4.2 Lease grant versus renewal

Resource keys are generated by Core, never supplied as unrestricted caller strings: `task:<taskId>`, `worktree:<worktreeId>`, and the project integration resource. Grant/renew/release are short Coordinator transactions.

- New grant requires no unresolved previous writer/operation for that resource and increments its retained fence by exactly one.
- Renewal requires the identical current owner, incarnation, epoch and fence; it preserves the fence and extends expiry only under an approved timing profile.
- Release clears owner/expiry but retains counters and history; expiry cannot substitute for release or termination proof.
- Heartbeat interval and lease duration are explicit owner-approved positive safe integers; interval MUST be at most one third of duration. No hidden environment override.
- Use monotonic elapsed time while live; wall-clock expiry is an audit/recovery observation. Reboot, suspend or material clock discontinuity invalidates live timing assumptions and triggers reconciliation before granting ownership.

### 4.3 Restoring an older backup

This resolves the baseline's unspecified global numeric continuity: numeric counters are monotonic within an authority incarnation, not globally across disaster restoration. The full tuple prevents authority reuse.

1. Restore into an isolated directory and verify the whole backup set. Keep original data and guard untouched.
2. Require explicit maintenance approval and proof that the old namespace cannot have a live Coordinator/writer. If proof is unavailable, leave restoration read-only; a new nonce does not stop an old process.
3. Under the canonical registry/guard authority, persist an activation intent containing old and new identity, backup digest and a fresh incarnation.
4. Before installing either new registry or workflow identity, settle ALL unfinished old-incarnation operations and attempts in the isolated, stopped maintenance namespace. Prove every writer stopped, finalize observed promotions or safely fail/abandon unpromoted effects, and release all old grants with retained counters. Never replay a historical spawn or admit ordinary work during this settlement. Unknown/unfinalizable promoted intent blocks activation; it cannot be archived or bypassed with a fresh incarnation.
5. Retain old counters, settled operation history and grants as historical facts. Establish the new active epoch/counter domain without transferring old attempts/plans/scopes as current authority.
6. Install the new incarnation in registry and workflow via intent/readback/finalization only after settlement. Any disagreement or interruption blocks admission. Never copy `guard.sqlite` as live leadership.
7. Invalidate old scopes/timers and unfinished tasks/plans. Create new tasks/plans for the new active authority/content domain; prior settlement does not authorize replay or live ownership transfer.
8. Record activation provenance and original snapshot/evidence identity. Historical verification is not new-environment acceptance; current mandatory checks still apply to a new promotion.

An ordinary restart that finds unexpected incarnation mismatch MUST NOT invent a new incarnation to bypass it. Random identity rotation is only the explicit backup activation operation. Process restart does not reset counters.

Source: backup (historical source), recovery (historical source).

## 5. Durable operation journal

### 5.1 One discriminated contract

The effective journal replaces the incomplete historical shape. Do not loosen `additionalProperties` or hide mandatory fields inside untyped JSON. Use a closed common envelope with a closed `intent` variant per operation kind, an append-only observation stream, and a versioned phase projection.

Common required identity: schema version, project/repository identity, operation ID, kind, authority incarnation, originating Coordinator epoch/fence/resource/owner, principal scope ID, request-key hash, normalized semantic-request hash, effective policy hash, approved profiles hash, created timestamp and immutable intent hash.

Mutable projection: phase, version, last observation ID and update timestamp. Every update checks expected version and increments once. Hash immutable intent only; do not include later observations or phase in the intent hash. Idempotency binds semantic request, not output style or observation timeout.

Observations record observed identity/bytes/refs/process result, observer authority, timestamp, evidence/artifact references and safe reason codes. Corrections append a new observation, never edit a past one. Store append-only rows/events transactionally with phase changes. Recovered execution records its CURRENT authority separately; it cannot rewrite the originating intent.

Every projection update's referenced observation must bind the entire CURRENT execution
tuple to the current lease: project/incarnation/epoch/resource/owner/fence. An old observation
cannot justify an update merely because another owner now holds that resource. Renewal
preserves the tuple and may reuse its observation; a replacement/recovery grant needs a
new current-authority observation. Origin authority remains immutable.

### 5.2 Required kind-specific intent

| Kind | Immutable intent required before its effect |
|---|---|
| init | canonical repository/common-dir identity, project registration identity, approved base OID/tree, object format, generated baseline/integration ref names and expected absence, state schema/policy/profile identity |
| worktree_create | attempt/operation owner, canonical managed parent/path, branch or detached role, expected branch absence where created, base OID/tree, ownership marker identity |
| spawn | attempt/worktree identity, approved executable/profile digest, supervisor launch identity, argument/request digest, cwd, environment-profile hash and budget; never raw credentials |
| stop | target attempt/supervisor identity and exact observed process-start identity/descendant scope, stop mode and bounded deadlines; PID alone is invalid |
| merge, undo, restore | plan ID/hash, expected integration OID, candidate OID/tree, ordered source pins, generated integration/candidate/snapshot refs, expected snapshot absence, policy/profile hashes, check/environment requirements, expected/next content epoch, exact task membership; undo also original batch operation; restore also target verified snapshot |
| backup | approval reference, quiescent barrier, integration OID/content epoch/event watermark, required DB/schema/ref/object/artifact identities, target ownership and manifest contract; excluded work explicitly listed |

Planning may create objects before apply. It requires its own durable allocation/candidate observations; apply MUST NOT invent candidate identity after testing. A blocked/no-change plan has no promotable integration intent.

Before phase `tests_passed`, a durable acceptance observation MUST contain evidence ID AND exact evidence digest, candidate/tree, policy/profile/environment bindings, required check results and artifact hashes/lengths. An evidence ID alone is insufficient. Keep the evidence immutable and durably stored before promotion.

Each operation has exactly one selected immutable acceptance receipt and at most one
promotion receipt. Required checks must ALL be present and pass in that exact evidence
ID/digest; a union of separate evidence rows is insufficient. Promotion and verified
snapshot reference that same selected receipt. Later corrections append reconciliation
observations, not replacement accepted receipts or overwritten history; uncertainty keeps
the slot in review.

### 5.3 Phase graphs

Integration kinds keep:

`prepared -> candidate_created -> testing -> tests_passed -> git_promoted -> finalized`.

Preparation validates all frozen inputs. The already pinned candidate is adopted/read back at candidate_created, not reconstructed. There is one integration pipeline. Partial/unknown results enter needs_review and keep its slot. Once promoted, failure/cancellation cannot release that slot or remove evidence; finalize or reconcile.

candidate_created requires a candidate_pinned observation matching the frozen OID/tree/ref.
testing requires testing_started matching the frozen candidate/environment. A reconciliation
resume references current authority plus retained exact phase proof, never an unrelated
observation. Durable promotion history forbids failed/abandoned and regression to any
pre-promotion phase even after needs_review; the slot remains held until finalized.

Integration intent planId equals its relational plan projection. Its ordered sources equal
every relational plan source at the same ordinal and its taskMembership is the exact
distinct task set, not a subset. Finalization/completion uses that same frozen intent set.

Non-integration kinds use:

`prepared -> effect_observed -> finalized`.

Kind-specific observed proof:

- init: registered identity, initialized storage and exact managed refs agree;
- worktree_create: managed path, branch/detached base and ownership marker agree;
- spawn: the supervised process start was observed, or an identified start-and-exit receipt exists; finalization means launch receipt, NOT task success;
- stop: the entire authorized writer tree is proven stopped;
- backup: every consistent backup member and manifest is durable and verified.

For multi-step effects, record each fixed per-kind observation as it occurs. No state transaction spans an external effect. Crash at any partial step requires reconciliation; `effect_observed` is not entered for a partial set.

Known safe failures before promotion can become failed; explicit reviewed abandonment can become abandoned only when no unresolved writer/effect remains. Both preserve artifacts. Unknown effects become needs_review. needs_review can resume only at the phase proven by reconciled facts, recorded in an explicit recovery event; it cannot skip verification. Terminal phases are finalized, failed, abandoned; they do not restart. Reusing the request returns that operation, not a new one.

A failed validation records fail/incomplete evidence and exit 7 where prescribed by the CLI; it never promotes. A false start with proven absence may fail; missing PID or EOF alone may not.

### 5.4 Cross-system recovery decisions

| Observed state | Action |
|---|---|
| Integration remains expected; snapshot absent | Resume only if intent/pins/current authorization/content/evidence agree; otherwise review. |
| Integration is candidate; exact snapshot ref and acceptance proof match | Finalize SQLite once; record recovery authority without altering historical intent. |
| Snapshot missing, refs partial, candidate mismatched, or integration is another OID | needs_review; hold integration slot; never overwrite based on ancestry alone. |
| Process may exist; launch receipt absent | Quarantine attempt/worktree; prove process identity and termination before replacement. |
| Response lost after finalization | Return stored receipt for the identical semantic request; do not repeat effects. |
| DB/artifact/registry write fails | Stop admission; preserve effects and intent; inspect persistence before any retry. |

Historical promotion can be recorded after a policy change only after an explicit reconciliation decision proves what actually happened. It does not authorize a new promotion or reuse stale validation. If current authorization/evidence cannot establish the required result, remain needs_review.

Sources: Git integration (historical source), recovery (historical source), durability (historical source).

## 6. Local IPC authority

Keep local sockets/named pipes, 4-byte big-endian length framing, strict bounded UTF-8 JSON and no TCP/HTTP. JSON responses and public NDJSON events stay distinct.

- The owner approves caller scopes through the existing initialization/policy bootstrap path. Coordinator mints random 256-bit scope handles; store only their digests and bound scope metadata. Owner CLI handle storage is outside repository/worktrees with owner-only access; no tokens in args, task text, artifacts, logs or provider environment.
- Bind each scope to project identity, incarnation, Coordinator epoch, stable principal ID, allowed methods/resources and expiry/revocation. Epoch changes revoke connection handles; reconnect obtains a new approved handle without changing the stable principal used for idempotency.
- Authenticate OS peer identity where supported AND validate the scoped handle. If required peer verification/ACLs are unsupported, deny mutation. A caller-supplied sender/role/lease is not identity.
- Hello uses fresh client/server nonces and echoes both with project/incarnation/epoch to bind this connection and reject stale handshakes. Nonces are not credentials. Scope validation, not the nonce, grants authority.
- Worker reports use a dedicated supervisor-owned channel bound to one attempt, launch identity and authority. The provider process does not inherit that channel or any owner handle. Reports cannot call owner-only task/policy/promotion methods.
- The effective permission is the intersection of current owner policy and trusted scope. Validate it again at each side effect; a connection authenticated earlier cannot bypass policy revocation.
- On restart revoke all old handles/channels, reconcile processes, then admit connections. A backend without verified reattachment cannot claim recovered process supervision.
- Requests still require idempotency and expected state identity; authentication does not make delivery exactly-once. Event replay remains at-least-once, deduplicated by eventId.

Same-UID malicious processes may read owner files or bypass the broker in cooperative mode. These controls prevent accidental scope confusion and untrusted payload escalation; they do NOT make raw same-account code safe. Strong isolation remains a separate release gate.

Source: IPC (historical source), policy (historical source), security (historical source).

## 7. Idempotency and recovery retention

Keep `(project, stable principal, command, key hash)` as the request namespace and persist semantic-request hash. Conflicting payload is IDEMPOTENCY_CONFLICT. Identical reserved/unknown request reports or reconciles the same operation; no duplicate launch. Identical applied/failed request returns the stored result. Fresh intentional retry requires a new authorized request/attempt, not mutation of an old receipt.

V1 retains idempotency records and audit events indefinitely; no automatic deletion/compaction. Bound storage and halt admission before exhaustion. Event cursors bind project/history identity; a backup activation invalidates prior live cursors and requires a fresh snapshot/high-watermark handshake. No hidden numerical cursor expiry is implied when there is no retention process.


## 8. Git, evidence, policy and storage obligations

Policy/profile exact bytes, hashes and owner approval are outside agent-writable source.
Repository text, task messages, flags and model output cannot grant authority. Deny all
unspecified grants. Intersect owner paths with task paths; protected paths always win.
Paths are exact relative selectors or directory prefixes ending in `/`, never globs or
implicit root grants. Validate both rename paths; forbid `.git`, traversal, symlink/device
escapes and unsupported case collisions. Recheck identity/scope before every effect.
A policy/profile update pauses admission and invalidates incompatible plans/checks.

Use approved executable+argv with shell=false, explicit cwd, controlled Git configuration,
empty hooks, no pager, no credential/prompt helpers and denied custom filters/drivers.
Audit effective repository/worktree/global/system/environment config and attributes before
Git commands which can execute code. A Node `.cmd` launcher is not a no-shell executable;
approve actual Node+entrypoint or an audited executable backend, never task interpolation
into cmd.exe/PowerShell. Bound time/stdout/stderr/disk/process count and drain both streams.
Never put credentials in args, task text, state, artifacts or logs. Provider authentication
stays inside its separately approved boundary. Version probes are also approved execution.
Codex, Claude and Pi remain planned integrations, not supported/tested in Stage 0.

Plans freeze integration OID, content epoch, ordered full submission pins, requirements,
policy/profiles/environment and deterministic commit metadata. `ready` means promotable
structure, NOT tested. Merge plans fold ordered inputs with merge-tree --write-tree and
commit-tree using explicit parents. Text conflicts/unsupported drivers become blocked or
conflicts; no automatic ours/theirs or model merge repair. Bounded plan construction may
allocate objects/ref pins/artifacts but cannot run project checks or advance integration.
Candidate identity is durable before apply; repairs create new tasks/attempts/plans.

Required checks run only on the pinned detached candidate with approved profiles and
supervised termination. Bind exact candidate/tree, operation, plan, policy, profiles and
environment. Capture tracked/untracked dirtiness before/after, actual exit/signal and
artifact byte hashes/lengths. Missing/incomplete/skipped/todo/cancelled or zero-test required
runs do not pass; a non-test check needs a separately approved acceptance type. Dirty
source invalidates acceptance. Evidence verdict is computed from observations, never model
prose or exit zero alone. Schema/SQL can check structure, not truth of external observations.

Durably persist immutable acceptance before promotion. Serialize cancellation and capture,
and cancellation and the promotion commit point. Git update-ref transaction conditionally
updates the generated integration ref from EXPECTED to CANDIDATE AND create-only snapshot
ref. Read back exact refs. SQLite finalization records snapshot/evidence/task membership,
events and exact-once task version updates in one transaction after operation finalization.
Git and SQLite do not share a transaction. Once refs committed, finalize/reconcile; cannot
cancel away evidence/ownership or retry promotion with a newly invented candidate.
Restore creates a new history-preserving commit with current integration parent and target
verified tree, increments content epoch and invalidates unfinished work. Undo is the explicit
original batch operation, not ambiguous per-task reversal. Completed historical tasks do not
reopen; effectiveness in current snapshot is separately projected. Baseline is unverified.

Workflow uses local SQLite WAL, foreign_keys=ON, synchronous=FULL and bounded busy timeout.
Lifetime guard is a separate rollback-journal database holding its write transaction for the
host lifetime. No external effect is inside a workflow transaction. Forward migrations have
exact SHA-256 receipts; unsupported future schemas are read-only. BUSY retries are bounded
before unknown effects; never retry a whole execution after a persistence error. All counters
are positive/nonnegative safe integers; exhaustion fails closed and never wraps. JSON hashes
use compact UTF-8, lexicographic keys, preserved arrays, unchanged NFC, no duplicate keys,
floats/NaN/infinity or out-of-range integers. Intent hash covers immutable intent only; plan
hash excludes planHash, evidence digest excludes evidenceSha256. Artifact hashes cover bytes.
Events, immutable evidence, snapshots, plan sources and intent cannot be edited or pruned.

## 9. Backup activation and recovery admission

Owner-approved backup halts admissions/promotions, drains/stops known work and proves a
quiescent barrier: integration OID, content epoch, last finalized operation, event watermark.
Unknown writers deny the barrier. Use driver backup API, never copy a live WAL main file.
The complete set includes schema/checksums, explicit Git ref/object bundle, all referenced
immutable artifacts, policy/profile and canonical identity metadata; hash exact bytes and
list excluded dirty/untracked/ignored work and credentials. Verify isolated restoration:
manifest, bundle/objects/refs, DB integrity/FKs/schema, artifacts and snapshot membership.
Guard is never copied as leadership. Backup is maintenance/runbook, not a nineteenth leaf.

A same-incarnation restart keeps immutable originating attempt/plan/intent authority but
acquires a NEW current execution grant, epoch and fence before an effect. Reconciliation
observations record current observerAuthority separately. Do not require historical origin
epoch to equal the current epoch merely to read/adopt valid same-incarnation intent; current
policy/content/ref/process applicability must still be established. Only explicit isolated
backup activation rotates incarnation only after old namespace writer-termination proof,
settlement of ALL unfinished operations/attempts and release of old grants. A fresh
random identity alone cannot stop writers. Registry/workflow activation mismatch blocks all
admission; normal restart cannot invent an incarnation to bypass the mismatch. Historical
old-incarnation plans/scopes/timers/reports are not transferable; create new approved work.

## 10. CLI surface and acceptance boundary

[Command catalog](../contracts/commands.json), [CLI reference](CLI_REFERENCE.md) and
[request schemas](../schemas/commands/) describe the eighteen leaves only. Utility flags
help/version/capabilities do not initialize state, probe providers or add public commands.
Accepted is not completed. Read-only observation never repairs/migrates/deletes/starts hosts.
Plans/dry-run may allocate bounded objects, never run project checks or promote. Normal
JSON is one bounded result; public NDJSON events and internal framed IPC are separate.

[Acceptance mapping](../tests/acceptance-map.json) retains every original 64 scenario and
all 18 CR additions without claiming 82 independent executions. [Fault boundaries](../tests/FAULT_INJECTION.md)
retain FI-01..FI-16. Offline schemas/SQL negative fixtures do not prove CLI/IPC/Core behavior,
crash durability, provider compatibility, process control or platform security.

## 11. Adoption and remaining gates

CR-01/02: closed attempt states and transition graph, termination/submission proofs,
reserved-only inserts and versioned immutable identity. CR-03/04: closed typed intents and
observations for all eight kinds, two phase graphs and partial-effect reconciliation.
CR-05: exact grant/renew/release actions, retained counters and no expiry-only replacement.
CR-06: owner-approved scoped handles, nonce-only denial and separate supervised reports.
CR-07: full incarnation identity across registry/project/attempt/plan/intent/IPC/backup,
with separate current recovery observations. CR-08: queued initial tasks and same-operation
plan/evidence/snapshot/task-membership completion. Retention: indefinite idempotency/events
with history-bound fresh-cursor handshake after backup activation. These are adopted design
and fixture constraints, not runtime implementation claims.

status/task show normalize bounded `--cursor-file` JSON to the required history-bound cursor
object; there is no unbound numeric replay alias. All project/incarnation/history identity
fields must be compared before replay; mismatch requires a new snapshot/high-watermark.
Current equality and transport replay are unimplemented Core/CLI acceptance gates.

Remaining release gates: OS file identity/reparse safety; actual lifetime-lock races and
loss handling; named-pipe restricted DACL, SID/peer authentication; Job Object ownership
before provider execution, descendant containment/termination and nested-job compatibility;
exact Node/SQLite backup/durability API and filesystem power-loss behavior; reviewed helper
source/license/binary integrity with scripts-disabled installation; actual Git admission/CAS;
owner scope bootstrap; real Codex/Claude/Pi profiles; all product/fault/backup rehearsal and
packed-consumer gates. No sandbox, Linux/macOS support, public npm availability or power-loss
certification is implied. An unmet Windows gate denies mutation; no silent fallback platform.

## 12. Change provenance

2026-10-14: consolidated the historical architecture, selected CR-01..08 overlay and
Windows/MIT/private Stage 0 selection into this source; removed competing effective copies.
Original source bundle and overlays remain untouched. No historical report/manifest has
been regenerated as new evidence. `scripts/validate-contracts.py` is an offline contract
harness only, creates NEW temporary databases and cleans them, and must be run by the parent.

The Stage 0 review corrections bind termination assertions to observed start facts, retire
the shared terminal-success alias, wire complete cursors into both replay request consumers,
preserve promoted history through review, bind current observer grants, settle old authority
before rotation, freeze exact ordered membership, select one complete acceptance receipt and
require matching phase observations/plan projection. Offline boundary fixtures express these
requirements without claiming current Core/CLI/OS behavior or product test execution.
