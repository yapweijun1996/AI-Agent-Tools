# Change Impact consumer profile

Status: **Explicit native profile, source-observed; not a Hub protocol-conformance claim**.
Profile ID: `hub-consumer/agent-change-impact@0.1`.

This profile describes how a Hub consumer may invoke and interpret the native
`agent-change-impact` CLI. It applies to package `agent-change-impact@0.1.1`,
executable `agent-impact`, and the native schema identifier `0.1-draft`. Other
versions or providers require a new profile review.

## Evidence boundary

The Hub registry records the published `agent-change-impact@0.1.1` identity. The
source contract was observed from the repository's `0.1.1` line at the immutable
source snapshot `b67c87e277af3a616ec64ff8c1f34992f71aed88`; the sibling checkout
also contains uncommitted changes that are excluded from this profile. Existing Hub
release evidence records publication and clean-install checks separately. This
profile does not promote the tool or replace its repository-owned release evidence.

## Invocation and safety boundary

- Invoke `agent-impact` with an argument array and `--json`; do not invoke a shell
  or infer commands from output.
- Supported operations are `capabilities`, `file`, `symbol`, and `changed`; the
  package declares a Node.js `22` or newer runtime floor.
- `file` and `symbol` analyze one selected TypeScript/JavaScript/TSX project;
  `changed` requires `--base` and exactly one of `--head` or `--worktree`.
- stdout contains exactly one JSON document and stderr contains diagnostics.
- Analysis is local and read-only. The tool may read bounded working-tree/Git
  snapshots and permitted TypeScript metadata, but does not execute repository
  code, tests, package scripts, external diff helpers, or a network service.
- Declared candidate tests are evidence classifications, not proof of coverage or
  authorization to execute tests.

## Native output contract

The native result identifier is `schemaVersion: "0.1-draft"`. A successful envelope
has `ok: true`, an operation, `unresolved`, `warnings`, and operation-specific
fields. `capabilities` reports the supported operation set without an analysis
object. Analysis operations include `analysis.status`:

| Native analysis status | Meaning | Required interpretation |
| --- | --- | --- |
| `complete` | The selected bounded static scope finished | Use the returned graph and impact facts within the declared project and limits. |
| `partial` | The tool returned usable observations but a boundary, unresolved target, diagnostic, or limit prevents full scope coverage | Preserve the returned facts, `analysis.limitations`, `analysis.stopReasons`, and `unresolved`; do not treat the result as full coverage. |

A failed envelope has `ok: false`, a stable `error.code`, an error message, and
`warnings`. Error fields are operation-independent; do not fabricate an empty impact
result from them. `OUTPUT_LIMIT_EXCEEDED`, provider diagnostics, unresolved module
observations, and graph/snapshot limits remain native evidence.

## Consumer classification and exits

These are profile-local classifications, not Hub `status` values:

| Classification | Native condition | Consumer action |
| --- | --- | --- |
| `complete` | exit `0`, `ok: true`, `analysis.status: "complete"` | Use the bounded complete analysis within its explicit project and limits. |
| `partial_success` | exit `0`, `ok: true`, `analysis.status: "partial"` | Preserve and report the partial evidence; inspect stop reasons before relying on it. This is still native success, not a process error. |
| `error` | exit `1` or `2`, `ok: false`, stable `error.code` | Correct the request/context or report the operation/output failure; never convert it to an empty result. |

The native numeric exit is deliberately coarse:

| Exit | Native meaning | Profile rule |
| ---: | --- | --- |
| `0` | Usable complete or partial result | Require `ok: true`; inspect `analysis.status`. |
| `1` | Operation or output failure | Require `ok: false` and read `error.code`. |
| `2` | Invalid invocation | Require `ok: false` and read `error.code`; do not infer partial analysis. |

A nonzero exit with `ok: true`, exit `0` with `ok: false`, unsupported schema,
missing operation fields for a success, missing stable error code, malformed JSON, or
missing output is `protocol_error`. It must not be silently mapped to Hub `ok`,
`incomplete`, or an empty impact set.

## Compatibility and limits

This profile does not map native `analysis.status: "partial"` to the Hub target
`incomplete` status, because Change Impact intentionally returns usable partial
observations with top-level `ok: true`. It does not rename `schemaVersion`,
`analysis`, `impact`, `unresolved`, `warnings`, or native error fields. AIT's
`ait-result/v1` wrapper may preserve this native output but does not normalize its
semantics.

The executable fixtures in
[`tests/change_impact_profile.test.js`](../../tests/change_impact_profile.test.js)
cover complete and partial usable results, invalid invocation, output failure,
malformed/unknown output, and exit/status mismatch. They are contract fixtures, not
an independent release or cross-platform conformance claim.
