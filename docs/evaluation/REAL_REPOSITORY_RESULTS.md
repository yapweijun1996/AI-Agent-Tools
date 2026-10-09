# Real-repository selection observations

Observed 2026-10-08 after the separate Ubuntu study, using the
[registered pilot](REAL_REPOSITORY_PILOT.md) and
[portable record](REAL_REPOSITORY_OBSERVATION_2026-10-08.json). Twelve fresh
sequential sessions and a separate fresh blind grader completed on Ubuntu WSL
with the Windows controller, Node 24.19.0 and CLI 0.161.0, requested
`gpt-6.1-sol`/`xhigh`. No trial was replaced or omitted.

## Input and answer evidence

Markdown-Editor was pinned to `6b74417e28cf31987df10a962e19c3d123e66439`: 82
selected Git-object files, 238,879 bytes. PWA-Queue-Now was pinned to
`d53054faee4df485211c0a244446b9b3113290cd`: 21 selected files, 38,511 bytes.
Both source checkouts were clean before extraction. The portable record lists
every included path/hash. These are selected source subsets without dependencies,
generated output or other applications; no project command or test was run.

Every Markdown answer selects only `test/htmlEscape.test.js`, the direct Node
suite importer of `src/preview/htmlEscape.js`. Every Queue answer selects all six
queue-core Vitest suites: idempotency, lifecycle, presence, return-window,
revision and sequence. Each imports the source barrel that re-exports revision;
`.js` specifiers resolve to existing `.ts` source. The separate dist smoke script
is excluded from this Vitest question. Static module reachability does not prove
symbol assertions, execution, passing tests or complete business coverage.

The fixed path-set checks and blind adequacy grades agree for all twelve answers.
All six tool participants attempted `plan` under the explicit uptake requirement.
No answer makes an unsupported completion/coverage claim. The grader saw opaque
IDs without condition, command or usage data; prose method hints can still weaken
blinding. Three correct repeats on each selected task are descriptive evidence,
not a population error-rate estimate or repository-generalization guarantee.

| Repository | Arm | Exact paths | Blind adequate | Unsupported completion claims |
| --- | --- | ---: | ---: | ---: |
| Markdown-Editor | Conventional | 3/3 | 3/3 | 0 |
| Markdown-Editor | Test Scope | 3/3 | 3/3 | 0 |
| Queue-Now | Conventional | 3/3 | 3/3 | 0 |
| Queue-Now | Test Scope | 3/3 | 3/3 | 0 |

## Captured costs

Medians include interface discovery, supplementary reads, CLI/provider and WSL
work. Bytes count UTF-8 `aggregated_output` in emitted command events, not proof
of complete stdout or backend context. Input tokens include common/repeated and
cached session context; cached counts and exact samples remain in the record.
Do not infer account billing or monetary cost.

| Repository | Arm | Shell calls | Returned bytes | Input tokens | Output tokens | Elapsed seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Markdown-Editor | Conventional | 4 | 4,609 | 63,029 | 1,359 | 54.2 |
| Markdown-Editor | Test Scope | 4 | 54,207 | 83,209 | 1,632 | 65.8 |
| Queue-Now | Conventional | 3 | 51,214 | 83,767 | 1,758 | 71.2 |
| Queue-Now | Test Scope | 5 | 61,845 | 144,908 | 2,580 | 91.5 |

Both conditions answer correctly. Tool-arm medians have higher input usage,
output bytes and elapsed time on these two questions. Tool participants inspect
native recommendations and then verify the requested direct/barrel/runner scope
with supplementary reads. A bounded plan is not automatically the smallest
evidence packet for a narrow import question. These observations support using
tools when their explicit evidence/contract answers the task; they do not
establish causal overhead or performance on full development workflows.

One initial capabilities invocation omitted required `--root` and returned
`INVALID_REQUEST`; its subsequent plan used the explicit root. Nonzero `rg`
no-match/absent-directory outcomes are retained too. These are captured command
outcomes inside available sessions, not missing trials. Repeated plan calls and
discovery costs remain in the measurements.

## Integrity and limits

Local evidence is `.cache/agent-study/real-repositories-7t83a8__/`, with registered
file hashes, exact executed harness/design snapshots, exact UTF-8 stdin prompts,
complete emitted JSONL, final answers, stderr, process records and blind mapping.
All thirteen prompt/answer/event identities match their recorded hashes. Both
studies and their graders have forty-four distinct thread IDs. Tool/source
subset hashes and owned-fixture cleanup passed; all twelve command inventories
were manually reviewed with no observed tests, writes, installs, Git, network,
MCP or outside evaluator/credential access. No policy was bypassed or token copied.
These checks establish recorded consistency, not OS isolation or authentication
of all actions/model state. Obvious credential-pattern screening of the selected
source found none; it cannot identify every secret.

Post-collection auxiliary inventory generation used Windows default decoding
for Unicode output text in trials 5 and 8. Core capture already decoded UTF-8
explicitly and its raw events, byte counts and usage are unchanged. Original
derived inventories remain; a separate UTF-8 inventory matches every command
identity/exit field. The uptake parser now names UTF-8 explicitly, and an added
offline Unicode event/final-answer control passes. Executed pre-fix harness
bytes remain in the recorded snapshot rather than being presented as current
source bytes.

The repositories were selected owned projects, not a random sample. Only static
selection was studied; no actual fix, testing workflow, Linux-native disk,
other model or Node 22 comparison was run. Three repetitions and uncontrolled
host/provider load cannot establish significance, causality, productivity or
release maturity. Production source/version/release state remains unchanged.
Root native and Hub acceptance are recorded separately in TASK/VALIDATION.
