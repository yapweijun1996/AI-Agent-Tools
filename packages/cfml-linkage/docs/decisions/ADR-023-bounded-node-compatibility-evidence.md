# ADR-023: Bounded Node compatibility evidence

- **Status:** Accepted for local v0.1 evidence
- **Date:** 2026-09-15
- **Decision owners:** Project implementation

## Context

The package declares Node `>=20`, but no cross-version CI, CFML engine, browser, database, network, or application runtime is available. Compatibility claims must therefore remain limited to an observed local host and the checks actually run there.

## Decision

Record the observed Node.js host and bounded test result in a retained JSON evidence file. The current evidence covers Node.js `v25.2.1` on `win32`/`x64` and the repository's `npm test` suite only. It does not promote the result to a cross-version, cross-platform, CFML-engine, or published-package compatibility claim.

## Consequences

- The declared Node engine range is checked against one observed runtime.
- The evidence is reproducible from the recorded commands and remains explicit about its scope.
- Lucee, Adobe ColdFusion, browser, database, network, application-runtime, Node 20, and public-install claims remain unverified.
- No external service or application source is accessed as part of this compatibility evidence.

## Evidence

- `package.json`
- `docs/compatibility/node-v25.2.1-win32-x64.json`
- `npm test`: 95 passed, 0 failed
- `node --version`: `v25.2.1`
