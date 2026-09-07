# Company KB synchronization

Scope: AI-Agent-Tools documentation and knowledge maintenance. Last reviewed:
2026-09-07. The existing Company KB `AI Agent Tools` has ID
`3e631a61-d63d-4c25-aaac-cd1557b063f2` and category family `ai-agent-tools.*`.
The KB-MCP visibility was explicitly changed to `user` and read back as `user`
before the successful synchronization. The logical KB remains the project's
SSOT, but this run is user-visible rather than company-wide.

## Ownership and conflict handling

The Company KB holds cross-session project knowledge; repository files hold
reviewable contracts, registry snapshots and Git history. Update corresponding
records in the same task. Source code and immutable releases establish actual
behavior; a KB summary alone does not upgrade a Hub release or conformance claim.
Agent Brain stores only a compact pointer to this project KB.

Preserve dates when evidence differs. For example, this Hub records the previously
reviewed Code Slice 0.2.0 publication snapshot; the Company KB also reports later
0.2.1 package evidence. This task does not independently audit that later artifact,
overwrite the KB's report, or attach it to the Hub's 0.2.0 verification field.

## Existing record owners

| Record | Item ID | Update responsibility |
| --- | --- | --- |
| Canonical Ecosystem SSOT | `5e5c8c5e-c3e9-460d-a985-3165e0b83031` | Synchronize order, status axes, added designs and evidence limits |
| Functional Map | `e360b621-3c4c-4a81-b7ce-f3d892015be8` | Synchronize tool responsibilities and optional integration boundaries |
| Tool Status Record Schema v1 | `6c736cc3-756b-435c-9ae0-2f911143f4ad` | Preserve schema, add new IDs to the canonical record index |
| Maintenance Rule | `83d272d8-2965-4dee-9f93-b10fe760c6e9` | Existing update-in-place, company-tier and readback policy |
| Maintenance Skill | `0fb4d79d-c9fa-4787-9e61-1ad037394875` | Existing workflow; no skill implementation change required |

Each tool has one active status record with independent roadmap, design,
development, verification, release and evidence axes. At the initial three-tool
sync, all new records used `roadmap_state: queued`, `design_status: draft`,
`development_status: not_started`, `verification_status: not_started`, and
`release_status: not_started`. The later CFML Check follow-up records local
development and test evidence without changing its Hub lifecycle. `evidence_status:
partial` still refers to incomplete admission/release evidence. Repository/package
identities and release versions remain unknown until verified. Do not register
planned designs as runnable KB tools.

## Synchronization procedure

1. Read the existing ecosystem, relevant status/design records and maintenance
   rule. Search/list before creating; never create a second current-status record.
2. Update local contracts, registry, roadmap, task ledger and evidence scope.
3. Write full detailed documents with source path, design revision, lifecycle,
   and SHA-256 of UTF-8 content normalized to LF. Ingest long documents with
   server-managed chunks; preserve full parent content for exact readback.
4. Update existing canonical summaries/index in place, preserving unrelated
   metadata. Keep historical implementation/release evidence separately scoped.
5. Read back new status records and full design parents; compare identity,
   status, exact normalized content and content digest. Read back updated
   ecosystem, functional map and canonical status index as well.
6. Record item IDs and verified digests below, run Hub checks, inspect the diff,
   and commit. Update the Brain pointer with the actual commit only after Git
   confirms it. Do not claim a remote push from a local commit.

The existing maintenance policy requires company share tier for company-wide SSOT.
The owner explicitly changed this KB's visibility to `user`, so the first two
company-tier attempts correctly failed with `above_scope`. The successful run used
user-tier writes with new idempotency keys. Use stable idempotency keys for exact
retries and check an uncertain write before retrying. User-tier synchronization is
not evidence of company-wide visibility; that requires a separate Company-tier
authorization and a deliberate visibility change.

## 2026-09-07 synchronization receipt

Status: **Synchronized at User tier**. The current KB visibility was read back as
`user`; all writes below returned `write_committed: true`, and all affected items
were read back successfully. The earlier company-tier failures remain preserved as
scope evidence: `req-b45ecb087ef7417cbf18357528bd356a` and
`req-50b6e146a41c407894baf8c2ec8b9bc7` both returned 403
`SHARE_TIER_DENIED`, `retryable: false`, `write_committed: false`.

The [synchronization manifest](KB_SYNC_PENDING.json) now records the applied
user-tier item IDs and readback results. Document bodies remain in their owning
Markdown files; the manifest records identity and digest evidence without creating
a second project SSOT.

| Local document | SHA-256 of UTF-8 LF content | User KB parent | Chunks | Readback |
| --- | --- | --- | ---: | --- |
| `docs/TOOL_EXPANSION.md` | `91fb6954afc0daca008250fd167f0ddc4956bf425377b40c0cef0077f78a1b80` | `3e0f9dfa-e53a-463e-872d-6869aecc8802` | 4 | Exact |
| `docs/tools/AGENT_CFML_CHECK.md` | `98b113c081934a1e7ecf0c506f2991c1d73fe5730ed13f0a5120f10433242dcb` | `63ddf381-7f18-426a-86eb-7a34a4c80a6b` | 5 | Exact |
| `docs/tools/AGENT_RESULT_STORE.md` | `a54773386f99e9ffa598d985ff23268b1cdb065fc75942fb1c137d978fb19fd5` | `b7084e94-fa4b-4ac9-8941-f75448c6ed04` | 6 | Exact |
| `docs/tools/AGENT_RUNTIME_TRACE.md` | `6186851e0c6484e6700b3fbe9144b47a82d421f460c77dc4a712fb5ed3c424ac` | `d489e96f-b1ef-4f16-894d-e5558539eac7` | 6 | Exact |

The new User-tier status records are `67898e2f-f74c-4701-b0c7-690b45d6dcdb`
(`agent-cfml-check`), `0d4ef250-e841-4d79-8ed2-4d5b68dc2804`
(`agent-result-store`), and `0d0acca2-62d7-4453-b657-547e8bf02287`
(`agent-runtime-trace`). Each readback confirms `roadmap_state=queued`,
`design_status=draft`, development/verification/release `not_started`, and
`evidence_status=partial`.

The existing Canonical Ecosystem SSOT, Functional Map, and Tool Status Schema
records were updated in place and read back at User tier. The canonical active
status-record count is now 13, with no new implementation, release, or conformance
claim. Company-wide sharing remains a separate follow-up because the current KB
visibility is User.

## 2026-09-07 CFML feasibility follow-up

The local independent repository `AI-Agent-Tool-CFML-Check` was created and committed
at `9ce90e9b3c6e4ad03ee8171f31ce46c97a0f0837`. Its local `npm run typecheck`,
`npm test` (17/17), CLI JSON scenarios, and `npm pack --dry-run` passed on Windows.
The source repository has no confirmed canonical remote URL or maintainer record,
and no engine-backed CF-14 trial was run.

The existing User-tier status item `67898e2f-f74c-4701-b0c7-690b45d6dcdb` was updated
in place after readback. Its Hub lifecycle remains `Planned`, `development_status`
is `in_progress`, and `verification_status` is `partial`; the record points to the
local commit and keeps release status `not_started`. This is local feasibility
evidence, not Experimental admission, publication evidence, or company-wide sharing.

## 2026-09-07 executable verification follow-up

Hub commit `5c468211ccc0a8fa769b2326c094a007156b3e7a` records the next local
verification tranche: `capabilities --json`, `npm run typecheck`, `npm test`
(17/17), direct CLI checks for `valid.cfm` and `misnested.cfm`, and
`npm pack --dry-run`. The package dry-run listed 25 files for
`agent-cfml-check@0.1.0`; it did not publish an artifact. The valid fixture
returned `pass`; the misnested fixture returned `violations` with
`UNCLOSED_TAG` and `MISMATCHED_CLOSE`, both as completed exit-0 checks.

The existing User-tier CFML design parent, single active status record, Canonical
SSOT and Functional Map were updated in place and read back. All remain User-tier;
the status axes remain `roadmap_state=in_progress`, `development_status=in_progress`,
`verification_status=partial`, `release_status=not_started`, and
`hub_lifecycle=Planned`. No package publication, engine compatibility, CF-14,
cross-platform, canonical remote repository, or Experimental admission claim was
added.

| Read-back record | Item ID | Source/digest evidence |
| --- | --- | --- |
| `docs/TOOL_EXPANSION.md` | `3e0f9dfa-e53a-463e-872d-6869aecc8802` | SHA-256 `4d5a536bed5958ba513aeb80c63791161c3435663f0057799a106c8c0744ac39`; source commit `5c468211ccc0a8fa769b2326c094a007156b3e7a`; 9,684 chars |
| `docs/tools/AGENT_CFML_CHECK.md` | `63ddf381-7f18-426a-86eb-7a34a4c80a6b` | SHA-256 `ab200cf9640c103e07f19a563a65647694e47c96b91aba2fe821f3ae23d4cb3e`; source commit `5c468211ccc0a8fa769b2326c094a007156b3e7a`; 12,805 chars |
| `Tool Status - agent-cfml-check` | `67898e2f-f74c-4701-b0c7-690b45d6dcdb` | User-tier readback; local evidence refs expanded; 390 chars |
| `AI-Agent-Tools Canonical Ecosystem SSOT` | `5e5c8c5e-c3e9-460d-a985-3165e0b83031` | User-tier readback; CFML implementation evidence expanded |
| `AI-Agent-Tools Functional Map` | `e360b621-3c4c-4a81-b7ce-f3d892015be8` | User-tier readback; CFML boundary/evidence expanded |

The pending manifest records these updates without creating duplicate design or
status records. Company-wide sharing remains a separate authorization boundary.
