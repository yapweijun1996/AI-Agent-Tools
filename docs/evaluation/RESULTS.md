# Local task-value observations

Observed 2026-10-08 on Windows, Node 24.19.0, ripgrep 15.2.0. Four repository
tasks were replayed under the [frozen protocol](PROTOCOL.md) and
[manifest](tasks.json), using source commit
`ef05d9a7cd270a0971dd9caa7fd8e0e52b48c40d` and historical patch commit
`5aaf567d4f207ef2e8a228d4072c2b26bceeb0e4`. Package source, runtime build and lock
hashes, exact samples, portable command locations, and control outcomes are in
[the recorded observation](OBSERVATION_2026-10-08.json). Full local evidence is
in `.cache/task-value-evaluation/run-GvfFHU/`.

A separate later [independent-agent observation](AGENT_RESULTS.md) records answer artifacts and incomplete telemetry; it does not change this scripted baseline.

A later owner-selected [Test Scope source refinement](TEST_SCOPE_REFINEMENT.md)
records a separate frozen before/after replay. The table and conclusions below
remain observations of the original runtime; they do not describe the new source.

## Measured interface costs

All listed arms retained their task's required evidence. Each ran three times,
sequentially in alternating order. Times are process/CLI medians in milliseconds;
returned bytes are complete stdout, not tokens or filesystem-read measurements.
They exclude setup/reasoning, discovery and shared test collection.

| Task and arm | Stdout bytes | Median ms | Evidence / limitation |
| --- | ---: | ---: | --- |
| Source: full file | 9,423 | 60.99 | Complete 134-line source |
| Source: bounded `rg` | 5,561 | 12.11 | Exact 70 lines; oracle-assisted known range |
| Source: Code Slice | 5,748 | 147.86 | Same exact 70 lines, named syntax and byte locator |
| Tests: direct-import `rg` | 574 | 18.30 | Five direct imports; no transitive/coverage claim |
| Tests: Test Scope | 57,693 | 87.22 | Five minimum paths, thirteen recommended paths; partial |
| Patch: full diff | 2,622 | 47.07 | Both files available for inspection |
| Patch: Git path list | 30 | 28.58 | Both paths; content uninspected |
| Patch: Patch Guard | 889 | 55.47 | Explicit protected-path violation; analysis exit 0 |
| Acceptance: bounded reference | 154 | 58.69 | Fixture-specific TAP counts plus declared bindings |
| Acceptance: Test Evidence | 1,885 | 139.24 | Summarize + verify, two calls; strict unknown |

Test Scope additionally emitted 610 stderr bytes per repetition. Other measured
arms emitted no stderr. All four tools' repeated stdout/stderr were byte-stable
within this run. The `rg` multi-file match order varied, but its normalized five
selected paths and byte count were stable. Three samples do not establish
statistical significance or comparative throughput.

Separate one-time tool capability discovery plus `rg --version` cost 332.24 ms
and returned 4,146 bytes. The native collection cost 2,185.18 ms, producing
8,689 TAP bytes and 2,334 projected JSONL bytes; both reporters observed the same
42 tests: 41 passed, one skipped, zero failed. Input preparation, baseline
authoring and agent interpretation were not timed. Test Evidence's compact
reference receives counts extracted from the independently recorded TAP; that
baseline is a lower-bound comparison, not evidence of faster human reasoning.

## Workflow decisions supported by this run

**Use Code Slice when syntax boundaries or symbol navigation matter.** Here its
complete JSON output was 39.0% smaller than a full-file read and returned 5,317
source bytes instead of 9,423. A caller already knowing the exact line range got
the same source from `rg` more cheaply. This task does not support always using
Code Slice, or general token-savings claims.

**Review Test Scope candidates before execution.** Its five minimum paths
matched all independently inspected direct imports. The recommended list also
included six fixtures, `test/helpers.js` and `test/type-contract.ts`; some
fixtures deliberately fail, cancel or skip. The returned partial status and
candidate provenance matter. At roughly one hundred times the direct-import
baseline stdout size, this small package is a concrete case where richer output
adds substantial interface cost. Candidate filtering and compact presentation
are follow-up proposals, not changes made by this evaluation.

**Use Patch Guard to automate a declared policy, not to infer intent.** It
identified protected `bin/install-all.js` in the real two-file installer patch.
That is a finding under the evaluation policy, not a claim that the historical
fix was defective or unauthorized. The clean one-file subset passed; a truncated
hunk withheld a verdict. Git's thirty-byte path list was sufficient for this
simple path question; Patch Guard additionally supplied a validated policy
result and rejection behavior.

**Use Test Evidence for reusable acceptance semantics.** Its summary agreed
with the real producer counts and its strict verifier withheld acceptance for
the skip despite native exit 0. A careful conventional check reached the same
unknown verdict. Nine evidence controls passed: synthetic all-pass, failure,
skip, stale source, missing check, unknown process, environment mismatch, failure
with another missing check, and truncation of the real capture. The eight
synthetic summary controls are derived evidence, not additional test executions.
Source/environment/process negatives start from an all-pass input so the
existing native skip cannot mask a broken binding check.

## What remains unproved

The signature-only, basename-only, patch-exit-only and stale-native-exit-only
shortcuts lacked required evidence or reached an unsupported conclusion. On
Windows the native-exit-only shortcut also incorrectly accepted the skipped
suite. These are deliberately defined diagnostic controls, not observed errors
from independent agents. No reduction in agent error rate, token usage or total
development time has been measured.

This is one selected four-task set from one repository/platform/runtime. No
unseen task, independent model session, developer study, Linux/macOS measurement
or Node 22 evaluation was run. Tool setup amortization and applicability to larger
repositories remain unknown. The next experiment is the separate fresh-session,
blinded agent comparison defined in the protocol; choosing a new endpoint or
delegating work is not implicit in these local replay results.

Current completion and broader regression evidence belong in
[TASK](../../TASK.md) and [VALIDATION](../../VALIDATION.md). No package maturity,
native contract, root acceptance rule or publication identity changed.
