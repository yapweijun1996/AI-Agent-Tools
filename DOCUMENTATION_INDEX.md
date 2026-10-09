# Documentation index

Last reconciled: 2026-10-08. This index assigns document ownership; it is not a
second task ledger or a tool release inventory.

| Document | Owns |
| --- | --- |
| [README.md](README.md) | Product entry point and concise current availability |
| [AGENTS.md](AGENTS.md) | Repository-specific contributor/agent rules |
| [TASK.md](TASK.md) | Completed/pending Hub tasks, blockers, and next steps |
| [SPEC.md](SPEC.md) | Hub requirements and acceptance boundaries |
| [DESIGN.md](DESIGN.md) | Architectural decisions, rationale, unresolved compatibility decision |
| [EPIC.md](EPIC.md) | Work-package deliverables and dependencies |
| [ROADMAP.md](ROADMAP.md) | Ecosystem delivery order and milestones |
| [VALIDATION.md](VALIDATION.md) | Dated observations, checks, and evidence limitations |
| [TOOL_REGISTRY.json](TOOL_REGISTRY.json) | Tool identity, lifecycle, repository/package links, release evidence snapshot |
| [Product vision](docs/PRODUCT_VISION.md) | User problem, product value, and non-goals |
| [Task-value evaluation](docs/evaluation/PROTOCOL.md) | Frozen task comparators, evidence grading, measurement boundaries and real-agent follow-on protocol |
| [Task-value results](docs/evaluation/RESULTS.md) | Identified local observations, measured interface costs and workflow decisions |
| [Test Scope refinement](docs/evaluation/TEST_SCOPE_REFINEMENT.md) | Frozen before/after candidate and output measurements for the selected source improvement |
| [Independent-agent observations](docs/evaluation/AGENT_RESULTS.md) | Historical host answer artifacts, telemetry audit and Windows CLI rejection |
| [Ubuntu study execution](docs/evaluation/WSL_STUDY.md) | Environment addendum, authenticated preflight and strict emitted-event capture |
| [Ubuntu CLI observations](docs/evaluation/CLI_RESULTS.md) | Thirty captured sessions, treatment uptake, grading adjudication and measured interface costs |
| [Real-repository pilot](docs/evaluation/REAL_REPOSITORY_PILOT.md) | Pinned source subsets, fresh-session selection tasks and pre-registered grading |
| [Real-repository observations](docs/evaluation/REAL_REPOSITORY_RESULTS.md) | Twelve captured suite-selection sessions, exact-path grading, costs and subset limits |
| [Architecture](docs/ARCHITECTURE.md) | Ownership boundaries, registry contract, and AIT runtime constraints |
| [Tool standard](docs/TOOL_STANDARD.md) | Scope/admission/lifecycle gates |
| [CLI standard](docs/CLI_STANDARD.md) | Target command/stream/exit/limit semantics |
| [JSON standard](docs/JSON_STANDARD.md) | Target result envelope and consumption rules |
| [Security standard](docs/SECURITY_STANDARD.md) | Trust, filesystem, process, and network boundaries |
| [AIT runtime](docs/AIT_RUNTIME.md) | Explicit discovery, installation, doctor, dispatch, and result-wrapper contract |
| [AIT profile selection](docs/AIT_PROFILE_SELECTION.md) | Exact-version profile selection, catalog, and native-output application boundary |
| [Code Slice consumer profile](docs/profiles/AGENT_CODE_SLICE.md) | Explicit native invocation, error, bounded-success, and compatibility rules |
| [Project Profile consumer profile](docs/profiles/AGENT_PROJECT_PROFILE.md) | Native complete/partial/unsupported/error and strict-mode rules |
| [Change Impact consumer profile](docs/profiles/AGENT_CHANGE_IMPACT.md) | Native draft-envelope, partial-success, limit, and error rules |
| [Test Scope consumer profile](docs/profiles/AGENT_TEST_SCOPE.md) | Native complete/partial/error verification-planning semantics |
| [CFML Check consumer profile](docs/profiles/AGENT_CFML_CHECK.md) | Native structural-check envelope and incomplete/error semantics |
| [Symbol Search consumer profile](docs/profiles/AGENT_SYMBOL_SEARCH.md) | Native bounded symbol-result and diagnostic semantics |
| [AIT profile catalog](docs/profiles/PROFILE_INDEX.json) | Machine-readable exact package/version/executable profile identities |
| [Release standard](docs/RELEASE_STANDARD.md) | Independent versioning, packaging, and release evidence |
| [Adding a tool](docs/ADDING_A_TOOL.md) | Registration and maintenance workflow |
| [Tool function review](docs/TOOL_FUNCTION_REVIEW.md) | Historical functional assessment and integration findings |
| [Tool expansion](docs/TOOL_EXPANSION.md) | Addition rationale, cross-tool boundaries, design reviews and evidence scope |
| [CFML Check](docs/tools/AGENT_CFML_CHECK.md) | Structural-checking contract, acceptance cases, and independent local feasibility handoff |
| [CFML Policy Check](docs/tools/AGENT_CFML_POLICY_CHECK.md) | Planned configurable CFML/HTML/project policy contract, boundaries, and acceptance cases |
| [Result Store](docs/tools/AGENT_RESULT_STORE.md) | Planned sanitized persistence, retrieval, retention and acceptance cases |
| [Runtime Trace](docs/tools/AGENT_RUNTIME_TRACE.md) | Planned event correlation, readback decision rules and acceptance cases |
| [KB synchronization](docs/KB_SYNC.md) | Company KB ownership, record mapping, synchronization and readback evidence |
| [Validator](scripts/validate_hub.py) | Executable local authoring checks |

Start with README for orientation or TASK for continued work; then SPEC, DESIGN,
and the relevant standard. Check VALIDATION before treating an observation as verified.

Verified source and scoped executable results establish implementation. Registry
metadata records reviewed facts; requirements describe intended behavior. If they
disagree, preserve the mismatch as pending work until its cause is understood.
Do not use an old review or a mutable sibling checkout as evidence of a new release.

## Monorepo source ownership (2026-09-30)

[Tool index](migration-tools.md) maps all ten package folders. [Migration](docs/migration/README.md) owns import coverage and deletion gates; [decision](docs/migration/DECISION.md) owns the superseding source-location decision. Package READMEs and local AGENTS own tool behavior. Historical Hub audits remain dated evidence.

- [Environment Doctor implementation and usage](packages/environment-doctor/README.md)
- [Contract Check implementation and limitations](packages/contract-check/README.md)
- [MVP verification scope](docs/mvp/VERIFICATION.md)

## Deploy Verify (2026-09-30)

[Release Guard Deploy Verify usage, evidence contract and limits](packages/release-guard/README.md)

- [Optional local CLI installation and rollback](docs/workflow/LOCAL_CLI.md)
- [Need-driven workflow skill](skills/ai-agent-tools-workflow/SKILL.md)
- [Legacy deletion readiness audit](docs/migration/DELETION_READINESS_2026-09-30.md)
- [Runtime Trace UI profile](packages/runtime-trace/README.md)
- [Patch Guard policy, supported diff formats and limits](packages/patch-guard/README.md)

- [Rules Resolve profile, provenance, safe discovery and limits](packages/rules-resolve/README.md)
- [Explicit batch CLI installation and agent onboarding](docs/workflow/INSTALL_ALL.md)
- [Context Pack manifest, budget accounting, duplicates and limits](packages/context-pack/README.md)

- [Test Evidence request, unified/Node captures, strict acceptance, schemas and optional pilot](packages/test-evidence/README.md)
