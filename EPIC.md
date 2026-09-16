# Hub delivery epic

## Outcome

Maintain a discoverable, evidence-backed ecosystem of independently released tools
without turning this Hub into a tool monorepo or reasoning runtime. The owner has
explicitly authorized a narrow dependency-free AIT install/dispatch runtime for
package management and explicit process invocation. [TASK.md](TASK.md) is the
authoritative execution ledger.

## Work packages

| ID | Work package | Tasks | Dependencies | Acceptance |
| --- | --- | --- | --- | --- |
| E-01 | Documentation foundation and reconciliation | HUB-01, HUB-02, HUB-03 | None | Required documents, registry, ownership map, evidence ledger, and validator agree |
| E-02 | Protocol compatibility decision | HUB-04 | HUB-02 | Decide native protocol migration or explicit consumer profiles using versioned success/partial/error fixtures; preserve existing consumers |
| E-03 | Release and conformance evidence | HUB-05 | HUB-03; HUB-04 for Hub conformance | Verify publication identity separately from exact artifact behavior and Hub standards; promote only with matching evidence |
| E-04 | AIT discovery, installation, and dispatch runtime | HUB-06 | HUB-03, HUB-04, confirmed metadata demand | Explicit registry source, pinned installation, lifecycle/approval gates, bounded `ait-result/v1` output, and no automatic installation/execution |
| E-05 | Planned tool contract handoffs | HUB-07 | HUB-02 | Narrow first-version inputs/outputs/non-goals and acceptance fixtures in each independent repository; no source copied here |
| E-06 | Conditional infrastructure review | HUB-08 | Roughly 3–5 mature tools with maintained releases and actual duplication | Reviewed ownership/cost/compatibility/migration/rollback decision; no assumed migration |
| E-07 | Three-tool design and KB handoff | HUB-09 | Owner request; HUB-03 | Three detailed draft contracts, registry/roadmap additions, KB status/design synchronization and verified readback |
| E-08 | Independent feasibility and delivery of the three additions | HUB-10, HUB-11, HUB-12 | HUB-09; independent repositories and owners | CFML lexical fixtures, Result Store persistence/integration fixtures, Trace event/readback fixtures; no Hub implementation |
| E-09 | CFML Policy Check handoff | HUB-13 | Owner request; HUB-03; independent repository | Configurable CFML/HTML/project policy contract and boundary evidence; implementation, fixtures, package, and release remain outside the Hub |

## Scope and handoff rules

Code Slice delivery is owner-confirmed complete. Its remaining E-02/E-03 Hub work
must not be presented as unfinished tool delivery. Further completion updates are
owner-triggered: inspect evidence, synchronize documentation/registry, validate,
and commit the Hub update without installing or rebuilding unrelated tools.

E-02 now resolves the target completeness semantics with executable consumer
fixtures before a generic consumer interprets multiple Hub-conformant tools.
Documented native differences remain separate profile/migration work. E-03 may verify
npm identity, but cannot assert an external tool's Hub protocol conformance without
matching native-profile or migration evidence.

E-05 follows the agreed [roadmap](ROADMAP.md). Change Impact implementation work
belongs in its own repository and ledger; Hub tasks record only ecosystem decisions,
registration, and handoffs. Later tool proposals must separate observations from
inference and cannot assume a mandatory chain of installed tools.

No work package here authorizes publishing, pushing, changing permissions, or
modifying another repository's active implementation. The AIT runtime is explicitly
owned by this Hub and remains dependency-free; it is not a shared tool implementation,
framework, service, or reasoning layer.

E-07 is documentation and KB delivery only. E-08 is active for the CFML Check
feasibility slice and remains planned for Result Store and Runtime Trace; it does
not reorder the original ten tools. E-04 now owns the AIT runtime implementation.
Detailed contracts are linked from the [expansion review](docs/TOOL_EXPANSION.md)
and [AIT runtime](docs/AIT_RUNTIME.md); budgets and cases are proposed until the
applicable executable evidence exists in the owning repository.

## Completion criteria

Each Hub task closes with the evidence required by [SPEC.md](SPEC.md) and
[VALIDATION.md](VALIDATION.md). Documentation delivery does not close future tool,
discovery, release, or shared-infrastructure work. Unassessed release access is a
prerequisite to investigate later, not an invented current blocker.
