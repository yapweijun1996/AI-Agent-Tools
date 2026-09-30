# agent-test-scope

`agent-test-scope` is a deterministic, local-first, read-only verification planner for AI coding agents. Given changed files, it returns bounded test recommendations, verification commands, evidence, confidence, risk, diagnostics, and escalation guidance.

## Boundary

The analysis core reads repository files as data. It never runs tests, builds, package scripts, installers, project code, network calls, or LLM calls, and it does not modify the target repository. Commands in results are recommendations with `executed: false`.

V0.1 supports JavaScript, TypeScript, JSX, and TSX repositories with Vitest, Jest, and Node.js native test conventions. Static imports and `require()` calls are bounded evidence; dynamic loading is reported as partial rather than treated as confirmed reachability.

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
