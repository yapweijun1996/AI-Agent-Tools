# Agent CFML Check Task Ledger

**Ledger baseline:** implementation `0.1.1`, release commit `8e2c4d9`
**Ledger scope:** repository evidence only; external Hub/release tracking remains separate

## Completed

| ID | Task | Evidence |
|---|---|---|
| CFML-001 | Define tool identity, profile, and envelope | `src/schema/types.ts`, JSON Schema |
| CFML-002 | Implement default/hard limits | `src/core/limits.ts`, capabilities |
| CFML-003 | Enforce root/path/file/UTF-8/NUL/size/snapshot rules | `src/core/source-reader.ts` |
| CFML-004 | Implement UTF-8 byte and line/column indexing | `src/core/source-index.ts`, CF-10 |
| CFML-005 | Implement paired-tag stack checking | `src/core/lexer.ts`, CF-01/02/07 |
| CFML-006 | Implement branch ownership/order | `src/core/lexer.ts`, CF-05 |
| CFML-007 | Implement bodyless tags/comments/quoted attributes | CF-03/04/06/07 |
| CFML-008 | Implement CFScript string/comment/delimiter handling | CF-08/09 |
| CFML-009 | Support pure-script `.cfc` entry modes | pure-script CFC test |
| CFML-010 | Implement fail-closed findings/output limits | `checker.ts`, CF-11 |
| CFML-011 | Implement CLI parsing, rendering, help/version, and exit codes | `src/cli/index.ts`, CLI tests |
| CFML-012 | Add schema, fixtures, package metadata, generated `dist` | package dry-run |
| CFML-013 | Run local regression and packaging checks | 22/22, typecheck, pack dry-run |
| CFML-014 | Commit initial implementation without dependencies | `1d5c768` |
| CFML-015 | Synchronize DESIGN/SPEC/EPIC/ROADMAP/TASK/GOAL/PROGRESS/GOAL_PROMPT | current working-tree documentation review |

## Pending contract and release work

| ID | Task | Status | Exit evidence |
|---|---|---|---|
| CFML-016 | Add executable JSON Schema validation | Done | Ajv-backed capabilities, pass, violations, incomplete/error, and negative envelope tests |
| CFML-017 | Add complete negative input/limit/path contract tests | Pending | Documented error and exit-code matrix passes |
| CFML-018 | Verify clean packed-install CLI behavior | Done | Temporary packed install runs the CLI and resolves the exported library entry |
| CFML-019 | Decide and implement library package exports, or record CLI-only scope | Done | `main`, `types`, and `exports` plus package self-reference and packed-install tests; release version 0.1.1 |
| CFML-020 | Confirm canonical Hub/repository identity and admission | Pending | Authoritative mapping and lifecycle evidence |
| CFML-021 | Run authorized Lucee compatibility comparison | Partial | Targeted Lucee 6.2.2.91 probe passes; supported-profile matrix and recorded differences remain |
| CFML-022 | Run authorized Adobe ColdFusion comparison | Blocked | No Adobe ColdFusion runtime is installed or available; supported-profile matrix remains required |
| CFML-023 | Verify independent non-Windows platform | Done targeted | Ubuntu WSL Node 18.19.1 npm ci, 22/22 tests, and typecheck pass; broader platform matrix not claimed |
| CFML-024 | Decide and execute CLI package publication | Done | npm registry version/tarball/integrity and registry-install CLI/library readback for `agent-cfml-check@0.1.1` |

## Unscheduled scope

| ID | Task | Status | Boundary |
|---|---|---|---|
| CFML-025 | Reconcile published artifact documentation/package metadata with current repository docs | Done | Registry README/SPEC/exports match the published 0.1.1 artifact |
| CFML-026 | Add GitHub Agent Skill and CI workflow | Done | `skills/agent-cfml-check/SKILL.md` and `.github/workflows/ci.yml`; CI passed for release commit `8e2c4d9` |
| CFML-027 | Expand tag catalogue/full grammar | Unscheduled | New compatibility and versioned contract required |
| CFML-028 | Add include-aware/directory/project analysis | Unscheduled | New privacy, resource, and failure model required |
| CFML-029 | Add expression/semantic validation | Unscheduled | Outside current structural profile |

## Blockers and risks

- No local implementation task is failing.
- Remaining release tasks are blocked by missing external evidence, not by the current 22 passing tests.
- The prior published `0.1.0` package predates the repository's export, schema, and documentation hardening; `0.1.1` is the current release.
- CI passed for release commit `8e2c4d9` across Node 18.18.0, 20.x, and 22.x.
- Registry README/SPEC/exports parity was verified for the published 0.1.1 artifact.
- JSON Schema is an executable Ajv test gate.
- Unknown/custom/imported tags and unsupported constructs fail closed by design.

## Verification commands

```sh
npm test
npm run typecheck
npm run build
npm pack --dry-run --json
node dist/cli/index.js capabilities --json
node dist/cli/index.js check --root . fixtures/valid.cfm --json
node dist/cli/index.js check --root . fixtures/misnested.cfm --json
```
