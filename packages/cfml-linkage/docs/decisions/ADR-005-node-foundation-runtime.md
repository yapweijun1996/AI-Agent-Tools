# ADR-005: Use Node.js built-ins for the safe foundation

> **Status: PROVISIONAL / IMPLEMENTED FOUNDATION.** This decision covers the M1 foundation only; public package/runtime compatibility is not released.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | M1 runtime, module format, dependency policy, and test runner |
| Source of truth | `package.json`, this ADR, and focused tests; release compatibility remains open |
| Evidence | Node `v25.2.1` local run; root-guard tests pass within the current 95-test suite; `src/root-guard.js` and `test/root-guard.test.js` |
| Verification | Root-guard tests passed locally; cross-version CI/package verification is not available |
| Limitations | Node minimum, public exports, CLI, package publication, and complete compatibility matrix require release review |

## Context

The project is explicitly planned as an NPM/library + CLI tool. M1 needs a runnable foundation without introducing parser or runtime dependencies before the contracts and security boundary are implemented.

## Decision

Use Node.js ECMAScript modules and the built-in `node:fs`, `node:path`, `node:os`, and `node:test` APIs for the foundation. Declare Node `>=20`, keep the package private while unreleased, and add no runtime or development dependencies for this slice.

The first runtime module is a root guard. It canonicalizes an existing directory, rejects invalid/non-directory/missing roots, rejects absolute references and any `..` segment, rejects symlink path segments, verifies existing targets remain beneath the canonical root, and optionally requires a target to exist. It returns structured `RootGuardError` codes and never reads or executes analyzed source.

## Consequences

The foundation is easy to run and audit, with no supply-chain dependency added for path safety. Node's platform path semantics still require cross-platform tests before release. The package remains private and its bounded `analyzeProject` export and CLI entry do not constitute a released public API.

Revisit this decision if parser/runtime requirements, supported Node versions, or package compatibility evidence materially change.
