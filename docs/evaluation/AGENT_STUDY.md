# Fresh-session agent comparison

## Pre-registered design (2026-10-08)

The owner selected local commit, independent agent comparison and broader Test
Scope naming checks. This opt-in development study implements the fresh-session
follow-on described by the frozen [protocol](PROTOCOL.md). The original protocol,
manifest and observations remain unchanged. It does not add an agent runtime to
any tool, AIT, native verification or the package dependency graph.

There are thirty separate Codex CLI sessions: four known task families and one
new test-selection fixture, two conditions, three repetitions per family and
condition. Known tasks reuse the frozen Git source/patch and the retained real
native TAP/capture/process declarations. Native evidence is historical replay,
not a new execution. The unfamiliar fixture is reported separately and cannot
establish generalization to unseen repositories.

Both conditions use the existing configured `gpt-6.1-sol` model with `xhigh`
reasoning effort, Codex CLI 0.161.0, Windows and Node 24.19.0. This declares the
requested model/settings; JSONL does not authenticate a backend model snapshot.
Each fresh ephemeral session receives only its task, an isolated fixture root,
the same answer schema and a six-command budget, including at most two discovery
calls. Conventional agents use bounded reads/searches. Tool agents use the
relevant built local CLI, with ordinary inspection permitted for clarification.
Test Scope uses the refined source and optional compact output, identified by
runtime hashes; other selected tools retain their earlier source.

The runner does not load user MCP/provider configuration; it preserves the
declared model/effort and uses the CLI's existing saved authentication. It uses
read-only shell sandboxing, no repository instructions in experiment context,
and prompts forbid filesystem writes, network tools, other agents, KB access,
inspection of evaluator artifacts, installations and test execution. Inputs and
tool source/runtime hashes are checked before/after. Protocol compliance is
audited from transcripts; prompt restrictions are not an OS proof of isolation.

Trial order is pseudorandomly shuffled with recorded seed 20261008 before any
answer is collected. Sessions run sequentially; no concurrent benchmark is
introduced. There are no automatic retries or removal of unsuccessful trials.
An unavailable CLI/provider or invalid transcript is reported as unavailable,
not a correct answer. A separate fresh grader receives answers shuffled under
opaque IDs, reference facts and fixed criteria, without condition, commands,
usage or timings. Method hints in prose can weaken blinding and are disclosed.
Deterministic exact-source/path/count checks independently cross-check grading;
disagreements are reported rather than tuned away.

Known tasks ask agents to retain the full `analyze` function and explain unknown
withholding/failure precedence; select all five directly importing tests with
static-scope limits; inspect both changed patch paths under the explicit
protected-path policy; and decide strict acceptance from native counts plus
declared source/environment/process evidence. The new fixture asks for a suite
reachable through a helper and a direct consumer while excluding runner inputs,
with explicit naming/coverage limitations. These are read-only investigation
tasks, not implementation or complete developer workflows. Earlier synthetic
controls remain scripted controls; they are not counted as independent trials.

Record exact prompts and complete emitted JSONL events, final answers, CLI exits,
command calls, returned command-output UTF-8 bytes, wall-clock task time and
actual reported token usage. JSONL captures emitted events, not hidden reasoning
or provider internals. Setup and blinded grading are separate costs. Usage
includes prompts, common context, output schema and repeated tool/context input;
it is not inferred from bytes. Host load, warm caches and response variability
remain uncontrolled; three repetitions cannot establish statistical significance.
No monetary cost is inferred without account-specific billing evidence.

## Execution

Only run the provider-backed stage when independently authorized, as in this
owner selection. The runner requires explicit local executable paths; it does
not install software, discover credentials or change configuration:

```sh
python scripts/evaluate-agent-study.py --node /path/to/node24 --codex-js /path/to/codex/bin/codex.js --run
```

Local transcripts and exact prompts belong in an ignored
`.cache/agent-study/run-*/` directory. A portable observation and results document
contain hashes and measurements without raw provider transcripts. Temporary
fixture roots are removed after execution; evidence directories are retained.
TASK/VALIDATION own current completion and verification, and a separate results
document owns observations. No push, package publication or KB writeback is
included.

The event/answer collection follows [OpenAI's non-interactive CLI documentation](https://learn.chatgpt.com/docs/non-interactive-mode): `--json` records emitted
events and usage, `--output-schema` structures the final answer, and
`--ephemeral` avoids persistent session rollout files. Local CLI help and actual
events establish the installed version's behavior.
