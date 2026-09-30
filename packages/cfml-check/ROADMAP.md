# Agent CFML Check Roadmap

**Implementation baseline:** `0.1.1` release-hardening commit pending
**Overall state:** local feasibility and release hardening complete; external compatibility and canonical admission pending

## Phase 0 — Feasibility implementation (Complete)

- Define `cfml-structure-v1` and result envelope `1.0.0`.
- Implement the bounded paired/branch/bodyless tag catalogue.
- Handle nested CFML comments, quoted attributes, CFScript delimiters, and pure-script `.cfc` entry modes.
- Enforce explicit-root, realpath, UTF-8, source-stability, size, output, nesting, findings, and time boundaries.
- Provide deterministic CLI capabilities/check operations, text/JSON output, typed source exports, schema, fixtures, tests, and generated `dist/`.
- Synchronize maintainer documentation.

Evidence: 22/22 tests, typecheck, package dry-run, Windows CLI probes, schema validation, and packed-install smoke pass.

## Phase 1 — Contract hardening and release readiness (Pending)

### 1.1 Package surface

- Package metadata now declares `main`, `types`, and `exports`; local self-reference tests pass.
- Temporary packed-install CLI and library import smoke checks pass.
- `0.1.1` is published; registry version, tarball/integrity, exports, README/SPEC parity, and registry-install CLI/library smoke pass.
- Keep `dist/` aligned with source.

### 1.2 Contract validation

- Executable Ajv validation covers capabilities, pass, violations, incomplete/error, and a negative envelope.
- Add negative tests for all documented input, limit, path, and exit-code boundaries.
- Verify `--help`, `--version`, pretty JSON, tiny output limits, BOM, line endings, and deterministic repeated runs.

### 1.3 Canonical ownership

- Confirm the canonical source repository, Hub entry, roadmap position, admission state, and version mapping.
- Record external evidence without overriding repository behavior.

### 1.4 Engine and platform evidence

- Targeted Lucee `6.2.2.91` probe passes; define and run the full authorized supported-profile matrix against Lucee and Adobe ColdFusion.
- Ubuntu WSL Node `18.19.1` clean dependency install, test, and typecheck pass; broader platform coverage remains optional evidence.
- Record compatibility differences as profile changes, exclusions, or a new version.

### 1.5 Publication

**Status: Complete for `0.1.1`; broader compatibility and governance gates remain open.**

- npm authentication and registry readback verify `agent-cfml-check@0.1.1`.
- The published tarball and integrity metadata are available from the npm registry.
- Publication does not close the remaining engine-compatibility or canonical-admission gates.
- Registry README/SPEC and package exports match the published repository artifact.
- For future releases, confirm registry, provenance, package metadata, release authorization, and release checks before publishing.

## Phase 2 — Contract evolution (Unscheduled)

- Expand the tag catalogue only with compatibility and regression evidence.
- Consider broader grammar, include-aware analysis, or directory/project analysis only with new privacy, resource, and failure contracts.
- Version changes to supported syntax, findings, limits, result semantics, or package surface.

## Release gates

1. implementation regression — passed;
2. package assembly — passed by dry-run;
3. contract/schema validation — passed with Ajv;
4. package surface metadata, packed-install smoke, and registry parity — passed;
5. engine compatibility — targeted Lucee probe passed; full Lucee/Adobe matrix pending;
6. canonical Hub/repository — pending;
7. cross-platform — Ubuntu WSL evidence passed; broader matrix remains optional evidence;
8. publication/operations — 0.1.1 publication, integrity readback, registry install, and GitHub CI passed.

No publication date or compatibility promise is implied.
