# JSON Contract

Status: `Implemented local contract`
Last reconciled: 2026-09-16

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

## Finding fields

Required fields are `rule_id`, `severity`, `message`, `line`, and `column`.
Optional fields may include a root-relative `path`, end locations, related
information, and a remediation hint. Current findings use one-based line and
column positions and no absolute paths.

## Error codes

Current codes include `INVALID_PROFILE`, `INVALID_LIMIT`,
`UNSUPPORTED_RULE`, `FILE_NOT_FOUND`, `PATH_ESCAPE`,
`UNSUPPORTED_ENCODING`, `CFML_STRUCTURE_UNCERTAIN`,
`RESOURCE_LIMIT`, and `INTERNAL_ERROR`. New codes require tests and schema
documentation.
