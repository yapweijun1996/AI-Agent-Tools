# Stage 2: controlled worktrees and execution lifecycle

## Authorization and boundaries

The owner selected Stage 2 after accepted Stage 1. Implement actual managed worktrees, supervised local CLI execution and serialized termination/submission capture. Add `agent start`, `agent stop` and foreground `run` to implemented leaves. Background `worker start/stop`, integration and restore remain explicitly unavailable; they were not selected by this stage. No tool-workspace Git init/commit/push, publication, login service, existing ACL repair or real Codex/Claude/Pi invocation is authorized during implementation verification. Tests may compile/launch inert owned native fixtures in disposable committed repositories. Provider compatibility remains unknown; generic executable support is not a provider adapter certification.

Use the effective CONTRACT, existing closed journal/attempt/supervisor schemas and SQL constraints. Never mark a task completed from process exit. Preserve worktrees, immutable specs, history and owner checkout/refs. Unknown effects retain their operation and ownership slots; no PID-only termination or blind spawn replay. Existing Stage 1 owner-private fixture seam remains internal; production KnownFolder anchors remain strict.

## Chosen command behavior

- `agent start`: sole foreground owner/coordinator session for one selected task; reserve/provision/spawn and await termination/capture. Return final attempt/worktree/operation facts, not an invented asynchronous host. Retries require explicit retry and immutable eligibility.
- `run`: sole foreground coordinator, bounded parallel task slots and dependency eligibility; `until idle` ends at quiescence, `until stopped` continues admission until an authenticated stop/interruption. Auto-integrate remains unavailable before effects. Recovery is exact persisted receipt reconciliation, never speculative reattachment or spawn replay.
- `agent stop` and active task cancellation: authenticated local broker requests serialized by the live session. Durable stop intent precedes native termination. Cancellation accepted before capture prevents submission; submission refs already pinned remain history.
- Existing metadata writes route through the authenticated live broker while its lifetime guard is held; read/follow paths stay read-only and do not acquire mutation epochs.

## Shared slice interfaces

Parent owns Core integration, storage authority/resource release, CLI flags/availability, tests/package/docs/evidence. Worktree slice owns `src/core/worktrees.ts` only; native slice owns `native/Execution.cs`, `src/execution-native.ts` and native build/pairing changes. Neither slice runs builds/tests/linters/formatters mid-flight.

`WorktreeBroker` construction: `(platform: PlatformAdapter, repo: Repository, git: ApprovedGit, registration: Registration, policy: ApprovedPolicy)`.

- `describe(attemptId, worktreeId, baseOid, baseTreeOid): { managedParent, canonicalPath, branchRef, ownershipMarkerId }`; generate fixed namespace paths/refs only, no allocation effect.
- `provision(description, onAllocated): Promise<WorktreeReceipt>`; parent has already committed `worktree_create` intent. Callback persists allocation observation before further effects. Receipt includes path/native identity/marker/branch/base/common-dir identity. Use owner-protected empty path, create-only private ref and managed checkout. Do not move/delete unknown directories.
- `inspect(receipt): Promise<void>`; exact ownership/common-dir/path/branch identity and owner-source preservation checks.
- `capture(receipt, baseOid, spec, submissionRef): Promise<{oid,treeOid,submissionRef}>`; parent has proved full writer-tree termination and serialized cancellation. Enforce clean tracked/untracked state, base ancestry, rename endpoints, task/owner scopes, protected paths, deletion/binary/symlink/submodule policy. Pin submission create-only/no-deref; do not auto-commit or merge. Dirty/out-of-scope facts reject and preserve source.

Native TypeScript module exports:

- `startBroker(assetRoot, descriptor, handler): Promise<BrokerHandle>` where descriptor binds private pipe name, 256-bit scope handle, owner SID and project/incarnation/epoch. Handler receives `{requestId, peerSid, clientPid, clientStartIdentity, request}` and returns a JSON-safe reply. BrokerHandle has `close(): Promise<void>`; closure must stop readiness and finish/deny pending clients.
- `callBroker(assetRoot, descriptor, request): Promise<unknown>` uses the fixed packaged native client, bounded stdin/control frames; scope never appears in args/provider environment/logs.
- `startSupervision(assetRoot, spec, callbacks): Promise<SupervisionHandle>`; spec includes executable+SHA, fixed argv, explicit cwd/environment, supervisor/launch identities, authority, approved timeout/output/process/heartbeat budgets and owner-private artifact directory. `callbacks.started(processReceipt)` is awaited before resume acknowledgment; no code executes before durable observed start and Job assignment.
- SupervisionHandle has `completion: Promise<TerminationReceipt>`, `pulse(): Promise<void>`, `resume(): Promise<void>` if needed by the started handshake, and `stop(stopOperationId): Promise<void>`. No PID selector API. Define exact exported DTOs in this module and tell parent before changing names.

ProcessReceipt contains supervisorId, launchIdentity, pid, startIdentity (SHA-256 of retained native process-start/executable identity), executableHash and descendantScopeHash. TerminationReceipt includes exact same receipt, writerTreeTerminated, rootExitCode, observedAtMs, terminationReceiptHash, timeout/output-limit/stop reason and stdout/stderr artifact byte counts/hashes/paths. A native final receipt is durable outside provider worktree; parent may reconcile it only through exact authority/launch/start/owned-helper bindings. Unknown termination never becomes proof.

## Native and broker requirements

Reuse actual Windows primitive patterns from `scripts/windows-primitives.cs`; it is feasibility provenance, not a runtime dependency. Pack owned helper source plus built x64 executable/digest pair. Fixed Framework64 compiler, no install-time compilation or downloads. Windows CreateProcessW explicit application/command-line escaping, CREATE_SUSPENDED, owned Job kill-on-close/no-breakaway, finite process cap and assignment before ResumeThread. Restrict inherited handles to provider standard streams; no owner control channel/handle inheritance. Drain/cap both output streams. Parent EOF, failed handshake/heartbeat and timeout terminate only the owned Job and retain termination facts; descendants after root exit must not release the attempt slot early.

Broker is native owner-only named pipe with first-instance and remote-client rejection, actual client PID/start/token SID and scoped-handle check; fresh nonce handshake binds project/incarnation/epoch. It forwards requests to parent, never mutates SQLite or performs stop before parent's durable approval. Provider has no control handle. Same-owner hostile code remains outside cooperative threat claims. Network policy declarations are not Windows network isolation proof; no provider/network/sandbox capability is advertised from inert fixtures.

## Storage, profiles and verification

Prefer existing attempt/worktree/operation/observation/lease/artifact tables; avoid a schema migration if existing closed projections suffice. If new persistent state is essential, parent owns an explicit guarded forward upgrade compatible with Stage 1 state—never read-side migration or checksum rewrite. Add an explicit owner `execution.maxProcessesPerAttempt` bound if needed; absent execution-only approval fails before effects rather than inventing a process budget. Disabled or unapproved executable/profile fails before provisioning; executable hashing and shell-launch rejection apply to probes too.

Before edits: bounded current references/impact, current source reads and known Stage 1 evidence. After integration: actual CLI and packed consumer; native suspended-before-resume/descendants/timeout/output/EOF and restricted-peer challenge; immutable DAG/version/idempotency; separate-process stop/cancel and capture ordering; exact submission scope/cleanliness; no owner-ref/workspace changes; recovery preserves unknown slots; all Stage 1 behavioral/contract regressions. Evidence distinguishes normal completion, unknown outcome and unsupported capability.
