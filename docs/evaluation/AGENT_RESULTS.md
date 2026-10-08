# Independent-agent answer observations

Observed 2026-10-08 on Windows with Node 24.19.0. The owner selected a local
commit, independent-agent comparison and broader naming regressions. The
[host pilot design](HOST_PILOT.md), [portable artifact audit](HOST_PILOT_2026-10-08.json)
and separate [CLI study design](AGENT_STUDY.md) have different evidence limits.
The original four-task protocol, manifest and observation remain unchanged.

## Answer artifacts

Twelve fresh host default-role agents ran sequentially in the registered order:
two Test Scope task families, two conditions, three repeats. They received
`fork_turns="none"` and the same inherited host settings. A separate fresh grader
saw shuffled opaque IDs and reference facts without condition, commands or time.
Method hints in answer prose can weaken blinding. Authoritative model snapshot,
full underlying host transcripts and usage are unavailable.

The known input contains forty-three frozen Test Evidence files; the unfamiliar
input contains seven authored billing/helper/fixture/type-check files. These are
two small selection tasks, not complete development workflows. Both prompts
require project-relative paths, native-command/import evidence, separation of
support inputs and static coverage limits. The grading instructions instantiated
after collection distinguish correct suite identification from the existing
path-format requirement; this is descriptive grading, not a confirmatory study.

| Task | Condition | Answer artifacts | Correct suite identification | Adequate answer contract |
| --- | --- | ---: | ---: | ---: |
| Known direct imports | Conventional | 3 | 3 | 0 |
| Known direct imports | Tool | 3 | 3 | 3 |
| Authored transitive imports | Conventional | 3 | 2 | 2 |
| Authored transitive imports | Tool | 3 | 3 | 3 |

Three conventional known answers identify all five correct suites and give
accurate reasons, but return repository-relative fixture prefixes rather than
paths relative to the selected project. They are formatting-contract failures,
not incorrect test selection. Deterministic path-set checks independently agree
with all blind factual and adequacy grades. No answer claims tests ran, passed
or that static reachability proves complete runtime coverage.

Trial 4 returns an empty selection and an unavailable-input claim. The frozen
prompt supplies an existing input root and its registered hash still matches.
Its participant journal instead records a prompt with an extra output-directory
component, then records commands against that wrong root and enumeration of
evaluator/other-trial metadata. The journal contradicts the actual frozen input;
the cause cannot be attributed confidently to an agent locating error, prompt
delivery or reconstruction of its journal. Retain the answer and violation
without replacement. Do not count this as a demonstrated tool benefit or a
verified agent error rate.

## Telemetry limitations

After only CRLF/LF and trailing-whitespace normalization, six of twelve journals
agree with the frozen setup prompt. Six disagree, including literal escape and
ownership-path differences as well as trial 4's material root difference.
Participant-written journals are not authenticated execution telemetry. All
aggregate command counts, output bytes, latency and token metrics are withheld;
raw local artifacts remain available for audit. Parent observation timestamps
also include scheduling and observation delay, so they cannot establish task
speed. Input, current tool source/runtime and registered prompt hashes passed
read-back checks. Those checks establish file consistency, not proof of every
action or complete transcript capture.

Local evidence is `.cache/agent-study/host-pilot-urxbbuf2/`, including registration,
prompts, answers, journals, blind mapping/grades, timestamps and the audit script.
Two earlier setup sessions under `host-pilot-cecv9791` used an accidental trailing
period in the tool example. They were excluded before the twelve measured
attempts; their evidence and correction remain separate. No failed attempt was
silently replaced. Owned fixture directories were removed after consistency
checks. Portable results contain hashes and answer grades, not raw transcripts.

## Separate CLI study remains blocked

The planned thirty fresh Codex CLI sessions could not obtain task evidence:
local execution policy rejected bounded input reads and analyzer commands. Six
completed unavailable responses and the stopped seventh session are retained in
`.cache/agent-study/run-cp6xkyof/`. They contribute zero performance or correctness
samples. No execution policy was disabled or relaxed. Despite the requested
ignore-user-config flag, the host injected MCP startup; it failed to authorize
and no MCP task call occurred. The host pilot does not fulfill the CLI study's
full-transcript and usage requirements.

The development runner now rejects a zero-exit response when its stderr reports
execution-policy rejection, retains stderr identity, and stops at the first
unavailable session. Offline controls exercise acceptance and that rejection
without contacting a provider. The tool invocation example no longer appends an
accidental positional period. The full positive provider-backed runner remains
unverified; a suitable authorized execution environment is needed before its
results can be claimed. Historical raw attempts retain the harness/protocol
snapshot used then.

## Engineering decision

Keep the independently verified candidate filtering and lossless compact output
as local source improvements. Add three naming/filter regressions covering
twenty-seven new paths and three include/exclude combinations; do not change
production classification based on these limited answer observations. Both
conditions identify the known test set correctly. There is insufficient evidence
to claim lower agent error rates, token savings, faster development, unseen
repository generalization or a published release. Node 22/Linux/macOS execution
of this refinement and study remains unverified. TASK/VALIDATION own current
acceptance and Git owns the owner-requested local commit identity.
