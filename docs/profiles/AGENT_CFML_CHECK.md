# CFML Check consumer profile

Profile ID: `hub-consumer/agent-cfml-check@0.1`.

This Hub-owned consumer profile applies only to package
`agent-cfml-check@0.1.1` and executable `agent-cfml-check`. The independent
repository owns the native checker and its `agent-cfml-check-result-v1` schema.

## Native boundary

- Operations are `capabilities` and `check`.
- `check` requires one explicit root and one `.cfm` or `.cfc` file.
- The checker reads one regular UTF-8 source file as data, never executes CFML
  or JavaScript, does not follow includes, uses no network, and does not modify
  the source tree.
- The supported structural profile is `cfml-structure-v1`; unknown/custom or
  unsupported constructs are not silently treated as valid.

## Native result and exit semantics

The native envelope has:

- `schema_version: "1.0.0"`;
- `tool.id: "agent-cfml-check"` and a semantic `tool.version`;
- `status`: `ok`, `incomplete`, or `error`;
- `complete`, `data`, `errors`, `warnings`, and `meta`.

An `ok` result has `complete: true`, no errors, non-null data, and exit `0`.
Structural violations are still a completed successful check: `data.verdict` is
`violations` and the process exits `0`. `capabilities` is also an `ok` result.
An `incomplete` result has `complete: false`, null data, bounded errors, and
exit `3`. An input error exits `2`, an explicit-root/access-policy error exits
`4`, and an internal/I/O error exits `1`; all are `error` with null data.

The profile preserves native authority:

| Native condition | Exit | Profile classification |
| --- | ---: | --- |
| `status: ok`, `capabilities` operation | 0 | `capabilities` |
| `status: ok`, completed check, including violations | 0 | `complete` |
| `status: incomplete` | 3 | `incomplete` |
| `status: error` | 1, 2, or 4 | `error` |
| malformed or inconsistent envelope | any | `protocol_error` |

AIT does not convert structural violations into execution failures or map
`incomplete` to the Hub target status.

## AIT application

When the exact registry ID, package name, package version, and executable match
the machine-readable profile catalog, AIT validates the bounded native envelope
and adds optional `meta.profile` classification. A missing exact match remains
native passthrough. Profile validation never executes source content or fetches
engine documentation.

## Evidence and non-goals

The published `0.1.1` artifact was audited on 2026-09-15: 25 files, unpacked
size 60,032 bytes, shasum `a86b3e18c3c156720ed6b34df176fbb03d0b1926`, and
integrity
`sha512-A9xVKvQpQJ4mpvYdPjrDlhogq6WVlVTMMLCFkLjiy6jzlxD8kGzZ6AlHkWAbLlL4aF6X2C3eIZ+yTOWh4kAOzg==`.
The package schema, README, and CLI were inspected. Artifact smoke checks
covered capabilities, a valid check, and bounded unsupported syntax.

This profile does not claim full CFML grammar, Adobe ColdFusion compatibility,
Lucee compatibility across versions, Hub target-envelope conformance, or engine
certification. See the independent package contract for authoritative details.
