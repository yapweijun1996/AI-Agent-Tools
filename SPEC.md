# Hub specification

Last reconciled: 2026-09-15. This specification covers the Hub's observable
documentation, registry, and the explicitly authorized dependency-free `agent-tools`
/ `ait` install and dispatch runtime. Independent tool internals remain outside the
Hub. [TASK.md](TASK.md) records completion status.

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
| H-10 | Keep discovery local and metadata-first; make installation and execution explicit, pinned, and fail-closed | AIT commands, install-state tests, and runtime security contract; no automatic install/execute |
| H-11 | Preserve compatibility until explicit protocol reconciliation is reviewed and tested | AIT wraps native output without reinterpreting it; HUB-04 fixtures remain pending |
| H-12 | Keep AIT as a narrow Hub runtime while preserving independent tool implementations and releases | Dependency-free `agent-tools` package; no shared tool source or mandatory SDK |
| H-15 | Install and dispatch only registered packages with explicit lifecycle, approval, path, and output boundaries | AIT implementation, `docs/AIT_RUNTIME.md`, and Node test suite |
| H-13 | Document the three additions with explicit scope, contracts, failure states, budgets and acceptance cases; register them as Planned | Expansion and three tool designs; V-07; CFML local feasibility tests exist, while engine admission and the other two tools remain pending |
| H-14 | Synchronize changed ecosystem facts and detailed designs to the existing Company KB and verify readback | KB synchronization record map and source digests; V-08 |

Evidence definitions are in [VALIDATION.md](VALIDATION.md). Requirements for future
behavior are not marked implemented merely because prose exists.

## Current machine-readable interface

`TOOL_REGISTRY.json` remains the ecosystem discovery source of truth. Its exact
fields, null semantics, versions, and consumer requirements are owned by
[Architecture](docs/ARCHITECTURE.md#registry-contract). AIT reads an explicit local
snapshot; IDs do not reserve npm or binary names. Local `package.json` values alone
do not populate published npm or release fields. Registry lifecycle is distinct from
task status and external tool-specific language certification. Owner-confirmed
delivery completion is recorded in TASK and summarized in README/ROADMAP; it does not
automatically promote Hub lifecycle or claim protocol conformance.

The validator exits 0 when its checks pass and 1 for handled invalid data or file
errors. AIT exits according to the CLI standard and returns `ait-result/v1` for JSON
operations. The validator and AIT do not test external evidence or perform CI; AIT
performs npm installation only after an explicit install command.

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

No tool source copying, npm workspace, LLM backend, shared parser, automatic
publication, or redesign of Codex/Claude/AGRUN is in scope. The narrow AIT runtime is
in scope; it must not become a shared tool implementation, reasoning runtime, or
unreviewed compatibility layer. Future tools must not promise minimum safe tests,
automatic root-cause proof, or minimum sufficient task context without an explicit
verifiable definition.

Documentation acceptance requires valid local links, valid registry data, consistent
IDs/status/versions, explicit remaining gaps, and preservation of unrelated work.
External repository existence, publication, artifact correctness, and behavioral
conformance are separate claims with separate evidence.
