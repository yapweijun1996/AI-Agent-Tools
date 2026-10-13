# JSON Contract

Status: `Implemented local contract`
Last reconciled: 2026-10-12

The result envelope is implemented in `src/cli.js` and described by
`schema/result-v1.schema.json`. It is compatible in shape with the inspected
read-only `agent_cfml_check` reference, but compatibility and registration are
not independently proven in every AIT consumer.

## Envelope example

```json
{
  "schema_version": "1.0.0",
  "tool": "agent-cfml-policy-check",
  "status": "ok",
  "complete": true,
  "data": {
    "verdict": "pass",
    "finding_count": 0,
    "findings": [],
    "profile": {
      "id": "example-cfml-policy",
      "version": "0.1.0"
    }
  },
  "errors": [],
  "warnings": [],
  "meta": {
    "scope": "one explicit local CFML file",
    "path": "test/fixtures/pass.cfm",
    "profile_id": "example-cfml-policy",
    "profile_version": "0.1.0",
    "limits": {}
  }
}
```

The example is internally consistent: `finding_count` equals the findings
array length. Versions and profile values are local example values, not release
claims.

## Semantics

- `ok` and `complete: true` mean the supported requested scope completed.
  Findings may still make the verdict `violations`.
- `incomplete` and `complete: false` mean evidence was insufficient, unsupported,
  ambiguous, malformed, dynamic, or stopped by a declared limit. `data` is null.
- `error` and `complete: false` mean invalid input, security rejection, or
  internal failure. `data` is null.

There is no partial-data success. The implementation withholds incomplete
observations rather than presenting them as a complete pass.

Structural uncertainty is independent of the presence of literal table targets:
unknown hash output, include-only input, other visible CFML tags and malformed
structures cannot establish a complete no-findings result. Static no-target,
comment-only and escaped-`##` sources remain supported.


## Finding fields

Required fields are `rule_id`, `severity`, `message`, `line`, and `column`.
Optional fields may include a root-relative `path`, end locations, related
information, and a remediation hint. Current findings use one-based line and
column positions and no absolute paths.

## Structural cause details

The envelope version remains `1.0.0`. Error objects require `code` and
`message`; only `CFML_STRUCTURE_UNCERTAIN` may additionally have `details`.
The implementation emits exactly one structural error with
`details: {reason,line,column}` and the validated canonical root-relative
source path in `meta.path`. Details permit no other fields.

| Fixed reason | Cause location |
| --- | --- |
| `UNSUPPORTED_CFML_TAG` | Opening `<` of a visible non-`cfoutput` CFML tag, including includes and assignments |
| `HASH_EXPRESSION` | First visible non-escaped `#` |
| `UNCLOSED_COMMENT` | Opening `<` of an unterminated HTML/CFML comment |
| `UNCLOSED_TAG` | Opening `<` of a tag with no supported terminating `>` |
| `MISMATCHED_CLOSING_TAG` | Opening `<` of an unmatched or out-of-order closing HTML tag |
| `UNCLOSED_ELEMENT` | Opening `<` of the first remaining open HTML element, when no explicit cause was found |
| `UNSUPPORTED_TEXT_CONTEXT` | Opening `<` of `plaintext` or `noscript` |
| `DOUBLE_ESCAPED_SCRIPT` | Opening `<` of the nested script tag in the unsupported escaped context |

The parser retains the first explicit cause in source order. If none was found,
it records a remaining unclosed-element opener. One visible-span hash scan can
replace that cause only with an earlier visible hash; it stops before an
already-known cause. Supported comments suppress their contents and `##` is
literal. Unsupported text contexts stop structural scanning safely rather
than inventing parsed facts.

`line` and `column` are positive one-based integers in the original decoded
source. Columns count UTF-16 code units, matching the existing finding index;
CRLF and Unicode are not normalized before locating a cause. The diagnostic
contains no source strings, attributes, values or snippets. It is not a CFML
syntax/runtime diagnostic or an include-resolution result.

The cause count is fixed at one, independent of repeated unknown constructs.
Input, token, depth, processing and serialized-output limits remain effective.
Limit exhaustion returns `RESOURCE_LIMIT`/exit 3/null data instead of a
structural cause where applicable. Other error types do not receive `details`
or newly disclosed source metadata. No universal Hub-envelope field is added.


## Error codes

Current codes include `INVALID_PROFILE`, `INVALID_LIMIT`,
`UNSUPPORTED_RULE`, `FILE_NOT_FOUND`, `PATH_ESCAPE`,
`UNSUPPORTED_ENCODING`, `CFML_STRUCTURE_UNCERTAIN`,
`RESOURCE_LIMIT`, and `INTERNAL_ERROR`. New codes require tests and schema
documentation.
