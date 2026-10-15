# Stage 1: local metadata implementation

This guide preserves the completed Stage 1 boundary. Current execution availability and lifecycle semantics are in [STAGE2](STAGE2.md); the eight unavailable leaves below describe Stage 1 at acceptance, not the current thirteen-leaf implementation.

## Delivery boundary

Agent-Native-Git is an independent MIT, Windows x64 development package. Its private package version `0.0.0` is not a release or a claim of public npm availability. The required runtime is exactly Node.js **24.21.0**; the built-in `node:sqlite` API remains release-candidate. There is no AI-Agent-Tools Hub integration, provider execution, service installation, remote action or publication in this stage.

Ten public leaves have metadata implementations: `init`, `doctor`, `status`, `task add`, `task list`, `task show`, `task message`, `task cancel` (only queued/blocked tasks without attempts), `worktree list` and `snapshot list`. The remaining eight—`agent start`, `agent stop`, `run`, `worker start`, `worker stop`, `integrate plan`, `integrate apply`, `snapshot restore`—remain contracts and reject before effects. Root `--help`, `--version` and `--capabilities --json` are implemented utilities, not extra leaves. Help/catalog entries do not make future commands executable.

Local Stage 1 acceptance does not establish full-product acceptance or production deployment. See [Validation](../VALIDATION.md) for the parent-run receipts and limitations; Stage 0 receipts remain historical contract/primitive evidence, not Stage 1 product results.

## Build and local invocation

From this package directory, with the exact required Node runtime on PATH:

```powershell
npm run build
node ./bin/angit.js --help
node ./bin/angit.js --version
node ./bin/angit.js --capabilities --json
npm run verify
npm run pack:check
```

These are developer commands, not claims that they passed. Build compiles TypeScript and the owned Framework64 Windows x64 helper. The local bin needs built assets; installation does not compile/download the helper or install a service. `verify` and `pack:check` provide local offline verification/packed-consumer checks, not publication. Dependency provisioning must use the existing local cache with `npm ci --offline --ignore-scripts --no-audit --no-fund`; missing cached dependencies are a prerequisite failure, not permission to enable network access. Runtime schemas and SQL are packaged and resolved offline.

## Owner approval and registration

`init` registers an existing supported repository at an owner-approved full commit OID. It does not initialize a Git repository or create a commit. It persists an intent before create-only baseline/integration refs, reads back the effects and finalizes an **unverified** baseline. It preserves the original checkout, index and protected refs. Unknown or partial effects require reconciliation; an uncertain operation is not automatically repaired or declared healthy.

The external owner policy must be explicitly selected outside project source and pass native private-file inspection. It binds `git.executable.path` and its lowercase SHA-256, protected refs/scopes, grants, limits and `execution.lease` (heartbeat interval/duration). `execution.profilesFile` is optional when `execution.allowedProfiles` is empty; a nonempty allowed list requires private external declarations. Task runtime IDs must identify allowed declared coding-agent profiles, and every owner-required check must identify an allowed declared check profile when task creation is granted. Tasks cannot weaken owner-required checks or extend allowed paths into protected scopes. Repository text, task/model input and CLI options never grant authority.

A declared enabled profile is still **unverified**, not runnable; a disabled declaration is **disabled**. Neither is executable in Stage 1. No provider binary probe or compatibility claim is made. Metadata acceptance of a declaration/check does not prove it can run or pass.

## Mutation and read semantics

Automation must supply `--idempotency-key` for `init`, `task add`, `task message` and `task cancel`, and reuse the key for identical logical work. Interactive CLI use may generate and return a key. Keys bind stable owner/project/command semantics, not request tracing IDs; different work under the same key conflicts. Unresolved receipts preserve the operation rather than repeat unknown effects.

Input files use bounded strict UTF-8 JSON with duplicate-key, depth, safe-integer and closed-schema checks. The general maximum is 1 MiB; cursor files are limited to 4096 bytes, and owner limits may further constrain payload/output. A schema-valid path is not authorization. Task specifications, dependencies, approved base and required checks are immutable. Dependency admission validates the DAG; later advisory messages do not edit the specification, complete work or convey privileges. Cancellation is limited to queued/blocked tasks without attempts; active execution cancellation remains unavailable.

Reads inspect registered state without initializing/repairing it or incrementing mutation epochs. `doctor` health is metadata integrity, not verified project content/provider readiness. `worktree list` reads recorded ownership metadata; it does not prove live Git/workspace health, provision or clean worktrees. `snapshot list` defaults to verified-only, so the unverified init snapshot requires `--include-unverified`.

History cursors are opaque versioned objects bound to project, authority incarnation and history identity, not numerical offsets. Obtain one from normal status/task history; a mismatch requires a fresh snapshot handshake. `status --follow --format ndjson` writes only public event objects to stdout, honors bounded replay/backpressure, and sends errors to stderr. With no cursor it starts after a captured high-watermark; it emits no initial synthetic snapshot event and no ordinary success envelope.

## Windows state admission and leases

Production state is the canonical `angit` child of the token owner's Known Folder Local AppData. There is no CLI, environment or public execute state-root override. Internal `CoreOptions.stateRoot` is fixture injection only, not permission or a deployment switch.

`ownerContext` observes SID/location/local filesystem/reparse ancestry without approving ACLs or creating state. Private-state admission validates anchors and owner-only targets. Existing roots are revalidated, including their parent and registry file, before use. On the current host, the default Local AppData/Temp anchors have non-owner grants (including CodexSandboxUsers/other SID Modify/DeleteChild), so default bootstrap is denied without modifying existing ACLs. Isolated fixtures explicitly protect only a newly allocated base before creating private native directories; their evidence does not establish safe default-host deployment. See [Windows backend](WINDOWS_METADATA_BACKEND.md).

Core timer heartbeat protects asynchronous initialization lease ownership; other short metadata transactions revalidate/renew their grant at mutation boundaries. It is not a background Coordinator, IPC host or worker. Synchronous native calls can pause the event loop long enough for a grant to expire: renewal preserves the existing grant/fence and cannot revive an expired grant. Expiry is not proof that effects/processes stopped or permission to steal authority; uncertain state remains preserved for reconciliation.
