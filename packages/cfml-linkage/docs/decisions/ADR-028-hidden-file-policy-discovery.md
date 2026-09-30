# ADR-028: Enforce the configured hidden-file discovery policy

- **Status:** Accepted for bounded v0.1 implementation
- **Date:** 2026-09-14
- **Scope:** T-051 dot-prefixed hidden-file and directory handling during snapshot discovery
- **Verification:** `test/snapshot.test.js`, `test/analyzer.test.js`, and `test/cli.test.js` cover include/ignore behavior, configuration forwarding, deterministic retained files, and the existing symlink/no-execution boundary

## Context

The v0.1 configuration contract already exposed `ignore.hidden_files`, but discovery did not forward or enforce that policy. A configuration requesting hidden-file exclusion could therefore still admit dot-prefixed source files.

## Decision

`createSnapshot()` accepts `hiddenFilePolicy` with `include` or `ignore`, defaulting to `include` for the direct snapshot API. When the policy is `ignore`, dot-prefixed regular files and directories are skipped before root admission, reading, hashing, or parsing. The policy applies to each directory entry name; symlink entries remain safety diagnostics and are not hidden by this policy. `analyzeProject()` forwards `config.ignore.hidden_files` unless an explicit `snapshotOptions.hiddenFilePolicy` override is supplied, so the private CLI and library share the same bounded behavior.

This slice defines hidden files as entries whose basename starts with `.`. Filesystem-specific hidden attributes are not inferred. The separate bounded `ignore.generated_files` policy controls only the directory named `generated`; built-in ignored directory names and configured ignore globs remain in force.

## Consequences

A caller can explicitly include or exclude dot-prefixed source entries without changing deterministic ordering or root containment. Excluded entries do not consume file, byte, or downstream analysis budgets. Broader generated-file detection and platform-specific hidden-attribute semantics remain open; T-058 verifies the bounded generated-directory behavior.
