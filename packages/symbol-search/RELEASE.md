# agent-symbol-search v0.1.0 release checklist

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Target | `agent-symbol-search@0.1.0` |
| Release mode | Public, unscoped npm package; local interactive publish |
| Publication status | Published 2026-09-08 |
| npm package | [`agent-symbol-search@0.1.0`](https://www.npmjs.com/package/agent-symbol-search) |
| GitHub Release | [`v0.1.0`](https://github.com/yapweijun1996/AI-Agent-Tools/releases/tag/v0.1.0) |

This checklist records the completed release gate for `agent-symbol-search@0.1.0`. Registry, fresh-install, Git tagging, and GitHub Release checks passed on 2026-09-08. The first local publish intentionally does not claim npm provenance.

## Repository and CI gate

- [x] Work from synchronized `main` after review PR #2 was merged.
- [x] Review the final diff and confirm no `dist`, tarball, `.npmrc`, npm token, OTP, or other secret is committed.
- [x] Open PR #2 and pass `.github/workflows/ci.yml` on Ubuntu/Node 22, 24, and 26; package smoke on Ubuntu, macOS, and Windows with Node 24; and the Ubuntu/Node 24 benchmark job.
- [x] Merge PR #2 and check out the exact green `origin/main` commit in a clean Node 24 LTS environment.

The supported Node.js majors are 22, 24, and 26. Node 20 and the local EOL Node 23 runtime are not release evidence.

## Local release gate

Run from the clean release commit:

```bash
npm ci
npm run release:check
npm audit --audit-level=high
npm pack --dry-run --json
git diff --check
git status --short
```

`release:check` runs `verify`, native Node coverage, packaged smoke, capability, benchmark, and documentation checks. Coverage measures product sources only and enforces lines ≥85%, functions ≥80%, and branches ≥75%. The benchmark gate requires every fixture to avoid `TIMEOUT` and keeps fixture file, byte, result, and status structure stable; v0.1.0 makes no public latency SLO.

The documented project-selection recovery command must succeed in this repository:

```bash
node dist/cli.js search --root . --project tsconfig.json --symbol SymbolSearchEngine
```

## Interactive npm publication record

The package name is intentionally fixed and unscoped. The completed pre-publication checks were:

1. [x] Confirm the package name was unoccupied before publishing and `node -p "require('./package.json').version"` was `0.1.0`.
2. [x] Confirm the working tree was clean and CI was green for the exact release line.
3. [x] Run `npm login` interactively and verify identity with `npm whoami`; `.npmrc` was never read or printed.
4. [x] Publish with `npm publish --access public`; `prepublishOnly` ran the release gate.
5. [x] Do not claim npm provenance for this local first release. Trusted publishing/provenance remains a follow-up for the next release.

Publication evidence: npm reports `agent-symbol-search@0.1.0` with `latest` pointing to `0.1.0`; the publishing account was `yapweijun1996`. The registry timestamp is 2026-09-08, and the package page is public.

If the package name is occupied, stop and ask the maintainer; do not rename automatically. If a publish command times out or has an uncertain result, query `npm view agent-symbol-search@0.1.0` before any retry. An existing version must never be republished.

## Post-publication verification

The following checks passed after npm reported success:

```bash
npm view agent-symbol-search@0.1.0 version dist-tags --json
npm install --prefix "$(mktemp -d)" --no-save --no-package-lock --ignore-scripts agent-symbol-search@0.1.0
```

- [x] Registry query confirms version `0.1.0` and `latest` points to it.
- [x] A fresh temporary install confirms the CLI, CommonJS API, and ESM API; README and MIT license are present, with 49 package files and no forbidden paths.
- [x] Annotated tag `v0.1.0` and matching [GitHub Release](https://github.com/yapweijun1996/AI-Agent-Tools/releases/tag/v0.1.0) identify the verified release line.

The npm version, tag, GitHub Release, and source release line are recorded together here. The first local release intentionally has no provenance statement.

A failed pre-publication gate may be fixed and rerun without creating a tag. If npm publication succeeds but tagging or GitHub Release creation fails, retry only the Git/GitHub steps. Never overwrite `0.1.1`; publish `0.1.2` for a later fix, deprecating a defective version when appropriate.

## v0.1.1 documentation patch publication

| Field | Value |
|---|---|
| Target | `agent-symbol-search@0.1.1` |
| Status | Published 2026-09-08 |
| Scope | README and release metadata refresh only; no runtime, API, schema, dependency, or benchmark changes |
| Tag | [`v0.1.1`](https://github.com/yapweijun1996/AI-Agent-Tools/releases/tag/v0.1.1) |

This patch replaced the stale release-candidate wording from the immutable npm `0.1.0` README snapshot. Registry, fresh-install, annotated-tag, and GitHub Release verification completed successfully. The local interactive publish intentionally does not claim npm provenance.

Publication evidence: npm reports `agent-symbol-search@0.1.1` with `latest` pointing to `0.1.1`; a fresh Node 24 install confirms the CLI, CommonJS API, and ESM API; the tag points to the merged `main` commit; and the GitHub Release is public and non-draft.

## v0.1.2 agent integration documentation release

| Field | Value |
|---|---|
| Target | `agent-symbol-search@0.1.2` |
| Status | Published 2026-09-08 |
| Scope | Add the npm-distributed `skills/agent-symbol-search/SKILL.md` and README integration guide; no runtime, API, schema, dependency, or benchmark changes |
| npm package | [`agent-symbol-search@0.1.2`](https://www.npmjs.com/package/agent-symbol-search/v/0.1.2) |
| Tag | [`v0.1.2`](https://github.com/yapweijun1996/AI-Agent-Tools/releases/tag/v0.1.2) |
| GitHub Release | [`v0.1.2`](https://github.com/yapweijun1996/AI-Agent-Tools/releases/tag/v0.1.2) |

This patch teaches AI coding agents how to install the package, choose operations, pass explicit TypeScript projects, interpret bounded JSON results, and hand locators to source-extraction tools. The merged `main` commit passed CI, the packed artifact included `skills/agent-symbol-search/SKILL.md`, and the public registry plus fresh-install checks passed before the annotated tag and GitHub Release were created. The local interactive publish intentionally does not claim npm provenance.

Publication evidence:

- `npm view agent-symbol-search dist-tags versions --json` reports version `0.1.2` and `latest: 0.1.2`.
- A fresh temporary install verifies the packaged CLI and CommonJS library API.
- Annotated tag `v0.1.2` dereferences to the published `main` commit `4f81a6ada296a1f454da53c0718adafc149fee0b`.
