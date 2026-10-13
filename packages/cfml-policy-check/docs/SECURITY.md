# Security Requirements

Status: `Implemented local controls; matrix incomplete`
Last reconciled: 2026-10-12

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

Malformed profiles and invalid requests return error status. Visible non-`cfoutput`
CFML tags, non-escaped hash expressions and malformed markup return incomplete
even with no literal table target. Includes, literal assignments and encoded-output
calls are not executed or assumed safe. Unsupported extensions and resource
exhaustion retain their native error/limit mappings. The tool does not diagnose
runtime syntax or the missing terminating `#` issue owned by `agent-cfml-check`.

`CFML_STRUCTURE_UNCERTAIN` discloses one bounded cause: one of eight fixed
reasons, original one-based line/UTF-16 code-unit column, and validated
root-relative source path in `meta.path`. No arbitrary source strings,
attributes, values or excerpts are included. See the
[cause contract](JSON_SCHEMA.md#structural-cause-details).
Limits may instead withhold the cause with `RESOURCE_LIMIT`; no partial data or
runtime conclusions are exposed.

## Verification status

The earlier local record reports 15/15 tests covering path escape, malformed
profile, no-write behavior, determinism, comments, dynamic CFML, output structure,
approved Globe3 fixtures and output-bound exhaustion, plus package dry-run and
Secretlint checks. Those historical results do not verify the current correction.

On 2026-10-12 the parent reported all 11 independent source CLI smoke controls
passing for no-target fail-closed behavior, static controls and content-free
CRLF/Unicode causal location. New regression tests also cover repeated-cause
bounds, serialization/deadline limits and token/depth limits; they await the
consolidated suite gate. No CFML, database, browser or include execution occurred.
Cross-platform/symlink/encoding/security matrices, consumer/import behavior and
registered AIT isolation remain unverified beyond recorded bounded observations.

Security requirements take priority over false-positive suppression.
