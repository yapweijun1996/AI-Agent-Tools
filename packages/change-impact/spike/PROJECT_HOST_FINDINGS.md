# Project-host feasibility findings

Date: 2026-09-07
Evidence implementation revision: `7cf02d0`; latest Windows short-path boundary fix: `0b72a83`; latest package verification revision: `7cf02d0`; latest provider observation bounding: `32fd01a`; latest diagnostic collection bounding: `a0f148b`; latest bounded source reads: `149e0fa`; latest validated real-path reads: `dd212e4`; latest bounded revision blob reads: `2f3c482`; latest snapshot diagnostic identity: `0c8a130`; latest internal symlink coverage: `f9f904b`; latest provider resolution read boundary: `ba0538a`; latest CLI formatted-output bound: `c6296e4`; latest installed artifact output-limit smoke: `3472b13`; latest Windows path
handling: `0b72a83`; latest platform-aware capture harness: `261c47a`; latest Git clean-filter isolation: `c32634e`; latest hosted matrix: `34123415471`

This note records the bounded feasibility check that informed the first provider.
It is evidence for project-host behavior, not a performance guarantee.

## Setup

- Runtime: Node.js `v23.10.0`, npm `10.9.2`, TypeScript `5.9.3`.
- Host: macOS `Darwin 25.6.0 arm64`.
- Fixture: `test/fixtures/basic/tsconfig.json` with JavaScript, TypeScript, TSX,
  and a separate test directory.
- Command: `npm test` (the test script builds first and then runs Node's test
  runner against temporary Git repositories made from the fixture).

## Findings

1. A virtual Language Service host can bind a selected `tsconfig.json` to a
   bounded in-memory snapshot. Project membership follows the parsed config;
   files outside that project are not returned as ordinary source nodes.
2. The provider resolves local imports, re-exports, JavaScript calls, TSX
   references, interface `implements`, and reverse symbol references without
   executing repository code or changing Git state. Worktree change collection
   avoids configured clean filters through raw file hashing and content-only
   range comparison outside repository attributes.
3. A missing or ambiguous configuration/target fails with a structured error.
   A dynamic or missing literal module is retained as an unresolved observation
   and downgrades an otherwise usable result to `partial`.
4. Revision snapshots can be analyzed concurrently with a working-tree snapshot.
   Deleted declarations remain addressable in the base context, and rename
   results retain old and new paths.
5. The implementation enforces file, graph, unresolved-observation, diagnostic,
   and output limits. The current 36-case smoke suite verifies behavior at the API/CLI
   boundary on the macOS runtime; the current clean-clone Linux runs recorded at
   `f9f904b` cover 34 cases using
   Node.js `v22.23.2` and `v24.20.0`
   Alpine runtime binaries inside a Git-capable container. Each Linux run used
   a fresh lockfile `npm ci` install, followed by cache-preferred package smoke;
   this reproduces the dependency-install order used by CI. The latest complete
   container rerun is recorded against `f9f904b` after the revision-blob,
   snapshot-diagnostic, internal-source-symlink, and repository-root-symlink
   regressions were added; it also passed dependency audit,
   and docs checks.
   Hosted run 34123415471 passes all six Node 22/24 Ubuntu/macOS/Windows jobs
   after the path, harness, and clean-filter fixes. The concurrent-content test is
   skipped on Windows because Node `execFile` cannot intercept Git with a `.cmd`
   shim. This does not establish
   sustained cross-platform performance,
   cancellation latency, or memory limits. Working-tree and permitted external
   declaration reads stop at the per-file budget plus one byte before decoding
   and re-open validated real paths. Git revision blobs use bounded binary output
   and classify overflow as `FILE_BUDGET_EXCEEDED` before decoding;
   the direct bounded-reader, oversized-blob, distinct base/head diagnostic
   identity, internal-source-symlink, and repository-root-symlink regressions are
   part of the same 34-case suite. The provider-resolution regression at
   `ba0538a` confirms oversized external package metadata becomes an unresolved
   observation before decoding on macOS.
   The formatted-output regression at `c6296e4` confirms pretty CLI output is
   rejected when expansion would exceed the declared byte budget.
   The installed artifact smoke at `3472b13` repeats that assertion through the
   packaged `dist/cli.js`, so the tarball path is covered separately from the
   checkout path.

## Decisions and remaining questions

The v0.1 host is intentionally one explicit or unambiguous `tsconfig.json` or
`jsconfig.json` project. Project references, historical dependency installation,
full workspace inference, and a worker-based cancellation boundary remain
unsupported or unmeasured. Those cases must stay visible in capabilities and
documentation until a separate fixture proves them. The reviewed schema/API
contract is frozen for package `0.1.0` at the `0.1-draft` identifier; this note
does not establish registry publication or a performance guarantee.
