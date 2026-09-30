# ADR-027: Apply configured ignore globs during deterministic discovery

- **Status:** Accepted for bounded v0.1 implementation
- **Date:** 2026-09-15
- **Scope:** T-050 root-relative ignore-pattern handling in snapshot discovery
- **Verification:** `test/snapshot.test.js`, `test/analyzer.test.js`, and `test/cli.test.js` cover recursive matching, configuration forwarding, deterministic retained files, and the CLI validation boundary

## Context

The v0.1 configuration contract already required `ignore.globs`, but the snapshot stage only skipped its built-in ignored directory names. A valid configuration could therefore appear accepted while its explicit file or directory patterns had no effect.

## Decision

`createSnapshot()` accepts an optional `ignoreGlobs` array with at most 256 non-empty patterns. Patterns are trimmed, normalized from backslash to POSIX separators, and matched against root-relative paths. The bounded matcher supports literal segments, `*`, `?`, and recursive `**` patterns; `**/` may match zero or more directory segments. Root-absolute, traversal, and null-byte patterns are rejected.

Matching directories are pruned before descending, and matching regular files are skipped before admission, reading, hashing, or parsing. Symlink entries remain safety diagnostics rather than being hidden by a file glob. Built-in ignored directory names remain in force. `analyzeProject()` forwards `config.ignore.globs` unless an explicit `snapshotOptions.ignoreGlobs` override is supplied, so the private CLI and library use the same discovery boundary.

## Consequences

Configured dependency, generated, cache, secret-like, and project-specific paths can be excluded deterministically without executing or reading their source. Ignore patterns only exclude paths; there is no negation, filesystem glob expansion, or case-folding in this bounded slice. The separate dot-prefixed hidden-file policy is covered by ADR-028; generated-file detection, broader glob semantics, and the bounded library budget contracts remain separate concerns.
