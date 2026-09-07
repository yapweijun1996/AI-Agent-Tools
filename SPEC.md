# Hub specification

Last reconciled: 2026-09-07. This specification covers the Hub's observable
documentation and registry behavior. It does not specify tool internals or a
working `agent-tools` CLI. [TASK.md](TASK.md) records completion status.

## Requirements and evidence

| ID | Requirement | Evidence or acceptance |
| --- | --- | --- |
| H-01 | Keep independent tool source, package dependencies, and release pipelines outside the Hub | Repository inventory and architecture review; V-01 |
| H-02 | Register each tool with one unique stable ID, intended purpose, lifecycle, and confirmed or explicitly unknown identity fields | Registry validation and source review; V-02 |
| H-03 | Separate Planned, Experimental, Verified, Stable, and Deprecated using evidence gates | Tool standard and registry gate checks; V-02 |
| H-04 | Preserve the original ten-tool order, appending explicitly reviewed additions without imposing execution dependencies | Roadmap/registry comparison; V-03 |
| H-05 | Define local-first, bounded, read-only, deterministic target CLI/JSON/security/release contracts | Standards and manual consistency review; V-05 |
| H-06 | Distinguish implementation, local tests, published artifacts, and Hub standards conformance | TASK/VALIDATION and release-specific registry metadata; V-05, V-06 |
| H-07 | Give design, architecture, requirements, work packages, task state, and evidence explicit owners | Documentation index and link checks; V-04 |
| H-08 | Provide repeatable dependency-free authoring validation | `python3 scripts/validate_hub.py`; V-02 through V-04 |
| H-09 | Make registration, promotion, downgrade, and deprecation reviewable | Adding-a-tool and release workflows; V-05 |
| H-10 | Keep future discovery metadata-only by default and fail on unsupported contracts | Architecture requirements exist; runtime acceptance remains future under E-04 |
| H-11 | Preserve compatibility until explicit protocol reconciliation is reviewed and tested | Known gaps documented; implementation acceptance pending E-02 |
| H-12 | Consider shared packages/monorepo migration only after roughly 3–5 mature tools reveal real duplicated infrastructure | Architecture gate; no migration implemented |
| H-13 | Document the three additions with explicit scope, contracts, failure states, budgets and acceptance cases; register them as Planned | Expansion and three tool designs; V-07; CFML local feasibility tests exist, while engine admission and the other two tools remain pending |
| H-14 | Synchronize changed ecosystem facts and detailed designs to the existing Company KB and verify readback | KB synchronization record map and source digests; V-08 |

Evidence definitions are in [VALIDATION.md](VALIDATION.md). Requirements for future
behavior are not marked implemented merely because prose exists.

## Current machine-readable interface

`TOOL_REGISTRY.json` is the only current ecosystem discovery artifact. Its exact
fields, null semantics, versions, and consumer requirements are owned by
[Architecture](docs/ARCHITECTURE.md#registry-contract). IDs do not reserve npm or
binary names. Local `package.json` values alone do not populate published npm or
release fields. Registry lifecycle is distinct from task status and external
tool-specific language certification. Owner-confirmed delivery completion is recorded
in TASK and summarized in README/ROADMAP; it does not automatically promote Hub
lifecycle or claim protocol conformance.

The validator exits 0 when its checks pass and 1 for handled invalid data or file
errors. It prints a human-readable summary and external URLs requiring review;
it is not a tool analysis CLI and does not implement the target JSON envelope.
It does not access npm, execute packages, test external evidence, or perform CI.

## Contract ownership

| Contract | Authoritative document |
| --- | --- |
| Tool scope, admission, lifecycle | [Tool standard](docs/TOOL_STANDARD.md) |
| Target flags, streams, exit semantics, limits | [CLI standard](docs/CLI_STANDARD.md) |
| Target result envelope and consumer rules | [JSON standard](docs/JSON_STANDARD.md) |
| File/process/network trust boundaries | [Security standard](docs/SECURITY_STANDARD.md) |
| Independent versioning, artifact and release evidence | [Release standard](docs/RELEASE_STANDARD.md) |
| Tool registration maintenance | [Adding a tool](docs/ADDING_A_TOOL.md) |

Known native-contract differences are recorded in [DESIGN.md](DESIGN.md).
Standards describe Hub conformance targets; they do not override an installed
tool's versioned interface or justify treating native output as the Hub envelope.

## Non-goals and acceptance limits

No tool code copying, root npm workspace, Agent Runtime, LLM backend, shared parser,
automatic publication, or redesign of Codex/Claude/AGRUN is in scope. Future tools
must not promise minimum safe tests, automatic root-cause proof, or minimum sufficient
task context without an explicit verifiable definition.

Documentation acceptance requires valid local links, valid registry data, consistent
IDs/status/versions, explicit remaining gaps, and preservation of unrelated work.
External repository existence, publication, artifact correctness, and behavioral
conformance are separate claims with separate evidence.
