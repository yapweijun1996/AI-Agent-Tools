# Agent Runtime Trace

Registry ID: `agent-runtime-trace`. Lifecycle: `Planned`. Design revision:
2026-09-07, draft for independent implementation. Repository, maintainer, npm
identity, executable name, and release version are unconfirmed. Runtime Trace V1
is a read-only analyzer of explicit event artifacts, with proposed contracts below.

## Problem and first vertical slice

A browser navigation timeout can coexist with a successful business write.
EXP-03 in the [expansion review](../TOOL_EXPANSION.md) identifies the historical
Globe3 Sales Quotation case: a single Save As Draft operation timed out in the
browser while independent exact-record readback confirmed the draft. This review
retrieved that historical KB record; it did not repeat the transaction.

V1 groups supplied events by an explicitly selected operation and reports which
stages have evidence. It must preserve both navigation timeout and independent
readback success. With missing readback, business outcome stays unknown. It never
automatically retries a write, launches a browser/runner, queries a database,
attaches an Inspector, instruments a service, or operates as an Agent Runtime.

## Operations and scope

| Proposed operation | Required input | Question answered |
| --- | --- | --- |
| `summarize` | Allowed root, explicit bounded event files/manifest, namespace, operation ID, observation cutoff, profile | What do all supplied events establish within this snapshot? |
| `verify` | Same inputs plus supported business-predicate profile and target identity/revision binding | Does this evidence establish the requested business outcome? |

The executable name is unconfirmed. Inputs are strict UTF-8 JSON arrays or a
versioned NDJSON event file with a manifest. NDJSON is an input artifact format,
not a change to the Hub's single-JSON stdout contract. File enumeration is explicit;
no recursive log discovery or network fetch. Reject root/symlink escape, invalid
JSON, duplicate keys, invalid encoding, and unsupported schemas.

The manifest identifies selected files and digests, declared producers, capture
window, known dropped-event counts, source-completeness assertions, and a safe
reference to the event/predicate profile. Input is an immutable snapshot; follow-up
analysis supplies a new snapshot and cutoff. Reading is not live monitoring.

## Event contract

The proposed input contract ID is `operation-events-v1`, not a package version.

| Field | Meaning |
| --- | --- |
| `event_id` | Stable producer event identity; duplicate IDs with different payloads are a conflict |
| `namespace` | Caller-selected isolation scope; never an authentication grant |
| `operation_id`, `attempt_id` | Logical business operation and one explicit execution attempt |
| `producer`, `producer_instance`, `sequence` | Declared source, restart-distinguishing identity and monotonic sequence within that instance |
| `kind` | Supported event kind from the table below |
| `occurred_at`, `observed_at` | Producer time and collector time in UTC, nullable if unavailable |
| `caused_by` | Explicit event ID references; missing parent is recorded, never guessed |
| `target_ref`, `target_revision` | Safe exact business target/revision, nullable when not yet known |
| `evidence_ref` | Supplied artifact digest plus line/byte locator; no arbitrary URL execution |
| `details` | Kind-specific allowlisted data; no unbounded request bodies, credentials, or scripts |

Optional `trace_id`, `span_id`, and `parent_span_id` preserve existing tracing
identifiers. [OpenTelemetry traces](https://opentelemetry.io/docs/concepts/signals/traces/)
describe span relationships and context propagation; reusing that instrumentation
is a candidate integration path, not a dependency or a claim of current support.
Do not equate a trace ID, PID, URL, timestamp, or document title with a unique
business operation. Producer restarts need a new instance ID; retries need distinct
attempt IDs while retaining explicit linkage to the logical operation.

| Kind | Evidence it records | What it does not establish |
| --- | --- | --- |
| `request_sent` | Caller dispatched the specific request/attempt | Backend receipt or commit |
| `backend_accepted` | Named backend handler accepted that attempt | Successful execution or durable storage |
| `execution_started` | Owning component started work | Completion |
| `execution_finished` | Component outcome, with explicit commit assertion if its profile defines one | Independent readback or correctness of another component |
| `transport_timeout` | Caller stopped receiving/waiting within a timeout | Rollback, cancellation, or failed business write |
| `transport_failed` | Explicit transport error | Final business state |
| `process_exited` | Named process exit and code | Business commit or readback success |
| `readback_verified` | Approved adapter's exact-target predicate matches at a stated revision/cutoff | Whole-workflow correctness beyond that predicate |
| `readback_mismatch` | Approved adapter read exact target but predicate differs | Permanent failure under eventual consistency unless the profile establishes finality |
| `readback_unavailable` | Read attempt failed or has insufficient target/snapshot evidence | Absence of the written record |

Example scenario is described without fabricated real transaction identifiers:
one request event, browser timeout event, and independent exact-target readback
event belong to one operation. Missing acceptance/execution events stay missing;
the successful readback must not manufacture those earlier stages.

## Correlation and business rules

Group only by the selected namespace/operation ID and explicit attempt/causal
links. Deduplicate identical event IDs; conflicting payloads or invalid causal
cycles make the analysis incomplete. Keep unlinked events visibly unmatched.
Do not silently combine retries, tenants, reused PIDs, or similarly named records.

Use explicit causal relationships and per-producer sequence for ordering. A
deterministic topological display uses `(producer, producer_instance, sequence,
event_id)` to break ties. Cross-producer timestamps do not prove execution order;
clock skew is reported. Missing events may reflect sampling or dropped buffers,
not a stage that failed to execute. Late events require a new report snapshot.

The caller's declarative profile maps known producer identities to allowed kinds
and defines the readback predicate. For the draft-save slice, require namespace,
exact returned record identity, correlation to the intended operation/write token,
expected Draft state, supplied-field checks, and read revision or a documented
freshness/consistency guarantee. Document number alone can match a preexisting
record and is insufficient. Retain evidence references for every supplied-field
comparison; avoid including sensitive field values in the trace report.

Producer labels in an untrusted file do not authenticate its source. The adapter
and manifest must supply provenance that the caller has approved. V1 checks
contract/provenance bindings, not a universal cryptographic trust chain. An
unsupported profile, untrusted producer, missing target correlation, unknown
readback freshness, or incompatible scope makes business verification incomplete.
Profiles are data only; application code owns execution of the business predicate
and database read. There is no eval, SQL runner, or shell callback in Trace V1.

## Output and state decisions

The common [JSON](../JSON_STANDARD.md) and [CLI](../CLI_STANDARD.md) contracts apply.
`summarize` returns `data.operation`, `snapshot`, `stages`, `transport_outcomes`,
`execution_observations`, `business_outcome`, `missing_evidence`, `conflicts`,
`unmatched_events`, and ordered evidence locators. Each stage is
`observed | not_observed | conflicting` with supporting event IDs. The report's
business outcome is `verified_success | verified_failure | unknown | conflicting`.

| Available evidence | Summary business outcome | `verify` behavior |
| --- | --- | --- |
| Navigation timeout plus trusted exact-write readback match | `verified_success`; timeout remains visible | `ok`, exit 0, verdict satisfied |
| Request sent/accepted/process exit 0 without sufficient readback | `unknown` | Incomplete, exit 3, `data: null` |
| Missing readback or readback endpoint unavailable | `unknown` | Incomplete, exit 3 |
| Readback matches old/different target, namespace or revision | `unknown` with binding problem | Incomplete, exit 3 |
| Trusted final negative outcome established by a supported profile | `verified_failure` | `ok`, exit 0, verdict not satisfied; caller must inspect verdict |
| Mismatch inside an eventual-consistency window | `unknown`, mismatch retained | Incomplete, exit 3; no automatic retry |
| Mutually incompatible authoritative outcomes for the same revision | `conflicting` | Incomplete, exit 3 |
| Readbacks from explicitly ordered different revisions | Outcome for the requested revision/cutoff | Do not erase earlier outcomes or choose a different attempt implicitly |

`summarize` is complete only when all supplied valid events in the explicit
snapshot were processed, even if they reveal missing business evidence. Its
`complete: true` never means the business operation completed. `verify` asks a
different, explicit question; inconclusive answers follow exit 3 and contain no
partial data. A caller needing diagnostics can explicitly request `summarize`.

Malformed input/limits are error/2, scope-policy rejection error/4, and I/O or
internal failure error/1. Unknown event schemas/kinds, conflicting duplicate
events, causal cycles, or budget exhaustion return incomplete/3. Do not hide an
unknown event kind as an advisory warning during verification.

## Architecture and integration path

The standalone tool owns event validation, source locators, grouping, causal
ordering, bounded report construction, and evaluation of the supplied evidence
against a supported declarative profile. The application owns producer semantics,
operation/attempt IDs, business authorization, commit boundaries, and readback.

First implement offline fixtures. Then, in separately authorized application work,
reuse existing browser/Inspector/request logs, Lucee acceptance/completion points,
and Node runner outcomes to emit the minimal events. Propagate operation identity
across each component explicitly. Add exact-write readback using the existing
application mechanism. Measure uncorrelated/missing events before expanding scope.

Use owner-supplied files for V1 storage. Result Store may later retain sanitized
event artifacts but is optional and does not interpret their business meaning.
No second retention engine, daemon, persistent socket listener, live debugger,
cross-machine clock service, or mandatory tracing SDK is included in V1.

## Proposed resource budgets

| Resource | Default | Hard cap |
| --- | --- | --- |
| Input files | 8 | 32 |
| Total input bytes | 16 MiB | 64 MiB |
| Events per snapshot | 10,000 | 100,000 |
| Event size | 16 KiB | 64 KiB |
| JSON nesting | 32 | 64 |
| Causal links per event | 8 | 32 |
| Output including envelope | 128 KiB | 1 MiB |
| Processing time | 5 seconds | 30 seconds |

Default display includes all selected-operation evidence within the caps; narrow
the requested snapshot or fail incomplete when it cannot fit. No sampling to fit
a successful verification. Bound graph traversal to the declared event/link caps,
reject cycles, check deadlines throughout, and reserve a valid failure envelope.

## Acceptance cases

| ID | Fixture | Required result |
| --- | --- | --- |
| RT-01 | One save, transport timeout, exact-write trusted readback match | Both timeout and verified success; no second save |
| RT-02 | Same events without readback; acceptance/exit 0 variants | Unknown outcome; verify exit 3 |
| RT-03 | Readback wrong tenant/record/old revision, reused PID | No false correlation or verified success |
| RT-04 | Identical event duplicates; same ID with conflicting payload | Deduplicate identical; conflicting duplicate yields incomplete |
| RT-05 | Reordered events, clock skew, restarted producer | Same causal report; clock limits explicit |
| RT-06 | Missing acceptance/execution events but valid readback | Report missing stages honestly; do not synthesize them |
| RT-07 | Two attempts, stale first-attempt readback, late second-attempt event | Preserve attempt scope; new evidence creates a new snapshot |
| RT-08 | Eventual mismatch vs authoritative final negative result | Unknown vs verified failure according to profile |
| RT-09 | Conflicting same-revision readbacks and ordered different revisions | Conflict preserved; cutoff/revision selection explicit |
| RT-10 | Unsupported event/profile, malformed JSON, causal cycle | Explicit error/incomplete according to failure contract |
| RT-11 | Event/file/link/output/time limits; dropped-source declaration | Bounded failure or explicit missing-source evidence, no silent successful clipping |
| RT-12 | Malicious message, sensitive payload, remote evidence URL, root escape | No execution/fetch; reject policy violations and redact diagnostics |
| RT-13 | Repeat fixed snapshot/profile/cutoff with filesystem/network/command checks | Deterministic report; no writes, network, processes or retries |

Release acceptance requires the independent fixture suite plus one authorized
instrumented nonproduction timeout/readback trial before claiming Globe3 runtime
integration. A synthetic event report alone proves only offline correlation.
Unknown event loss, adapter trust, engine versions, or readback semantics must
remain documented limitations rather than inferred success.
