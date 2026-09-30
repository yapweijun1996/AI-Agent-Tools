# AIT Tool Contract

Status: `Local contract implemented; registration pending`
Last reconciled: 2026-09-16

## Purpose and boundary

This document defines the local contract that an AIT or AI-agent adapter can
invoke. It is not proof of AIT registration, remote tool availability, public
release, or consumer compatibility.

The checked-in manifest is [ait-tool.manifest.json](../ait-tool.manifest.json).
Its `registration_status` is `local-contract-only`.

## Invocation

```text
agent-cfml-policy-check ait
```

The process reads one JSON object from stdin and writes one JSON result plus a
newline to stdout.

## Request shape

| Field | Requirement |
| --- | --- |
| `operation` | Required; `capabilities` or `check` |
| `root` | Required for check; explicit root directory |
| `file` | Required for check; root-relative `.cfm` or `.cfc` path |
| `profile` | Required for check; root-relative local JSON profile |
| `limits` | Optional bounded positive-integer limit map |
| `pretty` | Optional local-output indentation; default false |

Example:

```json
{
  "operation": "check",
  "root": ".",
  "file": "test/fixtures/pass.cfm",
  "profile": "profiles/example.json"
}
```

## Response shape

The response uses [result-v1.schema.json](../schema/result-v1.schema.json) with
`schema_version` `1.0.0`, tool `agent-cfml-policy-check`, status
`ok`/`incomplete`/`error`, and root-relative metadata. A violation is status
`ok` with exit code 0; dynamic or malformed static evidence is
`incomplete` with exit code 3.

## Safety declaration

- runtime: Node.js, package target `>=20`;
- safety level: read-only;
- network required: false;
- source/profile writes: false;
- approval: not required for the local process;
- registration: not performed.

## Registration prerequisites

Before any registry registration or public release, verify the exact AIT
registration API, package artifact contents, version identity, maintainer,
license, platform matrix, consumer error semantics, and isolation policy.
