# Agent-Native-Git

Independent Windows-first MIT `angit` package in the AI-Agent-Tools Hub at `packages/agent-native-git`. Its runtime and dependencies remain package-local, separate from the dependency-free Hub runtime.

Current scope: Stage 2 controlled worktrees and foreground execution, following completed Stage 1 metadata delivery and Stage 0 contract/primitive feasibility. Scoped local verification completed on 2026-10-15: all 53 behavioral tests and the offline installed-consumer check passed. The package remains private `0.0.0`, not a release or public npm availability claim; no real provider certification, background service or production deployment is asserted.

The owner authorized migration of the committed Stage 2/Stage 3-preflight snapshot into the Hub, package metadata/navigation updates and Hub integration. The canonical local directory is `C:/Users/tno/Documents/GitHub/AI-Agent-Tools/packages/agent-native-git`; the original workspace is retained as recovery, not the active package. The repository homepage identifies the intended remote package path, not evidence of a push. This authorization does not permit production Worker implementation, real coding agents, services, remote pushes, publication or deployment.

Required runtime: exactly Node 24.21.0 on Windows x64, with built-in SQLite 3.53.4; `node:sqlite` remains a release-candidate API. Packaged native helpers implement filesystem admission and controlled Job/pipe/process supervision, not a strong sandbox.

Run package commands from this directory. Existing 53-test/native-consumer and Stage 3 receipts are immutable historical observations from the original workspace, not migrated-tree verification. Remaining Stage 3 work and its separate authorization gates are in [HANDOFF](docs/HANDOFF.md) and [the plan](docs/STAGE3_PLAN.md).

## Read and verify

- [Effective contract](docs/CONTRACT.md): current normative requirements; schemas/SQL are representations.
- [Next-agent handoff](docs/HANDOFF.md): today's stop point, current evidence, remaining assignments, safe commands and preservation boundaries.
- [CLI reference](docs/CLI_REFERENCE.md): eighteen contracts, thirteen implemented leaves and five unavailable future leaves.
- [Preflight](docs/STAGE0_PREFLIGHT.md): authorization, environment, source/license boundaries.
- [Validation](VALIDATION.md): actual runs, failures, limits and evidence.
- [Task status](TASK.md): Stage 0/1 delivery, current Stage 2 status and later implementation gates.
- [Stage 1 guide](docs/STAGE1.md): build/local bin usage, owner approval, metadata semantics and current deployment limits.
- [Stage 2 guide](docs/STAGE2.md): approved profiles, foreground ownership, native termination, submission capture and exact recovery.
- [Stage 3 plan](docs/STAGE3_PLAN.md): proposed background ownership, migration, drain/cancel and production acceptance gates.
- [Stage 3 prerequisite evidence](docs/STAGE3_PREFLIGHT.md): six isolated handoff cases and an expected shutdown-failure rejection; not an enabled product Worker.
- [Windows backend](docs/WINDOWS_METADATA_BACKEND.md): packaged helper identity, ACL admission and evidence boundaries.

## Local use

With Node 24.21.0 on PATH, from this directory:

```powershell
npm run build
node ./bin/angit.js --help
node ./bin/angit.js --version
node ./bin/angit.js --capabilities --json
npm run verify
npm run pack:check
```

These commands are instructions, not fabricated run receipts. Verification and packed-consumer checks are offline; package installation has no build/download/service hook. See the Stage 1 guide for cached dependency provisioning and required private external owner policy/profile declarations.

The default state root cannot be overridden by a CLI flag or environment variable. The current host's unsafe Local AppData anchor is denied without ACL repair; internal private-fixture evidence is not default deployment evidence. Automation must supply stable idempotency keys for mutations. Execution requires an explicitly approved enabled profile and process budget; generic native execution is not Codex/Claude/Pi certification.

## Historical Stage 0 probes

From this directory, using existing local runtimes:

```powershell
python scripts/validate-contracts.py
& 'C:/Users/tno/.omp/ai-agent-tools-20261014/runtime/node.exe' scripts/sqlite-primitives.mjs
powershell -NoProfile -File scripts/windows-primitives.ps1
```

These commands operate only on fresh disposable fixtures, not an existing project.
Reports are structured stdout; nonzero results must be investigated. The SQLite
probe rejects all other Node versions before creating fixtures. See the evidence
receipts for the exact commands used here.

The Stage 0 prospective SQL migration and primitive fixtures did not prove Core authorization, provider compatibility, crash recovery or sandboxing. Keep those historical claims separate from Stage 1/2 runtime receipts. Product readiness still requires full acceptance; worker, integration and restore remain unavailable.
