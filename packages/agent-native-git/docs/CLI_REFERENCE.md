# CLI reference

The canonical list is [commands.json](../contracts/commands.json). There are **18 public leaf contracts**; grouped parents and utility flags do not add commands. Stage 2 implements thirteen leaves; five background/integration/restore leaves remain unavailable.

**Implemented:** init, doctor, status, task add/list/show/message/cancel, agent start/stop, foreground run, worktree list, snapshot list.

**Planned, unavailable before effects:** worker start/stop, integrate plan/apply, snapshot restore. Their sections specify future behavior. Root help/version/capabilities are actual utilities and do not probe providers.

Runtime requires exactly Node 24.21.0 on Windows x64. This independent MIT private `0.0.0` development package now resides in the Hub at `packages/agent-native-git`; it is not a release or publicly available npm package, and its runtime is not imported into AIT. See [Stage 1](STAGE1.md) for metadata prerequisites and [Stage 2](STAGE2.md) for controlled execution and its limits.

## Shared flags and normalization

`--repo PATH` selects an already registered canonical repository (except init); omitted PATH is discovered from cwd without network access. `--json` selects one result envelope except follow mode's event-only stream. Automation **must** supply/reuse `--idempotency-key KEY` for mutations; interactive use may generate one and return the receipt. `--request-id ID` is an optional tracing identifier, not an idempotency or authority token. `--help` works at every leaf; root `--version` does not initialize state or probe agents. Root `--capabilities --json` returns the eighteen-command catalog, contract versions and static feature availability without executing provider probes; it is not a nineteenth command.

CLI arguments normalize into the per-command request schema. `--file` for task/message accepts a bounded local JSON document and embeds its parsed structure. `--profile` maps to runtimeProfileId, `--base` to approvedBase, `--plan` to planId, `--to` to targetSnapshotId and `--tasks` to an ordered list of distinct taskIds. `--drain`/`--cancel` select exactly one worker stop mode. Neither `--yes` nor arbitrary shell execution is a v1 flag.

`--cursor-file PATH` on status/task show reads at most 4096 bytes of strict UTF-8 JSON,
rejects duplicate keys/unknown fields and normalizes the parsed object to `options.cursor`
under [event-cursor](../schemas/event-cursor.schema.json). A bare numerical replay offset
is not accepted and has no compatibility alias. Task show requires `--history` with a
cursor. Without a cursor, capture a fresh snapshot/high-watermark and return its full
project/incarnation/history-bound cursor. With a cursor, consume every identity field
before reading the requested replay range; status may return bounded replay or continue
with `--follow --format ndjson`. A changed project/incarnation/history returns
CURSOR_HISTORY_MISMATCH and requires a new snapshot handshake, never numeric-only fallback.
Stage 1 performs current-history equality, bounded replay and strict file normalization. Follow stdout contains only public event-schema NDJSON; errors go to stderr. Without a cursor follow begins after a captured high-watermark, with no initial synthetic event or ordinary result envelope.

Validate UTF-8, duplicate JSON keys, safe integers, depth at most 32, maximum payload 1 MiB, unknown flags, identifier lengths and mutually exclusive options. File path validation is separate from schema validation; a schema-valid absolute path is not automatically authorized. No environment variable may override a deny rule. Local profile references must resolve to the owner's approved copy outside the project source.

Owner approval requires an external private policy binding `git.executable.path`/SHA-256 and `execution.lease`. A nonempty `execution.allowedProfiles` requires external private `execution.profilesFile`; tasks cannot weaken owner-required checks. Execution additionally requires explicit `execution.maxProcessesPerAttempt` (1–32), an allowed enabled approved coding-agent profile and managed-worktree cwd. Disabled profiles stay disabled; provider compatibility remains unknown. There is no public state-root override. Unsafe default-host anchors are denied without repair.

## Results and exit codes

`ok=true` means the requested command contract completed, not that inspected work is correct. `integrate plan` with verdict=conflicts may exit 0. `integrate apply` that cannot satisfy required checks returns ok=false, CHECKS_FAILED and exit 7 after an awaited failure. An accepted asynchronous request returns status=accepted and an operationId; it does not set a task to completed.

| Exit | Meaning |
|---|---|
| 0 | Command completed or a durable async request was accepted; inspect verdict/status |
| 2 | Invalid argument, schema, unsupported option or malformed input |
| 3 | Stale state, unknown evidence, conflict requiring review, unsupported scope |
| 4 | Authorization/policy denied |
| 5 | Busy/unavailable host, guard or resource; bounded retry may be valid |
| 6 | Internal failure; preserve diagnostic and operation identity |
| 7 | Requested apply/check operation reached a known failing validation result |
| 130 / 143 | Conventional observed interruption when the process can report it; not a guaranteed result on hard kill |

Exit 7 separates a known failed validation from an internal tool bug. An aborted process may emit no final JSON at all; callers must reconcile a submitted idempotency key.

## Long-running execution

**Stage 2: controlled foreground execution; no background host.** `agent start` owns its coordinator and lifetime guard until final termination/capture; it never auto-detaches. Accepted `--wait-ms` does not convert it into a background operation. `run` defaults to until=idle and reports submitted/blocked work distinctly from completed work; until=stopped continues admission until owner interruption.

The live native broker handles metadata writes/cancellation/stop under the same authority. `agent stop` persists stop intent and returns a fast acknowledgement; positive waitMs observes committed proof outside serialized mutation. A timeout is not proof of termination. Heartbeats cannot revive expired grants; unknown outcomes retain ownership. Auto-integration is unavailable before effects.

## Planning side effects

**Future planning contract, unavailable in Stage 2.**

`integrate plan` and restore preview can create bounded objects, candidate refs, plan journal rows and artifacts; they do not run project scripts or advance integration. `--dry-run` in snapshot restore means no promotion and no tests, not zero disk writes. Read-only commands do not mutate business state, but operating-system/SQLite read mechanics can involve sidecars. Contracts describe semantics rather than an impossible universal no-syscall-write guarantee.

## Defaults

parallel=3 clamped by owner policy; autoIntegrate=false; status limit=100; task list limit=50; snapshot list verified-only, limit=50; worker stop timeout=300 seconds; required evidence cannot be skipped. Automatic integration requires both an explicit run/start flag and effective integration privileges plus allowAutoPromotion=true. Integration never means pushing or merging a remote branch.


## Contract source

[Effective contract](CONTRACT.md) is normative; this catalog projection does not add authority.
Event cursors bind project/incarnation/history. Backup activation requires a fresh snapshot/high-watermark handshake; no automatic cursor expiry/pruning exists.

## init

**Stage 1: implemented registration; existing repository only, explicitly unverified baseline.**

`angit init --repo PATH --base FULL_OID --policy-file PATH`

Register an existing repository without editing its main checkout.

Effect: managed-write. Capability: `project.register`.

Result: projectId, repo identity, baseline OID, policy hash; baseline verification=unverified.

Request schema: [init](../schemas/commands/init.schema.json).

## doctor

**Stage 1: implemented metadata diagnostics; healthy does not mean verified content/providers.**

`angit doctor [--deep]`

Inspect runtime capabilities, state integrity, identity, protected refs and stale operations.

Effect: read. Capability: `project.read`.

Result: verdict=healthy|attention|unsupported; diagnostics with evidence, no auto-repair.

Request schema: [doctor](../schemas/commands/doctor.schema.json).

## status

**Stage 1: implemented snapshot/history and event-only follow.**

`angit status [--follow --format ndjson] [--cursor-file CURSOR_JSON]`

Read project/queue/attempt/operation status or a resumable event stream.

Effect: read. Capability: `project.read`.

Result: counts, integration OID, verification, content epoch; history-bound cursor and bounded replay, NDJSON events in follow mode.

Request schema: [status](../schemas/commands/status.schema.json).

## task-add

**Stage 1: implemented immutable task/DAG/check/scope admission; no execution.**

`angit task add --file TASK_JSON`

Create one immutable task spec with dependencies, scope and checks.

Effect: metadata-write. Capability: `task.create`.

Result: taskId, initial version=0, status=queued; eligibility projection may transition to blocked/review.

Request schema: [task-add](../schemas/commands/task-add.schema.json).

## task-list

**Stage 1: implemented bounded read.**

`angit task list [--status STATUS] [--limit N] [--after-task-id ID]`

List bounded task summaries with stable ID pagination.

Effect: read. Capability: `project.read`.

Result: items, nextCursor; task completion history separate from current effectiveness.

Request schema: [task-list](../schemas/commands/task-list.schema.json).

## task-show

**Stage 1: implemented bounded read/history.**

`angit task show TASK_ID [--history [--cursor-file CURSOR_JSON]]`

Read one task, attempts, dependencies, messages and evidence locators.

Effect: read. Capability: `project.read`.

Result: task projection and bounded history with continuation cursor.

Request schema: [task-show](../schemas/commands/task-show.schema.json).

## task-message

**Stage 1: implemented append-only advisory message; no authority or specification changes.**

`angit task message --file MESSAGE_JSON`

Append a bounded advisory message; broker supplies sender identity.

Effect: metadata-write. Capability: `task.message`.

Result: messageId and eventId; never changes task completion or authority.

Request schema: [task-message](../schemas/commands/task-message.schema.json).

## task-cancel

**Stage 2: queued cancellation or brokered active cancellation; unknown writer ownership is preserved.**

`angit task cancel TASK_ID --reason TEXT [--wait-ms N]`

Cancel queued work or request stop of an active attempt.

Effect: managed-write. Capability: `task.cancel`.

Result: accepted operationId or completed cancellation; no implicit undo after promotion.

Request schema: [task-cancel](../schemas/commands/task-cancel.schema.json).

## agent-start

**Stage 2: implemented foreground ownership, not provider certification.**

`angit agent start --task ID --profile ID [--retry] [--wait-ms N]`

Reserve a new attempt, provision an owned worktree and start one approved CLI.

Effect: managed-write. Capability: `attempt.start`.

Result: final attempt/worktree/operation facts after controlled termination/capture. Successful submission is not task completion or integration. Explicit retry requires a fresh eligible semantic request.

Request schema: [agent-start](../schemas/commands/agent-start.schema.json).

## agent-stop

**Stage 2: implemented through the live authenticated coordinator.**

`angit agent stop ATTEMPT_ID --reason TEXT [--wait-ms N]`

Persist stop intent for the exact owned attempt, then terminate its verified Job writer tree. Never select a target by PID alone.

Effect: managed-write. Capability: `attempt.stop`.

Result: stop operation ID and acceptance facts. Positive waitMs adds committed terminal proof or waitTimedOut with null proof; preserve worktree and unresolved ownership.

Request schema: [agent-stop](../schemas/commands/agent-stop.schema.json).

## run

**Stage 2: implemented sole foreground coordinator.**

`angit run [--parallel N] [--auto-integrate] [--recover] [--until idle|stopped]`

Run the sole foreground Coordinator and bounded local agent slots.

Effect: managed-write. Capability: `coordinator.start`.

Result: terminal queue summary after orderly shutdown; until=stopped supports continued live admission. `--auto-integrate` is denied before effects. Recovery requires exact receipts and never blindly replays spawn.

Request schema: [run](../schemas/commands/run.schema.json).

## worker-start

**Planned contract only; unavailable before effects in Stage 2.**

`angit worker start --detach [--parallel N] [--recover]`

Explicitly start the same Coordinator in the background without installing a login service.

Effect: managed-write. Capability: `coordinator.start`.

Result: verified startup receipt only after guard, DB recovery and IPC readiness.

Request schema: [worker-start](../schemas/commands/worker-start.schema.json).

## worker-stop

**Planned contract only; unavailable before effects in Stage 2.**

`angit worker stop --drain|--cancel [--timeout-seconds N]`

Stop admission and drain or request cancellation of managed attempts.

Effect: managed-write. Capability: `coordinator.stop`.

Result: completed after process reconciliation; timeout does not authorize force deletion.

Request schema: [worker-stop](../schemas/commands/worker-stop.schema.json).

## worktree-list

**Stage 1: implemented observation, not provisioning or cleanup.**

`angit worktree list [--include-preserved]`

Compare registered worktrees with Git porcelain observations.

Effect: read. Capability: `project.read`.

Result: items with ownership, branch, dirty status and unknown flags.

Request schema: [worktree-list](../schemas/commands/worktree-list.schema.json).

## integrate-plan

**Planned contract only; unavailable before effects in Stage 2.**

`angit integrate plan --tasks ID[,ID...] | --undo-integration OP_ID`

Freeze source OIDs and produce a candidate plan; no builds or tests.

Effect: planning-write. Capability: `integration.plan`.

Result: planId/hash, expected OID/epoch, candidate OID, verdict and conflict paths.

Request schema: [integrate-plan](../schemas/commands/integrate-plan.schema.json).

## integrate-apply

**Planned contract only; unavailable before effects in Stage 2.**

`angit integrate apply --plan PLAN_ID [--wait-ms N]`

Validate an immutable merge/undo plan and conditionally promote verified refs.

Effect: managed-write. Capability: `integration.apply`.

Result: operation ID accepted, or new verified snapshot after checks and ref/DB finalization.

Request schema: [integrate-apply](../schemas/commands/integrate-apply.schema.json).

## snapshot-list

**Stage 1: implemented; verified-only default hides the unverified init snapshot unless requested.**

`angit snapshot list [--include-unverified] [--limit N]`

Read pinned snapshots, evidence and restore lineage.

Effect: read. Capability: `project.read`.

Result: snapshot list with verification labels; never infer verification from a ref alone.

Request schema: [snapshot-list](../schemas/commands/snapshot-list.schema.json).

## snapshot-restore

**Planned contract only; unavailable before effects in Stage 2.**

`angit snapshot restore --to ID [--dry-run] | --apply --plan PLAN_ID`

Plan or apply a history-preserving restoration to a verified snapshot tree.

Effect: planning-or-managed-write. Capability: `snapshot.restore`.

Result: preview plan or completed new snapshot; current history and task worktrees retained.

Request schema: [snapshot-restore](../schemas/commands/snapshot-restore.schema.json).
