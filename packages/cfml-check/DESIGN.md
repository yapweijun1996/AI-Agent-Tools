# Agent CFML Check Design

**Status:** release hardening complete; external compatibility and canonical admission pending
**Version:** `0.1.1`
**Implementation baseline:** repository release-hardening commit pending

## 1. Purpose and authority

`agent-cfml-check` provides deterministic, read-only structural checks for one explicitly selected CFML source file. It is deliberately narrower than a full CFML parser or runtime validator.

Authority order:

1. repository source code and generated output;
2. executable test and packaging evidence;
3. `SPEC.md` for the intended externally observable contract;
4. this design and the planning/status documents;
5. external KB or Hub notes, which must not override repository evidence.

`schema/agent-cfml-check-result-v1.schema.json` is the published envelope schema artifact. The test suite uses Ajv to validate capabilities, completed, incomplete/error, and negative envelope cases.

## 2. Architecture

```text
CLI (src/cli/index.ts)
  -> checker (src/core/checker.ts)
      -> limits (src/core/limits.ts)
      -> source reader (src/core/source-reader.ts)
      -> bounded lexer/scanner (src/core/lexer.ts)
          -> source index (src/core/source-index.ts)
      -> result envelope and output fitting
```

### Components

- **CLI:** validates operations, flags, positional arguments, limits, `--help`, and `--version`; renders JSON or text and maps failures to exit codes.
- **Checker:** normalizes limits, loads one source, selects the pure-script `.cfc` path, computes SHA-256 metadata, creates envelopes, and withholds data for incomplete/error outcomes.
- **Source reader:** validates extension, root containment before and after realpath resolution, regular-file status, UTF-8, NUL absence, size, and source stability.
- **Lexer/scanner:** recognizes the explicit tag catalogue, skips nested CFML comments, respects quoted tag attributes, validates the tag stack and branch rules, and checks CFScript delimiters while ignoring strings/comments.
- **Source index:** converts JavaScript string offsets to one-based line/column positions and zero-based UTF-8 byte ranges.
- **Schema layer:** provides TypeScript types and the JSON Schema for the result envelope.

## 3. Processing flow

1. Parse the CLI request or accept typed `checkFile` options.
2. Normalize requested limits against defaults and hard caps.
3. Resolve the explicit root and selected file.
4. Verify containment, extension, existence, realpath, file type, size, UTF-8, NUL absence, and read-time stability.
5. Scan a recognized pure-script `.cfc` for delimiters, or scan the bounded CFML profile.
6. Collect ordered findings, or fail closed with `data: null` when evidence is incomplete or a limit is reached.
7. Add source hash/encoding/coordinate metadata and the fixed checks list.
8. Enforce the output byte limit without returning partial success.

## 4. Structural model

Supported paired bodies are `cfcomponent`, `cffunction`, `cfif`, `cfloop`, `cfoutput`, `cfquery`, `cfsavecontent`, `cfscript`, and `cfsilent`. Supported branches are `cfelse` and `cfelseif`. Supported bodyless tags are `cfargument`, `cfinclude`, `cfqueryparam`, `cfreturn`, and `cfset`.

Tag names are case-insensitive. Paired tags require matching closes and cannot be self-closing. Bodyless tags accept ordinary and self-closing spellings but cannot have a closing tag. Branches must belong to the directly open `cfif`; one `cfelse` is allowed and `cfelseif` cannot follow it.

Nested CFML comments (`<!--- ... --->`) and quoted attribute values are skipped during tag recognition. HTML comments do not suppress server-side CFML detection. CFScript delimiter checks cover `()`, `[]`, and `{}` while respecting quoted strings, line comments, and block comments. CFML tag islands inside `cfscript` are unsupported. A `.cfc` beginning with `component` or `interface` after an optional BOM is treated as pure script.

## 5. Design decisions

### Bounded lexer, not a full parser

A small explicit catalogue is easier to reason about, test, and fail closed. Expression, type, SQL, HTML, include, and runtime semantics are outside this version.

### Explicit root and one-file scope

The caller supplies the root and one source file. The tool does not traverse directories or expand includes. Lexical and realpath containment checks reject path and symlink escapes.

### Incomplete is not a violation

A structurally valid completed check returns `status: "ok"` with `pass` or `violations` and exit `0`. Unsupported syntax, malformed input, source changes, and resource exhaustion return an incomplete/error envelope rather than a false clean result.

### Deterministic local execution

The core is synchronous and has no runtime npm dependency, network call, database call, CFML engine, watch process, or source-tree write. Build output is generated into `dist/`; test compilation output is `.test-dist/` and is Git-ignored.

## 6. Package surface decision

The CLI package surface is proven through the `bin` entry `dist/cli/index.js`. `src/index.ts` exports `capabilities`, `checkFile`, limits, and types. The repository declares `main`, `types`, and conditional `exports` for the library entry. Package-surface tests and a temporary packed-install CLI/library smoke check verify the current repository artifact. The published `agent-cfml-check@0.1.1` artifact includes this metadata; npm registry readback and a temporary registry-install CLI/library smoke check pass.

## 7. Dependencies

| Dependency | Current contract |
|---|---|
| Node.js | `>=18.18.0` runtime |
| Ajv | `^8.20.0` development/test dependency |
| TypeScript | `^5.7.0` development/build dependency |
| `@types/node` | `^22.10.0` development dependency |
| Runtime npm packages | None |
| CFML engine | Not required or invoked |
| Network/database | Not used |

## 8. Risks and future boundaries

- The tag catalogue is incomplete and unknown/custom/imported tags fail closed.
- The lexical scanner does not establish full CFML string/expression semantics.
- Lucee and Adobe ColdFusion behavior is unverified.
- A targeted Lucee `6.2.2.91` probe and Ubuntu WSL Node `18.19.1` install/test/typecheck run pass. Full engine behavior, Adobe compatibility, and canonical Hub ownership/admission remain unverified; npm publication, registry parity, and current packed-install behavior are verified.
- Expanding grammar, adding include/project analysis, or adding semantic validation requires a new versioned contract, privacy/resource model, and regression evidence.

## 9. Current evidence

The pre-onboarding implementation baseline passed 17/17 tests. The current release-hardening tree passes 22/22 tests, typecheck, package dry-run, capabilities/valid/misnested CLI probes, JSON Schema validation, and temporary packed-install CLI/library smoke checks. The `0.1.1` publication, registry readback, and GitHub CI verification are complete. These checks prove local implementation, package, CLI publication, targeted Lucee, and Ubuntu WSL evidence only; they do not prove a complete engine matrix or release readiness.
