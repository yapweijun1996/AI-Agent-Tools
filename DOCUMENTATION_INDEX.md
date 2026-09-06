# Documentation index

Last reconciled: 2026-09-06. This index assigns document ownership; it is not a
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
| [Architecture](docs/ARCHITECTURE.md) | Ownership boundaries, registry contract, future discovery constraints |
| [Tool standard](docs/TOOL_STANDARD.md) | Scope/admission/lifecycle gates |
| [CLI standard](docs/CLI_STANDARD.md) | Target command/stream/exit/limit semantics |
| [JSON standard](docs/JSON_STANDARD.md) | Target result envelope and consumption rules |
| [Security standard](docs/SECURITY_STANDARD.md) | Trust, filesystem, process, and network boundaries |
| [Release standard](docs/RELEASE_STANDARD.md) | Independent versioning, packaging, and release evidence |
| [Adding a tool](docs/ADDING_A_TOOL.md) | Registration and maintenance workflow |
| [Tool function review](docs/TOOL_FUNCTION_REVIEW.md) | Historical functional assessment and integration findings |
| [Validator](scripts/validate_hub.py) | Executable local authoring checks |

Start with README for orientation or TASK for continued work; then SPEC, DESIGN,
and the relevant standard. Check VALIDATION before treating an observation as verified.

Verified source and scoped executable results establish implementation. Registry
metadata records reviewed facts; requirements describe intended behavior. If they
disagree, preserve the mismatch as pending work until its cause is understood.
Do not use an old review or a mutable sibling checkout as evidence of a new release.
