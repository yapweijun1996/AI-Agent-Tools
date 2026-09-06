# Tool standard

This document owns tool scope, lifecycle, and admission requirements. The initial Hub standards version is `1.0.0`. Requirements describe conformance targets; registry entries alone do not prove implementation.

## One tool, one responsibility

Every tool has an independent repository and npm package. Its README must describe the narrow problem, supported input formats/languages, explicit non-goals, input/output bounds, deterministic behavior, failure modes, platform/runtime support, installation, and reproducible examples. Keep core operation local and independent of LLMs, API keys, or backends.

Before implementing new logic, inspect existing helpers in the owning tool repository. Do not introduce a shared dependency merely because two tools have similar code. Apply the [shared infrastructure gate](ARCHITECTURE.md#shared-infrastructure-gate).

## Lifecycle

Use these exact case-sensitive values everywhere:

| Status | Meaning and minimum evidence |
| --- | --- |
| `Planned` | Intended scope accepted into the Hub; implementation, publication, or conformance is not established. Unknown links remain `null`. |
| `Experimental` | A confirmed independent repository contains an inspectable implementation, documented limits, and runnable basic tests. npm publication is optional; interfaces may change. |
| `Verified` | A specific published release has reproducible evidence for declared capabilities and the recorded Hub standards version. Repository, npm identity, release version, and verification snapshot are required. |
| `Stable` | Meets `Verified`, uses a release version at least `1.0.0` without prerelease suffix, documents compatibility/support policy, and has regression and Windows/macOS/Linux evidence for its declared scope. |
| `Deprecated` | Maintainer-approved retirement or replacement notice exists. `deprecation.reason` is required; replacement may be unknown. Retain identity and historical metadata so consumers can migrate. |

Typical progression is `Planned` → `Experimental` → `Verified` → `Stable`. Any state may become `Deprecated`. Promotions are reviewed, not automatic or time-based. A verified prerelease is possible but is not `Stable`. Hub lifecycle and npm semantic version are different dimensions.

Hub lifecycle also differs from a tool's own language certification or task status.
Code Slice is owner-confirmed complete and published at recorded version 0.2.0.
Its Experimental Hub lifecycle describes pending native/Hub protocol conformance,
not unfinished tool delivery; completion is tracked separately in TASK/ROADMAP. Change Impact's
in-progress scaffold does not meet Experimental solely because source files and a
manifest exist. Current observations are scoped in [Validation](../VALIDATION.md).

Broken or stale evidence requires review: retain a known-good recorded version or downgrade to `Experimental` and clear its verification snapshot. Do not transfer verification to a new version without testing it. Reactivation from `Deprecated` requires a reviewed rationale and the destination state's evidence; clear the active deprecation notice while preserving history in Git.

## Verification scope

Evidence must identify the immutable source/release, exact package version, commands, fixtures, environment, platform matrix, resource limits, supported cases, and known limitations. Test complete success, invalid input, unsupported syntax, insufficient evidence, limit exhaustion, determinism, and read-only behavior. Security-relevant cases follow [Security standard](SECURITY_STANDARD.md).

Cross-platform support is the ecosystem target. `Experimental` and `Verified` entries must disclose untested platforms; `Stable` requires all three OS families. Do not use a narrow fixture as evidence for every language or project structure. Deterministic relationship analysis and candidate test selection are bounded evidence, not guarantees of full impact or test coverage.

Hub maintainers review evidence and registry updates; tool maintainers produce and maintain it. [Adding a tool](ADDING_A_TOOL.md) defines the workflow; [Release standard](RELEASE_STANDARD.md) defines versioning.
