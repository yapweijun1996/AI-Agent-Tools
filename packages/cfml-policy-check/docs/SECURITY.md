# Security Requirements

Status: `Implemented local controls; matrix incomplete`
Last reconciled: 2026-09-16

## Implemented trust boundary

Source files, profile JSON, rule messages, comments, and repository metadata are
untrusted data. The implementation does not evaluate them as code or commands.
It reads only the explicit root-relative source and profile.

## Filesystem and process controls

- Explicit root and source/profile paths are required.
- Absolute child paths, traversal, and realpath symlink escapes are rejected.
- Only UTF-8 input is accepted.
- File, profile, token, depth, finding, output, and processing limits are finite.
- The implementation uses Node built-ins and does not execute CFML, JavaScript,
  SQL, browser code, package scripts, profile code, or includes.
- The implementation writes no source, cache, telemetry, or generated output.
- Output contains root-relative paths and does not include full source bodies.

## Fail-closed behavior

Malformed profiles and invalid requests return error status. Dynamic CFML tags,
non-escaped hash expressions affecting a table, malformed markup, unsupported
extensions, and resource exhaustion return incomplete or bounded security errors
according to the exit contract. The tool does not diagnose runtime syntax or the
missing terminating `#` issue owned by `agent-cfml-check`.

## Verification status

Current-cycle local tests (15/15) cover path escape, malformed profile, no-write
behavior, determinism, comments, dynamic CFML, output structure, the approved
Globe3 fixtures, and output-bound exhaustion. The current package dry-run and
Secretlint scans also pass. The following remain unverified: symlink escape on
the declared platform matrix, unusual encodings, oversized/deep input,
cross-platform execution, consumer/import behavior, and registered AIT
isolation.

Security requirements take priority over false-positive suppression.
