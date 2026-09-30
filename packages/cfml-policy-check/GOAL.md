# Goal

Status: `Implemented local slice`
Lifecycle: `Pre-prototype`
Last reconciled: 2026-09-16

## Purpose

Build a deterministic, read-only checker for project-specific conventions in
mixed CFML/HTML templates. The checker is intended for AI coding agents and
developers who need a repeatable source review before deployment or human
review.

The first useful outcome is now implemented locally: one explicitly selected
`.cfm` or `.cfc` file is checked under one explicit root with one local JSON
policy profile. The result is a bounded JSON envelope. Dynamic or malformed
input remains visibly incomplete instead of becoming a false pass.

## Current evidence

The repository now contains a private Node.js package named
`agent-cfml-policy-check`, version `0.1.0`, with an npm lockfile, CLI
entrypoint, local AIT JSON mode, profile/schema files, generic fixtures, an
owner-approved sanitized Globe3 legacy PrintForm profile and fixtures, and
tests.
The package declares Node `>=20`; this Windows host currently reports Node
`v25.2.1` and npm `11.6.2`. The declared platform matrix is not yet
verified.

The local implementation is not an AIT registry registration, public npm
release, deployment, or Hub admission. The package is private and
`UNLICENSED` while maintainer and redistribution decisions remain open.

## Intended outcomes

1. Identify clear project-policy violations such as a statically understood
   `<table>` without a direct `<colgroup>` or a `<colgroup>` without a
   direct `<col>`.
2. Preserve root-relative source locations and stable rule identifiers.
3. Return deterministic JSON with explicit `ok`, `incomplete`, and `error`
   states and bounded diagnostics.
4. Keep source, profile, and repository content inside a read-only, offline,
   non-executing trust boundary.
5. Provide an AIT-callable local contract without claiming registry or release
   status.
6. Give future agents a fixture-backed implementation path that can be
   independently verified before any Hub/AIT admission.

## Non-goals

- Executing CFML, HTML, JavaScript, SQL, browser code, or application behavior.
- Replacing the separate CFML structural checker or proving runtime syntax,
  accessibility, security, permissions, tenant isolation, or business
  correctness.
- Implicit directory traversal, include traversal, network profiles, automatic
  fixes, or arbitrary executable rule plugins in V1.
- Claiming a public package, maintainer, distributable license, platform matrix,
  registry registration, or release before its evidence exists.

## Measurable success criteria

| Criterion | Current state | Required evidence |
| --- | --- | --- |
| Identity | Partially implemented | Node/npm, package/CLI name, owner, and distributable license are explicit and reviewed |
| Scope safety | Locally verified | Tests prove explicit-root/file handling, traversal boundary, finite limits, and no source mutation |
| Rule behavior | Locally verified for the generic and approved Globe3 slice | Positive, negative, comments, CFML wrapper, dynamic, malformed, and nested fixtures pass |
| Contract | Locally implemented | CLI, AIT JSON mode, envelope, exit codes, stdout purity, and stable ordering are tested |
| Release | Not started | Build/package inspection, platform evidence, release notes, artifact identity, and consumer admission |

## Status model

Track each outcome independently:

- `Planned`: intended work is recorded.
- `Implemented`: the scoped artifact exists in the current tree.
- `Verified`: the relevant check, test, or runtime evidence passes.
- `Released`: package, deployment, registry, or release evidence proves delivery.

Missing evidence is `Unverified`; documentation or a local implementation alone
cannot promote a product to `Released`.

## Open decisions

- Confirm a maintainer and a distributable license before any publication.
- Confirm the supported Node platform matrix and release policy.
- Confirm the exact AIT registry registration path; the current manifest is
  explicitly `local-contract-only`.
See [TASK.md](TASK.md) tasks `T-003`, `T-008`, `T-009`, and `T-010`.

## Related documents

- [Design](DESIGN.md)
- [Specification](SPEC.md)
- [Delivery epic](EPIC.md)
- [Roadmap](ROADMAP.md)
- [Executable task ledger](TASK.md)
- [Evidence-based progress](PROGRESS.md)
- [Autonomous task contract](GOAL_PROMPT.md)
- [AIT tool contract](docs/AIT_TOOL_CONTRACT.md)
