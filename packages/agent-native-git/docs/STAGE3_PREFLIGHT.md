# Stage 3 prerequisite observations and fault review

## Decision and scope

The owner selected A (isolated startup/handoff feasibility), B (implementation plan and acceptance matrix) and C (fault/security review). Those prerequisites are delivered. **Product availability remains 13/18.** `worker start` and `worker stop` remain unavailable; no production Worker, migration, drain/cancel implementation, packaged Lifecycle Host or release is delivered.

The proposed product architecture and production gates are in [STAGE3_PLAN](STAGE3_PLAN.md). The demonstrator uses synthetic SQLite tables and a separate inert Host. It is not a second implementation of production Core and is not imported by product runtime code.

## Actual commands and receipts

Run from the product directory, with the existing pinned local runtime:

```powershell
& 'C:/Users/tno/.omp/ai-agent-tools-20261014/runtime/node.exe' scripts/worker-handoff-probe.mjs --explicit-isolated-probe
& 'C:/Users/tno/.omp/ai-agent-tools-20261014/runtime/node.exe' scripts/worker-handoff-probe.mjs --explicit-isolated-stop-failure
```

The first command must exit zero. The second intentionally injects a post-READY graceful-stop exception and **must exit one and preserve its fixture**. It is not a successful shutdown command.

Final positive run: 2026-10-15 04:59:43.471–05:00:12.988 UTC, Windows x64, Node 24.21.0, SQLite 3.53.4. Six cases passed. See the exact command, duration, source/binary hashes and observations in [positive evidence](../evidence/stage3-worker-preflight.json). The [negative evidence](../evidence/stage3-worker-preflight-negative.json) records actual exit one, retained directory and the confirmed injected diagnostic.

| Exercised case | Actual assertion |
|---|---|
| Normal creator exit | Coordinator retains the real exclusive guard after creator exit; an independent contender cannot acquire it; epoch advances from 1 to 2 only after child guard acquisition. |
| Repeated invalid controls | Two wrong stop tokens and one wrong crash token go through the actual control-file reader. Each is rejected; a fresh contender still finds the guard held. A later valid stop exits zero and commits the stopped event. |
| Creator loss before handoff | The runner terminates its retained launcher child. Bootstrap child exits zero without READY or child workflow events; epoch remains 1 and the guard becomes available. |
| Creator loss after commit, before handoff publication | At the forced cutpoint, no handoff file exists, epoch is still 1 and no child workflow mutation exists. Creator dies; the exact child recovers the committed transfer and reaches epoch 2 without a creator release marker. |
| Creator loss after handoff publication, before release | Child first demonstrates SQLite busy while the creator holds the guard. Creator dies without publishing release; the same child acquires the actual guard and becomes ready. |
| Omitted reply | Creator exits normally without stdout. The read-only observer resolves the one fixed synthetic key to the original ready launch. This is narrower than a transport/server crash; the two preceding cases separately exercise actual creator death. |
| Coordinator crash with provider descendant | Existing inert `root-descendant` fixture enters both root and child. Host terminates only its retained Coordinator process. Existing native supervisor persists full-tree `parent_eof` proof, accepted by the real `readTerminationReceipt`, including output/MAC/identity/helper-absence validation. |
| Graceful shutdown failure | After READY and valid stop delivery, an injected exception produces actual Coordinator exit 1. Runner rejects it rather than accepting guard release as success; fixture remains present. |

The final native receipt hash is recorded in the positive receipt, not re-created here. The nominal run observed zero reconciliation retries; it does not demonstrate the transient publication/helper-exit race by injection.

## Mechanics established, not production authority

- New owner-private directories only. ACL protection applies only to a freshly allocated container; native admission then creates a protected child beneath it. Existing AppData/Temp anchors and prior unknown fixtures are not repaired, deleted or adopted.
- Framework64 compiles the owned probe Host together with unchanged `native/Platform.cs`, into that disposable private child. No installed dependencies, product binaries or public schema/SQL files are changed.
- Fixed Node executable and fixed probe script are hash-bound. Shell execution and arbitrary environment forwarding are absent. There is no service, login hook, TCP listener, real provider/model/network call or Git operation.
- Launcher prepares a synthetic durable transfer under its actual exclusive SQLite guard. Child may read bootstrap state but cannot write workflow state before acquiring that guard itself. Child validates the frozen request, PID/start identity and transfer; no creator message is required after commit.
- Native Host retains its newly created Coordinator process handle and the launcher's exact identity/handle. PID helpers observe identity/absence only; no saved-PID kill, tree kill or broad scan is used. No new outer kill-on-close Job is introduced.
- Host receipts are fixture HMAC-bound OS observations. They do not grant a project capability or prove provider-tree termination. Only the existing attempt-level native verifier supplies that latter proof in the crash case.
- Inputs are bounded at 16 KiB; publications are flushed temporary files followed by rename/move. Diagnostics are bounded and observed, file hashing streams native inputs, rejection history is capped and the Host lifetime check also applies during repeated rejected controls.
- Successful deletion follows exact Host/Coordinator absence, expected exit/event assertions and real native full-tree reconciliation. Failed cases preserve their directory. Neither a timeout, a released guard nor an OS root exit substitutes for the required proof.

## Review findings and disposition

Independent read-only review identified the following draft issues. The integration owner made the corrections and ran the evidence above; this is not independent final approval or a security certification.

| Draft finding | Correction and observed coverage |
|---|---|
| Repeated invalid control reached fatal cleanup and killed the Coordinator | Separate bounded rejection recording; three invalid controls leave the guard held before valid stop. |
| Committed transfer still depended on creator handoff/release files | Child reads the committed synthetic transfer and acquires the actual guard. Both creator-death cutpoints pass without a creator release marker. Host records creator absence, not authority to run. |
| Receipt existence raced complete flush and supervisor absence | Bounded read-only retry wraps the full unchanged verifier. Final run accepted real proof; delayed publication and permanent corruption/missing-proof injection were not run here. |
| Nonzero graceful exit could be accepted and fixture deleted | Normal cases require exit zero and a committed stopped event; Host errors fail the case. Injected post-READY exit one is rejected and retained. |
| Native crash exercised only an idle root | Use existing root-descendant fixture and require both start observations before crashing Coordinator; real full-tree EOF receipt accepted. |
| Diagnostic drain exceptions were swallowed | Drain failure/overflow becomes observable and fails the Host; stream closure is bounded. No overflow injection was run in this preflight. |

Production integration gaps remain **open implementation gates**, explicitly addressed in the plan rather than patched through this fixture:

1. Current unresolved-effect rules cannot simply accept a new pending Worker-start intent. Add an exact typed handoff/recovery path without exempting unrelated metadata effects or unknown prior writers.
2. Current `stopping` semantics cancel accepted work. True drain needs admission, liveness and stop-mode separation throughout reservation, provisioning, start, capture and cleanup.
3. Current reserved-key replay cannot retrieve an unfinished successful handoff. Add authenticated same-launch observation and durable child-side result completion without a second writer/launcher.
4. Add closed Worker lifecycle contracts, forward existing-store migration, approved bootstrap scope provenance, frozen stop targets, observation-only timeout semantics and post-exit finalization.

## Failures and retained evidence

The first draft encountered `INSECURE_STATE` when asserting the fresh container directly beneath the unsafe default Temp anchor. No Host was compiled or child launched in that attempt. The corrected fixture follows the existing private-child pattern; it does not weaken admission or repair Temp. That failed directory and intentional negative-run directories are retained, not passed off as successful cleanup.

The final negative fixture is named in its receipt. It contains private bootstrap/control material; do not copy those tokens into logs or Git. Earlier Stage 2 unknown fixtures remain untouched. The successful positive fixture was removed only after the stated closure proofs.

## Verification limits

No production Core startup, public Worker API, broker authorization, migration, drain, cancellation, stop-key replay across replacement or full fault matrix was exercised. No restrictive enclosing Job, Lifecycle Host death, disk-full/failed-flush, delayed receipt, permanently missing/forged receipt, clock jump, power loss, stale epoch or hostile same-account scenario was injected. Native supervisor survival is demonstrated only for the actual ambient Windows environment of this run, not every possible ancestor Job.

At preflight time, the static impact CLI returned `NOT_A_REPOSITORY` because the product workspace had no Git repository. Bounded direct imports and protected Stage 2 byte identities were used instead; no complete impact graph or Git revision was claimed for that run. The owner later authorized local Git initialization and commit/main integration for [end-of-day handoff](HANDOFF.md); the historical impact receipt remains unchanged. The previous 53-test/installed-consumer Stage 2 gate was not rerun for documentation/standalone-fixture work.

Next production work requires separate authorization and the contract/migration, shared Core/Host, stop-semantics and installed-consumer gates in the plan. Until then, availability remains 13/18, default-host ACL denial remains in place, and integration/restore/provider/release claims remain unverified.
