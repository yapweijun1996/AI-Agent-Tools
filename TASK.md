# Task status

Status date: 2026-09-16. Scope: AI-Agent-Tools Hub. This is the authoritative Hub
execution ledger; independent tool repositories own their implementation tasks.

## Current situation

The Hub documentation, registry, local Python validator, and dependency-free AIT
runtime now exist. The initial tracked baseline was `2f2d46e`; Git history records
subsequent Hub documentation and runtime commits. A commit is not a tool release or
a push. AIT package version `0.1.0` is configured as a public Apache-2.0 release
candidate; npm publication and registry read-back remain pending authentication.
It does not contain independent tool implementations.

**Code Slice delivery is Done**, confirmed by the owner on 2026-09-06. Published
`agent-code-slice@0.2.0` metadata matches its repository and `code-slice` executable.
Prior local tests at `7f2969f` remain separately scoped source evidence. Its Hub
lifecycles stay Experimental only because protocol conformance is still pending.
Change Impact now has an inspectable implementation and is Experimental after the
implementation/test admission audit, but is not delivery Done. See [VALIDATION.md](VALIDATION.md)
for snapshot scope; a manifest or type definition is not an implemented capability.
Project Profile now has an inspectable implementation and published npm identity,
but its corrected source release `0.1.2` is not published. A prior audit recorded a
registry `0.1.1` distribution defect; the current exact-artifact re-audit did not
reproduce it on this host, but the exact artifact omits its declared MIT `LICENSE`
file. The release/platform discrepancy remains unresolved. Its current public main
is `b711b724`, with a successful CI run; this does not publish `0.1.2`. It remains
Experimental and is not delivery Done.

Three owner-requested tools are now registered, with detailed draft
specifications: CFML Check, Result Store and Runtime Trace. CFML Check is now
Experimental after the implementation admission audit. Symbol Search was
appended as an Experimental implementation admission on 2026-09-08. The registry
contains fourteen entries with one owner-confirmed completion. The original
ten-tool order is unchanged. Company KB knowledge retrieved on 2026-09-07 records Change Impact
in progress and Project Profile next with an approved V1 boundary; those records
are knowledge evidence, not a new source/release audit by this Hub. The current
Symbol Search main CI run fails its Documentation check on Ubuntu Node 22/24/26
while package-smoke jobs pass; the published `0.1.2` artifact remains separately
audited.

Option A has now produced a public independent CFML Check implementation at
`AI-Agent-Tool-CFML-Check` commit `d132a82de4e2a764710e04968f8a480b8b6153c7`.
Its implementation, capabilities response, typecheck, 22/22 test run, and
package-surface checks are evidence for an Experimental implementation only.
Engine compatibility, maintainer release evidence and Hub protocol conformance
remain unverified.

## Task vocabulary

| Status | Meaning |
| --- | --- |
| Done | The scoped deliverable exists and the applicable check is recorded |
| In progress | Work has started but acceptance is incomplete |
| Planned | Identified work with no completed acceptance evidence |
| Blocked | A concrete unavailable input, resource, access, or approval prevents the next required action |
| Deferred | Outside current delivery scope; no release commitment |

These task states are distinct from registry lifecycle. An unmet task dependency
or an unimplemented feature is not automatically an external blocker.

## Work ledger

| ID | Work | Status | Depends on | Evidence / remaining acceptance |
| --- | --- | --- | --- | --- |
| HUB-01 | Establish Hub standards, registry, roadmap, and validator | Done | None | Existing foundation; V-01 through V-05 |
| HUB-02 | Review all ten tool functions and Hub boundaries | Done | None | Dated function review; Code Slice local evidence V-06; planned tools assessed as designs |
| HUB-03 | Reconcile document ownership, task state, and confirmed registry facts | Done | HUB-01, HUB-02 | DESIGN/SPEC/EPIC/TASK/index/validation added; confirmed repository links and Code Slice Experimental; V-01 through V-05 |
| HUB-04 | Resolve native/Hub JSON, exit, and completeness contracts | In progress | HUB-02 | E-02; target envelope semantics are locked by executable consumer fixtures under `tests/hub_consumer.test.js`. Code Slice, Project Profile, Change Impact, Test Scope, CFML Check, and Symbol Search now have explicit native profiles under `docs/profiles/`, including bounded/partial semantics and native error authority. Other native tools still require separate profiles or migration; no contract is inferred |
| HUB-05 | Audit published identities/artifacts and collect Hub conformance evidence | In progress | HUB-03; HUB-04 for conformance | E-03; exact packlists for six published versions and current remote-head/CI observations are recorded in V-25/V-26; Project Profile license/release gap, Symbol Search current-main CI failure, independent artifact/remote reconciliation, and Hub conformance remain pending |
| HUB-06 | Implement the AIT discovery, installation, and dispatch runtime | In progress | HUB-03, HUB-04 | E-04; local `agent-tools@0.1.0` implements list/doctor/pinned install/local-path install/explicit dispatch, `ait-result/v1`, and exact catalog-backed native profile selection/application; the packed default-registry omission was corrected and is recorded in V-27, while publication, license/ownership, remote refresh, sandboxing, and provenance policy remain pending |
| HUB-07 | Hand off bounded first-version contracts in roadmap order | Planned | HUB-02 | E-05; independent owners implement and validate tools |
| HUB-08 | Evaluate shared infrastructure only at the maturity gate | Deferred | None | E-06; roughly 3–5 mature maintained tools and concrete duplication not evidenced |
| HUB-09 | Specify three additions, reconcile Hub documents/registry, and synchronize Company KB | Done | Owner request; HUB-03 | Local design/registry handoff verified under V-07; User-tier KB synchronization and exact readback verified under V-08 and current reconciliation V-12; company-wide visibility remains separate because the KB is intentionally User-visible |
| HUB-10 | Hand off CFML Check lexical/structural feasibility | In progress | HUB-09; independent owner/repository | E-08; public implementation, capabilities, typecheck, 22/22 tests, package-surface checks, and published 0.1.1 artifact smoke are recorded; CF-14 engine trial, broader platform, and Hub protocol evidence remain pending |
| HUB-11 | Hand off Result Store persistence and producer integration | Planned | HUB-09; independent owner/repository | E-08; RS-01 through RS-13 proposed; no store or connector implemented |
| HUB-12 | Hand off Runtime Trace event/readback correlation | Planned | HUB-09; independent owner/repository | E-08; RT-01 through RT-13 proposed; no instrumentation or runtime trial |

## Delivery completion notices

- Code Slice: **Done**, owner-confirmed 2026-09-06; recorded published version `0.2.0`.
- Remaining thirteen tools: awaiting owner completion notices. The owner will provide
  updates; no background polling or inferred completion is requested. Project
  Profile has review evidence but no delivery completion notice; it remains
  outside the completed count.
- On each notice, verify identity/evidence, synchronize Hub documentation and registry,
  run validation, and commit the resulting Hub documentation changes. Keep native
  delivery and Hub protocol conformance separate.

## Decisions and pending work

- Accepted boundaries and rationale are in [DESIGN.md](DESIGN.md); existing target
  standards and registry versions stay `1.0.0`.
- The Hub target envelope and completeness matrix are resolved by executable
  fixtures. Code Slice, Project Profile, Change Impact, Test Scope, CFML Check, and
  Symbol Search have explicit consumer profiles; profiles for other native tools or explicit migration remain
  engineering decisions, not an automatic compatibility layer. Preserve current
  consumers.
- Code Slice npm publication identity for `0.2.0` is confirmed; its exact artifact
  behavior and Hub conformance remain unaudited here. Other package fields stay `null`.
- Project Profile repository and npm identity are confirmed, and its source commit
  passed the local implementation checks recorded in [VALIDATION.md](VALIDATION.md).
  A prior audit recorded a published `0.1.1` CLI distribution defect, while the
  current exact-artifact re-audit did not reproduce it on this host. The exact
  published artifact omits its declared MIT `LICENSE` file; the source `0.1.2`
  correction remains unpublished, so the release/platform discrepancy is unresolved
  and its registry lifecycle remains `Experimental`, with no verification snapshot.
- Symbol Search repository identity and current source commit are confirmed. Its
  TypeScript implementation passed the recorded repository verification suite, and
  the published `0.1.2` artifact is audited for native profile evidence. The current
  public main CI run fails its Documentation check on Ubuntu Node 22/24/26 while
  package smoke passes on Ubuntu/macOS/Windows; Hub protocol conformance and a
  verification snapshot remain unverified.
- Confirm later tools' repository identities, first formats/languages, budgets,
  test scope, and maintainers before expanding claims.
- AIT package distribution is in its public-release step. Ownership and the
  Apache-2.0 license decision are recorded; the packed-consumer gate exposed and
  corrected omission of the default `TOOL_REGISTRY.json`. The remaining release
  work is npm authentication, publication, and post-publication registry read-back.
  Exact-version native profile selection/application is implemented only for the
  checked-in catalog and bounded validators; it is not a universal compatibility
  layer. CFML Check and Symbol Search can now match the catalog only after their
  registry identities are confirmed in the selected snapshot.
- Within the three additions, CFML Check's bounded feasibility work is now the
  active first spike. Preserve the existing Change Impact / Project Profile
  sequence. Detailed contracts and current evidence are linked from [the expansion
  review](docs/TOOL_EXPANSION.md).
- Checked-in validator regression tests now cover the current repository, JSON
  parsing and malformed roadmap rows. Executable Hub consumer fixtures now cover
  success-with-findings, partial/ambiguous/unsupported/limited incomplete outcomes,
  invalid/internal errors, native-envelope rejection, and exit/status mismatches.
  The prior review's Planned-release and
  evidence-URL acceptance cases are not established bugs against the current
  human-reviewed registry contract.

## Blockers and risk

No external blocker prevents current Hub documentation maintenance. There is an
unresolved native-profile dependency before cross-tool composition and external Hub
conformance; the target Hub envelope semantics are now executable and verified.
User-tier synchronization for HUB-09 was completed and read back successfully at
its 2026-09-15 reconciliation. The affected design, status, SSOT, functional-map
and schema records were updated in place; the new Symbol Search status record was
read back with its returned ID. The KB visibility is intentionally `user`, so
company-tier sharing remains a separate follow-up rather than an unreported
assumption. The earlier Company-tier attempts were correctly rejected with
`SHARE_TIER_DENIED: above_scope`.
Active sibling working-tree development can stale observations quickly; dated
evidence must not be mistaken for a released or continuously monitored state.
CFML Check's public repository identity and Experimental lifecycle admission are
now confirmed; its engine compatibility claim remains unverified.
Release credentials, CI availability, and publication permissions are unassessed,
not reported as failed or granted.
Project Profile's source and registry versions are currently split: current public
source is `0.1.2`, while npm `latest` is `0.1.1`; the published artifact also omits
its declared MIT license file. Code Slice's current public/npm latest is `0.4.0`,
while the Hub retains the separately reviewed `0.2.0` release snapshot. Symbol
Search current-main CI has a documentation-check failure despite published-artifact
smoke evidence.

## Next steps

Keep the 2026-09-15 User-tier reconciliation receipt and returned item IDs with
this working-tree state. If company-wide collaboration is later required, change
visibility and authorization deliberately, then run a separate Company-tier
readback. The existing ecosystem work below keeps its original order.

1. Extend explicit native profiles only when cross-tool composition is requested;
   preserve existing consumers and do not infer migration from the existing profiles.
2. Audit exact published artifacts and identities under HUB-05; update registry
   release/evidence fields only when their meaning is satisfied. Resolve the Project
   Profile package/license gap and current Symbol Search CI failure before any
   promotion claim.
3. Review and harden the three Experimental implementations, then obtain
   engine/package/protocol evidence before considering further promotion.
   The owner still reports tool delivery completion; do not infer it from this spike.
4. Complete HUB-06 runtime acceptance, then decide whether to publish `agent-tools`
   only after the packed-consumer gate, license/ownership decision, and explicit
   provenance policy are satisfied. Keep remote refresh and OS sandboxing out of
   the current runtime; document them as separate future decisions. Keep shared
   tool implementation consolidation behind the existing maturity gate.
