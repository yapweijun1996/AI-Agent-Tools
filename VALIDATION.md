# Validation and evidence

Latest Hub review: 2026-09-07. The original source/release observations below are
dated 2026-09-06 and remain historical. This document owns the Hub's evidence scope. Individual
tool test plans, dependencies, and release artifacts belong to their repositories.

## Current source observations

| Repository | Observed source state | What it establishes |
| --- | --- | --- |
| AI-Agent-Tools | Initial baseline `2f2d46e`; documentation commits are recorded in Git history | Documentation foundation and local authoring checks; no root npm/runtime/discovery implementation |
| AI-Agent-Tool-Code-Slice | Clean local `7f2969f`; manifest `agent-code-slice@0.2.0` | CLI/API and language adapters inspected; local tests from the preceding review apply to this same revision |
| AI-Agent-Tool-Change-Impact | Committed documentation baseline `81b9e62`; in-progress untracked scaffold observed during reconciliation | Implementation has started; no completed feature, test, package, or release gate inferred |

At the bounded Change Impact inspection, the scaffold contained `package.json`,
`tsconfig.json`, `.gitignore`, `LICENSE`, and `src/types.ts`, `src/errors.ts`,
`src/util.ts`, `src/snapshot.ts`. The manifest declared CommonJS, Node `>=22`,
TypeScript `5.9.3`, `@types/node` `22.15.30`, and package version `0.1.0`.
These are observed local declarations, not installed versions, tested compatibility,
or publication evidence. Types declare a `0.1-draft` envelope and limit defaults;
those declarations do not prove complete runtime enforcement. Snapshot code exists,
but its correctness/security tests were not executed in this Hub documentation task.
This active working tree can change independently after inspection.

The two canonical repository links were checked against local Git remotes and
opened successfully during reconciliation:
[Code Slice](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice) and
[Change Impact](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact).
This establishes repository identity/accessibility, not npm publication or CI results.

## Code Slice completion and publication update

On 2026-09-06 the owner explicitly confirmed Code Slice completed and supplied its
repository URL. npm's [version metadata](https://registry.npmjs.org/agent-code-slice/0.2.0)
was read directly: `name` is `agent-code-slice`, `version` is `0.2.0`, repository
matches the supplied GitHub repository, executable is `code-slice`, and license is MIT.
The [npm package page](https://www.npmjs.com/package/agent-code-slice/v/0.2.0)
is recorded for discovery. This verifies publication identity; it does not equate
local hardening commit `7f2969f` with that published artifact or rerun package/CI tests.
The npm HTML pages returned HTTP 403 to the browsing tool; their page content was
not verified. Publication identity was verified through the accessible official
npm registry version endpoint above, not inferred from HTML link availability.

Delivery completion is recorded as Done. Hub lifecycle remains Experimental and
`verification` remains null because native/Hub contract conformance is unresolved.
The other nine tools are not marked complete; further updates await the owner.

## Hub checks

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-01 | Inventory and preservation | Hub contains no tool source, workspace, npm package, or runtime; original `.gitattributes` preserved; sibling source left untouched |
| V-02 | Registry structure and lifecycle | Local validator checks exact authoring fields, unique IDs, lifecycle gates, versions, evidence/release matching, and replacement references; external behavioral evidence requires review |
| V-03 | Roadmap consistency | Validator compares ordered IDs and names with registry and checks lifecycle vocabulary against Tool standard |
| V-04 | Document integrity | Required documents, inline local links/anchors, and fenced JSON syntax checked; task/epic/requirement references reviewed and checked separately |
| V-05 | Architecture and claim review | Human review separates current/target/future contracts, task status/lifecycle, local source/publication, and native/Hub protocol semantics |
| V-06 | Code Slice local evidence | Prior review on unchanged `7f2969f`: 64 tests, typecheck, and eight source-CLI scenarios passed on local macOS/Node `v23.10.0`; not a package install or cross-platform rerun |

Reconciliation checks pass with the current documentation and registry. Run the
commands below to reproduce authoring checks; use their current summary rather than
copying a stale document/link count into multiple files.

```sh
python3 scripts/validate_hub.py
git diff --check
```

`git diff --check` does not cover untracked files. During reconciliation, all Hub
Markdown, registry, and validator files were also checked for trailing whitespace
and final newlines, and `.gitattributes` was compared with HEAD. The validator's
added required-document coverage was exercised with a missing-document fixture.
The preceding review also exercised a valid Stable registry fixture and 15 invalid
registry/link/roadmap cases; those are historical checks, not a checked-in test suite.

## Unverified and pending

- Native-to-Hub protocol compatibility and complete consumer fixtures: HUB-04.
- Code Slice exact packed artifact behavior, current remote CI, and Hub conformance:
  HUB-05. Its 0.2.0 npm identity is now confirmed, but no Hub verification snapshot
  is populated. Other tools' publication identities remain pending.
- Change Impact's active scaffold: no runtime verification performed here.
- Eight other planned tools: no local repositories inspected; no remote-absence,
  capability, release, or availability conclusion follows.
- Future discovery, shared infrastructure, and release automation: not implemented.

No new tool tests were necessary for this documentation-only reconciliation because
Code Slice's inspected revision is unchanged. The Hub checks do not establish an
external release or fix the compatibility gaps recorded in [TASK.md](TASK.md).

## Three-tool documentation review - 2026-09-07

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-07 | Expansion design and Hub integrity | Three detailed drafts define CF-01 through CF-14, RS-01 through RS-13 and RT-01 through RT-13; registry/roadmap append three Planned entries while preserving the original ten; local validator and whitespace checks pass |
| V-08 | KB synchronization at explicit User scope | Read existing KB, maintenance skill/rule, status schema, ecosystem and functional map; two Company-tier attempts returned 403 SHARE_TIER_DENIED with retryable=false and write_committed=false; after KB visibility read back as user, four detailed design parents, three new status records, and three existing index records were written at User tier and read back with exact content/digests and 13 status records; company-wide visibility remains unverified |

The [expansion review](docs/TOOL_EXPANSION.md) records SCMC design disposition,
cross-tool boundaries, evidence references and the correction to two overbroad
findings in the earlier conversational review. The validator source is unchanged.
Its lack of a checked-in regression suite remains a separate maintenance gap.

New external reference links were opened/reviewed: Lucee cfif/tag-island syntax,
Adobe CFML comments, RFC 6901 JSON Pointer and OpenTelemetry trace concepts.
These references support design choices; no dependency was installed and no tool
runtime conformance was established. The retrieved Globe3 exact-draft readback
record is historical evidence; this task did not execute a business write.

The Company KB contains later Code Slice package observations; the Hub's recorded
0.2.0 release remains unchanged because later artifact behavior was not reaudited.
Change Impact and Project Profile status from the KB is explicitly scoped as
knowledge evidence. No additional delivery completion is inferred.

[KB synchronization](docs/KB_SYNC.md) and its pending payload record the exact
Company target, failure, document digests, proposed status records and remaining
updates. This is prepared data, not an applied KB migration. The 40 tool acceptance
cases are design requirements only; none were run as implementation tests here.
