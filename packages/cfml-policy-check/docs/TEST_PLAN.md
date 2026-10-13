# Test Plan

Status: `Local slice verified; complete matrix pending`
Last reconciled: 2026-10-12

## Recorded results and current correction

The earlier local record reports `npm test` passing 15/15 tests on Windows Node
v25.2.1 and manual CLI/AIT stdin smoke checks including the approved Globe3 profile.
These are historical observations, not a new suite run for the current correction.
The POL-01 through POL-16 states below retain that earlier evidence.

On 2026-10-12 the parent reported all 11 independent source CLI smoke controls
passing: no-target unknown hash/include, adjacent unknown/literal assignment and
malformed input refused with exit 3/null data; static violation retained exit
0/`violations`; static/comment/raw-text/escaped-hash controls passed; CRLF plus
Chinese text produced `HASH_EXPRESSION` at line 2, column 12 with content-free
root-relative metadata. All 52 native package tests subsequently passed under
Windows Node 24.21.0 consolidated root acceptance. A real offline packed Windows
CLI consumer also returned incomplete for unknown output without a table.
Deployment, complete cross-platform coverage, runtime CFML/database/browser
and published-release AIT behavior remain unverified.

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

## Current regression cases

The following are implemented in the existing test files and passed in the
52-test Windows native package gate. Broader matrix gaps above remain separate.

| ID | Consumer-visible behavior | Expected result |
| --- | --- | --- |
| POL-17 | Unknown hash/encoded output, include-only, assignment/script and raw-text CFML, with/without static targets | Incomplete/exit 3/null data, one cause |
| POL-18 | Static no-target, comment-only and escaped hashes | Complete pass with no findings |
| POL-19 | Multiline CRLF, BMP/astral Unicode and normalized nested source path | Original one-based line/UTF-16 column and canonical root-relative path; no private source values |
| POL-20 | Malformed closures/comments/tags/elements and unsupported text contexts | Fixed causal reason/location, first-cause ordering and deterministic result |
| POL-21 | Thousands of unknown tags | Exactly one bounded content-free cause, independent of construct count |
| POL-22 | Structural cause with output/deadline/token/depth limits | Resource exhaustion remains incomplete/exit 3/null data with no cause disclosure |
| POL-23 | AIT include-only request | Hub schema 1.0.0 and unchanged incomplete/exit mapping with original cause |
| POL-24 | Security path escape | Existing refusal without new cause details or path metadata |

The cause schema permits only `{reason,line,column}` for
`CFML_STRUCTURE_UNCERTAIN`; reason identifiers and location semantics are in
[JSON_SCHEMA.md](JSON_SCHEMA.md#structural-cause-details). Tests protect consumer
outcomes and coordinate/privacy boundaries, not incidental diagnostic wording.


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
