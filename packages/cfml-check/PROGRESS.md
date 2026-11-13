# Agent CFML Check Progress

## 0.6.1 release (2026-11-13)

Source commit `7d350cd` adds standalone `cfsetting`. The packed CLI and library passed focused checks, and the registry artifact matches the tested SHA-256; `0.6.1` is the latest release. Optional-body closing forms and engine semantics remain outside the verified scope.

## 0.6.0 release (2026-11-13)

Source commit `871ab51` prepares three standalone tags. Windows and Ubuntu package tests and an offline packed-consumer smoke passed. Registry readback confirms `0.6.0` as `latest`; the artifact matches the reviewed digest and the global registry installation passed version and inspection checks. See the Hub validation ledger for evidence and limitations.

## 0.5.0 release (2026-11-13)

Source commit `019df67` prepares four standalone tags. Windows and Ubuntu package tests and an offline packed-consumer smoke passed. Registry readback confirms `0.5.0` as `latest`; the artifact matches the reviewed digest and the global registry installation passed version and inspection checks. See the Hub validation ledger for evidence and limitations.

## 0.4.0 release (2026-11-13)

Source commit `3a7dba9` prepares standalone tag support and the backslash parsing correction. Windows and Ubuntu package tests and an offline packed-consumer smoke passed. Registry readback confirms `0.4.0` as `latest`; the artifact matches the reviewed digest and the global registry installation passed version and inspection checks. See the Hub validation ledger for evidence and limitations.

## 0.3.0 release (2026-11-13)

Source commit `8f41d26` prepares the inspection extension. Windows and Ubuntu package tests and an offline packed-consumer smoke passed. Registry readback confirms `0.3.0` as `latest`; the registry artifact matches the reviewed digest and a fresh registry install passed CLI smoke checks. See the Hub validation ledger for exact evidence and limitations.

## 0.2.0 release (2026-11-13)

Source commit `998e3cc69918df88447dc3719d08da4a104d6358` prepares `0.2.0` with `cfparam` and paired exception tags. The Windows package suite passed 37 tests with three platform skips; Ubuntu WSL Node 18.19.1 passed 40 tests and typecheck. npm registry readback confirms `0.2.0` as `latest`; the registry tarball SHA-256 matches the reviewed packed artifact, and a temporary registry install passed CLI, check, capabilities and library smoke tests. Engine and macOS compatibility remain unverified.

The following status records describe the earlier `0.1.1` release.

**Reviewed against:** release commit `8e2c4d9`; status commit `46b3bc8`
**Version:** `0.1.1`
**Working-tree state:** clean; status commit `46b3bc8` is pushed
**Published artifact:** `agent-cfml-check@0.1.1` verified from npm registry
**Publication note:** the prior immutable `0.1.0` artifact predates the release-hardening changes

## Executive status

The deterministic feasibility slice and release hardening are locally verified. Targeted Lucee and Ubuntu WSL evidence now pass. The project is not yet fully release-ready because full engine compatibility, Adobe ColdFusion, and canonical ownership/admission remain open.

## Completed implementation

- bounded `cfml-structure-v1` tag scanner;
- paired-tag nesting and branch ownership/order checks;
- bodyless tags, nested CFML comments, and quoted attributes;
- CFScript delimiter checks and recognized pure-script `.cfc` entry modes;
- UTF-8 positions/byte ranges and source SHA-256 metadata;
- explicit-root, realpath, file, encoding, NUL, snapshot, and resource-limit protections;
- deterministic CLI capabilities/check operations, JSON/text rendering, help/version, and exit codes;
- TypeScript source exports, JSON Schema, fixtures, tests, generated `dist`, package metadata, and `.gitignore`;
- synchronized design, specification, epic, roadmap, task, goal, progress, and goal-prompt documents.

## Verified evidence

- `npm test`: 22/22 passed after schema coverage;
- `npm run typecheck`: passed;
- `npm pack --dry-run --json`: passed;
- capabilities, valid fixture, and misnested fixture CLI probes: passed on Windows;
- package metadata self-reference test: passed;
- temporary packed-install CLI and library import smoke checks: passed;
- JSON Schema validation: passed for capabilities, completed, incomplete/error, and a negative envelope;
- targeted Lucee 6.2.2.91 execution probe: passed;
- Ubuntu WSL Node 18.19.1 npm ci, 22/22 tests, and typecheck: passed;
- repository-local Agent Skill is present;
- GitHub CI for release commit 8e2c4d9: all Node 18.18.0/20/22 jobs completed successfully;
- working tree excludes `node_modules` and temporary `.test-dist/` output;
- npm registry readback: version/latest, tarball shasum/integrity, README/SPEC parity, package exports, registry-install CLI, and registry library import passed;
- `npm whoami` verifies the authenticated npm identity;

## Open work

1. Confirm canonical Hub/repository identity and admission.
2. Run the full authorized Lucee/Adobe compatibility matrix when Adobe ColdFusion is available.

## Blockers

No local implementation failure is known. Remaining blockers are Adobe ColdFusion access, full engine-matrix evidence, and canonical ownership/admission.

## Progress accounting

- Feasibility implementation: **100% complete**.
- Release gate path: **6/8 gates passed** (implementation regression, package assembly, executable schema, package surface/packed-install, targeted cross-platform evidence, and publication/CI), or **75%** by gate count. Full engine compatibility, Adobe compatibility, and canonical ownership/admission remain open. Targeted Lucee and Ubuntu WSL evidence do not close the full engine matrix. This is a planning indicator, not a quality score.

## Next action

Pursue canonical admission, then complete the full Lucee/Adobe compatibility matrix when Adobe ColdFusion is available.
