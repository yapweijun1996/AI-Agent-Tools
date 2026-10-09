# Ubuntu CLI study observations

Observed 2026-10-08 under the owner-selected [study](AGENT_STUDY.md) and
[Ubuntu addendum](WSL_STUDY.md). The [portable record](CLI_OBSERVATION_2026-10-08.json)
preserves original automatic/blind scores and a separate primary review.
Earlier Windows rejection and unreliable host journals remain historical
records in [agent observations](AGENT_RESULTS.md).

## Collection and treatment uptake

Thirty fresh, sequential CLI sessions and one separate blind grader completed
with available, paired emitted events, answers and actual usage. Inputs/tool
trees matched before/after; all thirty command inventories were manually
reviewed against the allowed read/analyzer scope. No observed command invoked
tests, Git, installs, network, MCP or outside evaluator/credential files.
Owned fixtures were removed. These are emitted-event and consistency checks,
not proof of every OS action, producer authentication or backend model identity.

The tool-access condition did not require an analyzer invocation explicitly in
the delivered prompt. All three source-navigation participants chose ordinary
file reads. This deviates from the planned tool strategy. Preserve their assigned
arm and report uptake: zero of three used Code Slice; the other twelve assigned
tool trials invoked their analyzer. Source-navigation costs therefore cannot be
attributed to Code Slice. No trial was replaced or excluded. The subsequent
real-repository pilot registers explicit plan uptake before its answers.

## Answer checks and grading audit

All six source excerpts exactly preserve the full `analyze` function. All twelve
selection answers give the required suite sets and static limitations. All six
patch answers identify both changed paths and protected-path rejection. All six
acceptance answers report the six required counts correctly: 42 tests, 41 passed,
one skipped, zero failed/todo/cancelled, with declaration limitations.

Strict verdict distinctions matter: all three tool-access acceptance answers
explicitly say `unknown`. Two conventional answers withhold acceptance without
specifying the three-valued verdict; one incorrectly labels a skip as `FAIL`.
None claims execution was rerun, passing acceptance, complete runtime coverage
or business correctness.

The original deterministic checker compared a free-string `conclusion` against
an exact word. It marked equivalent patch rejection prose and expanded unknown
phrases incorrect, although the answer schema did not define a verdict enum.
Its five disagreement flags are retained, not rewritten as clean agreement.
The blind grader additionally rejected two correct unknown answers for omitting
the native suites count. That count was not among the six required schema fields
or a registered adequacy requirement. Retain the original scores and reasons;
do not treat them as an unbiased accuracy estimate.

Primary post-collection review uses the original criteria, accepts equivalent
patch rejection language, and removes the added suites-count requirement. It
finds 27 adequate answers versus 25 from the original blind grader. Conditions
were known during primary review; this is an explicit adjudication, not a new
independent or confirmatory grade. The table keeps both.

| Task | Assigned arm | Analyzer used | Original blind adequate | Primary reviewed adequate |
| --- | --- | ---: | ---: | ---: |
| Source navigation | Conventional | 0/3 | 3/3 | 3/3 |
| Source navigation | Tool access | 0/3 | 3/3 | 3/3 |
| Known direct selection | Conventional | 0/3 | 3/3 | 3/3 |
| Known direct selection | Tool access | 3/3 | 3/3 | 3/3 |
| Patch review | Conventional | 0/3 | 3/3 | 3/3 |
| Patch review | Tool access | 3/3 | 3/3 | 3/3 |
| Strict acceptance | Conventional | 0/3 | 0/3 | 0/3 |
| Strict acceptance | Tool access | 3/3 | 1/3 | 3/3 |
| Authored transitive selection | Conventional | 0/3 | 3/3 | 3/3 |
| Authored transitive selection | Tool access | 3/3 | 3/3 | 3/3 |

## Observed interface costs

Medians include discovery and clarification, CLI/provider work and WSL startup.
Returned bytes count UTF-8 `aggregated_output` in emitted command events; they
do not authenticate complete process stdout or backend context. Usage is
CLI-reported total session input, including repeated/common
context and cached input; it is not inferred from bytes or converted to billing.

| Task | Assigned arm | Shell calls | Returned bytes | Input tokens | Output tokens | Elapsed seconds |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Source navigation | Conventional | 1 | 9,423 | 32,297 | 2,224 | 64.3 |
| Source navigation | Tool access, unused | 1 | 9,423 | 32,542 | 2,247 | 66.2 |
| Known direct selection | Conventional | 5 | 27,063 | 105,494 | 2,577 | 97.1 |
| Known direct selection | Tool access | 6 | 41,556 | 146,682 | 2,499 | 98.5 |
| Patch review | Conventional | 2 | 2,804 | 46,122 | 425 | 24.6 |
| Patch review | Tool access | 3 | 4,171 | 48,355 | 580 | 26.1 |
| Strict acceptance | Conventional | 3 | 16,166 | 69,207 | 1,175 | 46.4 |
| Strict acceptance | Tool access | 5 | 14,493 | 93,419 | 1,319 | 50.9 |
| Authored transitive selection | Conventional | 2 | 1,127 | 45,970 | 1,014 | 41.4 |
| Authored transitive selection | Tool access | 5 | 11,363 | 67,046 | 1,545 | 54.7 |

These samples do not show a general token or latency advantage from tool access.
All three tool-access acceptance answers preserve the explicit unknown verdict;
their input usage and timings are higher. Simple bounded reads remain
adequate on several tasks. Three repeats, selected small tasks, one requested
model/settings/environment, uncontrolled load, treatment nonuse and grading
limitations prevent significance, causal productivity or generalization claims.

## Capture correction and retained evidence

Local evidence is `.cache/agent-study/run-ks994pxu/`. Exact executed harness and
design snapshots are retained; Git text normalization can change checkout EOL
bytes without changing that archived identity. Windows initially saved prompt
display files with CRLF while stdin delivery used LF. For all thirty trials and
the grader, separate `prompt-delivered.txt` files reverse only that conversion
and match the originally recorded stdin SHA-256. Original display files remain.
The subsequent capture writer stores exact UTF-8 stdin bytes directly, and seven
offline subprocess controls verify newline/Unicode identity and rejection of
policy, truncation, ambiguous turns, unfinished commands and answer mismatch.

Requested Node 24.19.0/CLI 0.161.0 and model/effort were preserved. The first Ubuntu
request's HTTP 401 and post-owner-login successful preflight remain separate
setup evidence. No policy bypass, copied token, alternate model or automatic
retry was introduced. Package source/releases and root native semantics are
unchanged. Linux-native storage, other models, Node 22 and full Linux/macOS
package acceptance were not executed by this study. TASK/VALIDATION own final
repository checks and status.
