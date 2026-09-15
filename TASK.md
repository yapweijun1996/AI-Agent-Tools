# Task status

Status date: 2026-09-15. Scope: AI-Agent-Tools Hub. This is the authoritative Hub
execution ledger; independent tool repositories own their implementation tasks.

## Current situation

The Hub documentation, registry, local Python validator, and dependency-free AIT
runtime now exist. The initial tracked baseline was `2f2d46e`; Git history records
subsequent Hub documentation and runtime commits. A commit is not a tool release or
a push. AIT package version `0.1.0` is local/private and not published; it does not
contain independent tool implementations.

**Code Slice delivery is Done**, confirmed by the owner on 2026-09-06. Published
`agent-code-slice@0.2.0` metadata matches its repository and `code-slice` executable.
Prior local tests at `7f2969f` remain separately scoped source evidence. Its Hub
lifecycles stay Experimental only because protocol conformance is still pending.
Change Impact now has an inspectable implementation and is Experimental after the
implementation/test admission audit, but is not delivery Done. See [VALIDATION.md](VALIDATION.md)
for snapshot scope; a manifest or type definition is not an implemented capability.
Project Profile now has an inspectable implementation and published npm identity,
but its corrected source release `0.1.2` is not published and its registry `0.1.1`
executable has a known distribution defect; it remains Experimental and is not
delivery Done.

Three owner-requested tools are now registered, with detailed draft
specifications: CFML Check, Result Store and Runtime Trace. CFML Check is now
Experimental after the implementation admission audit. Symbol Search was
appended as an Experimental implementation admission on 2026-09-08. The registry
contains fourteen entries with one owner-confirmed completion. The original
ten-tool order is unchanged. Company KB knowledge retrieved on 2026-09-07 records Change Impact
in progress and Project Profile next with an approved V1 boundary; those records
are knowledge evidence, not a new source/release audit by this Hub.

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
| HUB-04 | Resolve native/Hub JSON, exit, and completeness contracts | In progress | HUB-02 | E-02; 2026-09-15 decision recorded in [CLI standard](docs/CLI_STANDARD.md#invocation-and-streams): exit codes are a coarse ok/not-ok signal only, never a cross-tool semantic key; consumers read JSON status/error fields instead — see [Validation](VALIDATION.md#hub-04-exit-code-comparison---2026-09-15) for the sourced comparison behind it. Remaining: apply this decision as executable consumer fixtures; completeness-contract semantics (`incomplete`/partial) still unresolved |
| HUB-05 | Audit published identities/artifacts and collect Hub conformance evidence | In progress | HUB-03; HUB-04 for conformance | E-03; Code Slice 0.2.0, Project Profile/Test Scope package identities, and Change Impact/CFML Check/Symbol Search repository identities reviewed; corrected Project Profile 0.1.2 and Symbol Search 0.1.0 publication, independent artifact/remote CI, and Hub conformance checks remain pending |
| HUB-06 | Implement the AIT discovery, installation, and dispatch runtime | In progress | HUB-03, HUB-04 | E-04; local `agent-tools@0.1.0` implements list/doctor/pinned install/local-path install/explicit dispatch and `ait-result/v1`; npm publication, remote refresh, sandboxing, package-signature policy, and HUB-04 consumer fixtures remain pending |
| HUB-07 | Hand off bounded first-version contracts in roadmap order | Planned | HUB-02 | E-05; independent owners implement and validate tools |
| HUB-08 | Evaluate shared infrastructure only at the maturity gate | Deferred | None | E-06; roughly 3–5 mature maintained tools and concrete duplication not evidenced |
| HUB-09 | Specify three additions, reconcile Hub documents/registry, and synchronize Company KB | Done | Owner request; HUB-03 | Local design/registry handoff verified under V-07; User-tier KB synchronization and exact readback verified under V-08 and current reconciliation V-12; company-wide visibility remains separate because the KB is intentionally User-visible |
| HUB-10 | Hand off CFML Check lexical/structural feasibility | In progress | HUB-09; independent owner/repository | E-08; public implementation, capabilities, typecheck, 22/22 tests, and package-surface checks are recorded; CF-14 engine trial, package/release, and protocol evidence remain pending |
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
- Protocol profiles versus explicit migration remains an engineering decision, not
  an implemented compatibility layer. Preserve current tool consumers meanwhile.
- Code Slice npm publication identity for `0.2.0` is confirmed; its exact artifact
  behavior and Hub conformance remain unaudited here. Other package fields stay `null`.
- Project Profile repository and npm identity are confirmed, and its source commit
  passed the local implementation checks recorded in [VALIDATION.md](VALIDATION.md).
  The published `0.1.1` package has a reproduced CLI distribution defect; the
  source `0.1.2` correction remains unpublished. Its registry lifecycle is therefore
  `Experimental`, with no verification snapshot.
- Symbol Search repository identity and current source commit are confirmed. Its
  TypeScript implementation passed the repository's local verification suite, but
  package `0.1.0` is unpublished and Hub protocol conformance is unverified; its
  lifecycle is `Experimental` with no npm or verification snapshot.
- Confirm later tools' repository identities, first formats/languages, budgets,
  test scope, and maintainers before expanding claims.
- AIT package distribution and Hub licensing remain open; the current local package
  is private/UNLICENSED and is not a published tool release.
- Within the three additions, CFML Check's bounded feasibility work is now the
  active first spike. Preserve the existing Change Impact / Project Profile
  sequence. Detailed contracts and current evidence are linked from [the expansion
  review](docs/TOOL_EXPANSION.md).
- Checked-in validator regression tests now cover the current repository, JSON
  parsing and malformed roadmap rows. The prior review's Planned-release and
  evidence-URL acceptance cases are not established bugs against the current
  human-reviewed registry contract.

## Blockers and risk

No external blocker prevents current Hub documentation maintenance. There is an
unresolved protocol dependency before cross-tool composition and Hub conformance.
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
Project Profile's source and registry versions are currently split: local source is
`0.1.2`, while npm `latest` is `0.1.1`.

## Next steps

Keep the 2026-09-15 User-tier reconciliation receipt and returned item IDs with
this working-tree state. If company-wide collaboration is later required, change
visibility and authorization deliberately, then run a separate Company-tier
readback. The existing ecosystem work below keeps its original order.

1. Resolve HUB-04 with real native success, bounded/partial, ambiguity, unsupported,
   and error payloads; select a compatible versioning path before changing consumers.
2. Audit exact published artifacts and identities under HUB-05; update registry
   release/evidence fields only when their meaning is satisfied.
3. Review and harden the three Experimental implementations, then obtain
   engine/package/protocol evidence before considering further promotion.
   The owner still reports tool delivery completion; do not infer it from this spike.
4. Complete HUB-06 runtime acceptance, then decide whether to publish `agent-tools`
   and document package-signature, sandbox, and remote-refresh policies. Keep shared
   tool implementation consolidation behind the existing maturity gate.
