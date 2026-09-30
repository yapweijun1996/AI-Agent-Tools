# Epic: Agent CFML Check Feasibility and Release Readiness

**Epic ID:** `CFML-CHECK-001`
**Implementation baseline:** `0.1.1` release-hardening commit pending
**Status:** feasibility and release hardening complete; external compatibility and canonical admission pending

## Goal

Deliver a deterministic, read-only `agent-cfml-check` tool that establishes bounded CFML structural facts without claiming full parsing or runtime validation.

## Acceptance matrix

| Criterion | Status | Evidence or gap |
|---|---|---|
| Tool/profile identity and `1.0.0` envelope | Done | Source types and JSON Schema |
| One `.cfm`/`.cfc` file under explicit root | Done | Source reader and CLI |
| Paired-tag nesting | Done | Lexer stack; CF-01/02/07 |
| Branch ownership/order | Done | CF-05 and lexer rules |
| Bodyless tags, nested comments, quoted attributes | Done | CF-03/04/06/07 |
| CFScript delimiter scanning | Done | CF-08/09 and scanner |
| Recognized pure-script `.cfc` handling | Done | Component/interface test |
| UTF-8 positions, byte ranges, hash, and limits | Done | SourceIndex, reader, checker |
| Deterministic JSON/text CLI behavior | Done | CLI tests and smoke checks |
| Local regression | Done | `npm test` 22/22 after schema coverage; typecheck pass |
| Package assembly dry-run | Done | `npm pack --dry-run --json` pass |
| Documentation synchronization | Done in working tree | DESIGN/SPEC/EPIC/ROADMAP/TASK/GOAL/PROGRESS/GOAL_PROMPT aligned to code |
| JSON Schema executable validation | Done | Ajv validates capabilities, pass, violations, incomplete, error, and negative envelopes |
| Installed-package CLI/library smoke test | Done locally | Temporary packed install runs the CLI and resolves the exported library entry |
| Library package export contract | Done | `main`, `types`, and `exports` added; package self-reference and temporary packed-install import tests pass; release package is 0.1.1 |
| Lucee compatibility | Partial | Targeted Lucee 6.2.2.91 probe passes; full authorized engine matrix required |
| Adobe ColdFusion compatibility | Pending | Authorized engine matrix required |
| Canonical Hub/repository handoff | Pending | External ownership/admission evidence required |
| Independent non-Windows verification | Done targeted | Ubuntu WSL Node 18.19.1 npm ci, 22/22 tests, and typecheck pass; broader platform matrix is not claimed |
| Public CLI package publication | Done | npm registry version, tarball, integrity, and registry-install CLI/library readback verify `agent-cfml-check@0.1.1` |
| Published artifact documentation/package parity | Done | Registry README/SPEC and package exports match the repository release artifact |

## Completed work

- Implemented the bounded lexer/checker and source safety model.
- Added stable result envelopes, findings, limits, exit codes, CLI rendering, types, schema, fixtures, and tests.
- Added generated `dist/`, package metadata, `.gitignore`, and maintainer documentation.
- Confirmed local tests, typecheck, packaging dry-run, and CLI fixture probes.
- Synchronized the documentation set with the current implementation and explicitly separated facts from external evidence.

## Risks and blockers

No local implementation check is failing. Release readiness is blocked by missing external evidence or decisions:

- only a targeted Lucee probe is verified; full engine compatibility and Adobe ColdFusion compatibility are unverified;
- canonical Hub/repository ownership and admission are unconfirmed;
- broader cross-platform coverage beyond Ubuntu WSL is absent;
- the published CLI artifact does not close the remaining engine-compatibility or canonical-admission gates;
- the prior published `0.1.0` artifact predates the repository's package export, schema, and documentation hardening; `0.1.1` contains the release-hardening changes;
- full Lucee/Adobe engine compatibility and canonical Hub admission remain unverified.

The bounded catalogue and lexical semantics are intentional scope limits, not defects to silently remove.

## Dependencies

Runtime: Node.js `>=18.18.0`. Development: Ajv `^8.20.0`, TypeScript `^5.7.0`, and `@types/node ^22.10.0`. There are no runtime npm, CFML engine, network, or database dependencies for the feasibility slice.

## Next steps

1. Confirm canonical Hub/repository ownership and admission.
2. Complete the Lucee/Adobe compatibility matrix when the Adobe runtime is available.
3. Handle grammar expansion as a separately versioned epic.
