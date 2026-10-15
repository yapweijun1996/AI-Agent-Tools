# Agent-Native-Git monorepo migration — 2026-10-15

## Scope and current evidence state

The owner selected immediate source migration, validation and local Hub-main integration. This is an independent package import, not a direct merge of unrelated repository roots. It does not authorize push/publication, production Worker implementation, real providers/models, services/autostart, existing ACL repair or removal of the original workspace.

Canonical source: [packages/agent-native-git](../../packages/agent-native-git/README.md). Original committed checkpoint: `46e46123adaea304884f5e0e0c7ef6235426153e`; Hub migration base: `837b48939321bc1f746f8a1587dc5b87363a2208`. [Import provenance](AGENT_NATIVE_GIT_IMPORT.json) maps all 472 original tracked members and explicit metadata/documentation changes. Handwritten implementation, native sources, SQL/public contracts, existing evidence, MIT license and package lock are preserved; generated binaries are rebuilt and must be paired/verified independently.

Pre-verification observations already exercised:

- Original all-ref Git bundle creation and `git bundle verify` succeeded: four refs, complete history. The private bundle remains inside the original workspace's `.git`, outside public source; original workspace is retained for recovery.
- Exact committed archive import contains all 472 files, including all 43 schema-directory members. No nested `.git`, ignored temporary material, dependencies or generated binaries were imported.
- Metadata-only package adapters preserve native `test`, `verify` and `pack:check`: `test:prepared` adds the existing Python contract validator before the existing native test script; `smoke:pack` invokes the existing packed consumer. Independent identity/version/private/license/lock/ESM/compiler/runtime pin remain unchanged.
- Offline `npm ci --ignore-scripts --offline --no-audit --no-fund` from the existing cache completed for the new package, installing eight locked packages. No root runtime dependency or global installation was added.
- Current mounted LSP status reports no configured server. Root JavaScript has no canonical TypeScript project; a temporary four-file analysis project made bounded Change Impact usable. The result is partial for dynamic/unresolved/external edges, not a complete graph. The temporary config was removed before runtime verification.

The owner subsequently requested immediate source move/commit rather than waiting for long regression. Full `npm run verify` was started and explicitly cancelled at that request; **full migrated-tree acceptance is deferred, not passed**. Completed authoring/import coverage and actual Hub discovery/private-release/host-denial smoke are recorded below. Native full-suite/installed-consumer/relocated-preflight gates remain for the next agent. Interrupted fixture state and partial logs are preserved; controller cancellation is not provider-tree termination proof.

Completed before this scope reduction: Hub authoring passed for 20 tools, 56 documents and 530 links; source coverage passed for 1170 imported files and 103 explicit updates. Actual CLI smoke discovered angit, denied unconfirmed npm installation with exit 4, and rejected an incompatible source host with exit 2 before build/artifact creation. These results do not replace the deferred full gate.

## Integration decisions

- `agent-native-git@0.0.0`, CLI `angit`, remains private/MIT and owns its dependencies and native contracts. Registry status is Experimental; npm, release version and release verification stay `null`. This does not mark full delivery complete.
- Node 24.21.0 and Windows x64 are mandatory for native acceptance. Standard package `os`/`cpu` and exact engine declarations are not weakened. Root orchestration labels incompatible package hosts not applicable, never passed native acceptance. Source `install-all` rejects an incompatible inventory before package dependency installation/build rather than silently dropping a CLI.
- Root prepared verification runs contracts plus all native behavior tests; root pack retains the eight existing packed-consumer scopes and adds only angit. Unrelated tool scripts are not newly expanded or rebuilt by a generic pack-script sweep.
- AIT remains dependency-free discovery/install/dispatch. The Coordinator, SQLite state, Git effects and process ownership stay inside this package; no new LLM framework, shared scheduler or mandatory cross-tool dependency is introduced.
- The ten-repository historical source manifest and its update history remain unchanged. A separate reviewed import record supports exact current handwritten inventory and records any metadata/navigation adapter with original/current hashes.

## Required final gates

| Gate | Evidence required before completion |
|---|---|
| Full Hub `npm run verify` | Pinned Windows Node 24.21.0; root plus applicable package build/typecheck/lint/tests/packs; angit contracts, full native behavior and scripts-disabled installed consumer included. |
| Hub authoring and source coverage | Actual Python validator and import verifier; correct 20 registry entries/19 source packages; all 472 imported handwritten members accounted for. |
| Migrated native surface | Actual `angit` help/capabilities, unchanged 13/18 availability, actual controlled native execution/termination/submission from the packed consumer; no real provider. |
| Standalone preflight | Actual relocated six-case inert handoff/EOF proof, not a claim that the production Worker exists; expected stop-failure exit 1 remains a negative. |
| Source safety | Bounded credential scan, whitespace/JSON/local-link checks, immutable source/lock/license/receipt identities and ignored temp/generated output. |
| Local Git closeout | Scoped commit and real local Hub-main merge, complete tracked inventory and clean worktree; no remote push or release. |

## Limits and continuation

The original 53-test Stage 2 and Stage 3 receipts are historical, not substitute proof for this relocated tree. Successful native mechanics do not certify Codex/Claude/Pi, hostile same-account isolation, default-host ACL safety, restrictive ancestor Jobs, power-loss durability, complete backup activation or the unavailable Worker/integration/restore commands.

The new package homepage names the intended remote package path. This import has not been pushed; the existing Hub root repository URL is confirmed, but the new remote package path is not claimed available. Published npm identities/releases and installed tool snapshots are unchanged.

Continue only the next owner-assigned implementation at [the package handoff](../../packages/agent-native-git/docs/HANDOFF.md) and [Stage 3 plan](../../packages/agent-native-git/docs/STAGE3_PLAN.md). Keep original recovery data and unknown/failed fixtures; do not remove them merely to produce a clean workspace.
