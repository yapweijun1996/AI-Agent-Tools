# Fault-injection specification

Status: planned product suite, not executed by this documentation delivery.

## Harness contract
Inject a deterministic named checkpoint in a disposable build, then terminate the process or make one call fail. Persist harness-owned receipts outside the process being killed. Re-run the same checkpoint with both a normal restart and an observation-only doctor. Never assume a graceful shutdown handler ran. Use a clean isolated HOME, fake credentials, local repository, bounded process tree and unique test run ID.

| Checkpoint | Durable fact before failure | Required restart observation |
|---|---|---|
| FI-01 after idempotency reservation | request identity exists, no process known | inspect intent; identical retry resumes same operation |
| FI-02 after attempt reservation | active attempt blocks a second claim | prove absence of process/worktree before closing attempt |
| FI-03 during worktree creation | declared unique path/ref, partial Git side effect possible | reconcile exact ownership; unknown state preserved |
| FI-04 after spawn before PID persistence | child may exist despite missing receipt | quarantine; never spawn a replacement solely from missing PID |
| FI-05 after provider exit before source capture | descendants may still write | require full writer quiescence, then clean immutable submission |
| FI-06 while writing candidate/artifact | partial file or unreachable object possible | validate hash/length and ref pin before using it |
| FI-07 after tests before journal | test output alone is not accepted evidence | rerun only under reviewed policy, or mark incomplete |
| FI-08 after tests_passed journal before refs | expected integration still old | fresh authorization and plan checks before any resume |
| FI-09 between ref transaction prepare and commit | no partial ref set may be treated as committed | inspect actual integration and snapshot refs |
| FI-10 after ref commit before DB finalization | candidate and snapshot refs may be advanced | validate frozen evidence and finalize once; block next promotion |
| FI-11 after DB commit before reply | completed result may be lost | replay same durable result for same request key |
| FI-12 after restore refs before content epoch commit | Git content changed, DB epoch possibly stale | reconcile epoch and stale tasks before scheduling resumes |
| FI-13 during cancellation | process stop and integration may race | apply cancellation boundary, never signal unrelated PID |
| FI-14 guard lost/replaced | exclusivity uncertain | stop admission/promotions; preserve all unresolved attempts |
| FI-15 DB/artifact/ref disk full | final step may or may not be durable | fail closed; inspect actual writes; no completed inference |
| FI-16 backup between DB and bundle capture | pieces may reference different checkpoints | reject incomplete set; original operation untouched |

## Assertions for every checkpoint
Original protected refs and checkout are unchanged by the tool. At most one valid active attempt owns a task. No false completed or verified status exists. Every observed mutation links to one operation intent. Dirty/unresolved workspaces survive. No stale epoch can promote after a restore. No new promotion starts while a previous one is unresolved. Retrying the same idempotency key never allocates an unrelated operation.

## Failure models
Process termination, transient IO errors, contention, signal loss, clock jumps, suspended workers and PID reuse are separate cases. Power-loss simulation needs filesystem/driver-specific crash testing and cannot be inferred from SIGKILL behavior. Complete disk loss requires a separately validated backup restore. Limit attempts, process trees, disk bytes and run duration to avoid an unbounded test harness.

## Evidence and reporting
Record checkpoint, source revision, seed, operation/attempt IDs, killed process identity, pre/post full OIDs, row versions/epochs, observed exit/signal and cleanup result. Reports state `passed`, `failed`, `blocked` or `not_run`; missing observations never become a pass. See test matrix (see effective CONTRACT.md) and recovery (see effective CONTRACT.md).


All FI-01..FI-16 remain future product harness requirements, NOT RUN in Stage 0. Use the effective contract for typed journals, effect_observed, immutable origin/current recovery authority and termination rules.
