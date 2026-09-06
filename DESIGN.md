# Design decisions

Last reconciled: 2026-09-06. Scope: the AI-Agent-Tools Hub. This document owns
decision rationale; [Architecture](docs/ARCHITECTURE.md) owns structural contracts,
[SPEC.md](SPEC.md) owns requirements, and [TASK.md](TASK.md) owns execution status.

## Observed implementation

The Hub contains Markdown documentation, `TOOL_REGISTRY.json`, and
`scripts/validate_hub.py`. The validator uses only the Python standard library.
There is no root npm package, tool implementation, runtime service, discovery CLI,
shared SDK, or release automation. The initial tracked baseline is `2f2d46e`;
subsequent documentation delivery is recorded in Git history, independently of tool releases.

The validator reads the registry, checks authoring structure and lifecycle gates,
checks document links/anchors and JSON examples, and compares registry order/names
with the roadmap. Human review establishes behavioral evidence and architectural
consistency; the script cannot prove external tool conformance.

## Decisions

| ID | Decision | Reason and consequence |
| --- | --- | --- |
| D-01 | Keep the Hub separate from tool repositories and npm packages | Source, dependencies, tests, versions, and releases stay with each tool; Hub governance does not become orchestration |
| D-02 | Give each fact one document owner | Registry owns lifecycle/identities; TASK owns work status; SPEC owns requirements; Architecture and individual standards own their contracts |
| D-03 | Record delivery completion separately from Hub conformance | Code Slice is owner-confirmed complete and published at 0.2.0; its Experimental Hub lifecycle denotes pending protocol conformance, not unfinished delivery |
| D-04 | Preserve existing tool interfaces during documentation reconciliation | Document JSON/exit/completeness gaps; do not silently rewrite Code Slice consumers or declare a draft migration implemented |
| D-05 | Keep the validator dependency-free and local | Python 3.9+ is maintenance tooling, not an ecosystem runtime requirement; no package framework or network validation dependency |
| D-06 | Treat discovery as future metadata consumption | Listing tools never authorizes installation/execution; source, freshness, and schema validation precede any future discovery result |
| D-07 | Separate delivery priority from usage order | Tools remain independently useful; agents may read rules early and only use release checks for release tasks |
| D-08 | Defer shared infrastructure until roughly 3–5 mature tools expose real duplication | Evidence, ownership, compatibility, migration cost, and rollback must justify a separately reviewed change |
| D-09 | Preserve historical reviews and timestamp current observations | A changing sibling checkout is not a release snapshot; latest observations belong in TASK/VALIDATION, with historical review notices |

## Protocol reconciliation still pending

The Hub standard version and registry schema remain `1.0.0`. The target result
envelope also remains `1.0.0`. No protocol migration or profile field has been
implemented in this update.

Code Slice uses `schemaVersion`, `ok`, and `result`/`error`, with separate CLI usage
error schema and tool-specific exit codes. Its bounded outline can succeed with
`OUTLINE_TRUNCATED`. Change Impact's draft and initial types distinguish useful
results from analysis completeness. The Hub target instead uses `schema_version`,
`status`, `complete`, and `data`, with exit 3 and no partial data for incomplete work.

The next decision must compare a versioned tool migration against explicit consumer
contract profiles, using success, partial, ambiguity, unsupported, and limit fixtures.
Preserve existing consumers and reject unsupported semantics. Neither alternative
is silently selected by documenting the gap. This is an engineering dependency
for composition/conformance, not a blocker for maintaining Hub documentation.

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
