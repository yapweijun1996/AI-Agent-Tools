# Company KB synchronization

Scope: AI-Agent-Tools documentation and knowledge maintenance. Last reviewed:
2026-09-07. The existing Company KB `AI Agent Tools` has ID
`3e631a61-d63d-4c25-aaac-cd1557b063f2` and category family `ai-agent-tools.*`.

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
development, verification, release and evidence axes. New designs use
`roadmap_state: queued`, `design_status: draft`,
`development_status: not_started`, `verification_status: not_started`, and
`release_status: not_started`. `evidence_status: partial` refers to documented
need/design evidence only. Repository/package identities and release versions
remain unknown until verified. Do not register planned designs as runnable KB tools.

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

Use company share tier as defined by this existing project's maintenance policy.
Use stable idempotency keys for exact retries, and check an uncertain write before
retrying. A failed KB write/readback leaves synchronization incomplete; local
document success alone does not satisfy the task.

## 2026-09-07 synchronization receipt

Status: **Blocked**. The Company-tier `kb_ingest_document` call was rejected by
the service with HTTP 403, `SHARE_TIER_DENIED`, message
`share-tier write denied: above_scope`, and `write_committed: false`.
Request ID: `req-b45ecb087ef7417cbf18357528bd356a`.

Readback after rejection confirmed 18 existing KB items, including 10 current
tool-status records, and no new tool or expansion-design records. No existing
Company KB item was changed by this task. Local documentation now describes 13
registry entries; the KB remains on its preceding ten-tool state until authorized
synchronization succeeds. This is an explicit synchronization gap, not evidence
that either snapshot silently updated the other.

The [pending synchronization payload](KB_SYNC_PENDING.json) contains four full-document
source descriptors, three schema-conformant proposed status records, and three
existing-record update plans. Document bodies remain in their owning Markdown
files; the payload does not duplicate them or implement a synchronization runner.
It preserves the required company tier rather than creating a competing private KB.

| Local document | SHA-256 of UTF-8 LF content | Company KB write |
| --- | --- | --- |
| `docs/TOOL_EXPANSION.md` | `1ab2f39825b99159121a075c58f849226bec0c94cc6a3d0f57191f4a23c6a244` | Not written |
| `docs/tools/AGENT_CFML_CHECK.md` | `98b113c081934a1e7ecf0c506f2991c1d73fe5730ed13f0a5120f10433242dcb` | Not written |
| `docs/tools/AGENT_RESULT_STORE.md` | `a54773386f99e9ffa598d985ff23268b1cdb065fc75942fb1c137d978fb19fd5` | Not written |
| `docs/tools/AGENT_RUNTIME_TRACE.md` | `6186851e0c6484e6700b3fbe9144b47a82d421f460c77dc4a712fb5ed3c424ac` | Not written |

Resume with a connection authorized to write this Company KB. Reread records and
verify the listed hashes before applying the pending payload. Then read back all
affected content and status/index records, update this receipt and TASK/VALIDATION,
and commit the synchronization result. A local commit of the current documents
does not complete the denied Company KB write.
