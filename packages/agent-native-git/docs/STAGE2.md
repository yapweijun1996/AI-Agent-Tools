# Stage 2: controlled foreground execution

## Current scope

The independent private `0.0.0` Windows x64 package implements thirteen of eighteen CLI leaves: the ten Stage 1 metadata/read commands plus `agent start`, `agent stop` and `run`. Scoped local verification completed on 2026-10-15 with 53 passing behavioral tests and an actual offline scripts-disabled installed consumer. This is implementation/local verification scope, not release approval or default-host deployment certification. Receipts and historical limits belong in [VALIDATION](../VALIDATION.md); Stage 1 receipts remain unchanged.

Background `worker start/stop`, `integrate plan/apply` and `snapshot restore` remain unavailable before effects. No real Codex, Claude or Pi version has been certified. No Hub integration, product Git initialization, commit/push, publication, login service or deployment has been performed.

## Approval and runtime

Use exactly Node 24.21.0 on Windows x64 and the packaged native helpers. The existing external private policy/profile bindings apply. Execution additionally requires explicit `execution.maxProcessesPerAttempt` (integer 1–32), an allowed, enabled coding-agent profile with approval required and `cwdMode=managed-worktree`, and the approved executable SHA-256. Shell/script-launcher profiles are denied. Disabled profiles stay disabled. Task instructions are JSON input, never interpolated shell commands.

The current execution backend requires `sandboxBackend=none` and owner `requireSandbox=false`. Environment forwarding is restricted; credentials are not inherited. Network declarations and Job Objects do not prove filesystem or network isolation. Same-owner hostile code is outside the cooperative coordination guarantee.

There is no public state-root override. This host's unsafe Local AppData/Temp anchors remain denied without ACL repair. Successful internal owner-private fixtures cannot approve production default-host admission.

## Commands and ownership

```powershell
node ./bin/angit.js agent start --task TASK_ID --profile PROFILE_ID --idempotency-key KEY --json
node ./bin/angit.js agent stop ATTEMPT_ID --reason TEXT --wait-ms 5000 --idempotency-key KEY --json
node ./bin/angit.js run --parallel 3 --until idle --idempotency-key KEY --json
node ./bin/angit.js run --recover --until idle --idempotency-key KEY --json
```

These are usage instructions, not authorization to run a real provider or fabricated receipts.

`agent start` owns a foreground coordinator and lifetime guard until termination and capture. It does not detach or invent an asynchronous background host. `run` owns the same sole coordinator, admits eligible tasks with bounded parallel slots and respects immutable dependency eligibility. Submitted dependencies are not completed dependencies. `until=idle` ends at quiescence; `until=stopped` continues admitting brokered work until owner interruption. Auto-integration is unavailable before effects.

A live coordinator publishes an owner-private descriptor only after recovery and native broker readiness. Metadata mutations, task cancellation and attempt stop use the authenticated local broker; inspection/follow remain read-only. The broker binds native peer PID/start identity/token SID and a scoped nonce to project/incarnation/epoch. It is not an MCP server or reasoning runtime.

An authorized caller can replay a committed semantic stop receipt after the live broker has closed; conflicting key reuse is still rejected. A genuinely new stop request requires the live authenticated owner. During `run`, cancellation or an advisory version change to a selected queued candidate before reservation causes a fresh eligibility scan, not session shutdown or cancellation of unrelated active attempts.

Brokered task additions wake an available `run` slot without waiting for unrelated writers to finish; a full pool still waits for authenticated slot release. This wake is coalesced within the foreground coordinator, not a polling worker or separate reasoning runtime.

Public input remains bounded at 1 MiB. Internal control envelopes use a separate 2 MiB ceiling for request/identity overhead and reuse the same strict UTF-8/duplicate-key/integer parser. The native launch envelope is bounded separately at 8 MiB; final native receipt files remain limited to 64 KiB.


`agent stop` persists an exact stop intent before terminating the owned Job. It targets one attempt, not every slot. The broker returns a fast acknowledgement. Positive `waitMs` observes committed termination proof outside the serialized broker mutation; a bounded wait timeout is not termination proof or permission to delete the workspace. Cancellation accepted before submission capture prevents publication; existing pinned history is retained.
Generic executable profiles have no certified graceful-stop protocol. Their journal records zero grace before authorized owned-Job termination; this is not a graceful Codex/Claude/Pi shutdown claim. Native termination observation is bounded by the smaller of approved lease duration and 60 seconds.


## Managed worktrees and native lifecycle

Worktree creation has durable intent and allocation observations before subsequent effects. A native-identified private directory, external ownership marker, Git administrative backlink/common-directory identity and create-only private branch bind each attempt. The owner checkout/index/HEAD/refs and source—including ignored/untracked files—are preserved. Unknown directories are never adopted, moved or deleted.

The fixed native execution helper creates a suspended process, assigns a kill-on-close/no-breakaway Job with a finite process cap, and emits a retained start identity. Provider code resumes only after the Core durably commits the observed start. Only standard-stream handles are inherited; the owner broker/control channel is not inherited.

Durable suspended-start persistence is a synchronous guarded transaction on the foreground JS thread. It does not wait behind another task's asynchronous submission capture; those private worktree/ref paths are independent. Resume still occurs only after that exact start transaction commits, and terminal capture/control mutations retain their serialized ordering.

Successful durable-start work sends one authenticated liveness pulse before resume. The native watchdog duration is not extended; this starts its current heartbeat window from a fresh authorized owner action instead of consuming the startup window before provider code can run. Failed durable-start work still cannot resume the process.

Only the fixed native supervisor bypasses the Node parent's Windows kill-on-close Job, so parent loss cannot kill the supervisor before it persists EOF termination proof. Its stdio stays referenced and `agent start`/`run` remain foreground; this is not a detached coordinator, worker service or durable daemon. The supervisor still enforces its approved heartbeat and its own provider Job. Native control loss, including incomplete EOF or unavailable acknowledgement delivery, never substitutes for authenticated full-tree proof.

Heartbeat loss, parent EOF, timeout, output overflow, stop and failed durable-start callback terminate only the owned Job. Root exit alone is insufficient while descendants remain. Combined stdout/stderr bytes are capped and retained as exact hashed artifacts. Storage admission includes retained DB/WAL/artifacts and active output reservations.

Only full writer-tree termination permits terminal timestamps and slot release. A successful clean, scope-compliant commit may be pinned create-only at a submission ref. Dirty/untracked output, protected/out-of-scope paths, forbidden deletion/binary/symlink/submodule changes or nonzero execution preserve the workspace for review. The tool never auto-commits, merges, integrates, promotes or marks a task completed from process exit.

Approved Git commands retain their existing native 15-second deadline and combined 4 MiB output cap in a finite internal worker, independent of coordinator callback delays. The worker receives only the prevalidated executable/controlled arguments/cwd/environment/input and closes before the result is accepted. This internal Git runner is not `worker start/stop`, a background service, or an AI reasoning runtime; all normal authority and filesystem checks remain before/after execution.

## Recovery and packaging

`run --recover` consumes exact durable manifests and a native-verified final receipt bound to authority, launch/start identity, helper identity, private MAC and output hashes. A retained capture intent plus exact existing submission may be reconciled without repeating its effect. Recovery does not reattach by PID, kill an unrelated process or blindly replay spawn. Missing or contradictory proof leaves the attempt orphaned with no fabricated terminal timestamp; ownership slots and files remain preserved.

The build explicitly compiles `native/Platform.cs` and `native/Execution.cs` into paired x64 helpers. The packed distribution includes `dist/native/platform.exe`, `platform.identity.json`, `execution.exe`, `execution.identity.json`, their owned sources and the finite internal `dist/core/git-process.js` runner. Installation has no compile/download/service hook. Source/binary pairing detects mismatch, not malicious replacement of both by the same owner. Inert native test fixtures, evidence, caches and `temp/` are excluded from the package.

Full product acceptance still requires background ownership, provider/version compatibility, integration/CAS/check evidence, restore/content epochs, complete backup activation, broader fault recovery and supported-platform/security/release evidence.
