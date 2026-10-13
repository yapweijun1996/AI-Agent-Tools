# Specification

Status: `Implemented local slice`
Lifecycle: `Pre-prototype`
Last reconciled: 2026-10-12

The first vertical slice is implemented and locally verified. The complete
product and release specification remains broader than the current slice.

## Objective

Provide a deterministic static checker for project-defined rules over mixed
CFML/HTML templates. The checker identifies clear policy violations, preserves
source locations, and fails closed when the selected source and profile cannot
support the requested conclusion.

## Supported local V1 input

The current implementation requires:

1. an explicit root directory;
2. one explicit root-relative `.cfm` or `.cfc` source path;
3. one explicit root-relative local JSON policy profile;
4. bounded file, profile, token, depth, finding, output, and processing limits.

Directory scanning, implicit project discovery, include traversal, network
profiles, and stdin as a check input are excluded. AIT mode uses stdin only for
the JSON request envelope.

## Implemented policy semantics

- Each applicable `<table>` must have a direct `<colgroup>` child.
- Each applicable `<colgroup>` must have at least one direct `<col>` child.
- A `<col>` elsewhere in the table does not satisfy the rule.
- Nested tables are evaluated independently.
- HTML and CFML comments do not create active elements.
- Tag-shaped contents of `script`, `style`, `textarea`, `title`, `xmp`, `iframe`,
  `noembed`, and `noframes` do not create active HTML elements. Matching end tags
  are case-insensitive; lookalike names do not end the text context. An opening
  self-closing slash does not close these text elements.
- Unclosed text elements, double-escaped script contents, `plaintext`, and
  `noscript` return `incomplete`. The bounded checker does not implement the
  full HTML tokenizer or choose a browser scripting mode.
- `cfoutput` is transparent for static markup.
- Other visible CFML tags, non-escaped hash expressions and malformed markup
  return `incomplete`, whether or not a literal table/colgroup exists. Limits
  also return `incomplete`; literal `cfset`, encoded-output calls and includes
  are not whitelisted or executed.

CFML tags and hash expressions within text contents retain the conservative
dynamic-structure checks; opaque HTML text is not evidence of static CFML output.
Comment suppression and escaped hashes are evaluated in one scan over visible
source spans. Analysis uses one monotonic cooperative deadline covering source
positions, markup, hashes, rules and final finding ordering; see
[CLI_CONTRACT.md](docs/CLI_CONTRACT.md) for the processing boundary.

## AIT and CLI request contract

The local AIT entrypoint is:

```text
agent-cfml-policy-check ait
```

It reads exactly one JSON request from stdin and writes exactly one JSON result
to stdout. The request uses `operation: capabilities` or `operation: check`.
For `check`, `root`, `file`, and `profile` are required. See
[AIT_TOOL_CONTRACT.md](docs/AIT_TOOL_CONTRACT.md).

The direct CLI supports:

```text
agent-cfml-policy-check --help
agent-cfml-policy-check --version
agent-cfml-policy-check capabilities --json
agent-cfml-policy-check check --root ROOT --file FILE --profile PROFILE --json
```

## Result contract

The implemented envelope is version `1.0.0`:

| Field | Requirement |
| --- | --- |
| `schema_version` | Exact `1.0.0` |
| `tool` | `agent-cfml-policy-check` |
| `status` | `ok`, `incomplete`, or `error` |
| `complete` | True only for supported completed analysis |
| `data` | Result data for `ok`; null for `incomplete` and `error` |
| `errors` | Stable error-code/message objects; structural refusal may add bounded cause `details` |
| `warnings` | Advisory array |
| `meta` | Scope, root-relative path, profile identity, and effective limits |

A completed check with violations uses status `ok`, verdict `violations`, and
exit code `0`. An incomplete or error result withholds `data`.

`CFML_STRUCTURE_UNCERTAIN` includes one cause in `errors[0].details`:
`{reason,line,column}`. Its eight fixed reasons and selection semantics are
defined in [JSON_SCHEMA.md](docs/JSON_SCHEMA.md#structural-cause-details).
Coordinates are original one-based line/UTF-16 code-unit column positions;
the validated source path is root-relative in `meta.path`. No arbitrary
source text, attribute names/values or snippets are returned. Other error
codes do not acquire this optional field. Output/deadline limits still apply
and may return `RESOURCE_LIMIT` instead.


## Finding contract

Each finding contains:

```json
{
  "rule_id": "html.table.requires-colgroup",
  "severity": "error",
  "message": "Table must contain a direct colgroup element.",
  "line": 1,
  "column": 1
}
```

Locations are one-based. Paths are root-relative. Absolute paths, credentials,
and unnecessary source excerpts are not returned.

## Status and exit mapping

| Exit | Status | Meaning |
| --- | --- | --- |
| `0` | `ok` | Supported analysis completed; findings may exist |
| `1` | `error` | Unexpected internal failure |
| `2` | `error` | Invalid request, input, profile, or limit |
| `3` | `incomplete` | Dynamic, malformed, unsupported, or resource-limited analysis |
| `4` | `error` | Explicit security boundary rejection |

## Acceptance boundary

Earlier local tests and smoke checks accepted the generic and owner-approved
Globe3 slices. The 2026-10-12 no-target refusal and causal-location correction
has independent source CLI smoke coverage and 52 passing native package tests
under Windows Node 24.21.0 root acceptance, plus a real packed Windows CLI
consumer refusal. These observations do not prove runtime CFML behavior.
Experimental admission still requires the remaining security matrix, platform
evidence, package inspection, maintainer/license decision, and AIT/Hub
registration review.
