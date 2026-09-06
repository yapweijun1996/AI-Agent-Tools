# AGENTS.md

## MODULE: PROJECT_SYSTEM

This file contains repository-specific rules. Keep modules focused and independent. Global working rules remain outside this file; detailed ecosystem contracts live in the linked standards.

## MODULE: PROJECT_CONTEXT

AI-Agent-Tools is an ecosystem Hub for independent deterministic tools. Its responsibilities are registry, standards, discovery, documentation, roadmap, and governance. Read [README.md](README.md) before making changes.

## MODULE: ARCHITECTURE

Follow [Architecture](docs/ARCHITECTURE.md). Do not copy tool implementations here, create a monorepo, or introduce an Agent Runtime. Do not redesign Codex, Claude, or AGRUN reasoning or orchestration. Shared packages or migration require evidence from roughly 3–5 mature tools and a separately reviewed decision.

## MODULE: PROJECT_MAP

- [TOOL_REGISTRY.json](TOOL_REGISTRY.json): authoritative tool identities, status, links, and recorded release evidence.
- [ROADMAP.md](ROADMAP.md): delivery sequence and scope.
- [DOCUMENTATION_INDEX.md](DOCUMENTATION_INDEX.md): reading order and document ownership.
- [TASK.md](TASK.md): authoritative Hub task status, blockers, and next steps.
- [SPEC.md](SPEC.md), [DESIGN.md](DESIGN.md), [EPIC.md](EPIC.md): requirements, decisions, and work packages; do not duplicate the task ledger.
- [VALIDATION.md](VALIDATION.md): dated source observations and verification limits.
- [docs/PRODUCT_VISION.md](docs/PRODUCT_VISION.md): product purpose and boundaries.
- Standards under `docs/`: contracts, lifecycle, security, and releases.
- [docs/ADDING_A_TOOL.md](docs/ADDING_A_TOOL.md): registration workflow.
- [scripts/validate_hub.py](scripts/validate_hub.py): local documentation and registry checks.

## MODULE: OWNERSHIP

Hub maintainers approve registry and standards changes. Tool maintainers own source, package identity, tests, support, and releases in their independent repositories. Never invent maintainers, repository URLs, package names, version numbers, or verification evidence. Use `null` for unknown registry values.

## MODULE: DEPENDENCIES

Keep this foundation dependency-free. Do not add frameworks, a package workspace, tool runtime dependencies, or a root npm package merely to host documentation. The validator uses Python's standard library.

## MODULE: VERIFICATION

Run `python3 scripts/validate_hub.py` and `git diff --check`; additionally inspect whitespace in untracked files because Git's ordinary diff does not include them. Review changed external links and their evidence manually. Check terminology, current/planned/future distinctions, and architecture consistency across all affected documents. A valid link is not proof of tool behavior. Preserve historical review evidence and put current observations in VALIDATION/TASK; never infer release completion from a changing sibling worktree.

## MODULE: PROJECT_DOD

Changes are complete when relevant contracts agree, registry checks and links pass, claims have evidence or are clearly planned, and useful existing material and unrelated changes are preserved. Keep technical artifacts in English. Report unverified external claims explicitly.

## MODULE: COMPLETION_UPDATES

The owner reports when independent tools are completed. Code Slice is the first
owner-confirmed completed tool. On later notices, inspect the supplied repository
and release evidence, synchronize documentation/registry, validate, and commit the
Hub update. Do not mark other tools complete from scaffolds or start monitoring.
Keep delivery completion separate from Hub protocol conformance.

## MODULE: SCOPED_RULES

These rules apply throughout this repository. Add nested rules only for a demonstrated independent responsibility or risk boundary; ordinary documentation folders do not need another AGENTS.md.
