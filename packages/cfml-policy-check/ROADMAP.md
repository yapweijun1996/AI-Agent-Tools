# Roadmap

Last reconciled: 2026-09-16
Lifecycle: `Pre-prototype`
Planning horizon: dependency order only; no release dates are promised.

## Delivery sequence

| Order | Stage | Planned | Implemented | Verified | Released | Dependency / gate |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Documentation baseline | Yes | Yes | Yes | No | Core SSOT and affected docs agree; local documentation checks pass |
| 2 | Package and CLI identity | Yes | Yes | Partial | No | Node/npm and local identity are recorded; maintainer/license/release policy remain open |
| 3 | Secure source reader | Yes | Yes | Yes locally | No | Explicit root/file, UTF-8, limits, traversal, symlink, and no-write tests pass locally |
| 4 | CFML-aware static model | Yes | Yes | Yes locally | No | HTML tags/comments, transparent cfoutput, locations, and uncertainty barriers are tested |
| 5 | Rule engine and table rules | Yes | Yes | Yes locally | No | Profile-driven direct colgroup and col checks pass fixtures |
| 6 | Project profile and representative fixtures | Yes | Yes | Yes locally | No | Owner-approved sanitized Globe3 profile and fixtures pass the local fixture tests |
| 7 | Contract, security, and platform evidence | Yes | Partial | Partial | No | Fifteen local tests and package/secret checks pass; resource, consumer, and full platform matrix remain |
| 8 | Release and Hub/AIT admission | Yes | No | No | No | Requires maintainer/license, artifact, registration, release, and consumer evidence |

## Completed local vertical slice

The first local slice now performs:

1. Node.js CLI/package invocation and AIT JSON stdin invocation;
2. validation of one local JSON profile;
3. reading one explicit .cfm or .cfc file under one explicit root;
4. tokenizing static HTML and transparent cfoutput;
5. reporting missing colgroup and missing col;
6. returning incomplete for dynamic, malformed, unsupported, or bounded input;
7. proving deterministic JSON and no source mutation in local tests.

This is a local implementation milestone, not an Experimental, public-package,
or AIT registry release.

## Recommended next slice

1. Expand the security matrix,
   including symlink and encoding cases on the declared platform set.
2. Complete package artifact inspection and a consumer smoke harness.
3. Confirm maintainer, distributable license, supported Node platform matrix,
   and the AIT registration path before any release discussion.

## Risk gates

- Do not promote an implementation to release because a local test passes.
- Do not promote a parser to complete without fixtures for known and unknown
  CFML cases.
- Do not expose absolute paths, execute profiles, traverse includes, or infer
  runtime markup.
- Do not register an AIT consumer until the exact package/version and native
  JSON/capability contract are accepted.

## Release gates

Promotion requires evidence for invalid input, unsupported/dynamic input,
resource limits, determinism, path safety, malformed profiles, no-write
behavior, output bounds, package contents, and the declared platform matrix.
A local manifest with registration_status local-contract-only is not an AIT
registration.
