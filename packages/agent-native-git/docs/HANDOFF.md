# End-of-day handoff — 2026-10-15

## Stop point and authorization

The prior implementation/preflight closeout is historical. The owner subsequently authorized committed-snapshot migration into AI-Agent-Tools, owning-package metadata/navigation updates and Hub integration. This migration does not authorize production Worker implementation, a remote push, publication, services or real model/provider execution. Remaining Stage 3 production work requires its own assignment and acceptance gates.

Canonical product directory: `C:/Users/tno/Documents/GitHub/AI-Agent-Tools/packages/agent-native-git`. Keep this independently built package and its dependencies separate from the dependency-free AIT runtime. The original `C:/Users/tno/Documents/GitHub/Agent-Native-Git` workspace and its Git history remain recovery material, not the active package; do not recommend a separate GitHub repository. The intended remote path is the owning Hub's `packages/agent-native-git`, without claiming it has been pushed.

Historical standalone Git facts: initial import `29f8a3a`, documentation closeout and the public-schema completeness correction culminated in source checkpoint `46e46123adaea304884f5e0e0c7ef6235426153e`. Those refs remain in the original recovery repository/bundle; they were not merged as unrelated root history into the Hub. [Import provenance](../../../docs/migration/AGENT_NATIVE_GIT_IMPORT.json) binds the exported snapshot. Use Git history in the owning AI-Agent-Tools repository for current migration/main commit IDs. No remote push or release is assigned by this migration.

## Read first

1. [README](../README.md): current platform and operating scope.
2. [TASK](../TASK.md): authoritative delivery status and open gates.
3. [CONTRACT](CONTRACT.md): effective normative requirements; historical delivery wording is not today's availability.
4. [Stage 3 plan](STAGE3_PLAN.md): proposed lifecycle types, migration and implementation/acceptance gates.
5. [Stage 3 preflight](STAGE3_PREFLIGHT.md): actual isolated evidence, resolved draft findings and untested boundaries.
6. [VALIDATION](../VALIDATION.md): dated runs and limitations; inspect the linked receipts rather than inferring a pass from documentation.
7. [Stage 2 guide](STAGE2.md), [Windows backend](WINDOWS_METADATA_BACKEND.md) and [CLI reference](CLI_REFERENCE.md): existing behavior that must survive later changes.

## Current truth

| Area | Delivered and verified scope |
|---|---|
| Product | Private `0.0.0`, Windows x64, MIT development workspace; no public release or production approval. |
| Runtime | Exactly Node 24.21.0 with built-in SQLite 3.53.4. PATH's unrelated Node 25 is unsupported. `node:sqlite` remains a release-candidate API. |
| Availability | 13/18 leaves: ten metadata/read operations plus foreground `agent start`, `agent stop` and `run`. |
| Unavailable | `worker start`, `worker stop`, `integrate plan`, `integrate apply`, `snapshot restore`; `autoIntegrate=true` stays denied before effects. |
| Stage 2 | Completed local gate: 53 behavioral tests, contracts/SQL and an offline scripts-disabled installed consumer with inert native execution/submission. This is historical evidence, not a closeout rerun. |
| Stage 3 | Prerequisite plan/review and six isolated Windows handoff cases only. No production Worker, forward upgrade or drain/cancel lifecycle delivered. |
| Default host | Unsafe default AppData/Temp anchors remain denied. Private-fixture success does not approve default deployment or justify ACL repair. |

Key receipts:

- [Stage 2 final summary](../evidence/stage2-final-summary.json), [aggregate](../evidence/stage2-verification.json), [packed consumer](../evidence/stage2-pack.json).
- [Stage 3 positive probe](../evidence/stage3-worker-preflight.json): normal ownership after creator exit; contender exclusion; creator death before transfer and at both committed-transfer cutpoints; omitted-reply observation; actual Coordinator crash with inert root and descendant.
- [Stage 3 expected negative](../evidence/stage3-worker-preflight-negative.json): injected post-READY graceful-stop exit 1 is rejected and its fixture retained. Exit 1 is expected for this negative command; it is not proof of successful shutdown.
- [Stage 3 consistency](../evidence/stage3-final-consistency.json) and [capabilities](../evidence/stage3-capabilities.json): scoped pre-closeout identities and 13/18 availability.

Historical manifests bind their dated snapshots, not all later documentation revisions. Closeout intentionally updates Markdown, removes one extra EOF blank line in the CLI reference, and excludes `tests/.native/` from Git. Do not rewrite old manifests, receipts or SQL checksums to pretend those later changes existed earlier. The earlier `NOT_A_REPOSITORY` impact receipt was accurate before this authorized Git initialization; it is not a current failure or a complete static impact graph.

## Remaining assignment for the next AI agent

The following is a dependency-ordered backlog, not permission to start it without the owner's assignment. Implement the full selected boundary and its acceptance evidence; do not enable Worker commands on a partial scaffold.

### 1. Contract and forward-migration closure — Stage 3 Gate B

- Adopt closed Worker start/stop intent, observation, instance and receipt types, exact resource/capability bindings and origin-versus-current authority.
- Add a guarded existing-store forward upgrade with verified historical prefix, preserved rows/counters/identities and interruption recovery. Keep historical `001_initial.sql`, `002_runtime_metadata.sql` and their receipts unchanged.
- Define exact pending-handoff and terminal-reconciliation exceptions. Current `unresolved()`/authority rules cannot simply be reused: a new unresolved metadata intent would block its own child. Never broadly exempt unknown effects/writers.
- Resolve observation-only stop timeout, frozen semantic target and bootstrap scope provenance consistently across schemas, SQL, normalization and Core.

### 2. Shared Core startup and fixed Lifecycle Host — Gate C

- Use the same canonical guard, store, scheduler and Core for foreground/background. Native Host is an OS-observation/process-ownership boundary, never a second scheduler or DB writer.
- Persist exact launch intent before OS effects; finish the creator write phase before child authority. Child acquires the same guard and a new committed epoch itself. Preserve incarnation, counters and origin intent.
- Recover the same committed launch after creator loss without requiring a later creator message. Re-read committed state after observed creator death; an earlier prepared snapshot may predate the creator's final commit.
- READY requires real Core recovery, current authority/policy, approved scope, broker round trip and durable idempotent result. A probe JSON file or live PID is insufficient.
- Preserve independent per-attempt native supervisors. Do not add an outer kill-on-close Job or tree-kill that prevents durable EOF/watchdog receipts.

### 3. True drain/cancel and exact stop replay — Gate D

- Separate admission closure, liveness and explicit mode throughout reservation, provisioning, suspended start, running, capture and cleanup. Existing `stopping` cancels work and is not drain.
- Drain admits no new reservations but lets accepted obligations finish with heartbeats. Cancel durably journals exact cancellation before native stop. Timeout does not escalate drain or prove termination.
- Freeze the background instance/launch at first semantic acceptance. Old stop/no-target keys must never affect a replacement or foreground owner.
- Finalize only after accepted effects/provider proofs, quiescence, exact Coordinator/Host exit and guard release. A pre-exit row cannot prove a future OS exit; observer finalization needs its own guarded reconciliation authority.

### 4. Fault acceptance and installed-consumer cutover — Gate E

- Exercise the full plan matrix, including actual Core migration/handoff, stale authority/scopes, foreground/alias contention, Host loss, restrictive ancestor Jobs, partial/corrupt/missing proof, storage/flush failures and all drain/cancel/replay races.
- The current isolated evidence covers only its named ambient Windows scenarios. Host loss, restrictive enclosing Job, delayed/corrupt/missing receipt, power loss and hostile same-account isolation remain unverified.
- Run the full pinned-runtime contract/SQL/behavioral gate and offline scripts-disabled installed consumer after production changes. Prove real background ownership, control, drain/cancel and restart/replay using inert approved fixtures.
- Only after all production gates pass, enable both Worker leaves consistently in CLI/Core/capabilities/docs: 15/18. Integration/apply/restore stay unavailable.

### 5. Later product work, outside Stage 3

Candidate validation/CAS/finalization, integration/restore/content epochs, complete backup activation, approved real Codex/Claude/Pi version compatibility, stronger sandbox evidence, release/build-chain policy and publication remain separate assignments. Do not mark the entire eighteen-command tool complete from Stage 2 or the preflight.

## Safe verification and working commands

Existing local runtime location:

```powershell
$env:Path = 'C:/Users/tno/.omp/ai-agent-tools-20261014/runtime;' + $env:Path
node --version
node ./bin/angit.js --capabilities --json
python scripts/validate-contracts.py
```

The imported snapshot omits generated `dist/` and dependencies; the original workspace's built outputs were not imported. Perform separately approved dependency provisioning and the build before invoking the bin. Run these commands from the canonical package directory, using approved dependencies and repository scripts; do not silently install dependencies or use an unsupported Node:

```powershell
npm run build
node scripts/build-fixture.mjs --explicit-test-build
```

The standalone preflight requires the built owned inert fixture. Reproduce only when relevant to the assigned work:

```powershell
node scripts/worker-handoff-probe.mjs --explicit-isolated-probe
node scripts/worker-handoff-probe.mjs --explicit-isolated-stop-failure
```

The second command must fail with exit 1 and retain the new private fixture. Do not repair its expected failure by suppressing the exit check. Production changes additionally require `npm run verify` and `npm run pack:check`; prior receipts are not a substitute for verifying changed behavior.

## Preservation and safety boundaries

- `/temp/`, `.cache/`, `node_modules/`, `dist/`, `tests/.native/` and SQLite working files are ignored; native fixture sources/build scripts remain tracked. Do not force-add ignored output.
- Failed/negative Stage 3 private directories live outside this repository and are named in receipts. Earlier unknown Stage 1/2 fixtures and the interrupted packed-consumer cache remain preserved. Never use `git clean -fdx`, broad process-name cleanup or saved-PID termination to tidy them.
- Never read or commit `receipt.key`, private bootstrap/control tokens, provider credentials or injected runtime policies. Recorded fixture MAC/hash observations are not production capabilities.
- Do not change source/native/SQL/contracts merely to satisfy an old receipt hash. Preserve immutable evidence and add new dated observations.
- No real agent/model calls, services/autostart, network/remote Git write, existing ACL repair or publication is granted by this handoff. The later owner-approved Hub migration is limited to source/package integration, not production feature delivery.

## Next-agent instruction

Start from the canonical Hub package, read this document and TASK and the owner's new assignment, then implement only that assigned scope. Preserve the verified foreground/native invariants and all unrelated work. Report actual commands, results and unresolved limits. Existing Stage 2/preflight receipts are historical, not migrated-tree proof; the integration owner performs fresh migration gates. Remaining implementation was not started by the migration.
