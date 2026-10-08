# Local task-value evaluation

This opt-in development evaluation answers whether existing tools provide useful
evidence for four repository tasks. It does not add an agent runtime or a release
gate. Run it after `npm run build` with Node 22.13+ in the 22 line or Node 24:

```sh
node scripts/evaluate-task-value.mjs
```

The runner reads the frozen manifest, verifies Git object hashes and the selected
tool source, and executes only the four named local CLIs and the Test Evidence
native suite. It uses no network, provider API, credentials, installation, Git
writes or arbitrary command from an input. Missing Git history, builds, `rg`, or
supported runtime is an unavailable experiment, not a passing measurement.

## Frozen tasks and evaluators

Inputs are real source and a real historical patch, pinned in
[tasks.json](tasks.json). Fault controls are explicitly derived inputs. Freeze
this protocol and manifest before collecting measurements; any change requires
a new run and a documented reason. Do not tune thresholds to obtained results.

| Task | Conventional baseline | Tool | Required evidence / threshold | Negative control |
| --- | --- | --- | --- | --- |
| Read the Test Evidence acceptance implementation | Full source-file read; additionally a bounded `rg` excerpt | Code Slice symbol `analyze` | Exact frozen 70-line function, including unknown withholding and failure precedence; both approaches retain all required source | Missing symbol must reject; a one-line signature fails the evidence criterion |
| Find tests importing changed `src/index.js` | `rg` over the five native test files | Test Scope plan, minimum and recommended recorded separately | All five independently inspected direct imports retained; no assertion that static scope proves runtime coverage | A basename-only search omits the actual tests; partial output never establishes complete scope |
| Review a shared installer file in a historical patch | Full diff read; additionally Git-derived changed-path listing checked against explicit policy | Patch Guard | Preserve both paths and identify protected `bin/install-all.js`; clean `bin/ait.js` subset passes | Truncated hunk withholds verdict; exit 0 alone must not accept a violating patch |
| Decide whether a native suite satisfies a required check | Native TAP summary plus explicit source/environment/process declarations, inspected together | Test Evidence summarize and verify | Actual producer counts agree; matched nonzero all-pass accepts; any skip withholds acceptance | Stale source, missing check, unknown process, truncation, explicit failure and failure with a missing check |

The baseline implementations are deliberately bounded to these inputs. They are
not alternative general-purpose tools. A competent conventional workflow is a
valid comparator; tools need not win. Shortcut controls demonstrate insufficient
evidence, not the frequency with which real agents make that mistake. The frozen
line range for the bounded source comparator is oracle-assisted and disclosed;
it is a lower-bound cost for a caller that already knows the range.

## Measurement and interpretation

- Three sequential repetitions per arm, alternating baseline/tool order. No
  simultaneous benchmark processes. Report each elapsed sample and median;
  warm filesystem/process effects and host load are uncontrolled.
- Measure complete CLI stdout/stderr UTF-8 bytes, returned source bytes/lines
  where meaningful, command count, evidence adequacy, and stated limitations.
  Report fixture input bytes separately. These are not token measurements,
  filesystem-read tracing, agent reasoning time, or end-to-end task latency.
- Discovery/help and native evidence collection are recorded separately from
  analysis timing. Selected package versions, lock hashes, built runtime hashes,
  command arguments, artifact hashes and platform/runtime identify each run.
- Conventional evidence grading and the fixture-specific TAP reference are
  authored in advance; that setup/reasoning cost is not timed. The reference
  reads the counts extracted from the independently captured TAP summary. Its
  compact JSON is a lower-bound interface cost, not a demonstrated human or
  agent workflow speed. Tool analysis does not receive this reference verdict.
- Every arm has the same source snapshot and task. Tool output is schema-checked
  with the existing package-local Ajv dependency. Source and artifacts are hashed
  before and after analysis. Temporary fixtures are removed even after failure.
- The native suite is executed once for shared evidence with simultaneous TAP
  and JSONL reporters. This is a real run, not a fabricated successful capture.
  Its duration is a shared collection cost, not credited to either analysis arm.
- Synthetic controls accompany real tasks and are reported separately. An
  unavailable/malformed result cannot satisfy a criterion. No throughput,
  statistical significance, general correctness or safety claim follows.

Tool stdout/stderr must be byte-identical within the three repetitions. The
`rg` multi-file baseline may list equivalent matches in a different order;
its selected paths are normalized for grading and raw byte stability is reported
separately. Rejected development attempts are not timing samples. During runner
development, an existing CRLF checkout required separate canonical Git and actual
byte hashes, and control source/environment objects were made independent so
changing a target cannot also change the run declaration. These are evaluator
corrections; only a subsequent complete run is an observation.

Full command outputs and measurements go under ignored
`.cache/task-value-evaluation/`, with a unique run directory. The maintained
[results](RESULTS.md) summarize one identified observation; TASK/VALIDATION own
current completion and platform evidence.

## Agent-outcome boundary

This first pass establishes evidence availability and interface cost. It cannot
measure actual agent error rates: the current agent already knows the fixtures,
and scripted baseline decisions are not independent model trials. No avoided
agent mistakes, token savings or developer productivity are claimed.

The follow-on real-agent protocol reuses these task prompts and acceptance
criteria with separate fresh sessions, the same declared model/settings and
tool discovery budget, randomized condition order, at least three repeats per
task/condition, complete transcripts, and blinded grading of final answers.
Record correctness, unsupported completion claims, calls, returned bytes,
wall-clock task time and measured usage when available. Separate unfamiliar
tasks from this known four-task set to check selection and learning bias. A
different model, paid endpoint, external repository or delegated agent needs its
own explicitly selected scope; this runner starts none of them.

## Keep / reject rule

Keep a tool in a workflow when it retains required evidence and its provenance,
rejection behavior or context reduction justifies measured interface cost.
Prefer conventional inspection for small or already-localized questions when
it supplies equivalent evidence more cheaply. Reject any claimed improvement
that loses required facts or treats unknown/partial as acceptance. A failed
criterion stops the run; existing native contracts and root acceptance semantics
remain unchanged.
