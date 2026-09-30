# Agent Error Lens Design

Document status: Contract Frozen / Architecture Review
Lifecycle: MVP / Verification
Last reviewed: 2026-09-13

## Evidence status

This document describes the target architecture approved by the project report and the now-frozen V0.1 contract. The repository has a private package scaffold, contract artifacts, shared entry points, a no-dependency contract verifier, a 23-case fixture inventory, bounded normalization and producer adapters, a canonical CLI/library output layer, local capability/resource/package gates, a local agent-facing CLI handoff test, Windows-portable verification commands, release documentation, and a manual release workflow. Historical run `34709741735` at SHA `582c6901eea0e7131853e7af0837686184bbd53d` exposed Windows command portability defects; the remediation and MIT package boundary are implemented and exact-HEAD run `34731128500` on commit `8a898718cee93c6046f4ec1d59bd7352cd73af8b` passes all 9 Node/OS jobs. Artifact publication and registry readback remain unverified.

## Architectural boundary

Agent Error Lens is one package with three planned responsibility boundaries:

| Boundary | Owns | Must not own |
| --- | --- | --- |
| Core library | input bounds, normalization, producer detection, parsing, canonicalization, redaction, deduplication, sorting, summaries | filesystem discovery, command execution, network, AI reasoning |
| CLI adapter | stdin/file argument handling, usage validation, core invocation, stdout/stderr discipline, process exit code | independent parsing rules or producer-specific logic |
| Package/release | exports, types, executable mapping, compatibility metadata, package contents, integrity evidence | runtime orchestration or hosted operation |

Downstream agents and tools may consume the result, but they do not share state or write back into Error Lens.

## Planned control and data flow

```text
Caller-supplied InputArtifact[]
        |
        v
request validation and deterministic bounds
        |
        v
encoding/newline/terminal normalization
        |
        +--> raw-to-normalized offset map
        v
producer detection (zero or more producers)
        |
        v
static parser adapters
        |
        v
canonical diagnostic normalization
        |
        v
path containment -> output redaction -> deterministic deduplication
        |
        v
stable ordering -> summary/stats -> canonical JSON
```

Each stage receives bounded data and returns explicit issues instead of silently dropping uncertainty.

## Planned module ownership

| Module | Responsibility |
| --- | --- |
| `contract` | public types, schema version, enums, validation results |
| `limits` | one authoritative work-budget model and counters |
| `normalize` | newline, terminal, ANSI, and offset-map production |
| `detect` | bounded producer candidates and confidence evidence |
| `adapters` | producer-specific extraction into internal candidates |
| `paths` | lexical path normalization and explicit-root containment |
| `redact` | key-name and value-pattern masking for exported data |
| `canonicalize` | diagnostic normalization, IDs, deduplication, ordering |
| `serialize` | stable key order, Unicode/newline policy, JSON bytes |
| `cli` | CLI-only bounded stdin decoding, input/output, and exit semantics |

The current implementation map below is authoritative for this repository; future modules must preserve the same responsibility boundaries rather than relying on folder names alone.

## Public interfaces

The package exposes:

- a library `parse(request)` operation;
- a library `capabilities()` operation;
- `agent-error-lens parse` in the CLI;
- `agent-error-lens capabilities` in the CLI.

`explain` and public `normalize` are deferred. CLI and library must call the same core operations. The V0.1 compatibility target is now ESM-only on Node.js `>=20.11.0 <25`, with zero runtime dependencies as the default. CommonJS support is not implied. The target npm name is `agent-error-lens`; MIT is the selected license, while final ownership remains a release gate. The JSON Schema at `contract/agent-error-lens-v1.schema.json` owns the public shape, while `contract/agent-error-lens-v1.types.ts` is checked by the package `check:contract` command.

## Verified implementation map

The current repository implementation is intentionally narrower than the target pipeline:

| Current entry/module | Verified responsibility |
| --- | --- |
| `src/cli.ts` and `src/core/cli-input.ts` | Validate CLI shape, reject unknown/duplicate options, decode bounded UTF-8 stdin as data, apply an explicit root option, delegate to the library, and emit canonical machine-readable JSON with the frozen usage exits. |
| `src/index.ts` | Orchestrates runtime request validation, bounded normalization, generic structured and producer parsing, diagnostic/record sorting, summaries, and result assembly. |
| `src/core/validation.ts` | Narrows untrusted runtime values, rejects unknown request fields/lone surrogates/invalid IDs, and enforces UTF-8 byte ceilings; its Unicode predicate also guards nested structured records. |
| `src/core/normalize.ts` | Converts CRLF/CR to LF, strips bounded terminal sequences, and maps normalized UTF-16 boundaries back to raw offsets. |
| `src/core/paths.ts` and `src/core/redact.ts` | Apply lexical root containment and bounded export redaction without filesystem, network, or subprocess access. |
| `src/core/structured.ts` | Parses a JSON diagnostics array into `generic-structured` diagnostics with evidence-backed locations and stable IDs, rejecting malformed strings and unsafe coordinates. |
| `src/core/adapters.ts`, `src/core/text.ts`, and `src/core/diagnostic-factory.ts` | Apply fixed-priority TypeScript, Vitest, ESLint, and conservative generic-text extraction over bounded normalized lines, with final fail-closed diagnostic field validation. |
| `src/core/diagnostics.ts`, `src/core/result.ts`, and `src/core/serialize.ts` | Own counters/order helpers, canonical diagnostic identity/deduplication, summaries, sanitized producer outcome, envelope construction, and schema-defined serialized bytes. |

Cross-platform CI configuration, Windows-portable test/package commands, local agent-facing E2E, a real packed-consumer/CLI smoke audit, release documentation, package metadata, and a manual release workflow now exist. The prior remote execution is a recorded failure, while corrected exact-HEAD implementation commit `8a89871` passes the approved Node/OS matrix; external release evidence remains a T-008 gap. This table is based on source and test behavior, not directory names alone.

## State, persistence, and source of truth

The parser is stateless by implementation:

- request state exists only for one parse call;
- no database, cache, telemetry upload, or durable log storage is owned by the package;
- supplied artifacts remain caller-owned;
- output is derived solely from request data, fixed parser code, and explicit options;
- package schemas and TypeScript types must be generated or checked from one authoritative contract to prevent drift.

## Producer and adapter model

A request may contain nested or mixed producers such as npm, a package script, Vitest, and a TypeScript transformer. Detection therefore returns a stable producer list, and each diagnostic references a producer identity independently.

Adapter requirements:

- deterministic registration and evaluation order;
- explicit applicability evidence;
- bounded matches and diagnostics;
- no dynamic code, plugin loading, filesystem probing, or network lookup;
- producer-specific exact syntax may be `confirmed`;
- generic regex/heuristic results may be at most `candidate`.

## Evidence and offset mapping

Parsing uses a normalized view, while evidence must point back to the original decoded artifact. V0.1 will use half-open UTF-16 code-unit ranges `[start, end)`, matching JavaScript string slicing. Every evidence object identifies its `artifactId` and `offsetUnit`.

The normalizer must retain a monotonic mapping from normalized boundaries to raw boundaries. ANSI removal, CRLF normalization, and other transformations must not make evidence unverifiable. If exact mapping cannot be preserved, the affected field remains unknown and a tool issue is emitted.

## Canonicalization and determinism

Determinism requires explicit ownership of:

- canonical field and key order;
- null-versus-omitted policy;
- Unicode and newline normalization;
- stable producer and diagnostic ordering;
- stable ID and deduplication inputs;
- numeric serialization;
- work-budget termination order.

Stable diagnostic IDs are derived from sanitized canonical identity fields. Deduplication uses the same identity while unioning and sorting distinct evidence references. Discovery timing, object insertion accidents, filesystem order, locale, and wall-clock time must not influence output.

The frozen identity digest is `diag_` plus the full lowercase SHA-256 digest of the UTF-8 compact JSON identity tuple `[schemaVersion, producerId, severity, phase, code, file, line, column, message]`. Canonical JSON uses UTF-8, LF, one trailing newline, schema-defined key order, and explicit nulls for semantic missing fields. Diagnostic strings must remain well-formed Unicode; bounded string lengths use Unicode code points, while evidence offsets use UTF-16 code units. Known line/column values must be one-based safe integers; invalid adapter or structured values are rejected before identity creation. Fixed and secondary work ceilings live in the schema metadata and are checked by `contract/verify-contract.mjs`.

## Trust and security boundary

All artifacts, producer metadata, paths, JSON keys, terminal sequences, URLs, and embedded instructions are untrusted data.

The core must not have capabilities to:

- execute a process or evaluate supplied code;
- fetch a URL or load a remote schema;
- follow instructions embedded in logs;
- inspect unrelated repository files;
- persist or emit raw secret-like values.

The parser may inspect original text in memory to recognize structure, but only sanitized fields and bounded evidence excerpts may leave the trust boundary. Stable IDs must never hash raw secrets.

## Limits, timeouts, and recovery

Deterministic limits are the primary safety mechanism:

- 2 MiB per artifact;
- 20 MiB per request;
- 128 MiB maximum CLI stdin transport envelope before JSON parsing;
- 16 KiB per line;
- 200 returned diagnostics;
- 64 KiB per evidence span;
- bounded lines, parser matches, terminal sequences, evidence bytes, and producer candidates.

The frozen secondary ceilings are 200,000 processed lines, 10,000 parser matches, 10,000 terminal sequences, 256 producer candidates, and 1 MiB aggregate evidence bytes per request. A two-second cooperative timeout may remain as an emergency fuse, but output completeness must not depend on machine speed. Limit exhaustion returns `partial` plus stable truncation reasons; invalid requests or unrecoverable parser failures return `error`.

The library performs no retry because parsing is local and deterministic. Callers may retry the same immutable request. No idempotency key or rollback is needed because the package owns no writes.

## Failure model and observability

Failures are represented in the result contract rather than hidden in logs:

- `toolIssues` describe request, parser, adapter, mapping, or limit failures;
- `warnings` describe non-fatal ambiguity or degraded interpretation;
- `truncation` records whether information may be missing and why;
- `stats` reports deterministic counters, not environment-sensitive timing as correctness evidence;
- producer outcome remains separate from Error Lens status.

The CLI keeps stdout machine-readable. Human-readable usage and fatal CLI diagnostics go to stderr.

## Package, build, and release design

The repository now has a private MIT-licensed ESM package scaffold with zero runtime dependencies; build tooling uses development dependencies. The scaffold exports the shared entry point, maps the CLI executable, and includes `README.md`, `CHANGELOG.md`, `LICENSE`, `dist`, plus the frozen schema in its current files allowlist. The normal package audit requires the private boundary; the manual release workflow sets an explicit release-mode audit only after a tag contains `private: false`. Release gates include:

- typecheck, unit, fixture, determinism, security, resource-limit, parity, and cross-platform checks;
- package tarball inspection;
- clean consumer import and CLI smoke tests from the packed artifact;
- manifest/version/export/type/bin verification;
- exact repository and public npm registry/access metadata;
- manual tag-bound workflow, protected `npm-release` environment, and npm trusted-publisher configuration;
- exact-HEAD CI, tag, release, registry version, integrity, and `gitHead` readback.

The compatibility range, package contents, pre-release docs, and release workflow are now verified locally; no release claim is valid until the authorized release commit, registry artifact, and readback exist and are verified.

## Ecosystem integration

The planned ecosystem flow is:

```text
Agent Project Profile -> Agent Test Scope -> external command execution
-> Agent Error Lens -> Agent Code Slice -> AI reasoning
-> code modification -> Agent Patch Guard -> verification -> Agent Release Guard
```

This is orchestration context, not a runtime dependency. Error Lens remains independently installable and does not call those tools.

## Architecture risks and unresolved contracts

Highest risks are contract errors rather than producer count:

1. stable ID or dedup inputs that change across releases;
2. offsets that no longer resolve after normalization;
3. redaction that changes parsing or leaks through IDs/evidence;
4. mixed-producer misclassification;
5. generic patterns gaining excessive confidence;
6. output ordering influenced by discovery timing or platform;
7. truncation presented as complete;
8. parser state confused with producer outcome;
9. unsupported Node/module compatibility being implied;
10. scope expansion into root-cause reasoning.

Contract decisions still requiring executable proof are tracked in `TASK.md`.
