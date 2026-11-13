# Agent CFML Check Specification

**Status:** frozen feasibility contract for implementation baseline `c76b8be`, extended by release hardening
**Tool version:** `0.6.1`
**Profile:** `cfml-structure-v1`
**Envelope schema:** `schema/agent-cfml-check-result-v1.schema.json`

## 1. Scope

The v1 `check` operation performs deterministic, read-only structural checks on exactly one explicitly selected local UTF-8 `.cfm` or `.cfc` file under an explicitly supplied root. The `inspect` operation accepts multiple explicitly selected files under one root. Neither operation executes CFML, resolves includes, inspects a directory as source input, uses the network, or modifies the inspected source tree.

A completed result proves only the checks listed in that result. It does not prove Lucee or Adobe ColdFusion execution compatibility.

## 2. Operations and interfaces

### CLI operations

```text
agent-cfml-check capabilities [--json] [--pretty]
agent-cfml-check check --root <directory> <file> [--json] [--pretty]
```

`capabilities` reports the profile, operations, extensions, tag catalogue, effective default limits, and exclusions. The CLI does not accept a file, root, or check-limit override for this operation.

`check` requires exactly one explicit root and one `.cfm` or `.cfc` file. `--pretty` requires `--json`. `--help` prints usage and `--version` prints `0.6.1`; neither may be combined with other options.

### TypeScript interface

`src/index.ts` exports `capabilities`, `checkFile`, `DEFAULT_LIMITS`, `HARD_LIMITS`, `normalizeLimits`, and schema types. Repository package metadata declares `main: "./dist/index.js"`, `types: "./dist/index.d.ts"`, and an import/types `exports` map. Package-surface tests and a temporary packed-install CLI/library smoke check verified the previously published `0.1.1` artifact.

The TypeScript `capabilities(limitsInput)` API may receive limit overrides, while the CLI `capabilities` operation rejects them.

## 3. Supported structures

### Inspection extension

Version `0.3.0` additionally recognizes `cftransaction`, `cfswitch`, `cfcase`, and `cfdefaultcase`. A switch case must belong to the directly open switch, which can contain at most one default case. For transactions, absent or literal `begin` action is treated as a paired body; literal `commit`, `rollback`, and `setsavepoint` are treated as bodyless. Dynamic, duplicate, attribute-collection, or otherwise unrecognized transaction attributes return incomplete. This checks tag structure only, not database transaction behavior. These additions are not part of the published `0.2.0` artifact.

The opt-in `inspect` operation uses `schema/agent-cfml-inspect-result-v2.schema.json` and does not alter the v1 `check` envelope. It accepts one to 32 explicitly named source files under one root, an optional `--lines start:end`, or a `--baseline` file plus one current file. Relative file paths are resolved against the selected root; all paths use the existing source reader. Scope is recorded per file; the scanner reads the entire file for surrounding context, then filters findings to the requested range. Unsupported syntax anywhere in the scanned file makes that file incomplete, and its findings are provisional. Recoverable unsupported tags and CFScript tag islands are located and scanning continues; unterminated lexical constructs can stop scanning, reflected by `scan_complete: false`. No incomplete file receives a `pass` verdict.

Version `0.4.0` also recognizes standalone `cfabort`, `cfbreak`, `cferror`, `cfcookie`, `cfheader`, `cffile`, and `cfimage`. The profile checks these as standalone tags; a closing tag returns incomplete, including the optional-body forms of `cffile` and `cfheader`. It does not validate tag attributes, runtime effects, or `cfbreak` loop ownership.

Version `0.5.0` additionally recognizes standalone `cflocation`, `cfpdf`, `cfdirectory`, and `cfexecute`. Closing tags remain incomplete, including the optional-body forms of `cflocation`, `cfpdf`, and `cfexecute`. The checker does not validate attributes, PDF extension availability or operation results, and it never executes the commands or filesystem actions in the source.

Version `0.6.0` also recognizes standalone `cfflush`, `cfmodule`, and `cfzip`. Closing forms remain incomplete, including the optional-body forms of `cfmodule` and `cfzip`; `cfzipparam` remains outside the profile. Recognition of `cfmodule` checks only the caller's structure: the custom template is not resolved, read, or executed, regardless of whether its path is literal or dynamic. The checker does not validate custom tag semantics, archive actions, attributes, or extension availability.

Version `0.6.1` also recognizes standalone `cfsetting`; its optional-body closing form remains incomplete. This does not validate attributes or page-processing behavior and is not part of the published `0.6.0` artifact.

Inspection reports file, position, related opener and a non-automatic hint. It uses the existing per-file byte and nesting limits, a shared time limit, a 16 MiB aggregate source limit, a 32-file cap, and the output limit. When output cannot fit, results are withheld rather than truncated into apparent success. For a baseline comparison, the complete baseline is compared with findings in the current file's requested range; line numbers may have shifted. Unique matches of finding code and normalized source/opening lines are `existing`; findings with a code absent from the complete baseline are `new`; ambiguous or incomplete cases are `uncertain`. The response includes `comparison_basis` to state that these are diagnostic-signature classifications, not proof of semantic identity, causation, or runtime behavior. Baseline and current files must both be explicitly selected under the root; each is read as an individually verified snapshot rather than a simultaneous filesystem snapshot. `0` means inspection completed, including findings; `3` means incomplete, and input/security errors retain their applicable exit code.

### Paired bodies

`cfcatch`, `cfcomponent`, `cffinally`, `cffunction`, `cfif`, `cfloop`, `cfoutput`, `cfquery`, `cfsavecontent`, `cfscript`, `cfsilent`, and `cftry` require matching closing tags in this profile. Self-closing spellings of paired tags return incomplete; this does not assert that every CFML engine rejects them.

### Branches

`cfelse` and `cfelseif` must belong to the directly open `cfif`. Only one `cfelse` is accepted, and `cfelseif` cannot follow `cfelse`.

`cfcatch` and `cffinally` must belong to the directly open `cftry`. A closed `cftry` must contain at least one direct `cfcatch` or `cffinally`; multiple catches are allowed, at most one `cffinally` is allowed, and catches cannot follow it. Nested `cftry` blocks have independent handlers. The scanner does not validate catch attributes, exception types, or arbitrary text and statements between handlers. Support for these tags is a source change after the published `0.1.1` artifact.

### Bodyless tags

`cfargument`, `cfinclude`, `cfparam`, `cfqueryparam`, `cfreturn`, and `cfset` are standalone. Ordinary and self-closing spellings are accepted. Closing a bodyless tag is unsupported. `cfparam` support is a source change after the published `0.1.1` artifact; it does not validate attributes or runtime semantics.

Tag names are case-insensitive. Unknown, custom, imported, and unlisted tags are unsupported.

### Comments, attributes, and scripts

- Nested `<!--- ... --->` CFML comments are ignored for tag detection.
- Quoted CFML tag attributes and CFScript strings treat backslashes literally and respect doubled quote escapes. CFML comments inside tag expressions are skipped. The published `0.3.0` scanner treated backslashes as escapes and can miss later syntax or report false findings; version `0.4.0` corrects this behavior.
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

`max_output_bytes` has a minimum of 512 to reserve the compact failure envelope
at every hard-limit combination. CLI accounting includes the selected rendering
and final newline. An oversized result is withheld as incomplete with exit 3;
pretty mode falls back to compact failure JSON if indentation cannot fit.

## 7. Input and safety behavior

The source reader requires `.cfm` or `.cfc`, an existing root and file, realpath containment, a regular file, valid UTF-8, no NUL byte, and an effective source-size limit. Static symlink escapes are rejected before admission.

Reading is bound to a regular-file descriptor opened with no-follow and nonblocking flags where supported. Before consuming bytes, the reader compares admitted and opened device/inode identity, mode, size and nanosecond modification/change timestamps, checks the current pathname state, and rechecks the canonical path. Observed leaf or ancestor substitutions return the existing `SOURCE_CHANGED`/incomplete/exit 3 result. The same descriptor and pathname state are checked after reading, and the descriptor is closed on success or rejection.

Oversized metadata is rejected before body reads. Actual reads are bounded to the admitted size plus one byte for growth detection and cannot exceed the selected source-byte limit plus one. Over-limit growth returns `LIMIT_EXCEEDED`/incomplete/exit 3 before UTF-8 decoding. These checks reject observed mutation; they do not provide an atomic filesystem snapshot or operating-system path confinement.

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

The profile does not validate full CFML grammar, expression/type/runtime semantics, HTML, SQL, include expansion, directory/project context, Lucee/Adobe execution, unknown/custom/imported tags, or CFML tag islands inside `cfscript`. The prior `0.1.1` artifact was published and registry-verified. A targeted Lucee `6.2.2.91` probe and Ubuntu WSL Node `18.19.1` verification for prior source do not establish a full engine matrix for `0.2.0`.

The repository tests cover CF-01 through CF-13, pure-script `.cfc` handling, CLI behavior, package exports, and the parameter and exception tag additions. Full Lucee/Adobe engine comparison and a broader platform matrix remain unverified.
