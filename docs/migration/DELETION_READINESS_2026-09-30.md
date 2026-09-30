# Original repository deletion readiness — 2026-09-30

Read-only audit observed at 2026-09-30T15:22:08+00:00. The owner performs any deletion. No repository, npm publication, settings, or history was changed by this audit.

All ten repositories are **blocked for deletion** until the shared preservation gates below are satisfied. Source migration is verified; external usage remains **unknown**. Zero open issues or PRs does not establish that a repository is unused.

## Verified source and remote state

`python3 scripts/verify_migration.py` passed: 698 imported/adapted files across ten repositories have the manifest-expected destination hashes. Of 716 original tracked paths, 18 reproducible CFML Check compiled outputs were intentionally excluded. Fresh authenticated GitHub GraphQL reads show every default main head still equals its recorded source commit. All ten local bundles pass `git bundle verify`; live branches/tags match their corresponding bundled refs (including the annotated tag object IDs).

| Repository | Covered source files | Current main/source commit | Historical PRs | Releases/assets | Deletion state and package-specific evidence |
| --- | ---: | --- | ---: | --- | --- |
| [CFML-Check](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Check) | 36 | `afda57d711b8e57e05e4a03a52cf13faa0bbcdfd` | 0 | 0 / 0 | **blocked** — shared gates; 0.1.1; no repository field |
| [CFML-Linkage](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Linkage) | 155 | `c147822e5dfa6c7637ff80f191cd44b04531e084` | 0 | 0 / 0 | **blocked** — shared gates; public lookup 404; source private |
| [CFML-Policy-Check](https://github.com/yapweijun1996/AI-Agent-Tool-CFML-Policy-Check) | 35 | `3d34c48b39439f258a20c292788941b21e563c9e` | 0 | 0 / 0 | **blocked** — shared gates; public lookup 404; source private/UNLICENSED |
| [Change-Impact](https://github.com/yapweijun1996/AI-Agent-Tool-Change-Impact) | 51 | `f298328d7035adce57fc57fdc36ac30da70a2a68` | 0 | 0 / 0 | **blocked** — shared gates; 0.1.1; no repository field |
| [Code-Slice](https://github.com/yapweijun1996/AI-Agent-Tool-Code-Slice) | 169 | `12411e9153282e0304a985c1007e0e4bad4fcf31` | 5 | 0 / 0 | **blocked** — shared gates; 0.4.0; old repository/homepage/issues links |
| [Error-Lens](https://github.com/yapweijun1996/AI-Agent-Tool-Error-Lens) | 62 | `4b318bc2a3a3120a88f04ca5b19befd8afb6be9a` | 0 | 0 / 0 | **blocked** — shared gates; 0.1.0 publicly readable; old repository/homepage/issues links; source remains private |
| [Project-Profile](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Profile) | 44 | `b711b7244e369e86038d8a6eb05de7de481c8f20` | 2 | 0 / 0 | **blocked** — shared gates; 0.1.1 (source 0.1.2); no repository field; missing upstream LICENSE |
| [Project-Tree](https://github.com/yapweijun1996/AI-Agent-Tool-Project-Tree) | 34 | `3f3b0e3cc629bd37f8c6e6ae6f99eaf50d0bf2a1` | 0 | 0 / 0 | **blocked** — shared gates; 0.1.1; old repository/homepage/issues links |
| [Symbol-Search](https://github.com/yapweijun1996/AI-Agent-Tool-Symbol-Search) | 57 | `0e251c786edfd13e38f469289c5939e2acbdd39b` | 4 | 3 / 0 | **blocked** — shared gates; 0.1.2; old repository/homepage/issues links |
| [Test-Scope](https://github.com/yapweijun1996/AI-Agent-Tool-Test-Scope) | 55 | `aa39505d646d1ddf376c4413f294e8e67d913748` | 0 | 0 / 0 | **blocked** — shared gates; 0.1.1; old repository/homepage/issues links; provenance attestation |

All repositories have zero issues (all states) and zero open PRs. Eleven historical PR records exist: Code Slice five, Project Profile two, Symbol Search four. PR commits in bundles do not preserve reviews, conversation, checks, or attachments. Symbol Search release records are v0.1.0, v0.1.1 and v0.1.2 with no uploaded release assets. Auto-generated source archives can be reconstructed from retained tags; GitHub release descriptions/settings still need export. Other nine repositories have no GitHub release records at this observation.

## Local private recovery inventory

Bundles are only verified in the task workspace `../history/`. An independent durable private backup, restore test on that backup, access/retention policy, and owner confirmation are **unknown**. No bundle was added to public Git. Histories may contain data beyond the sanitized source import; review before any public rehosting. Bundle verification proves structural completeness, not secret absence.

| Bundle | Advertised refs including HEAD/PR refs | SHA-256 |
| --- | ---: | --- |
| `CFML-Check.bundle` | 2 | `c7d94961c7baa0a07f26ee5eecfe8cc5842652849ea372a0f80e7c52ab289d66` |
| `CFML-Linkage.bundle` | 2 | `a09b322bb4a614053f8ac747473cb144aefff3ccce72ef9700706acdd1604fea` |
| `CFML-Policy-Check.bundle` | 2 | `7671772324754276ef32ea607d2452b5600442053181f30b56a6683710cc4963` |
| `Change-Impact.bundle` | 2 | `ac97f338e4694be365bf4adf6ed45568295933b0a5401ba4cc7145cc0339eb2f` |
| `Code-Slice.bundle` | 9 | `792f270d4bdb150429e4cbdef18e7ac070d160b652b3397923e6e47662be45b6` |
| `Error-Lens.bundle` | 2 | `3403ac700f5f4b08356455e3423ed10a1f2c78be2326c3b09286fdedfeece82f` |
| `Project-Profile.bundle` | 4 | `f5b2bf74c9e0550f76f4a9a25a46e113ca8f527d1d486c38c2ef390c83f2be4d` |
| `Project-Tree.bundle` | 2 | `042e9296fc143b58dc8fa0a972d69bcca747f250a63cb6fb1cc91787705d2ab8` |
| `Symbol-Search.bundle` | 13 | `22a876df8c1f927c4e2f001424e2b3bca440f06eee26a18102a1ff2549d7b46a` |
| `Test-Scope.bundle` | 3 | `3ff319e1b6ad37337822eb56500fd02ba61a72c2b2a7ee9178645b5627b49d0f` |

## Required gates before owner deletion

1. Copy all ten bundles plus this inventory and source manifest to an independent private durable location; verify these hashes and perform an isolated clone/restore. Preserve current branches/tags and reconcile remote changes again immediately before deletion.
2. Export the eleven historical PRs with reviews/comments/check links, three Symbol Search release records, and needed Actions logs/artifacts/settings. Git bundles do not preserve these records. Repository environments, webhooks, branch protection, secrets, integrations, Pages, and dependent installations have not been exhaustively audited; their dependency status is **unknown**. Do not export secret values into this repository.
3. Review old GitHub references in [EXTERNAL_DEPENDENCIES.json](EXTERNAL_DEPENDENCIES.json). Historical commit/CI evidence and package-local archived workflows will cease to resolve after deletion. Preserve evidence privately or provide approved durable replacements. New source manifests point to the monorepo, but existing published npm versions retain old metadata.
4. Assess npm publisher configuration in the npm account before deleting publisher repositories. Existing source contains OIDC publishing workflows for Test Scope and Error Lens; nested workflows do not run in the monorepo. Error Lens explicitly checks the old repository URL. Current trusted publisher account settings are **unknown**, and Test Scope published metadata includes a provenance attestation. No publisher configuration or release was changed.
5. Review external Git-based consumers, personal/global installs, downstream CI, local clones, skills, and bookmarks. Absence of references in the monorepo cannot establish absence of external use. Public npm tarballs were not removed and generally remain installable independently, but their source/issues links and future publishing can break. No automatic npm release is authorized by this audit.
6. Preserve licenses/private flags. Seven original MIT LICENSE files remain hash-preserved. Project Profile declares MIT but has no upstream LICENSE file: distribution authorization/notice gap remains unresolved. Linkage is private with no package license declaration and an unverified optional native-parser installation/load path; Policy Check is private/UNLICENSED; Error Lens remains source-private/MIT even though an existing public package is readable. These are separate distribution/runtime gates, not evidence that source was omitted.

## Public npm observation and uncertainty

Read-only unauthenticated GET requests to the public npm registry returned metadata for **eight** original package names, including `agent-error-lens@0.1.0` despite its current source `private:true`. Linkage and Policy Check returned HTTP 404; this does not prove no private publication exists. Therefore previous shorthand “seven public / three private” is a source-policy classification, not an accurate live registry inventory. Do not flip private fields or publish to resolve this discrepancy.

The latest published Project Profile is 0.1.1 while migrated source is 0.1.2. Code Slice, Error Lens, Project Tree, Symbol Search and Test Scope latest versions retain old repository/homepage/issues URLs. Published exact-version metadata cannot be repaired by changing monorepo source alone. Installed-device, npm account authorization, actual downstream usage, and trusted publishing configuration were not inferred from public metadata.

Audit methods: owner-authenticated read-only `gh api graphql` for all ten default heads, branches/tags, issue/PR counts and release asset counts; public npm registry metadata GET; local `git bundle verify` and `list-heads`; migration hash verifier; archived workflow inspection. No deletion-readiness row is marked safe until the concrete shared gates have evidence.
