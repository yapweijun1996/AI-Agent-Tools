# Project Profile consumer profile

Status: **Explicit native profile, source-observed; not a Hub protocol-conformance claim**.
Profile ID: `hub-consumer/agent-project-profile@0.1`.

This profile describes how a Hub consumer may invoke and interpret the native
`agent-project-profile` CLI without changing its output contract. It applies to the
V1 source contract `0.1.2`, executable `agent-project-profile`, and JSON schema
`1.0`. Other source or package versions require a new profile review.

## Evidence boundary

The Hub registry currently records `agent-project-profile@0.1.1`. The corrected
source snapshot observed at commit
`c25043856cb4984e30d0a61672213e51b6c3758d` declares `0.1.2`, while npm `latest`
was observed as `0.1.1`. A prior audit recorded a packaged executable defect; the
current exact-artifact re-audit did not reproduce that symptom on this host. This
profile therefore records the native source contract without silently certifying
cross-environment artifact behavior. A consumer must keep package identity, source
version, and published artifact evidence separate; do not treat the corrected source
as proof that `0.1.2` is published.

## Invocation and safety boundary

- Invoke the declared `agent-project-profile` executable with an argument array and
  `--format json`; do not invoke a shell or infer commands from profile output.
- Supply exactly one caller-selected inspection root. The tool does not switch to a
  parent Git root or inspect outside that boundary.
- Supported presentation options are `--format json`, optional `--pretty`, and
  `--strict`. The consumer must not use text output as the machine contract.
- stdout contains the profile JSON; stderr contains bounded diagnostics. The tool
  itself does not create reports, modify the target, install dependencies, access
  the network, invoke Git/package managers, or execute discovered project commands.
- Declared commands have `execution: "not_run"`; discovery is not authorization or
  proof that a command succeeds or is safe.

## Native output contract

The native profile is a single `schemaVersion: "1.0"` object with required top-level
fields including `status`, `coverage`, evidence-backed facts, and structured
`warnings`. The native status values are:

| Status | Meaning | Required interpretation |
| --- | --- | --- |
| `complete` | Supported inspection completed within scope | Use the facts; `coverage.status` must be `complete` for the normal exit-0 classification. |
| `partial` | Some requested categories or evidence are incomplete/conflicting | Preserve the returned facts and diagnostics; never treat absent fields/arrays as proof of absence. |
| `unsupported` | A detected ecosystem is outside first-class V1 support | Preserve the bounded inventory, but do not claim commands, runtimes, or support that were not inferred. |
| `error` | Fatal inspection failure | Treat the profile as unusable for downstream facts; retain diagnostics for reporting. |

`coverage` is a separate completeness axis. Its category states and `truncated`
flags explain which facts are complete, partial, or not applicable. Unknown scalar
facts use `null`; evidence references must resolve within the returned `evidence`
array. The consumer must preserve `warnings[].code` and `coverage` rather than
reducing the result to a boolean.

## Consumer classification and exits

These are profile-local classifications, not Hub `status` values:

| Classification | Native condition | Consumer action |
| --- | --- | --- |
| `complete` | exit `0`, `status: "complete"`, `coverage.status: "complete"` | Facts are usable within the declared scan scope; commands remain declarations, not execution evidence. |
| `partial` | exit `2`, `status: "partial"`, `coverage.status: "partial"` | Preserve facts and diagnostics, but require the caller to inspect affected coverage before relying on them. |
| `unsupported` | exit `2`, `status: "unsupported"` | Preserve the bounded sentinel/inventory facts; do not treat unsupported as complete first-class support. |
| `error` | exit `1`, `status: "error"` | Stop fact consumption or use only the explicit diagnostic. |
| `strict_rejected` | `--strict` was supplied, exit `2`, and status is otherwise `complete` with warning/error diagnostics | The scan facts may be structurally complete, but the caller's strict policy rejected diagnostics; do not silently downgrade it to ordinary partial. |

Exit `2` is intentionally overloaded by the native contract. The JSON `status`,
`coverage`, warning severity/codes, and whether `--strict` was requested are the
semantic authority; the number alone is not enough. A status/exit mismatch,
unsupported schema, missing required fields, malformed JSON, or missing warning or
coverage data is `protocol_error` and must not become a successful or empty profile.

## Compatibility and limits

This profile does not map Project Profile's `partial` or `unsupported` output to the
Hub target envelope's `incomplete` status, and it does not rename `schemaVersion`,
`status`, `coverage`, or the top-level fact fields. AIT's `ait-result/v1` wrapper may
preserve this native output, but it does not normalize its semantics.

The executable fixtures in
[`tests/project_profile_profile.test.js`](../../tests/project_profile_profile.test.js)
cover complete, partial, unsupported, fatal error, strict-mode rejection, malformed
or unknown profiles, and status/coverage mismatch. They are contract fixtures, not
verification of cross-environment artifact behavior or a promotion of the Hub
lifecycle.
