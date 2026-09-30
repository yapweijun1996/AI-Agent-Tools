# Agent Error Lens Release Runbook

Status: preparation only. This runbook does not authorize or perform a release.

## Current release boundary

- Package: `agent-error-lens`
- Target version: `0.1.0`
- Module/runtime: ESM-only, Node.js `>=20.11.0 <25`
- License: MIT
- Current guard: `private: true`
- Registry state checked on 2026-09-13: package lookup returned HTTP 404
- npm authentication checked on 2026-09-13: local `npm whoami` returned HTTP 401
- GitHub release boundary checked on 2026-09-13: remote `main` contains `f69167b` and `release.yml`; the `npm-release` environment and `main` branch protection do not yet exist; no tags or GitHub releases exist
- Released state: no

The package must remain private until the release operator proves npm ownership, chooses the release commit, and receives explicit release approval.

## Preconditions

1. Confirm that the maintainer's npm account can publish the exact unscoped name `agent-error-lens`. If the name is no longer available, stop and resolve the naming decision; do not silently change the public package name.
2. Confirm the release version and update `package.json`, `package-lock.json` if required by the version change, `CHANGELOG.md`, and affected Core SSOT documents in one reviewed release commit.
3. Set `private` to `false` only in that authorized release commit. The normal development line must retain `private: true`.
4. Configure npm trusted publishing for the exact GitHub user, repository, workflow filename `release.yml`, and protected environment `npm-release`. Use the current npm documentation to verify the account settings because npm does not validate this configuration when it is saved.
5. Protect release tags and require maintainer approval for the `npm-release` GitHub environment.

## Local release candidate checks

From the exact release commit:

```bash
npm ci
AGENT_ERROR_LENS_RELEASE=1 npm test
npm pack --json --ignore-scripts
```

The package inspection must confirm:

- package name/version/license/repository/registry/access;
- `private: false` only for the release candidate;
- `exports`, declaration files, executable `bin`, source maps, `LICENSE`, `README.md`, `CHANGELOG.md`, and the contract schema;
- zero runtime dependencies;
- packed consumer import and packed CLI smoke;
- tarball `shasum`/`integrity` recorded for later registry comparison.

## Tag and workflow

Create the tag only after the local checks and review pass:

```bash
git tag -a v0.1.0 -m "Release v0.1.0" <release-commit>
git show v0.1.0
```

Pushing the tag, creating a GitHub release, and running the release workflow are separate authorized actions. The workflow must be dispatched with the tag selected as its GitHub ref and the same tag supplied as the required input. It verifies the tag/version/commit relationship, runs the full suite, and publishes only after the protected environment gate.

The workflow uses GitHub OIDC and npm trusted publishing from Node 24. It does not use a repository-stored npm token. Trusted publishing is an npm account configuration, not something the repository can prove locally.

## Registry and release readback

After the publish job completes, read back the exact version and retain the machine-readable result:

```bash
npm view agent-error-lens@0.1.0 version dist.tarball dist.shasum dist.integrity gitHead --json
gh api repos/yapweijun1996/AI-Agent-Tool-Error-Lens/releases --jq '.[] | {tag_name, draft, prerelease, html_url}'
git show-ref --tags v0.1.0
```

The release is verified only when the registry version, tarball integrity, `gitHead`, GitHub tag, GitHub release, package version, and exact tested commit agree. Update `TASK.md`, `PROGRESS.md`, `GOAL.md`, `SPEC.md`, `EPIC.md`, and `ROADMAP.md` with those readbacks before marking `Released`.

## Rollback and recovery

An npm publish is an external registry mutation. Do not use deletion or history rewriting as a routine rollback. If a published version is defective:

1. stop further publication and preserve the exact artifact/readback evidence;
2. deprecate the affected version with a concise, maintainer-approved warning;
3. fix the defect in a new commit and publish the next SemVer-compatible version after the same gates;
4. update the changelog, GitHub release notes, and Core SSOT status with the remediation and any compatibility impact.

## Security notes

Never commit npm credentials, OIDC tokens, `.npmrc` files, or raw registry responses containing credentials. Logs and package contents remain untrusted release inputs and must be inspected for secrets before publication.

References: [npm package metadata](https://docs.npmjs.com/files/package.json/), [npm trusted publishers](https://docs.npmjs.com/trusted-publishers/), and [GitHub's Node package publishing guidance](https://docs.github.com/en/actions/tutorials/publish-packages/publish-nodejs-packages).
