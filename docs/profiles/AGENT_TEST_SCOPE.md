# Test Scope consumer profile

Profile ID: `hub-consumer/agent-test-scope@0.1`.

This is a Hub-owned consumer profile for the native `agent-test-scope` CLI. It
applies only to package `agent-test-scope@0.1.1`, executable `agent-test-scope`,
and the native result schema version `1`.

## Native boundary

- Operations are `capabilities`, `discover`, `plan`, and `explain`.
- The required input root is explicit; changed paths are required for `plan` and
  `explain`.
- The tool reads repository files as data and never runs tests, builds, package
  scripts, installers, project code, network calls, or LLM calls.
- Commands in results are recommendations with `executed: false`; they are not
  execution instructions for AIT.
- Supported source types are JavaScript, TypeScript, JSX, and TSX. Framework
  discovery is bounded to Vitest, Jest, and the Node.js native test runner.

## Native result and exit semantics

The native JSON result is one object with:

- `schemaVersion: "1"`;
- `status`: `complete`, `partial`, or `error`;
- object `data`;
- array `diagnostics`;
- `truncation` with boolean `truncated` and string-array `reasons`;
- object `stats`.

`complete` means planning completed within the evidence boundary, not that tests
passed. `partial` means useful bounded evidence exists with a limitation. The
CLI returns exit `0` for `complete` and `partial`, exit `1` for an engine
`error`, and exit `2` for invalid CLI arguments.

The profile preserves this distinction:

| Native condition | Exit | Profile classification |
| --- | ---: | --- |
| `status: complete` | 0 | `complete` |
| `status: partial` | 0 | `partial` |
| `status: error` | 1 or 2 | `error` |
| malformed/unknown/status-exit mismatch | any | `protocol_error` |

The native `status` remains authoritative. AIT does not convert `complete` into
Hub `complete`, expose a recommendation as executed work, or withhold partial
native data.

## AIT application

When the exact package name, version, executable, and registry tool ID match the
machine-readable profile catalog, AIT validates the envelope and adds optional
`meta.profile` classification. A missing exact match remains native passthrough.
Profile validation is read-only and bounded by AIT's existing output limit.

## Evidence and non-goals

The published `0.1.1` artifact was audited on 2026-09-15: 88 files,
shasum `4830019255560757357aace1dbabadcab0a46837`, and integrity
`sha512-nibOfUlC3nZDg+iAC9biwXXOB7hv5sOqp+mg61HNjkkx7CbeE5smiVIITkfE2SgrkavM9RBknFlHn8PyYMcb4g==`.
The package README, SPEC, result schema, and CLI were inspected. The source
repository evidence is public commit `e3c4593`; the profile does not promote
lifecycle status or claim cross-platform conformance.

This profile does not execute recommendations, select tests itself, infer
semantic correctness, or create a Hub compatibility adapter. See the independent
package contract for the authoritative native behavior.
