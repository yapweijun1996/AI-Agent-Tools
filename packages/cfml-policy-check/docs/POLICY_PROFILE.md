# Policy Profile

Status: `Implemented local format`
Last reconciled: 2026-09-16

Profiles customize the checker for one project. The current parser validates the
format described by `schema/policy-profile-v1.schema.json`.

## Example

```json
{
  "schema_version": "1.0.0",
  "profile": {
    "id": "example-cfml-policy",
    "version": "0.1.0"
  },
  "rules": [
    {
      "id": "html.table.requires-colgroup",
      "enabled": true,
      "severity": "error"
    },
    {
      "id": "html.table.requires-col",
      "enabled": true,
      "severity": "error"
    }
  ]
}
```

## Requirements

- JSON only.
- Explicit profile ID and version.
- Unique rule IDs.
- Known rule IDs and validated options.
- Explicit `enabled` and `severity` fields.
- No executable fields, module paths, commands, network URLs, or template code.
- Deterministic rule order after validation.
- Profile identity included in result metadata.

The local implementation currently supports the two table rule IDs only. Generic
required-element and required-attribute rules remain planned and are not
accepted by the parser.

## Globe3 approved profile

`profiles/globe3-legacy-printform.json` is a sanitized, owner-approved profile
for the legacy Globe3 PrintForm family. Its fixture set uses stable layout-region
names such as `header`, `doc_info`, `rowN`, and `footer`, plus a nested detail
table, without copying business data or production source.

The approved profile is based on the KB-MCP reference
`0efbd0b8-9c27-411f-ab25-e608e83abae7:5944b36b-8639-451a-8184-6dc5aab86703`,
which records the verified table-based legacy PrintForm compatibility pattern.
The owner decision recorded on 2026-09-16 requires both direct `<colgroup>` and
direct `<col>` rules for this family. The profile is `Verified locally` after
the sanitized fixture tests; it is not `Released`. The synchronized project
evidence record is KB-MCP item
`3e631a61-d63d-4c25-aaac-cd1557b063f2:3f3cdb8a-5751-478c-9f4b-24ec092235b6`.

## Lifecycle

Tool versions and profile versions are independent. A rule change must update
the profile version and fixtures. The checked-in example is sanitized and
generic. The Globe3 profile is also sanitized and owner-approved for its
bounded static policy scope, but is not a runtime or release claim.

## Security

Profiles are data, not programs. Invalid JSON, duplicate rules, unknown rules,
unsupported fields, and unsupported severities are rejected without source
mutation.
