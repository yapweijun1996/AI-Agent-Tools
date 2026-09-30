# Owner-authorized monorepo decision

Decision date: 2026-09-30. Risk: HIGH. The owner explicitly requests all ten owned AI-Agent-Tool repositories consolidated into AI-Agent-Tools and will handle any repository deletion manually. This decision supersedes the former source-import prohibition and monorepo maturity gate in AGENTS, D-01/D-08 and Architecture. It does not authorize shared implementation libraries, agent reasoning, merging, repository deletion or npm publication.

## Structure and tradeoffs

`packages/<tool>` contains each complete tracked source tree, except reproducible build output. Independent package-lock files and isolated npm installs retain each module system, dependency graph and TypeScript version. Root scripts orchestrate native package scripts. This intentionally avoids dependency hoisting and compiler drift; it costs ten small install operations rather than a shared lockfile. AIT's existing package `files` allowlist and dependency-free runtime remain intact. No code is absorbed into AIT or given universal protocol semantics.

The root lockfile governs the dependency-free root package; package lockfiles govern tools. `npm run bootstrap` installs all packages with scripts disabled, while `npm run verify` builds, checks and tests them. Optional native Linkage dependencies require a separate explicit rebuild and verification; no native parser claim follows from fake-parser tests.

## Ownership and licensing

Root Apache-2.0 applies to Hub-owned files. Original MIT LICENSE files and source notices are retained byte-for-byte. CFML Linkage retains `private: true` and no declared package license. Policy Check retains `private: true` and `UNLICENSED`; Error Lens remains private/MIT. Imported source is not relicensed. Source manifests that declare MIT but lack an upstream LICENSE file remain documented gaps; do not fabricate copyright notices or publish to repair those gaps.

## Compatibility and rollback

Names, executable mappings, `exports`, ESM/CommonJS boundaries, versions, private flags and native CLI/JSON contracts are preserved. Repository/bugs/homepage metadata changes to the monorepo. Existing published metadata cannot be changed without a future release. Registry recorded release versions and AIT exact-version profiles remain unchanged until an artifact audit and explicit release approval.

Rollback before merge: close the draft PR; all original repositories are untouched. After a separately approved merge, revert the consolidation commit, retain recovery bundles and original repositories until all deletion gates pass. No history is rewritten into the public monorepo. Local bundles preserve branches and tags without exposing unreviewed historical credentials or sensitive deleted files.
