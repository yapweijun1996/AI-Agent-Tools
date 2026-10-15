# Stage 1 implementation boundary

Owner authorized Stage 1 after the accepted Stage 0 delivery. Target remains the independent Windows-first MIT workspace. This stage implements actual metadata Core/CLI behavior, not providers, background IPC hosts, worktree execution, integration, restore or automatic cleanup.

## Scope

Implemented command paths in this stage: init, doctor, status (including bounded history/follow), task add/list/show/message, queued task cancel, worktree list and snapshot list. Active execution cancellation and all execution/integration/restore commands are outside Stage 1 and must be rejected before side effects with explicit unavailable capability, never fake success. The eighteen-command catalog remains the total product contract, with honest availability metadata.

Core owns canonical identity, approved policy, guarded mutations, checksummed forward migrations, immutable task/DAG storage, lifecycle gates, leases, semantic idempotency and append-only events/messages. Each short-lived metadata mutation acquires the same lifetime guard and verifies current identity before admission. Unknown active effects/attempts require recovery rather than automatic lease release or repair. Read commands do not acquire mutation authority, initialize state, repair refs or increment epochs.

Init is real registration: approve a full existing commit and external owner policy, persist an intent before create-only private baseline/integration refs, read back exact effects, and finalize an explicitly unverified baseline. It must preserve owner checkout/index/protected refs and reconcile identical request replay without repeating effects. Failed/uncertain partial initialization remains blocked, never becomes healthy by inference.

## Interfaces and ownership

- Parent integration: src/shared.ts, src/json.ts, src/cli.ts, src/index.ts, bin/angit.js, package/build/test/pack scripts, runtime tests and final documentation/evidence.
- Core slice: src/core.ts and any src/core/ internal modules; runtime forward SQL additions and policy/schema/examples necessary for real metadata operations. Do not rewrite Stage 0 evidence or source manifests.
- Windows slice: native/Platform.cs, src/platform.ts, scripts/build-native.mjs and docs/WINDOWS_METADATA_BACKEND.md.

Shared DTO/error/native interfaces live in src/shared.ts. Core exports `Core`, constructor `(options?: CoreOptions)`, `resolveProjectId(repoPath: string): string`, `execute(request: CommandRequest, repoPath: string): Promise<CoreReply>`, and `follow(request: CommandRequest, repoPath: string, emit: (event: Record<string, unknown>) => Promise<void>, signal: AbortSignal): Promise<void>`. Native exports `createNativePlatform(assetRoot: string): PlatformAdapter`. No public CLI flag/environment state-root override; CoreOptions.stateRoot is internal fixture injection, not a permission or caller-role token. Public API uses default services.

The parent supplies src/json.ts exports `parseJson(bytes, maxBytes?)`, `readJsonFile(path, maxBytes?) -> {value, bytes, sha256}`, `canonical(value)`, `sha256(bytesOrString)`, `validateSchema(relativeSchemaName, value)`, and `readAsset(relativePath)`. All runtime schema loading is offline from this package; no remote resolver.

## Selected implementation choices

- Local private source manifest version 0.0.0 is a new development identifier, not a published/released version.
- Node target remains exactly the locally exercised 24.21.0; no security-reviewed release claim.
- Runtime schema validator Ajv 8.20.0; compiler TypeScript 5.8.2 and available Node API types 22.20.1. These observed local versions are independently locked in this package. Type definitions do not establish runtime support; actual Node24 behavior must pass.
- Dependencies initialized with offline npm, ignore-scripts/no-audit/no-fund, from existing user cache. An initial attempt against the Hub's cache lacked metadata; no network was enabled. No global package or AIT implementation changed.
- Compile the owned Windows filesystem/security helper before packing; installation has no build/download/service hook. Production helper exposes only identity/context/private-directory/file-inspection primitives, not shell/process execution or Git operations.
- Real Git executable fingerprint becomes a mandatory owner-approved policy binding. The selected external policy is an explicit owner bootstrap action; repository/task/model text never establishes authority. Controlled argv/environment and empty hooks must apply before Git effects.
- Use separate registry/project workflow storage, exact checksum receipts, closed journals for init and atomic metadata/idempotency/event transactions. No giant transaction spans Git.
- Status follow emits only versioned public event-schema objects, with backpressure and bounded replay. A fresh caller obtains snapshot/history cursor through normal status; follow with no cursor begins after the captured high-watermark and must not fabricate a snapshot event ID.

## Static impact baseline

Before runtime source creation the workspace contained only Stage 0 contract/probe artifacts and no TS project/Core consumers. src/shared.ts is the first runtime TypeScript file. Agent Impact returned NOT_A_REPOSITORY because Git has intentionally not been initialized; this is a tool limitation, not an empty graph. LSP reported no language server. Bounded TypeScript symbol search found no references to CoreReply while scanning the single initial source file. New CLI/Core/native callsites must be inspected during integration; no existing AIT consumer is migrated or imported.

## Verification

Build and typecheck once after source slices settle; then exercise real CLI paths against disposable committed Git fixtures with internal state-root injection through the same CLI main/Core (not a public override). Root help/version/capabilities also run through the actual packaged bin. Prove idempotent replay/conflict, task/dependency/permission boundaries, immutable specs, versioning, read-only observations, cursor history binding, queued cancellation, native ownership, lock contention and packed consumer behavior with scripts disabled. Validate JSON results and public event framing. Preserve meaningful regressions and independent review evidence; product claims remain scoped to Stage 1.

No Git initialization/commit/push, real coding agent, production-project change, service or npm publication is authorized here. Real temporary Git fixture init/commit/ref effects and isolated dependency/packed-consumer installs are implementation verification, not remote actions.
