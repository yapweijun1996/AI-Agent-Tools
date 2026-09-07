# Agent Result Store

Registry ID: `agent-result-store`. Lifecycle: `Planned`. Design revision:
2026-09-07, draft for independent implementation. Repository, maintainer, npm
identity, executable name, and release version are unconfirmed. All interfaces,
limits, and acceptance cases below are proposed, not implemented or benchmarked.

## Problem and outcome

Persist an explicitly authorized, sanitized tool result as an immutable local
artifact, then return a compact receipt and support precise bounded retrieval.
The truncation problem is EXP-02 in the [expansion review](../TOOL_EXPANSION.md).
Integration must receive full producer bytes before a UI or transport truncates
them. Already-lost bytes cannot be recovered or labeled complete by this tool.

The store owns persistence, retention, source locators, and retrieval. Error Lens
owns diagnostic classification; Context Pack owns task-specific selection. V1
does not intercept agent calls, invoke producer commands, run an LLM, index every
project, synchronize to a cloud, or provide a multi-user service. The caller or a
future explicit connector supplies bytes and producer outcome metadata.

## Operations and permissions

The executable is unconfirmed. These operation names are draft contracts:

| Operation | Input | Side effect and result |
| --- | --- | --- |
| `put` | Explicit store root, namespace, source file or stdin, source-completeness declaration, redaction policy, TTL, ingestion key | Authorized local write; atomically create a sanitized immutable artifact and receipt |
| `inspect` | Namespace and result ID | Read-only manifest/shape/size/completeness/expiry; no full body |
| `read` | Result ID plus line range, byte range, or JSON Pointer; optional cursor | Read-only bounded page with source locators |
| `search` | Result ID, literal keyword, case mode, page size/cursor | Read-only deterministic matches with positions |
| `delete` | Exact result ID; preview by default, explicit apply | Delete only that owned artifact and derived indexes |
| `gc` | Explicit namespace and evaluation time; preview by default, explicit apply | Remove expired owned artifacts and abandoned staging data |

`put` requires a write operation, an explicit storage scope, and a prior `put`
preview describing format, caps, policy, expiry and source declaration. Bind apply
to the preview inputs/policy; changed file bytes require a new preview. For stdin,
preview covers the declared stream contract and bounds; apply validates the stream
in memory before commit. Query operations never create storage, refresh TTL, or
perform garbage collection. No hidden writes on an ordinary read.

Use an owner-only local store outside the repository. Enforce actual OS filesystem
permissions, including Windows ACL behavior. Namespace IDs are isolation labels,
not authentication credentials; same-OS-user hostile processes are outside V1's
security guarantee. Reject cross-namespace lookups, root traversal, symlink/reparse
escapes, executable configuration, and missing policy. Metadata receives the same
redaction/validation as content. Credentials must never enter filenames or URLs.

## Ingestion and completeness

Accepted media are strict UTF-8 text and strict JSON (including a scalar root).
The caller declares `source_completeness: complete | truncated | unknown`, a safe
producer label, optional producer version/exit code, and a source reference.
`complete` requires an explicit producer completion assertion; EOF alone proves
only that the supplied stream ended. Unknown producer exit remains null. This
assertion is recorded with provenance, not independently certified by the store.

Reject duplicate JSON keys, invalid JSON numbers, invalid encoding, excess nesting,
and binary data. V1 field selectors use
[RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901), including escaping
and zero-based array indexes; no executable JSONPath or regular-expression search.
Missing fields fail explicitly. A null JSON value differs from a missing field.

On `put`, read within input caps, sanitize under a versioned declarative policy,
serialize the sanitized representation, build bounded position metadata, reserve
quota, write sanitized staging files, and atomically publish the record. No raw
input is written to temp files, logs, receipts, or indexes. A redaction failure or
quota failure leaves no visible new result. Do not clip oversized ingestion into
a successful record; callers must supply a smaller declared artifact instead.

A fully received but upstream-truncated input may be saved with the explicit
truncated declaration. `capture_complete` means all supplied bytes were processed;
it never overrides `source_completeness`. Producer failure also remains visible
even if saving that producer's log succeeds.

## Redaction and evidence integrity

V1 stores only the sanitized evidence, never an unredacted original. JSON policies
allowlist fields and replace excluded/secret values; text policies mask explicitly
selected spans and a documented bounded set of secret patterns. For free-form
logs, require an upstream sanitization assertion as well as local masking. Pattern
matching cannot guarantee detection of every secret. If the input cannot be
approved for storage, reject it. No "keep raw" escape hatch in this draft.

Keep `redaction_policy_id`, policy revision, transformation summary, redacted span
count, and a SHA-256 digest of the stored representation. Digest verifies the
stored bytes; it does not prove completeness, authorization, or secret removal.
Do not store original secret substrings, raw-value hashes, or reversible masks.

For text, preserve newline boundaries when masking and track mappings between
retained source byte spans and stored byte spans. For JSON, preserve member/array
order while producing deterministic sanitized JSON; an offset-aware parser maps
JSON Pointers to stored spans and, where available, original input spans. Removed
values are labeled redacted. Never serialize to JSON and then claim the new offsets
are the producer's original offsets.

Every excerpt references the immutable sanitized record and its digest. Original
input locations are non-retrievable provenance only unless the owner separately
retains that source; include `original_available: false` by default. There is no
automatic source refetch. This makes traceability honest without retaining secrets.

## Manifest and query data

| Field group | Required semantics |
| --- | --- |
| Identity | Opaque `result_id`, `namespace`, manifest schema revision, stored-content digest |
| Provenance | Safe producer label/version, nullable producer exit, source reference, source-completeness assertion |
| Capture | Received bytes, stored bytes, `capture_complete`, stored media/encoding, original availability |
| Structure | Line count or JSON root type and bounded shallow shape; explicit overview-depth scope |
| Policy | Redaction policy ID/revision, retention TTL, created/expiry times, effective limits |
| Lifecycle | Immutable content, fixed expiry, record visibility state; no TTL extension by reading |

An inspect overview does not list all keys by default. It reports bounded shape
and explicit counts, with `has_more` and a navigation cursor when applicable.
Do not infer token counts from bytes. Volatile IDs/timestamps are excluded from
determinism comparisons; content digest, sanitized bytes and query results are stable
for the same bytes, policy revision, snapshot, query and evaluation time.

Each successful query returns `items`, `query_scope`, `has_more`, `next_cursor`,
`source_completeness`, and locators containing record ID, digest, JSON Pointer
where applicable, stored `[start_byte, end_byte)` offsets, and one-based line
ranges. Byte ranges must end on UTF-8 boundaries; invalid boundaries are input
errors. Search uses literal Unicode text and declared case sensitivity, orders by
stored byte position, and never evaluates source contents as instructions.

A cursor binds namespace, result ID/digest, selector/query fingerprint, format
revision and next offset. Tampered, mismatched, expired, or deleted-record cursors
fail explicitly. V1 need not provide snapshot-independent search across all stored
results. A page is the explicitly requested bounded scope; `has_more: true` is not
silent truncation. If even one indivisible JSON value exceeds a page cap, fail
with `ITEM_TOO_LARGE` and direct the caller to a narrower pointer or byte-range read.

## Retention, crash recovery, and concurrency

Use one explicit namespace writer lock; reject concurrent writes with `STORE_BUSY`
rather than racing quota checks. Immutable readers can proceed subject to an
artifact read lock. Deletion skips active reads with an explicit busy result.
Quota includes content, indexes, manifests and staging; account atomically before
publishing. Cross-process interrupted writes must never expose half a manifest.

An ingestion key is unique within a namespace and bound to sanitized-content
digest plus format, producer declaration, policy and TTL. An exact retry returns
the original result/expiry, including after an ambiguous response. Reusing a key
with a different payload is `INGESTION_KEY_CONFLICT`. Expired records reject retries;
the caller needs a new ingestion key to create a fresh record. Keep bounded,
payload-free key receipts until the namespace's documented retry window ends.

TTL expiry denies new reads at `now >= expires_at`. With no daemon, physical
deletion occurs only on explicit `gc --apply`; report overdue cleanup when inspect
is allowed to return metadata. Do not promise physical removal at an exact time,
secure erasure from SSDs/backups, or protection from the store owner's filesystem
access. Restored backups retain original expiry and must be revalidated before reads.

Crash recovery removes only validated, owned staging artifacts through explicit GC.
No automatic eviction of unexpired evidence. Deletion is irreversible at the tool
level; preview lists exact IDs, bytes, cursor invalidation, and known backup limits.

## Protocol and proposed budgets

All operations return one [Hub envelope](../JSON_STANDARD.md). A successful write
receipt or explicit page query is `ok`, exit 0. Capture/processing/storage limit
exhaustion is incomplete, exit 3, `data: null`; policy rejection is error/4;
invalid query, source JSON, cursor or limits is error/2; storage corruption or I/O
failure is error/1. Expired/deleted/unavailable evidence is incomplete/3. A bounded
error message includes only safe identifiers, never raw source content.

| Resource | Default | Hard cap |
| --- | --- | --- |
| Input per artifact | 16 MiB | 64 MiB |
| JSON nesting | 128 | 256 |
| Namespace bytes, including indexes/staging | 256 MiB | 1 GiB |
| Namespace records, including key receipts | 1,000 | 10,000 |
| TTL | 24 hours | 7 days |
| Query items | 50 | 500 |
| Query output including envelope | 32 KiB | 1 MiB |
| Operation time | 10 seconds | 60 seconds |

Minimum TTL is one minute. Retry receipts expire at seven days from first apply;
they retain no payload. Timeouts on writes require checking the same ingestion key
before a new write. A monotonic deadline bounds the operation; UTC timestamps
govern retention. A backward wall-clock jump relative to persisted last-write time
must not silently extend access; fail with `CLOCK_UNCERTAIN` pending explicit review.

## Acceptance cases and release path

| ID | Fixture | Required result |
| --- | --- | --- |
| RS-01 | Large JSON within caps | Small overview, exact pointer read, bounded navigation |
| RS-02 | LF/CRLF and Unicode log with redacted spans | Stable excerpts, exact stored byte/line positions, honest original mapping |
| RS-03 | Upstream truncated or unknown input, producer failure | Preserve source declaration/exit independently of successful capture |
| RS-04 | JSON null, missing key, escaped pointer, duplicate key, huge scalar | Distinct null/missing behavior; reject ambiguous JSON; explicit oversized-item failure |
| RS-05 | Secret fixtures in content and metadata; redaction exception | No raw secrets in committed/staging/index/error outputs; failed policy means no record |
| RS-06 | Input/quota/index/time/output caps | No silent clip or unexpired eviction; valid bounded failure |
| RS-07 | Exact retry, key conflict, commit succeeded but response lost | One visible record; same key recovers receipt without renewing TTL |
| RS-08 | Concurrent writers, reader during delete, crash before/after publish | No partial record, quota overrun or unreported read race |
| RS-09 | At-expiry read, old cursor, restored backup, GC preview/apply | Deny expired data, preserve expiry, delete only selected owned artifacts |
| RS-10 | Cross-namespace ID, traversal, symlink/reparse escape, weak directory permissions | Reject access boundary violations |
| RS-11 | Search pages, query/cursor mismatch, UTF-8 split boundary | Deterministic pagination without skipped/duplicate hits; explicit invalid cursor/range |
| RS-12 | Repeat inspect/read with filesystem snapshot | No hidden TTL, index, GC or other writes |
| RS-13 | Explicit integration feeds pre-truncation bytes; already-truncated control | Full capture only in the first case; no claim of recovered missing bytes |

Prototype text/JSON ingestion, exact readback, masking, and atomic receipts first.
Then add selectors, pagination, TTL/GC, and cross-platform locking/permissions.
Promote only after the independent repository runs these cases and demonstrates
an explicit caller integration. Measure byte reduction per retrieval and locator
correctness against original fixtures. No hosted connector or package is created
by this specification.
