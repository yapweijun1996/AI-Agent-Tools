# Validation and evidence

Latest Hub review: 2026-09-12. The original source/release observations below are
dated 2026-09-06 and remain historical. This document owns the Hub's evidence
scope. Individual
tool test plans, dependencies, and release artifacts belong to their repositories.

## Current source observations

| Repository | Observed source state | What it establishes |
| --- | --- | --- |
| AI-Agent-Tools | Initial baseline `2f2d46e`; documentation commits are recorded in Git history | Documentation foundation and local authoring checks; no root npm/runtime/discovery implementation |
| AI-Agent-Tool-Code-Slice | Clean local `7f2969f`; manifest `agent-code-slice@0.2.0` | CLI/API and language adapters inspected; local tests from the preceding review apply to this same revision |
| AI-Agent-Tool-Change-Impact | Committed documentation baseline `81b9e62`; in-progress untracked scaffold observed during reconciliation | Implementation has started; no completed feature, test, package, or release gate inferred |
| AI-Agent-Tool-Project-Profile | Public `main` commit [`c250438`](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/commit/c25043856cb4984e30d0a61672213e51b6c3758d); source manifest `agent-project-profile@0.1.2` | Implementation, tests, packaging, and local security checks inspected; npm `latest` remains published `0.1.1`, so the corrected source is not a released artifact |
| AI-Agent-Tool-CFML-Check | Public repository [README](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Check); local feasibility commit `9ce90e9b3c6e4ad03ee8171f31ce46c97a0f0837` | Repository identity is confirmed and the local feasibility slice is inspectable and exercised; engine compatibility, npm publication and cross-platform evidence remain unverified |
| AI-Agent-Tool-Symbol-Search | Public `main` commit [`303c3b5`](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/commit/303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14); source manifest `agent-symbol-search@0.1.0` | TypeScript implementation, schemas, tests, packaging, capability, benchmark, and documentation checks inspected; npm package is not published |
| AI-Agent-Tool-Test-Scope | Public repository [README](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope) and published npm identity `agent-test-scope@0.1.1` | Repository identity and npm package metadata confirmed; implementation and release claims are recorded by the project, but Hub protocol conformance and an independent artifact audit remain unverified |

At the bounded Change Impact inspection, the scaffold contained `package.json`,
`tsconfig.json`, `.gitignore`, `LICENSE`, and `src/types.ts`, `src/errors.ts`,
`src/util.ts`, `src/snapshot.ts`. The manifest declared CommonJS, Node `>=22`,
TypeScript `5.9.3`, `@types/node` `22.15.30`, and package version `0.1.0`.
These are observed local declarations, not installed versions, tested compatibility,
or publication evidence. Types declare a `0.1-draft` envelope and limit defaults;
those declarations do not prove complete runtime enforcement. Snapshot code exists,
but its correctness/security tests were not executed in this Hub documentation task.
This active working tree can change independently after inspection.

The four canonical repository links were checked and opened successfully during
reconciliation:
[Code Slice](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice) and
[Change Impact](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact), plus
[Project Profile](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile) and
[Symbol Search](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search).
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

## Project Profile implementation and release audit

On 2026-09-07, the public [Project Profile commit
`c250438`](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/commit/c25043856cb4984e30d0a61672213e51b6c3758d)
was inspected from a source archive. Its manifest declares `agent-project-profile`
version `0.1.2`, with the executable mapped to `dist/bin.js`; the repository
documents bounded, read-only profiling and a cross-platform CI matrix. The
[npm registry metadata](https://registry.npmjs.org/agent-project-profile) reports
published `latest` version `0.1.1`; version `0.1.2` was not present. The exact
published `0.1.1` package was installed into a clean consumer and its generated
binary reproduced the documented P0 behavior: `--version` produced no output and
returned exit code 0. This is a release defect, not evidence that the current
source entry point is still broken.

The exact source commit passed `npm ci --ignore-scripts`, `npm run typecheck`,
`npm test` (31 passed), `npm run test:packaged-cli`, and
`npm audit --omit=dev --audit-level=moderate` (zero vulnerabilities). A local
`npm publish --dry-run --ignore-scripts` also produced a valid `0.1.2` artifact;
no publish action was performed. These results establish an Experimental
implementation snapshot, not a published `0.1.2` release or Hub protocol
conformance.

One residual security/robustness concern remains: the scanner reports
`REPOSITORY_CHANGED` when file state differs across a read but still retains the
read buffer. The race itself was not reproduced, so this is recorded as a
fail-closed hardening and coverage item rather than a confirmed exploit. The
package metadata declares MIT, but the repository and dry-run package did not
include a `LICENSE` file; release readiness should address that packaging gap.

## Symbol Search implementation admission review

On 2026-09-08, the public [Symbol Search commit
`303c3b5`](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/commit/303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14)
was inspected from a source archive. Its TypeScript-only V1 implements bounded
`search`, `symbols`, `definition`, `references`, `implementations`, and
`capabilities` operations using the TypeScript compiler API. It documents explicit
non-goals for JavaScript, Python, and CFML adapters, full-source return, code
execution, network access, dependency installation during search, and repository
mutation. The repository includes maintained request/result/capability schemas,
security fixtures, and an MIT `LICENSE` file.

The source archive passed `npm run verify` (lint, typecheck, and 30 tests),
`npm run smoke:pack`, `npm run capability:check`, and
`npm run benchmark:check`. `npm run docs:check` reached its final Git evidence
check but could not inspect `HEAD` because the review used a source archive without
`.git`; this is an evidence-environment limitation, not a reported runtime failure.
The npm registry query for `agent-symbol-search` returned 404, so no npm identity
or release version is recorded. These observations satisfy Experimental admission,
not publication, Hub protocol conformance, or cross-platform certification.

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
- CFML Check: engine compatibility, CF-14 engine comparison, npm publication, and
  cross-platform evidence remain unverified.
- Symbol Search: npm publication, Hub protocol conformance, and cross-platform
  certification remain unverified; its docs check needs a Git checkout for the
  final HEAD evidence step.
- Seven other planned tools: no local repositories inspected; no remote-absence,
  capability, release, or availability conclusion follows.
- Future discovery, shared infrastructure, and release automation: not implemented.

The CFML Check tests were run in its independent repository; the Hub checks do not
establish an external release or engine compatibility and do not fix the remaining
gaps recorded in [TASK.md](TASK.md).

## Three-tool documentation review - 2026-09-07

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-07 | Expansion design and Hub integrity | Three detailed drafts define CF-01 through CF-14, RS-01 through RS-13 and RT-01 through RT-13; registry/roadmap append three Planned entries while preserving the original ten; local validator and whitespace checks pass |
| V-08 | KB synchronization at explicit User scope | Read existing KB, maintenance skill/rule, status schema, ecosystem and functional map; two Company-tier attempts returned 403 SHARE_TIER_DENIED with retryable=false and write_committed=false; after KB visibility read back as user, four detailed design parents, three new status records, and three existing index records were written at User tier and read back with exact content/digests and 13 status records; company-wide visibility remains unverified |
| V-09 | CFML Check feasibility slice | Independent local commit `9ce90e9b3c6e4ad03ee8171f31ce46c97a0f0837`; `capabilities --json`, `npm run typecheck`, `npm test` (17/17), CLI valid/misnested/unsupported JSON scenarios, and `npm pack --dry-run` passed on Windows 2026-09-07; CF-14 and cross-platform/engine evidence remain pending |

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
User-tier target, historical Company-tier failures, document digests, status record
updates and remaining scope. CFML Check's local tests do not change the Hub registry
lifecycle or the 40-case design evidence boundary.

## Symbol Search registration review - 2026-09-08

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-10 | Symbol Search Experimental admission | Public commit `303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14`; `npm run verify` passed with 30 tests, `npm run smoke:pack`, `npm run capability:check`, and `npm run benchmark:check` passed; npm lookup returned 404 and `npm run docs:check` could not inspect Git `HEAD` from the source archive |

The repository is therefore registered with confirmed GitHub identity and
`status: "Experimental"`, while `npm`, `release_version`, and `verification`
remain `null`. This records inspectable implementation evidence without implying
an npm release, Hub protocol conformance, or delivery completion.

## Test Scope registration review - 2026-09-12

The public [Test Scope repository](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope)
was read and its README, specification, design, task board, progress, epic and
roadmap were reviewed. The repository documents a deterministic, read-only V0.1
planner for JavaScript/TypeScript/JSX/TSX repositories with Vitest, Jest and the
Node.js native test runner. It states that `0.1.1` is published with dual ESM/
CommonJS entrypoints and provenance.

The official [npm registry metadata](https://registry.npmjs.org/agent-test-scope)
was queried directly and reports package name `agent-test-scope`, latest version
`0.1.1`, a repository matching the GitHub project, and an MIT license. This is
enough to record the canonical repository and package identities. The entry
remains `Planned` because this Hub has not independently audited the packed
artifact, native/Hub protocol conformance, or the claimed release checks; no
`verification` snapshot is recorded.
