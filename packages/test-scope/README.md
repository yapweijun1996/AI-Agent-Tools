# agent-test-scope

`agent-test-scope` is a deterministic, local-first, read-only verification planner for AI coding agents. Given changed files, it returns bounded test recommendations, verification commands, evidence, confidence, risk, diagnostics, and escalation guidance.

## Boundary

The analysis core reads repository files as data. It never runs tests, builds, package scripts, installers, project code, network calls, or LLM calls, and it does not modify the target repository. Commands in results are recommendations with `executed: false`.

Command strings use POSIX shell quoting and are intended to run from the request's explicit `root`. Nested package scripts include `npm --prefix '<package-directory>' run '<script>'` so similarly named scripts retain their owning package. Use a POSIX-compatible shell when executing these recommendations; planning itself does not require a shell.

V0.1 supports JavaScript, TypeScript, JSX, and TSX repositories with Vitest, Jest, and Node.js native test conventions. Static imports and `require()` calls are bounded evidence; dynamic loading is reported as partial rather than treated as confirmed reachability.

Relative module imports retain an existing explicit file path before considering replacement extensions or directory indexes. JavaScript-extension imports can still map to TypeScript source when the exact file is absent; a same-stem TypeScript file does not replace an existing JavaScript target.

## Usage

For Codex CLI, install globally so the command is available from any project:

```bash
npm install --global agent-test-scope@latest
agent-test-scope capabilities --root .
```

The global installation exposes `agent-test-scope`; it does not execute tests
or automatically register the optional Codex Skill. For a checkout, use
`npm ci`, `npm run build`, and the same command through `node dist/cli.js`.

```bash
npm install
npx --no-install agent-test-scope capabilities --root .
npx --no-install agent-test-scope discover --root .
npx --no-install agent-test-scope plan --root . --changed src/order/service.ts
npx --no-install agent-test-scope explain --root . --changed src/order/service.ts --path tests/order/service.test.ts
```

The CLI writes one JSON result to stdout and human-readable copies of diagnostics to stderr. `complete` means planning completed within the evidence boundary; it never means tests passed. `partial` means useful evidence exists with a bounded limitation. `error` means the request or root boundary must be corrected.

## Source candidate filtering and compact output

The current monorepo source adds the following behavior; no updated npm artifact
has been published. Use a built checkout to try it:

```sh
node dist/cli.js plan --root . --changed src/core/discovery.ts --compact
```

`--compact` is a CLI formatting flag available for all four operations. It emits
the same complete JSON object and final newline without indentation. Status,
evidence, diagnostics, truncation, command ownership and exit codes are
unchanged; stderr diagnostics remain separate. Default output stays indented.
The library's request/result types and the distributed result schema are
unchanged. Removing whitespace does not deduplicate repeated evidence or prove
that a plan is the smallest useful context.

For planning decisions without the repeated evidence bodies, the current source
CLI also accepts:

```sh
node dist/cli.js plan --root . --changed src/core/discovery.ts --summary --compact
```

`--summary` is an explicit CLI view for `plan` only. It keeps every recommendation
in all three levels, IDs, paths, commands, ownership, confidence, changes, risk,
escalation, diagnostics, truncation, statistics and exit semantics. Each
recommendation replaces `evidence` with `evidenceCount` and sorted unique
`evidenceTypes`. Output declares `view: "summary"` and
`omitted: ["recommendation-evidence"]` when a plan exists. Evidence locations,
details and individual confidence values remain available in the full result;
the summary is a projection and cannot replace review of those details.

Summary JSON uses [summary.schema.json](schemas/summary.schema.json), while
default/compact JSON continues to use the original result schema. The ESM and
CommonJS APIs still return full results; `--summary` is not an API request field.
Combine it with `--compact` to remove formatting whitespace. Invalid operations,
duplicate flags and value-bearing forms are rejected. Partial or empty plans
retain their original status and diagnostic meaning; no mode executes tests.
Small plans can gain representation overhead, so choose the view for the needed
evidence rather than assuming every output is smaller. No new npm release is
recorded for this source addition.

## Optional CLI output budget

The current source supports `--max-output-bytes 1024..8388608` on operations:

```sh
node dist/cli.js plan --root . --changed src/core/discovery.ts --summary --compact --max-output-bytes 65536
```

This opt-in ceiling counts the serialized UTF-8 stdout, including its final
newline, after summary/compact formatting. A fitting result is byte-identical to
the same invocation without a ceiling. An oversized result is withheld entirely:
`data` is empty, `status` is `partial` (or remains `error` for an original error),
and `RESOURCE_LIMIT` reports the byte count, original status and number of withheld
diagnostics. Stderr receives that one bounded diagnostic rather than the original
diagnostic stream. A withheld result contains no usable plan. The existing
partial-result exit code remains zero; consumers must inspect status and data.

Narrow `--include`/`--exclude` to the relevant source/test owners before retrying.
The ceiling bounds delivery, not repository discovery time or parsing work. It
does not clip recommendations, silently select a subset, or change the API result,
core limits, package version or published artifact. Default output is unchanged.
Malformed CLI options now return a structured argument error before source
analysis. Output budget values outside the documented range are invalid input.

Discovery still retains support files as source for static import reachability,
but its directory-only test convention excludes these predictable support names:

- Declaration files ending in `.d.ts`, `.d.mts` or `.d.cts`.
- Subdirectories inside `test`, `tests` or `__tests__` named `fixture`, `fixtures`,
  `__fixtures__`, `__mocks__`, `mocks`, `helpers` or `support`.
- File stems `helper`, `helpers`, `setup`, `teardown`, `util`, `utils`,
  `test-helper`, `test-helpers`, `test-utils`, `type-contract` or `typecheck`.

An explicit `.test.*` or `.spec.*` name takes precedence over support-directory
and support-stem heuristics; declaration files remain excluded. Ordinary
directory-only tests, including aliased framework imports, retain the previous
candidate convention. These names are heuristics, not proof that a file contains
or executes tests. A real test using a reserved support name should use an
explicit test/spec filename; `include` narrows discovery and does not override
classification. Package-native commands remain available for wider verification.

Changes to a helper can therefore recommend importing test suites without
recommending the helper itself as a targeted test. Dynamic loading and missing
evidence still produce the existing partial result; candidate filtering cannot
turn partial analysis into executed or passing verification.

The library exposes `getCapabilities`, `discoverTests`, `planTestScope`, `explainRecommendation`, and `execute` from `agent-test-scope`. Both ESM and CommonJS consumers are supported:

```js
import { planTestScope } from "agent-test-scope";
```

```js
const { planTestScope } = require("agent-test-scope");
```

The CLI remains available as `agent-test-scope`.

## Agent skill and release status

The npm package includes `skills/agent-test-scope/SKILL.md`. An agent host must load that file explicitly; npm does not automatically register skills. The package has no runtime dependencies, but the repository requires the development toolchain to build and verify it.

The project is licensed under MIT; see [LICENSE](./LICENSE). Version `0.1.1` is published on npm with npm Trusted Publishing and provenance. The repository includes locked Node 20/22 CI and a tag-triggered npm publishing workflow; future releases must commit `package-lock.json`, create the matching `v<package.version>` tag, and pass the clean-install checks in CI.

## Result model

Every recommendation retains its evidence type and confidence. Direct filename mapping and explicit static imports may be `confirmed`; static transitive reachability is `strong`; naming, proximity, and fallback conventions are at most `candidate`. Risk describes verification breadth, not failure probability.

The planner returns `minimum`, `recommended`, and `release` levels. It does not select tests from runtime coverage, diagnose failures, generate tests, calculate blast radius, or replace Project Profile, Symbol Search, Code Slice, Change Impact, Error Lens, Patch Guard, or Release Guard.

See [SPEC.md](./SPEC.md) for the normative contract and [skills/agent-test-scope/SKILL.md](./skills/agent-test-scope/SKILL.md) for agent workflow guidance.
