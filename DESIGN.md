# Design decisions

Last reconciled: 2026-09-07. Scope: the AI-Agent-Tools Hub. This document owns
decision rationale; [Architecture](docs/ARCHITECTURE.md) owns structural contracts,
[SPEC.md](SPEC.md) owns requirements, and [TASK.md](TASK.md) owns execution status.

## Observed implementation

The Hub contains Markdown documentation, `TOOL_REGISTRY.json`,
`scripts/validate_hub.py`, and the dependency-free private `agent-tools@0.1.0`
package with the `ait` CLI. The validator uses only the Python standard library.
AIT manages explicit package installation and child-process dispatch but contains no
independent tool implementation or agent reasoning. The initial tracked baseline is
`2f2d46e`; subsequent delivery is recorded in Git history, independently of tool releases.

The validator reads the registry, checks authoring structure and lifecycle gates,
checks document links/anchors and JSON examples, and compares registry order/names
with the roadmap. Human review establishes behavioral evidence and architectural
consistency; the script cannot prove external tool conformance.

## Decisions

| ID | Decision | Reason and consequence |
| --- | --- | --- |
| D-01 | Keep tool implementations separate while allowing a narrow Hub-owned AIT runtime | Source, dependencies, tests, versions, and releases stay with each tool; AIT manages explicit package installation/dispatch without owning tool logic or agent reasoning |
| D-02 | Give each fact one document owner | Registry owns lifecycle/identities; TASK owns work status; SPEC owns requirements; Architecture and individual standards own their contracts |
| D-03 | Record delivery completion separately from Hub conformance | Code Slice is owner-confirmed complete and published at 0.2.0; its Experimental Hub lifecycle denotes pending protocol conformance, not unfinished delivery |
| D-04 | Preserve existing tool interfaces during documentation reconciliation | Document JSON/exit/completeness gaps; do not silently rewrite Code Slice consumers or declare a draft migration implemented |
| D-05 | Keep the validator dependency-free and local | Python 3.9+ is maintenance tooling, not an ecosystem runtime requirement; no package framework or network validation dependency |
| D-06 | Make AIT discovery metadata-first and installation/execution explicit | Registry validation precedes pinned install; Experimental install and all dispatch require explicit approval; no automatic upgrade, import, retry, or execution |
| D-07 | Separate delivery priority from usage order | Tools remain independently useful; agents may read rules early and only use release checks for release tasks |
| D-08 | Defer shared infrastructure until roughly 3–5 mature tools expose real duplication | Evidence, ownership, compatibility, migration cost, and rollback must justify a separately reviewed change |
| D-09 | Preserve historical reviews and timestamp current observations | A changing sibling checkout is not a release snapshot; latest observations belong in TASK/VALIDATION, with historical review notices |
| D-10 | Append three Planned tools without changing the original order | Owner requested detailed CFML Check, Result Store and Runtime Trace specifications; CFML Check is preferred first within this added group |
| D-11 | Give each new tool a bounded local responsibility | Structural validation, sanitized evidence storage, and supplied-event correlation stay separate; no automatic instrumentation or agent runtime |
| D-12 | Preserve source completeness and business outcome independently from operation success | A stored page can be complete while its upstream source is truncated; a trace summary can be complete while the business outcome is unknown |
| D-13 | Synchronize reviewable Hub contracts with the existing Company KB | KB status/design records and repository documents retain source provenance and content digests; reconcile conflicts explicitly before claiming current state |
| D-14 | Authorize a dependency-free AIT runtime in the Hub | `agent-tools@0.1.0` owns list/doctor/pinned install/approved dispatch and `ait-result/v1`; it is private, not a sandbox, and not a universal compatibility adapter |
| D-15 | Lock Hub envelope completeness semantics with executable consumer fixtures | `ok`/complete data uses exit 0; `incomplete`/null data uses exit 3; `error`/null data uses exit 1, 2, or 4; native tools are not remapped |

## Protocol reconciliation boundary

The Hub standard version and registry schema remain `1.0.0`. The target result
envelope also remains `1.0.0`. Executable consumer fixtures now lock its completeness
matrix: successful findings remain `ok`/complete with exit 0; partial, ambiguous,
unsupported, or resource-limited work is `incomplete`/null data with exit 3; invalid,
policy, and internal failures are `error`/null data with exit 2, 4, or 1. AIT adds
the separate local `ait-result/v1` wrapper for captured native output; it does not
migrate or reinterpret external tool protocols.

Code Slice uses `schemaVersion`, `ok`, and `result`/`error`, with separate CLI usage
error schema and tool-specific exit codes. Its bounded outline can succeed with
`OUTLINE_TRUNCATED`. Change Impact's draft and initial types distinguish useful
results from analysis completeness. These native contracts remain unchanged; no
exit-code remapping or partial-data conversion is introduced by the Hub.

Any future Hub conformance work must use an explicit versioned consumer profile or a
reviewed migration for each native tool, preserving existing consumers and rejecting
unsupported semantics. This native-profile decision remains separate from the now
verified target-envelope semantics.

## Ownership after the function review

Relationship evidence belongs to Change Impact; test selection to Test Scope;
source extraction to Code Slice; diff scope policy to Patch Guard; compatibility
classification to Contract Diff; release-evidence policy to Release Guard; bounded
artifact selection to Context Pack. Project Profile observes declarations, Error
Lens parses diagnostics, and Rules Resolve discovers explicitly supported rules.
None owns agent reasoning, test execution by default, or universal safety guarantees.

Detailed per-tool acceptance concerns remain in the
[function review](docs/TOOL_FUNCTION_REVIEW.md). They are backlog input, not completed
features in repositories that have not implemented them.

## Three-tool handoff

[Expansion review](docs/TOOL_EXPANSION.md) owns the design assessment and links to
each detailed draft. CFML Check uses an explicit supported lexical/structural
profile; Result Store writes only through explicit scoped operations; Runtime
Trace V1 analyzes supplied event artifacts and never executes a readback or retries
a write. Current standards/schema versions stay unchanged. The CFML implementation
is delivered in its independent repository; AIT provides only package management and
explicit process dispatch, not tool source, a compatibility adapter, or deployment.
