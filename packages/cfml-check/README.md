# Agent CFML Check

`agent-cfml-check` is a deterministic, read-only checker for a deliberately bounded CFML structural subset. It is the independent implementation repository for the `agent-cfml-check` entry in the AI-Agent-Tools Hub.

## Current status

Version `0.1.1` contains the first feasibility slice plus executable schema validation, package exports, and Agent onboarding. The prior `agent-cfml-check@0.1.0` publication predates these additions. The current implementation is verified for:

- paired CFML tag nesting;
- `cfelse` and `cfelseif` ownership and ordering;
- bodyless tags and self-closing bodyless spellings;
- nested CFML comments;
- quoted tag attributes, doubled-quote escapes, and comments inside tag expressions;
- embedded `cfscript` delimiter balance while respecting strings and comments;
- recognized pure-script `.cfc` files beginning with `component` or `interface`;
- UTF-8 source metadata, one-based source positions, and zero-based UTF-8 byte ranges;
- explicit-root path safety, source stability checks, input validation, output limits, nesting limits, finding limits, and time limits;
- deterministic JSON and text CLI output.

Local verification before this documentation update:

- `npm test`: 22/22 passed;
- `npm run typecheck`: passed;
- `npm pack --dry-run --json`: passed;
- capabilities, valid-fixture, and misnested-fixture CLI checks: passed;
- temporary packed-install CLI and library import smoke checks: passed;
- targeted Lucee `6.2.2.91` execution probe: passed;
- Ubuntu WSL Node `18.19.1` `npm ci`, tests, and typecheck: passed.

The prior npm publication of `agent-cfml-check@0.1.0` is immutable and predates this release's schema, package-export, and documentation updates. This release targets `agent-cfml-check@0.1.1`; authenticated registry publication/readback is the final release step. This is not a complete CFML parser or evidence of Adobe ColdFusion compatibility. A targeted Lucee `6.2.2.91` probe and an Ubuntu WSL Node `18.19.1` clean dependency install/test run pass; these do not establish a full engine matrix. Hub lifecycle, canonical ownership, admission, and Adobe compatibility remain outside the current verified evidence.

## Install and use

Install the published CLI globally for Codex CLI or any terminal session:

```sh
npm install --global agent-cfml-check@latest
agent-cfml-check capabilities --json
agent-cfml-check check --root /path/to/repository path/to/file.cfm --json
```

The global installation exposes the `agent-cfml-check` command from any working
directory. For a checkout, use `npm ci`, `npm run build`, and the same command
through `node dist/cli/index.js`.

```sh
npm install
npm test
npm run typecheck
npm run build
node dist/cli/index.js capabilities --json
node dist/cli/index.js check --root . fixtures/valid.cfm --json
node dist/cli/index.js check --root . fixtures/misnested.cfm --json
```

The package requires Node.js `>=18.18.0`. It has no runtime npm dependencies; Ajv, TypeScript, and Node.js type definitions are development dependencies. The package exposes `dist/index.js` and `dist/index.d.ts` through `main`, `types`, and `exports`; temporary packed-install CLI and library import smoke checks pass.

The CLI supports:

```text
agent-cfml-check capabilities [--json] [--pretty]
agent-cfml-check check --root <directory> <file> [--json] [--pretty]
```

Check limits can be overridden with `--max-source-bytes`, `--max-nesting`, `--max-findings`, `--max-output-bytes`, and `--time-limit-ms`, subject to the hard caps reported by `capabilities`.

The checker requires one explicit root and one `.cfm` or `.cfc` file. JSON mode emits one envelope on stdout; diagnostics stay on stderr. A completed check with structural violations still exits `0` and reports `data.verdict: "violations"`. Exit `3` means unsupported syntax, insufficient evidence, or a resource limit. Exit `4` means an explicit-root or access-policy rejection. See [SPEC.md](SPEC.md) for the complete contract.

## Safety and boundaries

The checker never executes CFML or JavaScript from the inspected source, follows includes, reads directories as input, uses the network, installs packages, or modifies the inspected source tree. It reads exactly one regular UTF-8 source file under the explicit root, rejects symlink escapes, and fails closed when the bounded profile cannot establish a result.

The supported profile is `cfml-structure-v1`. Unknown/custom/imported tags, optional-body semantics outside the catalog, full expression and runtime semantics, SQL/HTML validity, CFML tag islands inside `cfscript`, and engine behavior are outside the profile or explicitly unverified.

## Repository map

- `src/`: TypeScript implementation;
- `src/core/source-reader.ts`: root, path, file, encoding, and snapshot checks;
- `src/core/lexer.ts`: bounded CFML tag and CFScript scanning;
- `src/core/source-index.ts`: source positions and UTF-8 byte ranges;
- `src/core/checker.ts`: capabilities, checking, envelopes, and output fitting;
- `src/cli/index.ts`: CLI argument parsing and rendering;
- `schema/`: JSON Schema for result envelopes;
- `fixtures/`: valid and misnested examples;
- `test/`: implementation, CLI, and package-surface tests;
- `skills/agent-cfml-check/SKILL.md`: repository-local Agent usage workflow;
- `.github/workflows/ci.yml`: Node 18/20/22 CI and CLI smoke checks;
- `dist/`: generated package output;
- `DESIGN.md`, `EPIC.md`, `ROADMAP.md`, `TASK.md`, `GOAL.md`, `PROGRESS.md`, `GOAL_PROMPT.md`, `CHANGELOG.md`: repository design, planning, status, and maintenance documents.

`package.json` currently publishes `dist`, `README.md`, `SPEC.md`, `schema`, and `fixtures`; the design, planning, progress, goal, prompt, changelog, and Agent Skill documents remain repository-maintainer documentation. The repository exposes the TypeScript library through `main`, `types`, and `exports`, with package-surface and packed-install tests. The release package version is `0.1.1`.
