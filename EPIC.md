# Hub delivery epic

## Outcome

Maintain a discoverable, evidence-backed ecosystem of independently released tools
without turning this Hub into a monorepo or runtime. The documentation foundation
exists. Contract integration, release evidence, and discovery implementation remain
separate work. [TASK.md](TASK.md) is the authoritative execution ledger.

## Work packages

| ID | Work package | Tasks | Dependencies | Acceptance |
| --- | --- | --- | --- | --- |
| E-01 | Documentation foundation and reconciliation | HUB-01, HUB-02, HUB-03 | None | Required documents, registry, ownership map, evidence ledger, and validator agree |
| E-02 | Protocol compatibility decision | HUB-04 | HUB-02 | Decide native protocol migration or explicit consumer profiles using versioned success/partial/error fixtures; preserve existing consumers |
| E-03 | Release and conformance evidence | HUB-05 | HUB-03; HUB-04 for Hub conformance | Verify publication identity separately from exact artifact behavior and Hub standards; promote only with matching evidence |
| E-04 | Future discovery CLI | HUB-06 | HUB-03, HUB-04, confirmed metadata demand | Explicit registry source, supported schema, freshness, bounded output, and no automatic installation/execution |
| E-05 | Planned tool contract handoffs | HUB-07 | HUB-02 | Narrow first-version inputs/outputs/non-goals and acceptance fixtures in each independent repository; no source copied here |
| E-06 | Conditional infrastructure review | HUB-08 | Roughly 3–5 mature tools with maintained releases and actual duplication | Reviewed ownership/cost/compatibility/migration/rollback decision; no assumed migration |

## Scope and handoff rules

Code Slice delivery is owner-confirmed complete. Its remaining E-02/E-03 Hub work
must not be presented as unfinished tool delivery. Further completion updates are
owner-triggered: inspect evidence, synchronize documentation/registry, validate,
and commit the Hub update without installing or rebuilding unrelated tools.

E-02 must resolve completeness semantics before a generic consumer can interpret
multiple tools. Documenting differences is completed analysis, not completed
integration. E-03 may verify npm identity before E-02, but cannot assert Hub protocol
conformance until the compatibility decision and fixtures exist.

E-05 follows the agreed [roadmap](ROADMAP.md). Change Impact implementation work
belongs in its own repository and ledger; Hub tasks record only ecosystem decisions,
registration, and handoffs. Later tool proposals must separate observations from
inference and cannot assume a mandatory chain of installed tools.

No work package here authorizes publishing, pushing, changing permissions, or
modifying another repository's active implementation. There is no need for a shared
runtime, framework, service, or new dependency to complete the current documentation.

## Completion criteria

Each Hub task closes with the evidence required by [SPEC.md](SPEC.md) and
[VALIDATION.md](VALIDATION.md). Documentation delivery does not close future tool,
discovery, release, or shared-infrastructure work. Unassessed release access is a
prerequisite to investigate later, not an invented current blocker.
