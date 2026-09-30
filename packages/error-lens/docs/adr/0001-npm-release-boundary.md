# ADR-0001: Controlled npm release boundary

- Status: Accepted for release preparation
- Date: 2026-09-13
- Scope: `agent-error-lens` package and CLI release path

## Context

The repository is a public GitHub project with a private `0.1.0` npm package scaffold. The package name `agent-error-lens` returned HTTP 404 from the npm registry on 2026-09-13, and the local npm session was not authenticated. Therefore package ownership, first-publish authority, and registry artifact identity are not proven.

The parser itself is local-first and read-only. Release automation is a separate operational boundary and must not weaken the accidental-publish guard or place long-lived credentials in the repository.

## Decision

1. Keep `package.json.private` set to `true` on the normal development line until a maintainer explicitly prepares a release commit.
2. Keep the unscoped name `agent-error-lens` for V0.1. A name collision or ownership dispute is a release decision, not an implementation detail to resolve silently.
3. Declare the exact GitHub repository URL in `repository` and the public npm registry/access in `publishConfig` so package identity and the intended destination are explicit.
4. Use `.github/workflows/release.yml` as a manual, existing-tag workflow. It checks that the selected tag is `v<package.version>`, points at the checked-out commit, has `private: false`, passes the full verification and package suite, and then publishes from a protected `npm-release` environment.
5. Prefer npm trusted publishing through GitHub OIDC for the publish job. The workflow uses Node 24 because the current npm trusted-publishing requirement is newer than the package's minimum runtime. No npm token is stored in the repository or required by the workflow.
6. Treat first publication as a separately authorized bootstrap step: the maintainer must establish npm ownership and configure the trusted publisher for user `yapweijun1996`, repository `AI-Agent-Tool-Error-Lens`, workflow filename `release.yml`, and environment `npm-release` before attempting publication.
7. Treat npm registry readback as mandatory evidence. A GitHub tag or release alone never changes the repository's `Released` state.

## Consequences

The development path remains safe against accidental publication, while a future release has a reproducible and reviewable gate. The workflow cannot complete while the package is private or trusted-publisher configuration is missing. First publication still requires a maintainer's npm account/ownership action and explicit release approval.

If a published version is defective, do not rewrite or silently delete the artifact. Deprecate the affected version with a maintainer-approved message, correct the defect, and publish a new compatible patch/minor version according to SemVer. Update the release record and registry readback with the remediation.

## Evidence and references

- Repository metadata and current package state were inspected locally on 2026-09-13. The remote `main` branch now contains the prepared release workflow at commit `f69167b`; read-only GitHub checks found no `npm-release` environment, no `main` branch protection, and no tags or releases.
- `npm view agent-error-lens ...` and `npm owner ls agent-error-lens` returned 404; `npm whoami` returned 401.
- npm package metadata and `private` behavior: <https://docs.npmjs.com/files/package.json/>.
- npm trusted publishers and GitHub OIDC configuration: <https://docs.npmjs.com/trusted-publishers/>.
