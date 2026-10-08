# Test Scope candidate and output refinement

Observed 2026-10-08 on Windows Node 24.19.0. The owner selected the Test Scope
follow-up from the [first task-value observation](RESULTS.md): reduce support-file
candidates and output cost while retaining the native evidence contract. The
[package contract](../../packages/test-scope/README.md) owns the implemented
naming rules and optional `--compact` flag. These are local source changes; no
new npm artifact, package version or lifecycle claim is included.

## Comparison and measurement

The opt-in `scripts/evaluate-test-scope-refinement.mjs` replays only the Test
Scope task from the frozen [manifest](tasks.json). It reconstructs the old source
at `ef05d9a7cd270a0971dd9caa7fd8e0e52b48c40d`, compiles it with the already
installed TypeScript 5.9.3, and requires its complete built-runtime hash to match
the original observation. All forty-three Test Evidence input files are
reconstructed from that same commit and individually hash-checked. The original
four-task protocol, runner and measurement record are unchanged.

Each arm ran three times, sequentially in alternating order. Timings include the
Node process and CLI; bytes are complete stdout, not tokens. Reconstruction and
compilation are separate from plan timing. Exact samples, symbolic commands,
input/source/runtime/schema/lock hashes and limitations are recorded in the
[portable observation](TEST_SCOPE_REFINEMENT_2026-10-08.json). Full local command
evidence is `.cache/test-scope-refinement/run-Ar0vDk/`.

| Arm | Minimum / recommended paths | Stdout bytes | Median ms |
| --- | ---: | ---: | ---: |
| Frozen source, default formatting | 5 / 13 | 57,693 | 112.32 |
| Current source, default formatting | 5 / 5 | 36,947 | 96.79 |
| Current source, `--compact` | 5 / 5 | 20,108 | 95.46 |

Candidate filtering removed eight support inputs from the recommended set:
six nested fixture files, `test/helpers.js` and `test/type-contract.ts`. All five
independently identified required tests remained in every minimum set. Source
discovery still scanned 39 files and parsed 113,917 bytes, so this is candidate
filtering rather than a reduction in source-analysis work. The three arms
retained `partial`, no truncation, the same five diagnostic codes and 610 stderr
bytes. No recommended command was executed by the planner.

The combined stdout reduction is 65.1%. Compact serialization alone removes
45.6% of the new default output's bytes; it preserves every parsed JSON field.
All nine outputs passed the native schema check. Each arm's repeated stdout and
stderr hashes were identical, and compact/default objects were deeply equal.
The baseline's two compiler invocations took 1,119.99 and 1,154.70 ms separately.
Three samples do not establish statistical significance or general throughput.

## Verification and limits

The package's Windows Node 24 gates passed: ESM/CommonJS type checking, 34 native
tests (33 passed, one explicit POSIX-shell skip), schema/docs checks, the bounded
160-file benchmark (49.2 ms) and a real tarball consumer. The packed CLI's compact
plan matched its ESM API and excluded support inputs; existing CommonJS checks
were retained. New regressions cover named/plain tests, helper import
reachability, all CLI operations, errors, partial/truncated output and invalid
flag forms. [TASK](../../TASK.md) and [VALIDATION](../../VALIDATION.md) own full
repository acceptance and current status.

Support classification remains a documented naming heuristic. A real test with
a reserved support name needs an explicit `.test.*` or `.spec.*` filename; these
names take precedence except for declaration files. Static imports through
support files remain available, and unknown/dynamic resolution stays partial.
The planner does not determine what the test runner will execute or prove that
omitted paths require no verification.

The compact output still contains repeated evidence and is about 35 times the
574-byte direct-import `rg` result from the earlier observation. This refinement
addresses a measured cost without establishing lower agent error rates, token
savings or faster overall development. Independent agent trials and Node
22/Linux/macOS execution of this change remain unrun.

To replay from a built checkout with Node 24 and installed package development
dependencies:

```sh
node scripts/evaluate-test-scope-refinement.mjs
```

The script reads local frozen Git objects, invokes explicit compiler/plan
commands, retains command evidence under `.cache/test-scope-refinement/`, and
removes its owned temporary fixture directory. It does not install dependencies,
contact a provider, write KB memory or publish anything.
