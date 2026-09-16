# Validation and evidence

Latest Hub review: 2026-09-16. The original source/release observations below are
dated 2026-09-06 and remain historical. This document owns the Hub's evidence
scope. Individual
tool test plans, dependencies, and release artifacts belong to their repositories.

## Audited source/release snapshots

The table below preserves the immutable source snapshots used for the recorded
implementation and artifact reviews. A changing public `main` branch is not a
replacement for those release-specific observations; the current remote-head and
CI observation is recorded separately below.

| Repository | Observed source state | What it establishes |
| --- | --- | --- |
| AI-Agent-Tools | Initial baseline `2f2d46e`; documentation and AIT runtime commits are recorded in Git history | Documentation foundation, local authoring checks, and the dependency-free `agent-tools@0.1.0` runtime; no independent tool source is copied here |
| AI-Agent-Tool-Code-Slice | Clean local `7f2969f`; manifest `agent-code-slice@0.2.0` | CLI/API and language adapters inspected; local tests from the preceding review apply to this same revision |
| AI-Agent-Tool-Change-Impact | Public `main` commit [`f298328`](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/commit/f298328d7035adce57fc57fdc36ac30da70a2a68); clean clone `npm ci`, typecheck and 36 tests passed; published `0.1.1` artifact smoke-tested in V-19 | Inspectable implementation with documented bounded impact analysis, read-only behavior and runnable tests; broader platform evidence and Hub conformance remain unverified |
| AI-Agent-Tool-Project-Profile | Public `main` commit [`c250438`](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/commit/c25043856cb4984e30d0a61672213e51b6c3758d); source manifest `agent-project-profile@0.1.2` | Implementation, tests, packaging, and local security checks inspected; npm `latest` remains published `0.1.1`, so the corrected source is not a released artifact |
| AI-Agent-Tool-CFML-Check | Public `main` commit [`d132a82`](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Check/commit/d132a82de4e2a764710e04968f8a480b8b6153c7); clean clone `npm ci`, typecheck and 22 tests passed; published `0.1.1` artifact audited in V-22 | Inspectable bounded CFML structural checker with fixtures, schema and package-surface tests; engine compatibility and full cross-platform evidence remain unverified |
| AI-Agent-Tool-Symbol-Search | Public `main` commit [`303c3b5`](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/commit/303c3b5004cfdbd2eb7fb09eeebe64b3e4895f14); published `0.1.2` artifact audited in V-23 | TypeScript implementation, schemas, tests, packaging, capability, benchmark, and documentation checks inspected; Hub conformance and broader platform evidence remain unverified |
| AI-Agent-Tool-Test-Scope | Public `main` commit [`e3c4593`](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope/commit/e3c4593fb9b12233280dffd801a3c153ef9b3b1c); clean clone `npm ci`, dual typecheck/build and 17 tests passed; published `0.1.1` artifact audited in V-21 | Inspectable bounded verification planner with shared CLI/library engine and documented limits; Hub protocol conformance and broader platform evidence remain unverified |

At the earlier bounded Change Impact inspection, the scaffold contained `package.json`,
`tsconfig.json`, `.gitignore`, `LICENSE`, and `src/types.ts`, `src/errors.ts`,
`src/util.ts`, `src/snapshot.ts`. The manifest declared CommonJS, Node `>=22`,
TypeScript `5.9.3`, `@types/node` `22.15.30`, and package version `0.1.0`.
These are observed local declarations, not installed versions, tested compatibility,
or publication evidence. Types declare a `0.1-draft` envelope and limit defaults;
those declarations do not prove complete runtime enforcement. Snapshot code exists,
but its correctness/security tests were not executed in this Hub documentation task.
That historical working tree could change independently after inspection; the
current public commit and clean-clone audit are recorded above.

The canonical repository links listed in the audited snapshot table were checked
and opened successfully during their respective reviews. This establishes repository
identity/accessibility, not npm publication or current CI results.

## Current remote-head and CI observation - 2026-09-15

This is a bounded read-only observation of public `main` heads, package manifests,
and the GitHub Actions run associated with each exact head. It is not a release
certificate and does not replace the immutable source or npm artifact evidence above.

| Tool | Current public `main` | Manifest/package observation | Associated CI observation |
| --- | --- | --- | --- |
| Code Slice | `12411e9153282e0304a985c1007e0e4bad4fcf31` | Source package is `0.4.0`; npm `latest` is `0.4.0`, while the Hub's recorded reviewed release remains `0.2.0` | [Run 34551479033](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/actions/runs/34551479033) passed across its Windows/macOS/Linux Node matrix |
| Change Impact | `f298328d7035adce57fc57fdc36ac30da70a2a68` | Source package remains `0.1.1` | [Run 34551478970](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact/actions/runs/34551478970) passed on Windows/macOS/Linux with Node 22/24 |
| Project Profile | `b711b7244e369e86038d8a6eb05de7de481c8f20` | Source package remains `0.1.2`; npm `latest` remains `0.1.1` | [Run 34826574214](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile/actions/runs/34826574214) passed on Windows/macOS/Linux with Node 18.18/20/22 |
| Test Scope | `aa39505d646d1ddf376c4413f294e8e67d913748` | Source package remains `0.1.1` | [Run 34805729863](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope/actions/runs/34805729863) passed on Node 20/22; workflow matrix is not evidence for all three OS families |
| CFML Check | `afda57d711b8e57e05e4a03a52cf13faa0bbcdfd` | Source package remains `0.1.1` | [Run 34805721849](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Check/actions/runs/34805721849) passed on Node 18.18/20/22; this does not establish CFML engine compatibility |
| Symbol Search | `0e251c786edfd13e38f469289c5939e2acbdd39b` | Source package remains `0.1.2`; npm `latest` remains `0.1.2` | [Run 34805726939](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search/actions/runs/34805726939) failed because the Documentation check failed on Ubuntu Node 22/24/26; package-smoke jobs passed on Ubuntu/macOS/Windows |

The Symbol Search CI failure belongs to the current public `main` snapshot; it does
not retroactively invalidate the separately audited published `0.1.2` artifact, but
it prevents treating current source/CI as clean evidence. The Code Slice `0.4.0`
observation likewise does not replace the Hub's exact `0.2.0` release snapshot.

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
published `latest` version `0.1.1`; version `0.1.2` was not present. A prior audit
installed the exact published `0.1.1` package into a clean consumer and recorded a
P0 distribution behavior: `--version` produced no output and returned exit code 0.
The 2026-09-15 exact-artifact re-audit below did not reproduce that symptom on the
current host; the discrepancy remains a release/platform evidence gap, not a reason
to silently promote the package.

The exact source commit passed `npm ci --ignore-scripts`, `npm run typecheck`,
`npm test` (31 passed), `npm run test:packaged-cli`, and
`npm audit --omit=dev --audit-level=moderate` (zero vulnerabilities). A local
`npm publish --dry-run --ignore-scripts` also produced a valid `0.1.2` artifact;
no publish action was performed. The exact published `0.1.1` tarball declares MIT
but contains no `LICENSE` file, which is a release-packaging gap under the Hub
Release standard. These results establish an Experimental implementation snapshot,
not a published `0.1.2` release or Hub protocol conformance.

## Change Impact published artifact audit

On 2026-09-15, `npm pack --ignore-scripts agent-change-impact@0.1.1` returned the
published tarball with 41 files, unpacked size 326,963 bytes, shasum
`4f3e5102f521e2c6a2830604f6a127d8b84f9554`, and integrity
`sha512-EWR7/JszMR/jswoNXh4kP4kdMrMhmHdQHPSn+NvX9890cp42F1o8ml3T0BZK7vXouYZzrOTRs8uRQKYbl21H3Q==`.
A clean temporary consumer installed that tarball with lifecycle scripts disabled.

The artifact produced `capabilities --json` with exit 0, `ok: true`, schema
`0.1-draft`, and operation `capabilities`. Against a temporary Git-backed
TypeScript fixture, `file --json` returned exit 0, operation `file-impact`, and
`analysis.status: complete`. A missing project configuration returned exit 1 with
`PROJECT_CONFIG_NOT_FOUND`; a missing file returned exit 1 with `FILE_NOT_FOUND`.
The initial non-Git target correctly returned `NOT_A_REPOSITORY` rather than
silently analyzing an unrecognized project. This verifies the package identity and
these bounded native behaviors only; it does not establish all operations, platforms,
Hub target-envelope conformance, or a verification snapshot.

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
| V-01 | Inventory and preservation | Hub contains no copied independent tool source or workspace; the explicitly authorized private `agent-tools@0.1.0` runtime is present; original `.gitattributes` preserved and sibling source left untouched |
| V-02 | Registry structure and lifecycle | Local validator checks exact authoring fields, unique IDs, lifecycle gates, versions, evidence/release matching, and replacement references; external behavioral evidence requires review |
| V-03 | Roadmap consistency | Validator parses the complete delivery table, rejects malformed rows, compares ordered IDs/names with the registry, and checks lifecycle vocabulary against Tool standard |
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

- Native-to-Hub profile/migration compatibility remains unverified; HUB-04 target-envelope consumer fixtures and completeness semantics are now checked in and passing.
- Code Slice exact packed artifact behavior, current remote CI, and Hub conformance:
  HUB-05. Its 0.2.0 npm identity is now confirmed, but no Hub verification snapshot
  is populated. Other tools' publication identities remain pending.
- Change Impact: broader platform evidence and Hub protocol conformance remain
  unverified; the clean-clone audit and V-19 published-artifact smoke passed.
- CFML Check: engine compatibility, CF-14 engine comparison, and full cross-platform
  evidence remain unverified; V-22 audits the published artifact.
- Symbol Search: Hub protocol conformance and cross-platform certification remain
  unverified; V-23 audits the published artifact, while the earlier source admission
  docs check limitation remains historical.
- Seven other planned tools: no local repositories inspected; no remote-absence,
  capability, release, or availability conclusion follows.
- Current User-tier KB parity for the reconciled 2026-09-15 records is verified by
  content readback; Company-tier visibility remains unverified and is not claimed.
- AIT remote registry refresh, package signatures, OS-level sandboxing, release automation, and shared tool infrastructure: not implemented.

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
findings in the earlier conversational review. The validator now strictly parses
the roadmap table, and its checked-in standard-library regression suite covers the
current repository and the previously reproduced malformed-row gap.

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

## Validator regression review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-11 | Validator regression suite | `python -m unittest discover -v` passed 7 tests covering the current repository, duplicate/non-finite JSON, and malformed roadmap rows; Python syntax compilation also passed |

The suite is dependency-free and does not establish external URL availability,
external repository behavior, or Company KB synchronization.

## User-tier KB reconciliation review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-12 | KB reconciliation at explicit User scope | Read back the existing records, updated the two affected design parents, five status records (four existing plus the new Symbol Search record), Canonical SSOT, Functional Map and Tool Status Schema; all affected User-tier records read back with current content/statuses and the new ID `a94dac3b-9619-4dcc-89fb-025272afeb09`; Company-tier Code Slice update was denied with `SHARE_TIER_DENIED: above_scope` and was not retried or promoted |

The current normalized hashes read back for `docs/TOOL_EXPANSION.md` and
`docs/tools/AGENT_CFML_CHECK.md` are respectively
`139b0f4b8fdb3db10c833d2991649492f5885b7aa16add531d6920c5f6a81a52` and
`0606cc04dfa93f2891c9ba3289af132fb02881781b5540ee77ebc15938e590f0`.
This is User-tier synchronization only; the historical Company-tier receipt and
later independent package evidence remain separately scoped.

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
is now `Experimental` because its implementation, documented limits and basic
tests were independently audited from a clean clone. The packed artifact,
native/Hub protocol conformance, and broader platform evidence remain unverified;
no `verification` snapshot is recorded.

## Planned-tool implementation admission audit - 2026-09-12

The three remaining Planned entries in the reviewed set were audited from clean
shallow clones. Test Scope commit `e3c4593fb9b12233280dffd801a3c153ef9b3b1c`
passed `npm ci --ignore-scripts`, dual TypeScript typechecks, build and 17/17
tests. CFML Check commit `d132a82de4e2a764710e04968f8a480b8b6153c7` passed
`npm ci --ignore-scripts`, typecheck, build and 22/22 tests. Change Impact
commit `f298328d7035adce57fc57fdc36ac30da70a2a68` passed `npm ci --ignore-scripts`,
typecheck, build and 36/36 tests; its test run took about 65 seconds and produced
no intermediate output, then completed successfully.

Each repository contains an inspectable implementation, documented scope and
limits, and runnable basic tests. These observations satisfy the Hub's
`Experimental` admission gate. They do not establish npm publication, Stable
cross-platform support, or native/Hub protocol conformance, so all three retain
`verification: null`.

## ait-tool/v1 dispatch spike - 2026-09-15

A proposed `ait-tool/v1` plugin contract (Company KB item
`fb9b80fa-bcfd-42d7-a5f4-5a6973ca7b7f`, status `PROPOSED`) describes a future
discovery/dispatch CLI that installs independently owned tools by manifest and
runs them as isolated child processes. A local, unpublished spike repository
(`AI-Agent-Tool-AIT`, first commit `9bebbd9`, outside this Hub and never
registered in [TOOL_REGISTRY.json](TOOL_REGISTRY.json)) exercised that
contract manually against `agent-code-slice` version `0.4.0` from a local
checkout, then was deleted after producing this evidence; the Company KB
record (`19883525-60d6-4fa2-ba74-d3b867a9b1d8`) preserves the same findings.

Observed: manifest schema validation rejects a manifest missing required
`ait-tool/v1` fields with exit `2`; `ait install --from-path` resolves the
package's declared `bin` entry and registers it without executing the tool;
`ait list` and `ait doctor` read that registration back; dispatching
`ait slice outline <file>` spawns `code-slice` as a child process with the
caller's working directory preserved, captures its native JSON on stdout, and
wraps it into an `ait-result/v1` envelope (`protocol`, `tool`, `ok`, `status`,
`data`, `meta`). A file-not-found case produced envelope `status: incomplete`
at exit `3`; an unsupported-language case produced `status: denied` at exit
`4`.

**Correction**: the note originally recorded here said these two exit codes
"happened to already match the `ait-tool/v1` table." Reading `agent-code-slice`'s
own documented exit codes ([CLI_CONTRACT.md](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/blob/main/docs/CLI_CONTRACT.md)
in that repository) shows this was wrong: its exit `3` is documented as
"file/root/input error" (an invalid-input case) and its exit `4` as
"unsupported/ambiguous language" (an unsupported-input case) — neither matches
what those same numbers mean in the `ait-tool/v1` table (`3` = incomplete/
insufficient evidence, `4` = policy/security denial). The two numbers lined up
by coincidence; the categories they represent do not. See the dated comparison
below for the full picture. Native-to-Hub profile/migration reconciliation remains
unresolved; the target-envelope semantics are covered separately by V-14.

This historical spike established that the proposed dispatch mechanics were
implementable. At that time, `ait` was not approved, published, or conformant.
The Hub has since authorized and implemented a narrower dependency-free
`agent-tools@0.1.0` runtime with explicit install/dispatch approval. The spike did
not exercise real npm-registry installation, any tool other than `agent-code-slice`,
or filesystem/network sandboxing beyond environment-variable filtering.

## AIT runtime implementation review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-13 | AIT runtime acceptance | Local `agent-tools@0.1.0` implements `list`, `doctor`, pinned registry installation, controlled `--from-path` installation, explicit `--allow-experimental`, explicit `--allow-execution` dispatch, reduced environment, no-shell child process invocation, and `ait-result/v1`; the 7 AIT-runtime tests passed, and a temporary local package completed install/dispatch/doctor readback; real npm publication, remote refresh, signatures and OS sandboxing remain unverified |

The implementation keeps independent tool source and release ownership outside the
Hub. The package is private and unlicensed pending a release decision; no network
installation was performed during this validation. AIT remains `HUB-06 In progress`
until publication and the remaining security/compatibility policies are reviewed.

## HUB-04 exit-code comparison - 2026-09-15

To make `HUB-04` ("Resolve native/Hub JSON, exit, and completeness contracts")
concrete, this compares the target [CLI standard](docs/CLI_STANDARD.md#exit-codes)
against the exit codes two `Experimental` tools already document for
themselves, read directly from their own repositories (not inferred):

| Exit | Hub target ([CLI_STANDARD.md](docs/CLI_STANDARD.md#exit-codes)) | `agent-code-slice` ([CLI_CONTRACT.md](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice/blob/main/docs/CLI_CONTRACT.md)) | `agent-project-profile` (repository `README.md`) |
| ---: | --- | --- | --- |
| 0 | Complete supported analysis | Successful operation | Complete, usable profile |
| 1 | Execution or internal failure | Unexpected internal failure | Fatal failure; no usable profile |
| 2 | Invalid invocation, input, or configuration | Invalid CLI arguments | **Overloaded**: partial/unsupported profile, a strict-mode diagnostic, *or* invalid arguments all use this one code |
| 3 | Unsupported input, insufficient evidence, or resource limit | File/root/input error (closer to Hub's `2`) | Not used |
| 4 | Explicit policy or security boundary rejection | Unsupported/ambiguous language (closer to Hub's `3`) | Not used |
| 5-8 | Not defined | Parse/grammar error; selector not found; selector ambiguous; output/resource limit | Not used |

Two concrete, sourced findings, not an inference:

1. **The three schemes disagree on how many exit-code classes exist** (5 for
   the Hub target, 9 for `code-slice`, 3 for `project-profile`), and on what a
   shared number means. A numeric remap table alone cannot reconcile this: at
   least `code-slice`'s `3`/`4` need to swap categories relative to the Hub
   target, and `project-profile`'s single `2` would have to split into the
   Hub's `2` and `3` — but `project-profile`'s own JSON `status` field (not its
   exit code) is what actually distinguishes those cases today.
2. **`project-profile`'s exit `2` conflates "invalid input" and "incomplete
   result."** A caller cannot tell "you typed a bad flag" from "we produced a
   partial profile" by exit code alone; it must read the JSON body's `status`
   field. This means any Hub-conformant consumer (including a future `ait`)
   must treat exit code as a coarse ok/not-ok signal only and use the JSON
   envelope's own status/error fields as the semantic authority — which is
   already what [JSON_STANDARD.md](docs/JSON_STANDARD.md#consumer-rules) says,
   but this is now backed by two real, disagreeing implementations rather than
   the hypothetical fixture in that document.

This comparison remains evidence that native tools need explicit profiles or
migration; no mapping has been adopted and no tool's exit codes have changed. The
target contract is resolved without changing those native tools.

## HUB-04 target completeness review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-14 | Executable target-envelope consumer fixtures | `tests/hub_consumer.test.js` executes `tests/fixtures/hub-contract-tool.js` and verifies complete success with findings, partial/ambiguous/unsupported/limit outcomes, invalid/internal errors, null data for all non-`ok` statuses, malformed/missing/native envelope rejection, and exit/status mismatches; all 4 consumer tests passed as part of the 14-test Node suite. This verifies the Hub target contract only and does not establish external tool adoption or native protocol migration. |

HUB-04 target completeness semantics are therefore complete. Native tool
compatibility remains a separately scoped profile/migration decision under HUB-05
and future integration work.

## Code Slice native consumer profile review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-15 | Explicit Code Slice profile | `docs/profiles/AGENT_CODE_SLICE.md` records the registered `agent-code-slice@0.2.0` / `code-slice` identity, native v1.0/v1.1 envelopes, exit/error-code authority, bounded `outline` pagination, protocol-error conditions, and non-goals. `tests/code_slice_profile.test.js` executes a deterministic native-contract fixture for complete success, bounded success, CLI error, operation error, malformed/unknown output, and exit/status mismatch; all 3 profile tests passed. The source contract was observed at `7f2969ff04540d43c12b13bc863e4a745209ff28`; this does not certify the exact published artifact or promote Hub lifecycle. |
| V-16 | Explicit Project Profile profile | `docs/profiles/AGENT_PROJECT_PROFILE.md` records the source-observed `0.1.2` native contract, the registry/published `0.1.1` release mismatch, `complete`/`partial`/`unsupported`/`error` statuses, `coverage`, strict-mode behavior, and no-execution boundary. `tests/project_profile_profile.test.js` executes deterministic fixtures for complete, partial, unsupported, fatal error, strict rejection, malformed/unknown output, and status/coverage mismatch; all 3 profile tests passed. The source contract was observed at `c25043856cb4984e30d0a61672213e51b6c3758d`; it does not promote Hub lifecycle. |
| V-17 | Exact Project Profile `0.1.1` artifact re-audit | `npm pack agent-project-profile@0.1.1` returned 37 files, shasum `e837507faaa9dcbdfd97b70ddf00456cc985448a`, and the declared `dist/cli.js` binary. A clean temporary consumer installed the tarball with scripts disabled: `--version` exited 0 with `0.1.1\n`; a valid target produced `status: complete`/exit 0, mixed lockfiles produced `status: partial`/exit 2, and a missing root produced `status: error`/exit 1. The previously recorded no-output defect was not reproduced on this host; cross-environment reconciliation and `0.1.2` publication remain unverified. |

## Change Impact native consumer profile review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-18 | Explicit Change Impact profile | `docs/profiles/AGENT_CHANGE_IMPACT.md` records the published `agent-change-impact@0.1.1` / `agent-impact` identity, `0.1-draft` envelope, complete-vs-partial native success, error-code authority, bounded read-only boundary, and non-goals. `tests/change_impact_profile.test.js` executes deterministic fixtures for capabilities, complete/partial usable results, invalid invocation, output failure, malformed/unknown output, and exit/status mismatch; all 3 profile tests passed. The contract was observed at source HEAD `b67c87e277af3a616ec64ff8c1f34992f71aed88`; the sibling worktree was dirty and its uncommitted changes were excluded. V-19 separately audits the published artifact. |
| V-19 | Exact Change Impact `0.1.1` artifact audit | `npm pack --ignore-scripts agent-change-impact@0.1.1` returned 41 files, shasum `4f3e5102f521e2c6a2830604f6a127d8b84f9554`, and the recorded SHA-512 integrity. A clean consumer verified capabilities exit 0, a Git-backed TypeScript fixture's file impact exit 0 with `analysis.status: complete`, and bounded `PROJECT_CONFIG_NOT_FOUND`/`FILE_NOT_FOUND` exit-1 errors. The package identity and these native behaviors are verified; all operations, platforms, and Hub conformance are not. |

## CFML Check and Symbol Search native profile/artifact review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-22 | Exact CFML Check `0.1.1` artifact and profile | `npm pack --ignore-scripts agent-cfml-check@0.1.1` returned 25 files, shasum `a86b3e18c3c156720ed6b34df176fbb03d0b1926`, and the recorded SHA-512 integrity. A clean consumer verified capabilities exit 0, a valid check exit 0 with `status: ok`, and unsupported syntax exit 3 with `UNSUPPORTED_SYNTAX`. `docs/profiles/AGENT_CFML_CHECK.md` and its fixtures preserve the native envelope, structural-violation success, incomplete, and error semantics; the two native profile fixture tests passed; broader engine/platform and Hub conformance remain unverified. |
| V-23 | Exact Symbol Search `0.1.2` artifact and profile | `npm pack --ignore-scripts agent-symbol-search@0.1.2` returned 50 files, shasum `121d996f2fedee187cdfd7b56323ee533246a685`, and the recorded SHA-512 integrity. A clean consumer verified capabilities exit 0, a complete TypeScript symbol search exit 0, and a missing project error exit 1 with `INVALID_REQUEST`. `docs/profiles/AGENT_SYMBOL_SEARCH.md` and its fixtures preserve complete/partial/error native semantics; the two native profile fixture tests passed; broader platform and Hub conformance remain unverified. |

## Published artifact and platform follow-up - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-25 | Unified exact npm packlist audit | Exact published artifacts were packed read-only for Code Slice `0.2.0` (58 files, shasum `73965ce77072b370370555c129fbde7f19499858`), Change Impact `0.1.1` (41 files, `4f3e5102f521e2c6a2830604f6a127d8b84f9554`), Project Profile `0.1.1` (37 files, `e837507faaa9dcbdfd97b70ddf00456cc985448a`), Test Scope `0.1.1` (88 files, `4830019255560757357aace1dbabadcab0a46837`), CFML Check `0.1.1` (25 files, `a86b3e18c3c156720ed6b34df176fbb03d0b1926`), and Symbol Search `0.1.2` (50 files, `121d996f2fedee187cdfd7b56323ee533246a685`). All six exposed a README, declared executable and package contract material (with schema files where the package publishes them); Project Profile's exact artifact declares MIT but omits a `LICENSE` file. Code Slice's extract-only CLI attempt was not treated as a runtime result because its declared `web-tree-sitter` dependency was not installed; dependency-installed artifact smoke remains unrun. This is packlist/identity evidence, not full runtime or security certification. |
| V-26 | Current public source/platform observation | `git ls-remote`, package manifests, and associated GitHub Actions runs were checked for all six published identities. Five current heads had successful associated CI; Symbol Search current `main` failed its Documentation check on Ubuntu Node 22/24/26 while package-smoke jobs passed on all three OS families. Code Slice current `main`/npm latest is `0.4.0`, not the Hub's recorded reviewed `0.2.0`; Project Profile current source remains `0.1.2` while npm latest remains `0.1.1`. Current-head observations do not replace exact release evidence. |
| V-27 | AIT packed-consumer release gate | The initial `agent-tools@0.1.0` dry-run contained five files and an extracted default `ait list --json` failed with exit 1/`READ_FAILED` because `TOOL_REGISTRY.json` was absent. `package.json` now includes that snapshot and a regression test protects the inclusion. A post-edit packed-consumer smoke packed six files and verified `ait list --json` exit 0 with 14 tools plus `ait doctor --json` exit 0. The package remains private/`UNLICENSED`, and no publication was performed. |

| V-28 | Registry signature/provenance boundary | npm registry metadata exposed one `dist.signatures` entry and a `dist.integrity` value for each of the six audited tool versions. `npm audit signatures --json` on the dependency-free Hub returned `found no installed dependencies to audit`; no independent key-trust or provenance verification was claimed. AIT's policy therefore uses registry-native integrity/signature evidence when available and does not introduce a custom signature layer. |

| V-29 | User-tier KB audit follow-up | Project Profile and Symbol Search status records, plus the Canonical SSOT and Functional Map, were updated in place with the current audit facts; the Canonical SSOT Symbol Search publication/current-CI metadata was corrected; readback returned updated content/metadata at User tier. No Company-tier promotion was attempted; `SHARE_TIER_DENIED: above_scope` remains the separate company-scope blocker. |

## AIT public-release candidate audit - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-30 | AIT public-release candidate | `agent-tools@0.1.0` now removes the private flag, declares Apache-2.0, includes `LICENSE`, and records the verified GitHub repository metadata. `npm publish --dry-run --access public --ignore-scripts` passed with seven package files: LICENSE, README, registry snapshot, CLI, runtime documentation, profile catalog, and package manifest. Node tests passed 29/29, the Hub validator passed, the dependency tree is empty, and the CycloneDX SBOM reports no components. Actual npm authentication, publication, and post-publication registry read-back remain unverified. |

## AIT npm package identity update - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-32 | AIT package rename for public publication | The public `agent-tools` name is owned by another npm account. The selected replacement `ai-agent-tools` returned 404 from the public registry, so `package.json` now uses `ai-agent-tools` at version `0.1.0` while retaining the `ait` executable. Apache-2.0 metadata, the seven-file packlist, local tests, and Hub validation remain applicable; publication and post-publication read-back are pending. |

## AIT public npm release - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-33 | Published AIT package and consumer read-back | `ai-agent-tools@0.1.0` published successfully with public access. npm read-back reports `latest: 0.1.0`, Apache-2.0, the verified GitHub repository, and integrity `sha512-RbXH0SApdawfbgsCPpO/R3kCvO93mxeY9naRvPESufYjDXlHkfpDPtUP3JVJtQPpf+O9Xooeo9yZc3O/15ZlFQ==`. A clean temporary consumer installed the package with scripts disabled; its packaged `ait list --json` reported 15 tools and `ait doctor --json` reported registry 15 and installed 0. |

## AIT public npm patch release - 2026-09-16

| ID | Check | Evidence |
|---|---|---|
| V-34 | Published AIT patch release and consumer read-back | `ai-agent-tools@0.1.1` published successfully with public access. npm read-back reports `latest: 0.1.1`, Apache-2.0, the verified GitHub repository, and integrity `sha512-rI/WlF013V6mKdCCVln2xGOa5ApbW7faKHhWRYhu+5QnxY35Ce0nIyg8tOQOeTVGhV83RJjgwSHWzvVOCB/06Q==`. A new temporary consumer installed the published package with scripts disabled; its packaged `ait list --json` reported 15 tools and `ait doctor --json` reported registry 15 and installed 0. |

## CFML Policy Check registration review - 2026-09-16

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-31 | Independent policy-check repository and Hub registration | The owner-supplied local clone for [AI-Agent-Tool-CFML-Policy-Check](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Policy-Check) points to the confirmed GitHub remote and is at initial commit `24e0889657ac7da0fe752c4fb48c9e7f90fcaa4a`, whose tree contains only `.gitattributes`. The Hub records `agent-cfml-policy-check` as `Planned` with npm, release, verification, and deprecation fields `null`; no implementation, tests, package identity, release, or engine evidence is claimed. After registration, `python scripts/validate_hub.py`, `git diff --check`, the untracked-document whitespace check, and the AIT Node suite passed (29/29). |

## User-tier KB profile and artifact reconciliation - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-24 | User-tier KB readback after profile/artifact updates | Existing User-tier status records for CFML Check, Change Impact, Test Scope and Symbol Search were updated in place; the Canonical SSOT and Functional Map were updated in place. Readback confirmed User visibility, published package versions, artifact/profile evidence and the exact native-profile boundary. No Company-tier write or promotion was attempted; the historical `SHARE_TIER_DENIED: above_scope` blocker remains. |

## AIT profile catalog and exact application review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-20 | Exact catalog-backed profile application | `docs/profiles/PROFILE_INDEX.json` is validated for schema, identities, exact versions, executable names, safe relative evidence paths, duplicate matches, and evidence status. `bin/ait.js` selects only an exact tool/package/version/executable match and applies bounded native validators without rewriting the native payload. Node tests passed 28/28, including local install/dispatch evidence for Code Slice, no-match behavior for Project Profile `0.1.1`, malformed/unknown native fixtures, and profile metadata. The catalog remains local, exact, and non-networked; remote refresh and universal adaptation are not implemented. |

## Test Scope native consumer profile and artifact review - 2026-09-15

| ID | Check | Evidence and limitation |
| --- | --- | --- |
| V-21 | Exact Test Scope profile and artifact | The published `agent-test-scope@0.1.1` tarball had 88 files, shasum `4830019255560757357aace1dbabadcab0a46837`, and the recorded SHA-512 integrity. Its README, SPEC, schema, and CLI were inspected. `docs/profiles/AGENT_TEST_SCOPE.md` preserves `complete`/`partial` exit-0 semantics, engine-error exit-1, invalid-argument exit-2, and the no-execution boundary; `tests/test_scope_profile.test.js` passed 2/2 native fixture tests. AIT's built-in validator covers the same envelope and exact catalog entry; this does not establish Hub conformance or broader platform evidence. |
