# Three-tool expansion

Design review date: 2026-09-07. This is a documentation handoff for three new
`Planned` tools, requested by the owner. It does not establish an implementation,
published package, reserved executable, or passed tool test.

## Decision and priority

| Registry order | Tool | First useful result | Feasibility and main dependency |
| --- | --- | --- | --- |
| 11 | `agent-cfml-check` | Locate unsupported or incorrectly nested CFML structures in an explicit file | High for a declared structural subset; needs engine-specific lexical fixtures |
| 12 | `agent-result-store` | Save an authorized sanitized result and retrieve bounded, traceable portions | Feasible; needs explicit producer integration and a tested local storage lifecycle |
| 13 | `agent-runtime-trace` | Correlate supplied operation events and distinguish transport failure from observed business outcome | Feasible as offline evidence analysis; needs trustworthy operation and readback correlation |

The original ten-tool order remains unchanged. These entries are appended to avoid
silently reprioritizing ongoing Change Impact and next Project Profile work.
Among these three additions, CFML Check is the recommended first feasibility spike,
followed by Result Store and Runtime Trace. This recommendation does not schedule a
release or make any tool a mandatory dependency of another.

Detailed handoff contracts are owned by [CFML Check](tools/AGENT_CFML_CHECK.md),
[Result Store](tools/AGENT_RESULT_STORE.md), and
[Runtime Trace](tools/AGENT_RUNTIME_TRACE.md). They cover scope, operations, data,
failure semantics, proposed budgets, responsibility, acceptance cases, and rollout.
Implementation and executable fixtures belong in future independent repositories.

## Evidence and assumptions

| Ref | Evidence | What it supports and what remains unverified |
| --- | --- | --- |
| EXP-01 | Owner-supplied task narrative: extra closing `cfif` after a report edit | A concrete CFML checking need; the original edited file was not supplied or rerun here |
| EXP-02 | This review's tool outputs were truncated during broad discovery and reads | Bounded retrieval is useful; a store cannot recover bytes lost before ingestion |
| EXP-03 | KB item `080bc15a-dd20-40ab-8f81-f0d85c55546d:0d79311c-e83d-4b1c-8cfa-fa836aa564d2` | Historical Sales Quotation draft: one save, navigation timeout, independent exact-record readback; record retrieved on 2026-09-07, transaction not rerun |
| EXP-04 | Existing Hub source and standards at baseline `93d82f2` | Hub is documentation/registry/validator; no implementation of these three tools |
| EXP-05 | Company KB canonical ecosystem and maintenance records read on 2026-09-07 | Existing ten-tool order, Change Impact in progress, Project Profile next, and one current status record per tool |

All fixture cases below are proposed tests, not executed results. Budget numbers
are initial engineering proposals, not measured performance guarantees. No new
maintainer, repository URL, npm identity, or release number is asserted.

## Responsibility boundaries

| Responsibility | Owner | Integration boundary |
| --- | --- | --- |
| Exact source extraction | Code Slice | CFML Check may share evidence locators; parser reuse needs separate feasibility evidence |
| CFML structural findings | CFML Check | Does not execute templates or certify SQL, HTML, or business behavior |
| Immutable sanitized capture, retention, retrieval | Result Store | Accepts explicit bytes and producer metadata; never intercepts all agent calls automatically |
| Diagnostic classification | Error Lens | May inspect an explicitly retrieved log excerpt |
| Operation event correlation and evidence report | Runtime Trace | Consumes supplied artifacts; browser/backend/runner adapters own event production |
| Business predicate and authoritative readback | Owning application and caller | Trace reports scoped evidence; it never retries writes or invents application success |
| Task-specific artifact selection | Context Pack | May consume store locators; does not own storage or retention |

No Hub runtime, shared package, database service, automatic instrumentation, or
global agent memory is introduced. Result Store's explicit `put`, `delete`, and
`gc --apply` operations are scoped local writes under the existing CLI/security
write-mode rules. Trace V1 is read-only analysis of supplied files.

## Protocol decisions

The new tools target the existing [JSON](JSON_STANDARD.md) and
[CLI](CLI_STANDARD.md) contracts without changing their versions. A completed
structural check may report violations with exit 0; consumers must inspect its
verdict. Unsupported coverage or resource exhaustion returns exit 3 with
`status: incomplete`, `complete: false`, and `data: null`.

A completed page request may have `has_more: true`; the requested page is complete,
while the artifact's source completeness is independently declared. Trace
`summarize` describes all supplied evidence, including missing stages. Trace
`verify` asks whether that evidence establishes a specified business result and
returns incomplete when it does not. These explicit operations avoid treating a
successful evidence read as successful business execution.

The existing native Code Slice/Hub compatibility decision stays under HUB-04.
These drafts do not introduce a consumer adapter or silently change native exits.

## Delivery and acceptance gates

1. Review the detailed draft and obtain an independent repository/maintainer.
2. Freeze a fixture-backed V1 subset and operation/data schemas in that repository.
3. Implement the smallest vertical slice with positive, negative, unsupported,
   resource-limit, determinism, and read/write boundary tests.
4. Run a sanitized real-task trial against the existing manual workflow. Measure
   correctness first, then bytes returned, elapsed time, and manual investigation.
5. Publish only through the owning release process. Register identities and promote
   lifecycle only when the separate admission/release/evidence gates are satisfied.

Documentation completion is tracked separately from those implementation steps in
[TASK.md](../TASK.md). The owner still reports tool delivery completion.

## Review disposition

SCMC result: Simple PASS; Clear PASS; Modular PASS; Consistent PASS for these
bounded draft contracts. This is design review, not runtime verification. The
largest unresolved implementation dependencies are the CFML lexer/profile,
Result Store atomic retention behavior, and Trace producer/readback bindings.

The earlier conversational review overstated two validator findings: the current
registry contract does not prohibit confirmed npm/release metadata on a Planned
entry, and external evidence truth is explicitly a human review responsibility.
Neither acceptance case alone establishes a validator bug. Missing checked-in
validator regression tests remains a separate maintenance gap; no validator or
CI implementation is included in this documentation change.

## Knowledge synchronization

Use the existing Company KB rather than creating another project knowledge base.
Update its ecosystem summary, functional map, and status index; create exactly
one current status record for each new tool, plus a separately retrievable full
design document. Keep delivery, Hub lifecycle, design, verification, and release
states separate. [KB synchronization](KB_SYNC.md) owns the record mapping and
readback method. Repository contracts and their KB copies must be reconciled by
source path and content digest before either copy is treated as current.
