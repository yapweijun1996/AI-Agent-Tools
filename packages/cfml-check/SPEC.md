# Agent CFML Check Specification

**Status:** frozen feasibility contract for implementation baseline `c76b8be`, extended by release hardening
**Tool version:** `0.1.1`
**Profile:** `cfml-structure-v1`
**Envelope schema:** `schema/agent-cfml-check-result-v1.schema.json`

## 1. Scope

The tool performs deterministic, read-only structural checks on exactly one explicitly selected local UTF-8 `.cfm` or `.cfc` file under an explicitly supplied root. It does not execute CFML, resolve includes, inspect a directory as source input, use the network, or modify the inspected source tree.

A completed result proves only the checks listed in that result. It does not prove Lucee or Adobe ColdFusion execution compatibility.

## 2. Operations and interfaces

### CLI operations

```text
agent-cfml-check capabilities [--json] [--pretty]
agent-cfml-check check --root <directory> <file> [--json] [--pretty]
```

`capabilities` reports the profile, operations, extensions, tag catalogue, effective default limits, and exclusions. The CLI does not accept a file, root, or check-limit override for this operation.

`check` requires exactly one explicit root and one `.cfm` or `.cfc` file. `--pretty` requires `--json`. `--help` prints usage and `--version` prints `0.1.1`; neither may be combined with other options.

### TypeScript interface

`src/index.ts` exports `capabilities`, `checkFile`, `DEFAULT_LIMITS`, `HARD_LIMITS`, `normalizeLimits`, and schema types. Repository package metadata declares `main: "./dist/index.js"`, `types: "./dist/index.d.ts"`, and an import/types `exports` map. Package-surface tests and a temporary packed-install CLI/library smoke check verify the current `0.1.1` artifact.

The TypeScript `capabilities(limitsInput)` API may receive limit overrides, while the CLI `capabilities` operation rejects them.

## 3. Supported structures

### Paired bodies

`cfcomponent`, `cffunction`, `cfif`, `cfloop`, `cfoutput`, `cfquery`, `cfsavecontent`, `cfscript`, and `cfsilent` require matching closing tags and cannot be self-closing.

### Branches

`cfelse` and `cfelseif` must belong to the directly open `cfif`. Only one `cfelse` is accepted, and `cfelseif` cannot follow `cfelse`.

### Bodyless tags

`cfargument`, `cfinclude`, `cfqueryparam`, `cfreturn`, and `cfset` are standalone. Ordinary and self-closing spellings are accepted. Closing a bodyless tag is unsupported.

Tag names are case-insensitive. Unknown, custom, imported, and unlisted tags are unsupported.

### Comments, attributes, and scripts

- Nested `<!--- ... --->` CFML comments are ignored for tag detection.
- Quoted tag attributes respect backslash escapes, doubled quote escapes, and CFML comments inside the tag expression.
- HTML comments do not suppress CFML tag detection.
- Embedded `cfscript` respects quoted strings, `//` line comments, and `/* ... */` block comments while checking `()`, `[]`, and `{}`.
- CFML tag islands inside `cfscript` are unsupported.
- A `.cfc` beginning with `component` or `interface` after an optional BOM receives the pure-script delimiter check. A `.cfc` without recognized CFML tags or a recognized pure-script entry is incomplete/unsupported.

## 4. Findings

Completed structural findings use these codes:

- `UNEXPECTED_CLOSE`
- `MISMATCHED_CLOSE`
- `UNCLOSED_TAG`
- `INVALID_BRANCH`
- `UNTERMINATED_STRING`
- `UNTERMINATED_COMMENT`
- `UNBALANCED_DELIMITER`

Each finding contains a message, one-based line/column positions, a zero-based UTF-8 byte range `[start_byte, end_byte)`, and a related opening location or `null`. Findings are ordered by start byte and then code.

## 5. Result envelope

Every JSON result contains `schema_version`, `tool`, `status`, `complete`, `data`, `errors`, `warnings`, and `meta`.

For `status: "ok"`, `complete` is `true`, `errors` is empty, and `data` is present. A completed structural violation remains `status: "ok"`, with `data.verdict: "violations"` and exit `0`.

For `status: "incomplete"` or `"error"`, `complete` is `false`, `data` is `null`, and at least one error is present. No partial success is returned when evidence or a resource limit is insufficient.

Check data contains the profile, source path/SHA-256/byte size/UTF-8/BOM metadata, verdict `pass` or `violations`, checks `tag-nesting`, `branch-structure`, and `cfscript-delimiters`, exclusions, and findings. Capabilities data contains the profile, operations, extensions, supported tags, limits, and exclusions.

## 6. Limits

| Limit | Default | Hard cap |
|---|---:|---:|
| `max_source_bytes` | 2 MiB | 16 MiB |
| `max_nesting` | 256 | 1,024 |
| `max_findings` | 100 | 1,000 |
| `max_output_bytes` | 64 KiB | 1 MiB |
| `time_limit_ms` | 5,000 | 30,000 |

Requested limits must be positive safe integers and cannot exceed hard caps. Reaching a limit returns a fail-closed result rather than partial data.

## 7. Input and safety behavior

The source reader requires `.cfm` or `.cfc`, an existing root and file, realpath containment, a regular file, valid UTF-8, no NUL byte, and an effective source-size limit. It checks size and modification time before and after reading and rejects a changed snapshot. Symlink escapes are rejected.

Known envelope error codes include `INVALID_ARGUMENT`, `INVALID_LIMIT`, `UNSUPPORTED_EXTENSION`, `ROOT_NOT_FOUND`, `FILE_NOT_FOUND`, `PATH_UNRESOLVED`, `FILE_OUTSIDE_ROOT`, `LIMIT_EXCEEDED`, `SOURCE_CHANGED`, `BINARY_INPUT`, `ENCODING_UNSUPPORTED`, `UNSUPPORTED_SYNTAX`, and `INTERNAL_ERROR`.

## 8. Exit codes and output

| Code | Meaning |
|---:|---|
| `0` | Completed capabilities or check, including `violations` |
| `1` | Unexpected internal failure without a safe result |
| `2` | Invalid argument, limit, extension, or ordinary input rejection |
| `3` | Unsupported syntax, incomplete evidence, source change, or resource limit |
| `4` | Explicit-root, path-resolution, or access-policy rejection |

JSON mode emits one envelope on stdout; failure diagnostics are also written to stderr. Pretty JSON is intentionally multi-line but remains one JSON envelope.

## 9. Evidence boundary

The profile does not validate full CFML grammar, expression/type/runtime semantics, HTML, SQL, include expansion, directory/project context, Lucee/Adobe execution, unknown/custom/imported tags, or CFML tag islands inside `cfscript`. The `agent-cfml-check@0.1.1` CLI package is prepared for publication; authenticated npm registry readback remains required. Repository package export metadata, executable schema validation, and temporary packed-install verification are complete. A targeted Lucee `6.2.2.91` probe and Ubuntu WSL Node `18.19.1` verification pass, but they do not establish a full engine matrix. Adobe ColdFusion, Hub lifecycle, canonical ownership/admission, and registry parity remain outside current verified evidence.

The repository tests cover CF-01 through CF-13, pure-script `.cfc` handling, three CLI behaviors, and the package export surface. Current local evidence is 22/22 tests, typecheck pass, package dry-run pass, Windows CLI smoke checks, temporary packed-install CLI/library smoke checks, and JSON Schema validation. The prior immutable `0.1.0` artifact predates this release hardening; `0.1.1` registry readback remains required. Full Lucee/Adobe engine comparison, canonical Hub admission, and registry parity remain pending.
