# Real-repository selection pilot

Registered 2026-10-08 before collecting pilot answers. This owner-selected
follow-on uses the reliable emitted-event capture established for the
[Ubuntu study](WSL_STUDY.md). It is separate from the frozen four-task baseline,
authored unfamiliar fixture and earlier host journals. Production tools, package
identities and releases remain unchanged.

## Inputs and questions

Use clean, commit-pinned subsets of two existing owned repositories, extracted
from Git objects rather than mutable working files. Record every included path,
original-byte SHA-256, source commit and subset hash before any session. Omitted
dependencies, generated files, browser/worker applications and configuration
are explicit limitations. No project code, test, build or installer is executed.

* Markdown-Editor at `6b74417e28cf31987df10a962e19c3d123e66439`: root package and
  Vite metadata, JavaScript/JSX source, and JavaScript tests. For a proposed change
  to `src/preview/htmlEscape.js`, identify Node suites directly statically
  importing that file. Similar function names and callers outside tests are not
  direct-suite evidence. The task does not ask for all indirect consumers.
* PWA-Queue-Now at `d53054faee4df485211c0a244446b9b3113290cd`: root manifest,
  queue-core manifest/source/tests/build metadata, and contracts source/manifest.
  For a proposed change to `packages/queue-core/src/revision.ts`, identify
  queue-core Vitest suites with module-level static reachability, including
  barrel re-exports and `.js` specifiers resolved to existing `.ts` source.
  Reachability does not prove assertion coverage. The separately invoked
  `dist-smoke.mjs` is outside this Vitest-suite question. Both conditions receive
  the same scope and Vitest default include pattern, verified against
  [official documentation](https://vitest.dev/config/include).

These repositories have not supplied prior study task answers. They are owned
local projects selected deliberately, not a random sample of repositories.
The controller verifies clean status and exact commits, excludes executable
configuration loading, and never reads credentials or untracked files.

## Sessions and grading

Run twelve fresh, ephemeral Codex CLI sessions sequentially after the thirty
study sessions finish: two repositories, conventional/tool conditions, three
repetitions each. Seed 20261009 fixes order before answers. Use Ubuntu WSL, the
same task-local Node 24.19.0 and CLI 0.161.0, requested `gpt-6.1-sol` model and
`xhigh` effort. No model snapshot or billing cost is inferred. Neither study
runs concurrently with the other. Setup and grading are separate costs.

Each session sees only its isolated subset, task, answer schema and a six-shell-
call budget, including at most two help/capabilities calls. Conventional agents
use bounded POSIX reads and search; tool agents must invoke built Test Scope
`plan` at least once, with ordinary inspection for clarification. This explicit
uptake requirement was added before pilot answers after an earlier Ubuntu
study participant offered tool access chose only ordinary reading. Record
actual plan attempts as well as assignment; a missing tool attempt is a retained
protocol deviation and stops this pilot. Both must return paths relative to the
subset root, distinguish runner suites from support inputs, and state static
and subset limitations. Tests must not be run or claimed to pass. Do not use
network/MCP/KB, other agents, Git, installs, writes or evaluator artifacts.
Read-only sandboxing, existing policy and approval settings remain active.

The controller retains exact argv/prompt, all emitted JSONL, stderr, final
answer and actual usage. Capture checks reject policy/error events, ambiguous
turns, unpaired commands and answer mismatches. Check subset and tool hashes
before/after, report transcript scope violations, and stop at the first
unavailable or noncompliant session without replacement. Prompt restrictions
and emitted events do not prove every OS action was captured.

Prompts are stored as the exact UTF-8 bytes sent on stdin. Before this pilot,
an offline subprocess control verifies newline preservation. Earlier Windows-
controller study prompt files have CRLF display bytes; their LF delivery bytes
are separately reconstructed and checked against the originally recorded stdin
hash, preserving those original files. This pilot avoids that conversion.

A separate fresh grader sees shuffled opaque answer IDs and pinned reference
paths/criteria, without condition, command records, timing or usage. Adequacy
requires the exact suite set, correct static/runner reasoning and limitations,
without unsupported execution, acceptance or coverage claims. A deterministic
path-set check cross-checks factual grading; disagreement with broader adequacy
is reported. Prose can reveal method hints and weaken blinding.

Report each repository/condition separately: available samples, factual and
adequate answers, unsupported claims, command calls, returned UTF-8 bytes,
elapsed time and observed usage. Three repetitions, one environment/model,
selected subsets, warm caches and uncontrolled host/provider load cannot
establish significance, causality, complete workflow value or generalization.
Retain unsuccessful attempts and all raw local evidence in ignored storage;
portable observations contain measurements/hashes without raw transcripts.
Owned temporary subsets are removed after consistency checks. No policy bypass,
publication, push, production change or KB writeback is included.

Run only under the owner's existing research authorization:

```sh
python scripts/evaluate-real-repositories.py --wsl-distro Ubuntu --node /path/on/C/to/linux/node --codex-js /path/on/C/to/codex/bin/codex.js --run
```

TASK/VALIDATION own current status and acceptance; this document owns design.
