# Code Slice consumer profile

Status: **Explicit native profile, source-observed; not a Hub protocol-conformance claim**.
Profile ID: `hub-consumer/agent-code-slice@0.1`.

This profile describes how a Hub consumer may invoke and interpret the registered
Code Slice package without changing its native contract. It applies only to the
registered identity `agent-code-slice@0.2.0` and executable `code-slice`. Other
package versions require a new profile review.

## Evidence boundary

The registered package identity was verified through the npm registry metadata
recorded in [VALIDATION.md](../../VALIDATION.md#code-slice-completion-and-publication-update).
The implementation contract was read from the clean source snapshot
`7f2969ff04540d43c12b13bc863e4a745209ff28` and its `docs/CLI_CONTRACT.md` and
`docs/JSON_SCHEMA.md`. The current sibling checkout may advance independently;
these observations must not be silently substituted for the registered artifact.
Exact packed-artifact behavior and Hub conformance remain separate evidence items.

## Invocation boundary

- Invoke the package's declared `code-slice` executable with an argument array and
  `--json`; do not invoke a shell or infer commands from tool output.
- Supported operations are `capabilities`, `outline`, `symbol`, `line`, and `range`.
- stdout must contain exactly one JSON document and stderr is diagnostic output.
- Core operations are read-only. `--root`, input, line/range, language, and output
  limits remain Code Slice's native options; the consumer must preserve them rather
  than inventing Hub-wide defaults.
- Do not retry, reinterpret, or convert a native failure into a successful result.

## Native output contract

Code Slice has two native envelope versions:

| Envelope | Meaning | Required interpretation |
| --- | --- | --- |
| `schemaVersion: "1.0"` | Core operation result | `ok: true` carries `result`; `ok: false` carries `error.code`. |
| `schemaVersion: "1.1"` with `operation: "cli"` | CLI argument-shape failure | `ok` must be `false`; read the stable `error.code`. |

Both versions include a `warnings` array. The native `error.code` is the primary
machine semantic; `recoverable`, `details`, candidates, and warning metadata are
additional evidence. The Hub consumer must preserve the native envelope rather than
wrapping it as the Hub target envelope.

## Consumer classification

The profile exposes three consumer classifications. These are profile-local labels,
not new Code Slice output fields and not Hub `status` values:

| Classification | Native condition | Consumer action |
| --- | --- | --- |
| `complete` | exit `0`, `ok: true`, and no pagination/truncation signal | The requested native operation completed within its returned scope. |
| `bounded_success` | exit `0`, `ok: true`, and `OUTLINE_TRUNCATED` or `result.page.hasMore: true` | Keep the returned page; follow `nextOffset` when full outline coverage is required. Do not call this a complete full-file result. |
| `error` | nonzero exit and `ok: false` with a stable `error.code` | Stop or apply the caller's explicit recovery rule. Never infer semantics from the number alone. |

A nonzero exit with `ok: true`, exit `0` with `ok: false`, missing/malformed JSON,
unsupported schema version, invalid envelope version/operation pairing, or a missing
stable error code is `protocol_error`. It must not be treated as an empty result or
silently mapped to the Hub `incomplete` status.

## Native exit reference

| Exit | Code Slice meaning | Profile rule |
| ---: | --- | --- |
| `0` | Successful operation | Accept only with `ok: true` and a valid result. |
| `1` | Unexpected internal failure | Read `error.code`; do not remap to Hub `error` automatically. |
| `2` | Invalid CLI arguments | Expect the v1.1 `operation: "cli"` envelope for CLI shape errors. |
| `3` | File/root/input error | Read the native error code; this is not Hub `incomplete` by number. |
| `4` | Unsupported/ambiguous language | Distinguish `LANGUAGE_UNSUPPORTED` and `LANGUAGE_AMBIGUOUS` in the envelope. |
| `5` | Parse/grammar error | Preserve the native error code and details. |
| `6` | Selector not found | Preserve `SYMBOL_NOT_FOUND` or the exact native code. |
| `7` | Selector ambiguous | Preserve `SYMBOL_AMBIGUOUS` and bounded candidates. |
| `8` | Output/resource limit | Preserve `OUTPUT_LIMIT_EXCEEDED`; do not assume data was truncated safely. |

The numeric exit is a coarse process result. The JSON `ok` field and stable error
code remain authoritative within this profile.

## Compatibility and limits

This profile does not promote `agent-code-slice` from its registered lifecycle,
certify the published artifact's exact behavior, or add a registry contract-profile
field. It does not migrate Code Slice to `schema_version`, `status`, `complete`, or
Hub `data`. The executable fixtures in
[`tests/code_slice_profile.test.js`](../../tests/code_slice_profile.test.js) cover
complete success, bounded outline success, CLI and operation errors, malformed or
unknown envelopes, and exit/status mismatch. Native tool consumers remain separate
from the target-envelope fixtures in `tests/hub_consumer.test.js`.
