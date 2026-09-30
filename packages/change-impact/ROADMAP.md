# Roadmap

Status date: 2026-09-07. Current phase: **v0.1 scope and the `0.1.1`
documentation patch are published**. Version labels
describe package contracts and do not promise delivery dates. Detailed status
belongs in [TASK.md](TASK.md).
Current implementation tree: `7cf02d0`; hosted matrix: [run
34123415471](https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34123415471).
Previous documentation and clean-install evidence reconciliation: `1a57175`.
Latest provider observation bounding: `32fd01a`.
Latest diagnostic collection bounding: `a0f148b`.
Latest bounded source reads: `149e0fa`.
Latest validated real-path reads: `dd212e4`.
Latest bounded revision blob reads: `2f3c482`.
Latest snapshot diagnostic identity: `0c8a130`.
Latest internal symlink coverage: `f9f904b`.
Latest provider resolution read boundary: `ba0538a`.
Latest CLI formatted-output bound: `c6296e4`.
Latest installed artifact output-limit smoke: `3472b13`.
Latest cross-platform snapshot path handling: `6b1c9b5`.
Latest platform-aware capture test harness: `261c47a`.
Latest Git clean-filter isolation: `c32634e`.
Latest Windows short-path boundary fix: `0b72a83`.
Latest documentation line-ending check: `e85c573`.

## Before v0.1

| Milestone | Required outcome | Status | Gate |
| --- | --- | --- | --- |
| M-00: Documentation baseline | Consistent design, requirements, task ledger, and validation plan | Done | Documentation checks in [VALIDATION.md](VALIDATION.md) |
| M-01: Feasibility and contract draft | Config-bound project host and executable draft result fixtures | Done locally | CI-01, CI-02; local Node test evidence |
| M-02: Static target analysis | Snapshot access, file/symbol relationships, and evidence paths | Done for supported scope | CI-03, CI-04, CI-05; local smoke tests |
| M-03: Change analysis and candidate tests | Two snapshots, deletion/rename/configuration handling, candidate tests | Done for tested cases | CI-06, CI-07; local smoke tests |
| M-04: Verified release candidate | Bounded work/output, stable results, platform checks, reviewed draft contract, and packaged artifact | Done for tested scope; published as `0.1.1` | CI-08 and CI-09; hosted run 34123415471 passes all six Node 22/24 Ubuntu/macOS/Windows jobs; registry clean install, integrity/SHA-1, and npm signature checks pass; provenance is unavailable for interactive publication |
| M-05: Agent distribution | Server-free onboarding guide, portable Agent Skills instructions, Codex metadata, and GitHub/npm installation paths | Done and published in `0.1.1` | CI-10 and V-23; the public npm artifact contains the guide and skill, and a clean registry install verifies both |

M-00 through M-03 are implemented in commits `b57321d`, `0cdd08f`, `13e9f14`, `6b43c58`, `ca5453e`, `0169580`, `5d29c4c`, `954f6dc`, `bbfeb58`, `940effd`, `1753c22`, `e55647f`, `e51113d`, `89f5286`, `db809f4`, `143e9f7`, `d385ff5`, `798594c`, `83f398d`, `661cb4d`, and `8bb3651`; the NUL-byte regression is in `1e61baf`. M-04 hardening includes `0644fda`, `343750a`, `0902d49`, `2a68521`, `1c195af`, `b248f10`, `48f102e`, `273a344`, `c4dca94`, `74563b1`, `2262658`, `13990ce`, `4d770e0`, `17020ad`, `850f106`, `beb003e`, `f64fbb6`, `ab27679`, `b1f6477`, `473b4da`, `32fd01a`, `a0f148b`, `149e0fa`, `dd212e4`, `2f3c482`, `0c8a130`, `f8a580e`, `f9f904b`, `ba0538a`, `c6296e4`, `55a10bb`, `3472b13`, `6b1c9b5`, `261c47a`, `c32634e`, `0b72a83`, and `e85c573`; repeated resource observations are recorded in `aeef862`, and the diagnostic stress script is `spike/diagnostic-limit.cjs`. Cancellation and memory isolation remain deferred rather than release blockers for the bounded v0.1 scope.
Provider resolution-read hardening is in `ba0538a`; the regression verifies that
oversized external package metadata becomes an unresolved observation before
the resolver can classify the package as out of scope.
Documentation and evidence reconciliation after the implementation hardening is
recorded in `3a7bc99`, `079acbd`, `1a57175`, `ad028b6`, and `f032986`; Git clean-filter isolation is in `c32634e`.

## Release targets

| Target | Intended scope | Entry condition |
| --- | --- | --- |
| v0.1 | Configured JS/TS/TSX file, symbol, and Git-change impact; candidate tests; CLI/JS API; evidence paths; explicit limitations | Implementation, artifact, hosted validation, registry publication, and clean-install gates pass; provenance is recorded as unavailable for this interactive release |
| v0.1.1 | Documentation patch with the agent guide and host-neutral Codex/Claude Code skill packaged beside the CLI/API | Published; CI-09 hosted checks plus CI-10 local/package and registry checks pass, and registry clean-install/integrity/signature evidence is recorded; no hosted run includes the post-publish documentation-only commit |
| v0.2 | Dedicated `why` presentation and CFML provider feasibility | Verified v0.1 plus evidence that the next capability is useful and implementable |
| Later, unscheduled | CFML implementation, Python evaluation, SCIP ingestion, broader project coverage, public-surface analysis, optional Test Scope composition | Separate provider/scope contracts and validation evidence |
| v1.0 | Mature compatibility policy and stable provider/runtime evidence | Demonstrated compatibility and operational quality |

The current published package is `0.1.1` and carries the reviewed result contract
identified as `0.1-draft` for compatibility. It also carries the portable agent
guide and skill so host integrations can use the same CLI workflow. The dedicated `why` command
stays targeted at v0.2 because v0.1 already retains evidence paths needed by
downstream agents.

## Sequencing constraints

- Keep project and snapshot ownership ahead of graph conclusions.
- Preserve old-version evidence before claiming deletion or rename support.
- Establish graph direction, completeness, and coordinate contracts before integrations.
- Measure provider work, not only serialized response size.
- Verify language constructs and project arrangements separately before widening capabilities.
- Expand providers only after the initial capability proves useful on real changes.

## Release evidence policy

Local tests, a local package dry-run, remote CI, registry installation, and a
published release are separate evidence stages. Record each separately in
[TASK.md](TASK.md) and [VALIDATION.md](VALIDATION.md). The hosted matrix and
cross-platform workflow evidence are complete for the tested cases. Registry
publication and clean installation pass for `agent-change-impact@0.1.1`; those
gates establish npm-hosted skill availability. Future releases must repeat the
same evidence stages.
