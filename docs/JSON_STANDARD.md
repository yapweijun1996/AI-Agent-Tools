# JSON standard

This document owns the target result envelope, distinct from the registry schema in [Architecture](ARCHITECTURE.md#registry-contract). Initial envelope `schema_version` is `1.0.0`; implementation adoption must be verified per tool release.

Code Slice's native `schemaVersion`/`ok`/`result` envelope and Change Impact's
`0.1-draft` types are not implementations of this envelope. No automatic mapping
or contract-profile field exists in the registry. [DESIGN.md](../DESIGN.md) records
the unresolved compatibility decision; preserve installed native contracts meanwhile.

## Envelope

All fields below are required. No tool-specific result fields belong at the envelope root.

| Field | Contract |
| --- | --- |
| `schema_version` | Semantic version of this envelope contract. |
| `tool` | `{ "id": "...", "version": "..." }`; registered ID and exact executing package version. |
| `status` | `ok`, `incomplete`, or `error`; lowercase and distinct from registry lifecycle. |
| `complete` | `true` only when the supported requested analysis completed within its declared scope. |
| `data` | Tool-specific object for `ok`; `null` for `incomplete` or `error` in version 1. |
| `errors` | Array of `{ "code": "...", "message": "..." }`; empty for `ok`, nonempty otherwise. Codes are stable machine identifiers; messages are diagnostic text. |
| `warnings` | Array of the same code/message objects; advisory only, never a substitute for an incomplete result. |
| `meta` | Object containing `scope` (explicit bounded analysis description) and `limits` (object of effective tool-specific numeric caps). |

`status: "ok"` requires `complete: true`. Other statuses require `complete: false`. Partial results are intentionally withheld in version 1 so a consumer cannot mistake them for safe evidence. A completed, narrowly scoped observation is allowed; its scope must be explicit.

The following is a fictional protocol fixture, not a registered tool or release:

```json
{
  "schema_version": "1.0.0",
  "tool": { "id": "example-tool", "version": "0.1.0" },
  "status": "incomplete",
  "complete": false,
  "data": null,
  "errors": [
    { "code": "UNSUPPORTED_INPUT", "message": "The selected format is unsupported." }
  ],
  "warnings": [],
  "meta": {
    "scope": "One explicitly selected local file",
    "limits": { "max_input_bytes": 1048576, "max_output_bytes": 65536 }
  }
}
```

## Data contracts

Each tool repository must publish and test its `data` schema, stable error codes, numeric limit names/units, ordering, empty-result semantics, and supported evidence locators. Use UTF-8 strings, finite JSON numbers, and explicit `null` where the schema allows unknown values. Do not substitute guessed values for unknown data.

For source evidence, prefer root-relative paths with `/` separators and document locator conventions. Source line numbers are one-based inclusive unless a tool explicitly defines a different locator type; byte offsets must specify encoding and end exclusivity. Do not expose absolute user paths or source contents unnecessarily.

Stable ordering and omission of volatile timestamps/random IDs make comparisons reproducible. Any variable metadata must be optional, documented, and excluded from determinism comparisons. Reports must remain valid JSON under configured output caps, including failure cases.

## Consumer rules

Validate the envelope and supported schema major version before consuming `data`. Accept documented optional additions within a major version, but reject unknown statuses and incompatible required fields. Verify process exit/status consistency using [CLI standard](CLI_STANDARD.md#exit-codes). Never treat `incomplete`, missing output, or malformed JSON as an empty successful result.

Tool-specific `data` breaking changes require a package major bump; envelope breaking changes also require an envelope schema major bump. Registry schema, envelope schema, Hub standards, and package versions are separate contracts even when their initial numbers coincide.
