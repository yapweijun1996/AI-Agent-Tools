# Changelog

## 0.6.0

- Recognize standalone `cfflush`, `cfmodule`, and `cfzip`. `cfmodule` is structural recognition only: the invoked template is neither resolved nor executed; paired `cfmodule` and `cfzip` remain incomplete.

## 0.5.0

- Recognize standalone `cflocation`, `cfpdf`, `cfdirectory`, and `cfexecute`; closing forms remain incomplete. The checker does not execute tag operations or validate their runtime effects.

## 0.4.0

- Recognize standalone `cfabort`, `cfbreak`, `cferror`, `cfcookie`, `cfheader`, `cffile`, and `cfimage` in the structural profile; optional-body closing forms remain incomplete.
- Treat backslashes literally in CFML tag and CFScript strings instead of consuming a following quote, so later tags and delimiters remain visible. Version `0.3.0` may miss syntax or report false findings for affected input.

## 0.3.0

- Add bounded transaction and switch/case structural recognition.
- Add opt-in `inspect` v2 diagnostics, explicit multi-file and line-range scopes, and conservative baseline comparisons while retaining the existing `check` envelope.

## 0.2.0

- Recognize `cfparam` as a bodyless tag in the bounded structural profile.
- Recognize paired `cftry`, `cfcatch`, and `cffinally` tags and check handler ownership and ordering.

## 0.1.1 — release hardening

- Added package `main`, `types`, and `exports` metadata with a package self-reference regression test.
- Added a repository-local Agent Skill at `skills/agent-cfml-check/SKILL.md`.
- Added GitHub Actions CI for Node 18, 20, and 22 with tests, typecheck, package dry-run, and CLI smoke checks.
- Verified CLI and library imports from a temporary packed install.
- Added executable JSON Schema validation with Ajv.
- Recorded targeted Lucee 6.2.2.91 and Ubuntu WSL Node 18.19.1 verification.
- Published `agent-cfml-check@0.1.1` with these changes; registry readback and registry-install CLI/library smoke checks pass.

## 0.1.0 — feasibility slice

- Added deterministic, read-only CFML structural checking for a bounded tag profile.
- Added paired-tag nesting, branch ownership/order, bodyless-tag, nested-comment, quoted-attribute, and CFScript delimiter checks.
- Added recognized pure-script `.cfc` checking for `component` and `interface` entry modes.
- Added explicit-root containment, realpath/symlink escape protection, UTF-8 validation, source snapshot checks, SHA-256 source metadata, and bounded resource limits.
- Added JSON/text CLI operations, typed exports, result JSON Schema, fixtures, tests, generated `dist/`, and package metadata.
- Local verification: 17 tests passed, typecheck passed, and package dry-run passed.
- Published `agent-cfml-check@0.1.0` to npm; registry version, tarball, and integrity readback verified. The immutable registry README/SPEC may predate later repository documentation synchronization. Lucee/Adobe compatibility, canonical Hub handoff, library-package exports, and cross-platform verification remain pending.
