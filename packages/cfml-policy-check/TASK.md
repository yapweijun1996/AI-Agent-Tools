# Task Ledger

Status date: 2026-09-16
Current lifecycle: `In progress`
Next task: `T-009` remaining verification matrix

## Evidence snapshot

The current working tree contains a private Node.js/npm implementation with
package version `0.1.0`, `src/cli.js`, local AIT JSON mode,
`ait-tool.manifest.json`, executable profile/result schema documents,
sanitized fixtures, an owner-approved Globe3 legacy PrintForm profile, and
fifteen declared Node tests. All fifteen tests pass in the current cycle.
The host reports Node `v25.2.1` and
npm `11.6.2`. The package declares Node `>=20`; the cross-platform matrix
is not verified.

This ledger records the implementation cycle following documentation commit
`d107b6a`. The implementation, tests, and contract changes are one focused
local change; the final commit identity and clean working-tree state are
verified by Git after the checks below. No unrelated changes were present
before the implementation work.

## Working runtime decision

For this local implementation, Node.js with npm was selected because the
existing target is a CLI/JSON tool and the inspected trusted
`agent_cfml_check` Tool Registry reference also uses Node and a read-only
single-file `capabilities/check` contract. This is a working implementation
decision, not proof of a public package or owner-approved release policy.

Maintainer ownership, distributable license, supported platform matrix, and the
exact AIT registry registration path remain open. The package is deliberately
private with `UNLICENSED` to prevent accidental publication.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| `Planned` | Work is identified but has no implementation acceptance evidence |
| `In progress` | Work has started but its acceptance is incomplete |
| `Blocked` | A specific missing decision, input, access, or resource prevents the next action |
| `Implemented` | The scoped artifact exists in the current tree |
| `Verified` | Required evidence for that scope passes |
| `Released` | Package, deployment, registry, or release evidence proves delivery |
| `Deferred` | Intentionally outside the current delivery scope |

`Implemented`, `Verified`, and `Released` are independent fields. A local
implementation is not a release.

## Work ledger

| ID | Work | Status | Planned | Implemented | Verified | Released | Depends on | Acceptance / evidence |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| T-001 | Establish and reconcile the documentation baseline | Verified | Yes | Yes | Yes | No | None | Eight Core SSOT files, README, and affected `docs/` files agree; local doc checks passed |
| T-002 | Correct the JSON example contradiction | Verified | Yes | Yes | Yes | No | T-001 | The example count matches its findings array |
| T-003 | Establish local Node/npm identity and close ownership/release decisions | In progress | Yes | Yes locally | No | No | T-001 | `package.json` and lockfile establish local identity; maintainer, distributable license, platform matrix, and release policy remain open |
| T-004 | Freeze the profile schema and rule primitives | Verified | Yes | Yes | Yes locally | No | T-003 | Profile schema, parser validation, known rule IDs, severity, duplicates, and executable-field rejection are tested |
| T-005 | Implement secure bounded source reading | Verified | Yes | Yes | Yes locally | No | T-003 | Explicit root/file, UTF-8, byte limits, symlink containment, and no-write behavior are tested |
| T-006 | Implement the bounded CFML/HTML static model | Verified | Yes | Yes | Yes locally | No | T-005 | Locations, comments, transparent cfoutput, malformed input, and uncertainty barriers are tested |
| T-007 | Implement the declarative engine and first table rules | Verified | Yes | Yes | Yes locally | No | T-004, T-006 | Stable direct colgroup/col findings and pass/violation verdicts are tested |
| T-008 | Complete project profile and sanitized representative fixtures | Verified | Yes | Yes | Yes locally | No | T-007 | Owner-approved `profiles/globe3-legacy-printform.json`, four sanitized fixtures, and four passing Globe3 tests |
| T-009 | Complete CLI, JSON, security, determinism, and platform verification | In progress | Yes | Yes locally | Partial | No | T-007 | Fifteen local tests, CLI/AIT smoke, package hygiene, packlist, SBOM, and Secretlint pass; symlink/encoding/resource/cross-platform/consumer checks remain |
| T-010 | Prepare release and AIT/Hub admission evidence | Planned | Yes | No | No | No | T-008, T-009 | Maintainer/license, artifact, registration, release notes, and consumer review |

## Evidence-backed findings

- The former documentation-only claim is now historical: the implementation
  exists in this working tree, but it is not yet committed or released.
- The target AIT contract is now a local stdin JSON protocol and manifest. No
  registry registration or remote tool mutation was performed.
- The generic vertical slice and the owner-approved Globe3 fixture slice pass
  fifteen local tests. Test coverage does not prove cross-platform, packaged,
  deployed, or registered behavior.
- The missing terminating `#` expression remains the separate
  `agent-cfml-check` scope. This tool only withholds policy results when the
  structure is uncertain.
- KB-MCP supplied a trusted reference contract, a verified Globe3 table-based
  PrintForm context, and workflow guidance. On 2026-09-16 the owner selected
  option A: both `<colgroup>` and `<col>` are mandatory for the represented
  Globe3 legacy PrintForm family. The project-status evidence is mirrored in
  KB-MCP item `3e631a61-d63d-4c25-aaac-cd1557b063f2:3f3cdb8a-5751-478c-9f4b-24ec092235b6`.
- The installed `agent-cfml-check` 0.1.1 command was available, but its
  capabilities/help invocations exited 0 without stdout; no independent result
  from that tool was used as evidence.

## Resolved decision

On 2026-09-16 the owner selected option A: require both `<colgroup>` and `<col>`
for the Globe3 legacy PrintForm family represented by the approved profile.
This resolves the prior candidate gate; it does not extend the profile to
PrintForm.js or other families, and it does not constitute release approval.

## Next execution order

1. Complete the remaining `T-009` symlink, encoding, resource, platform, and
   consumer/import checks.
2. Resolve the open parts of `T-003` before any publication or registration.
3. Prepare `T-010` only after the previous evidence is complete.
