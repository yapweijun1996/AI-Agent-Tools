# Test Plan

Status: `Local slice verified; complete matrix pending`
Last reconciled: 2026-09-16

## Current results

Current-cycle `npm test` passes 15/15 tests on Windows Node v25.2.1. Manual CLI
and AIT stdin smoke checks also pass, including the approved Globe3 profile.
These results prove local source behavior only; they do not prove packaged,
deployed, cross-platform, or registered AIT behavior.

| ID | Fixture / check | Expected result | Current state |
| --- | --- | --- | --- |
| POL-01 | Table has direct colgroup and col | Complete pass | Pass |
| POL-02 | Table omits colgroup | Complete result with requires-colgroup | Pass |
| POL-03 | Table has empty colgroup | Complete result with requires-col | Pass |
| POL-04 | Multiple/nested table relationships | Stable independent findings | Pass |
| POL-05 | Static table inside cfoutput | Correct result and location | Pass |
| POL-06 | Table/columns emitted by loop or conditional | Incomplete; no false pass | Pass for generic cfloop and Globe3 dynamic fixture |
| POL-07 | Missing terminating # expression | Policy withheld/incomplete; CFML Check owns diagnostic | Partial; policy hash uncertainty is implemented, external owner not verified |
| POL-08 | Malformed/unsupported profile | Invalid-input error; source unchanged | Pass |
| POL-09 | File path escapes root or symlink escapes root | Security error; no outside read | Partial; traversal pass, symlink matrix pending |
| POL-10 | Repeated identical input/profile | Byte-stable result and order | Pass |
| POL-11 | Commented-out markup | No active finding | Pass |
| POL-12 | Nested tables | Independent evaluation | Pass; dedicated Globe3 fixture |
| POL-13 | Oversized/deep input | Incomplete resource result | Partial; output-limit path passes, oversized/deep source cases pending |
| POL-14 | Malicious profile text | No execution/network/mutation | Partial; executable fields rejected, full hostile corpus pending |
| POL-15 | Globe3 approved profile and sanitized regions | Profile loads; both table rules apply to the represented family | Pass; four fixture tests and owner decision recorded |
| POL-16 | Output limit overflow | Incomplete result and exit code 3 | Pass |

## Test layers

1. Unit tests for profile validation, path handling, tokenization, locations, and
   rule evaluation.
2. Fixture/contract tests for every POL case and every status/exit combination.
3. CLI tests for stdout purity, stderr bounds, help/version, invalid flags, and
   no-write behavior.
4. Security tests for traversal, symlink escape, malformed input, resource
   exhaustion, and executable-looking profile content.
5. Determinism tests across repeated runs and normalized line endings.
6. Cross-platform tests for the declared Windows/macOS/Linux support matrix
   before any Stable claim.

## Evidence rules

A passing build alone is not sufficient. Each release candidate must record the
exact source/release, commands, fixtures, environment, limits, platform scope,
known unsupported cases, and every failed or unrun check. Source tests do not
prove packaged, deployed, or AIT-consumed behavior.
