# Release standard

## Independent version ownership

Each tool repository owns its npm package, semantic version, changelog, tests, release artifacts, license, and support policy. The Hub does not publish tools or impose lockstep releases. Registry IDs are not reserved package or binary names.

Use semantic versioning: patch for compatible fixes, minor for compatible additions, and major for incompatible behavior. Breaking CLI flags/defaults, JSON semantics, exit-code meanings, or support removal require a major bump after `1.0.0`. Before `1.0.0`, document breaking changes and use a minor bump rather than a patch. `Stable` requires a non-prerelease version at least `1.0.0`.

The Hub has separate `standards_version` and registry `schema_version`; the result envelope has its own `schema_version`. They do not set individual package versions. Initial values are `1.0.0`. A standards amendment records migration implications in its review: clarification is patch, compatible addition is minor, incompatible requirement is major. Old verification remains explicitly scoped to the standard version tested; no automatic compliance upgrade is allowed.

## Release evidence

Before publication, the tool owner must:

1. Run relevant unit, contract, integration, CLI stream/exit, determinism, limit, and security tests against the intended release source.
2. Test the declared runtime/platform matrix and disclose gaps. `Stable` requires Windows, macOS, and Linux coverage.
3. Inspect the packed npm artifact for intended files, working entry points, license, and accidental secrets; smoke-test the artifact, not just the checkout.
4. Record source commit/tag, version, commands, environments, results, limitations, and compatibility notes in durable release/test evidence.
5. Publish through the owning repository's authorized process and verify the published package identity and version before claiming publication.

Publication is an external action; this checklist is not publication authorization. Dependencies and package scripts must be reviewed in the owning repository, with no new Hub runtime introduced.

## Updating the Hub

Repository identity and Experimental admission may be reconciled before publication.
A local manifest's npm name/version is not proof of a published package; keep
published fields null until that separate evidence exists. Task completion, native
functional tests, publication, and Hub protocol conformance are distinct gates.

Submit a focused registry update after confirming publication. Set `release_version` to the reviewed release, not a semver range. A `Verified` or `Stable` entry must include matching `verification.version`, tested `standards_version`, date, immutable source/release and reproducible test links, platforms, and limitations. [Registry contract](ARCHITECTURE.md#registry-contract) defines the exact fields.

On a new release, either retain the previously reviewed snapshot or verify the new release before replacing it. If promoting the new version is necessary before full verification, record it as `Experimental` with `verification: null`. Never leave old evidence attached to a new release number.

Lifecycle promotion, downgrade, retirement, and standards changes require repository maintainer review through a focused change request/PR. There is no automatic Hub certification service. `Deprecated` entries stay discoverable with a reason and optional replacement ID; preserve release evidence as history. Recovery and rollback instructions belong to the tool owner, including use of a known-good version when appropriate.
