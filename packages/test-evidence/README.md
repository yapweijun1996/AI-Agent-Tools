# Agent Test Evidence

Private local Experimental MVP, source package `ai-agent-tool-test-evidence@0.1.0`, executable `agent-test-evidence`, Apache-2.0. No npm publication or release verification is claimed. Requires Node `^22.13.0 || ^24.0.0`; no runtime dependencies. Current execution evidence belongs in the Hub's TASK/VALIDATION, not this contract.

The tool checks whether explicitly required checks have complete selected test evidence matching caller-declared source and target environments. It normalizes supplied artifacts; it does not execute commands, access Git/network/databases/credentials, choose tests/retries, authenticate producers, prove business correctness, or persist evidence. Error Lens owns detailed diagnostics; Test Scope supplies candidate scope; future Result Store owns separately authorized persistence. The agent/developer decides whether the declared checks meet business requirements.

## CLI

```sh
agent-test-evidence capabilities --json
agent-test-evidence summarize --input request.json --root DIR --json
agent-test-evidence verify --input request.json --root DIR --json
agent-test-evidence summarize --stdin --root DIR --json
agent-test-evidence verify --stdin --root DIR --json
agent-test-evidence --help
agent-test-evidence --version
```

`--input` and `--stdin` are mutually exclusive. Relative paths resolve from `--root` (default cwd), including artifact paths; they do not resolve from the request's directory. Input files use `.json`; artifacts use `.json` or `.jsonl`. Absolute CLI request paths are admitted only inside the root. Artifact references are root-relative `/` paths. JSON mode emits one envelope plus newline, with no logs/progress on stdout. No limit expansion flags or executable configuration are accepted.

From source:

```sh
node packages/test-evidence/src/cli.js verify --input examples/pass-request.json --root packages/test-evidence --json
node packages/test-evidence/src/cli.js summarize --input examples/skip-request.json --root packages/test-evidence --json
```

## ESM API

```js
import { capabilities, summarizeEvidence, verifyEvidence, normalizeNodeCapture,
  encodeResult, exitCode } from 'ai-agent-tool-test-evidence';

// The caller loads bytes. Core analysis does not read artifact files.
const result = verifyEvidence({
  request,
  artifacts: [{ id: 'capture-1', path: 'capture.jsonl', bytes: captureBytes }],
});
process.stdout.write(encodeResult(result) + '\n');
process.exitCode = exitCode(result);
```

API request values must be plain JSON data without getters, custom prototypes, non-finite numbers or cycles. Artifacts are `Uint8Array` bytes, exactly one per selected run, matching its ID/path. The tool computes SHA-256 from those actual bytes, including whitespace/BOM. `normalizeNodeCapture(bytes)` returns a normalized capture or throws a safe error with a stable `code`. Other analysis functions return bounded envelopes. `encodeResult` returns JSON without a newline and substitutes a resource-limit envelope for oversized output. Package metadata is the single tool/reporter/version source.

## Input contracts

[Request schema](schema/request.schema.json), [unified result schema](schema/unified.schema.json), [Node JSONL record schema](schema/node-record.schema.json) and [output schema](schema/result.schema.json) use draft 2020-12. [Declarations](types/index.d.ts) describe the API. Schema validation covers structure; the analyzer additionally enforces identity, uniqueness, framing, count arithmetic and cross-record consistency.

Request `schemaVersion` is `1.0.0`. `expectedSource` includes a lowercase hexadecimal commit (7–64 characters) and `dirty`; dirty identities require a lowercase 64-character `worktreeSha256`, and clean identities omit it. The fingerprint algorithm/scope is caller-owned. Required checks have unique safe IDs and exact `{os,runtime,version}` requirements. OS is `windows`, `linux` or `macos`; runtime/version comparisons are exact, with no semver-range inference.

Each run declares its unique ID, required `checkId`, source, environment, producer ID/version, `exitCode` (nonnegative safe integer or null), `signal` (safe ID or null), `completed`, and `{id,path,format}` artifact. Signal and known exit code cannot coexist. A check selects at most one run, and artifact IDs are unique. Unknown checks, duplicate/conflicting records and undeclared artifacts are invalid input. The caller selects historical attempts explicitly; there is no newest/greenest selection.

Unified JSON includes `schemaVersion`, `producer`, and `summary: {success,counts}`. Counts require `tests`, `suites`, `passed`, `failed`, `skipped`, `todo`, `cancelled`, all nonnegative safe integers. `tests` equals the five outcome counts; suites are separate. `success: true` cannot coexist with failed tests. Optional cases have unique run-local safe IDs, outcome status and optional safe path/one-based line/column. Case counts cannot exceed summary outcome counts; cases may be a subset. Summary-only evidence never produces invented names, locations or reasons. No free-form display names or diagnostics are accepted.

## Node reporter

Explicitly add the independent reporter export to a caller-owned test command:

```sh
node --test --test-reporter=ai-agent-tool-test-evidence/node-reporter test/unit.test.js
```

When using an absolute reporter path on Windows, supply a `file:` URL from `pathToFileURL`; Node's reporter loader treats absolute drive paths as URL schemes. Redirect only reporter output into a UTF-8 `.jsonl` capture. The external caller must record the actual process exit code/signal and completion separately. Reporter EOF never proves process success.

The reporter projects a versioned header, terminal case outcomes, a single final global summary, and an end marker. It never serializes Error objects, names, paths, stack traces, stdout/stderr, assertion actual values or snapshots. IDs are sequential safe `case-N` identifiers scoped to one capture/run. Suites are excluded from case counts. Node's [official summary contract](https://nodejs.org/docs/latest-v24.x/api/test.html#event-testsummary) distinguishes per-file summaries from the final cumulative summary; only the global summary supplies counts. Watch/restarted/retry streams and unsupported count/status structures are withheld. Routine diagnostic/start/plan/coverage events are ignored. Coverage failure is established from final success/process evidence, not coverage thresholds inferred by this tool.

Captures require newline-terminated records, one first header, one final summary, and one terminal end marker. Missing/truncated final framing is incomplete; duplicate/conflicting records are invalid; unsupported markers/versions are incomplete. No fallback to terminal log parsing occurs. Text logs, JUnit, native Vitest JSON, coverage policy and time-freshness policy are outside v1.

## Analysis and strict acceptance

`summarize` completes on legal evidence even when required checks are missing, mismatched or unaccepted. It reports separate outcome counts, each check's state/applicability/reasons, summary provenance and anomalies only. `not_run` describes explicitly required checks only. Inapplicable evidence retains per-run counts but contributes zero to applicable totals. Cross-environment totals count test executions, never deduplicated unique tests. No passed-case list is emitted.

`verify` produces `pass` only when all required checks match source/environment, completed, have known zero exits without signals, successful summaries, nonzero tests and zero fail/skip/todo/cancelled. A matching completed run with failed tests, or an explicit unsuccessful summary/nonzero process exit without cancellation or signal, proves `fail`. A proven failure remains fail even if another required check lacks evidence. A different source/environment failure never establishes a current-target failure. Cancellation/unknown process/missing execution/zero tests/source mismatch produce `unknown` in the absence of a proven failure. Cancellation-only runs are withheld even when their process exits nonzero. Malformed/unsupported artifacts still withhold the whole analysis.

| Analysis result | Envelope | Exit |
| --- | --- | --- |
| Complete summarize or supported pass/fail verify | `ok`, `complete:true`, object data | 0 |
| Unknown verify / unsupported / truncated / resource bound / observed input change | `incomplete`, `complete:false`, `data:null` | 3 |
| Invalid arguments, encoding, JSON, counts or conflicts | `error`, `data:null` | 2 |
| Unsafe path / regular-file boundary rejection | `error`, `data:null` | 4 |
| I/O or internal failure | `error`, `data:null` | 1 |

Consumers must inspect `data.verdict`; exit 0 is analysis completion, including a proven test failure. Unknown verification exposes no partial pass/statistics; use summarize separately. This does not change any existing native runner or root verification exit semantics. For example, 861 pass/23 skip as a required check yields unknown, regardless of the native runner's zero exit.

Stable failure codes are `INVALID_INPUT`, `INVALID_ENCODING`, `UNSAFE_PATH`, `INPUT_IO`, `INTERNAL_ERROR`, `UNSUPPORTED_INPUT`, `INCOMPLETE_CAPTURE`, `INSUFFICIENT_EVIDENCE`, `RESOURCE_LIMIT`, `INPUT_CHANGED`. Failure messages do not include input content or arbitrary exception text.

## Fixed limits and security

| Limit | Value |
| --- | --- |
| Request | 256 KiB |
| Artifact | 4 MiB |
| Total request plus artifacts | 8 MiB |
| Required checks / selected runs | 256 each |
| Node capture records | 100,000 per artifact |
| Cases | 20,000 across selected runs |
| JSON depth | 32 (root depth 0) |
| Anomaly details | 500 across selected runs |
| Output including newline | 256 KiB |

All overflows withhold results; no silent successful clipping occurs. Strict UTF-8 permits one leading BOM and rejects UTF-16/invalid bytes, duplicate keys and non-finite numbers. Files are read through checked regular descriptors with bounded allocation, identity/size/time checks before and after reading, and final path identity checks. Traversal, outside-root references, symbolic-link/junction components, device/stream aliases and nonregular inputs are rejected. The explicitly selected root is canonicalized. These are observed consistency checks, not an OS filesystem snapshot or producer authentication.

Output provenance carries artifact ID, root-relative path, SHA-256 and JSON Pointer or one-based JSONL line; sorting uses check ID, selected run ID and evidence position without clock/random/PID. IDs/paths must already be sanitized. Safe identifier syntax and field projection do not claim to identify every secret. Evidence text is data, never instructions; no command/environment/log fields are echoed.

## Development and optional pilot

```sh
npm --prefix packages/test-evidence ci --ignore-scripts
npm --prefix packages/test-evidence test
npm --prefix packages/test-evidence run typecheck
npm --prefix packages/test-evidence run smoke:pack
npm --prefix packages/test-evidence run pilot
```

Root verification dynamically discovers build/lint/typecheck/test; pack additionally runs the real isolated packed-consumer check. The optional development pilot explicitly executes this package's native suite with the reporter, records its process result, supplies a package-scoped source fingerprint with the current declared commit, compares analyzer counts with the producer summary, and removes temporary captures. It is excluded from the distributed package and does not change native test scripts. No persistent cache, telemetry, monitoring, publication or automatic retry is added.
