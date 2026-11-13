# Agent CFML Check

`agent-cfml-check` is a deterministic, read-only checker for a deliberately bounded CFML structural subset. It is the independent implementation repository for the `agent-cfml-check` entry in the AI-Agent-Tools Hub.

## Current status

Version `0.6.0` recognizes standalone `cfflush`, `cfmodule`, and `cfzip`; closing forms remain incomplete. `cfmodule` recognition does not resolve, read, or execute the custom template, and `cfzip` recognition does not perform archive operations.

Version `0.5.0` recognizes standalone `cflocation`, `cfpdf`, `cfdirectory`, and `cfexecute`; their closing forms remain incomplete. The checker does not execute tag operations or validate their runtime effects.

Version `0.4.0` recognizes seven additional standalone tags and fixes CFML path strings ending in a backslash. The published `0.3.0` scanner can skip subsequent tags or report false findings after such a string; recheck affected files with a corrected build before relying on its result. Optional-body closing forms of `cffile` and `cfheader` remain incomplete.

Version `0.3.0` extends the structural profile with transaction and switch tags and adds inspection workflows. The implementation checks:

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

Current repository source also recognizes `cfparam` as a bodyless tag and checks paired `cftry`, `cfcatch`, and `cffinally` structure. These changes are not included in the published `0.1.1` artifact or existing installed snapshots. They do not validate tag attributes, exception behavior, or runtime semantics. Self-closing paired tags, including `cfcatch`, return incomplete rather than an engine-validity claim.

The current local source corrects CFScript identifiers containing `cf` being
misclassified as markup. Ordinary variables and calls remain script text; actual
CFML tag islands still return `incomplete` with their source position. This fix
is included in the `0.2.0` source.

Historical verification for the `0.1.1` release baseline:

- `npm test`: 22/22 passed;
- `npm run typecheck`: passed;
- `npm pack --dry-run --json`: passed;
- capabilities, valid-fixture, and misnested-fixture CLI checks: passed;
- temporary packed-install CLI and library import smoke checks: passed;
- targeted Lucee `6.2.2.91` execution probe: passed;
- Ubuntu WSL Node `18.19.1` `npm ci`, tests, and typecheck: passed.

This is not a complete CFML parser or evidence of Adobe ColdFusion compatibility. A targeted Lucee `6.2.2.91` probe and an Ubuntu WSL Node `18.19.1` run for prior source do not establish a full engine or platform matrix for `0.2.0`.

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

Version `0.3.0` provides `inspect` for one or more explicit files, scoped line findings, and an explicit before/after comparison:

```text
agent-cfml-check inspect --root <directory> <file> [file ...] [--lines <start:end>] --json
agent-cfml-check inspect --root <directory> --baseline <before-file> <after-file> --json
```

`inspect` uses its own v2 result schema. It can continue after bounded unsupported tags, but the result remains incomplete and findings are provisional. A line range filters reported findings while the whole file is scanned for context; unsupported syntax elsewhere still makes the result incomplete. Comparison classifications use conservative diagnostic signatures and may be `uncertain`; they do not prove a semantic regression or code identity. This functionality is not in the published `0.2.0` artifact.

Check limits can be overridden with `--max-source-bytes`, `--max-nesting`, `--max-findings`, `--max-output-bytes`, and `--time-limit-ms`, subject to the hard caps reported by `capabilities`.

`max_output_bytes` must be at least 512, reserving a complete failure envelope.
CLI ceilings count actual UTF-8 stdout, including indentation and the final
newline. If pretty output cannot fit, checking returns incomplete/exit 3 and may
emit its failure envelope as compact JSON. Default fitting output is unchanged.

The `check` command requires one explicit root and one `.cfm` or `.cfc` file. JSON mode emits one envelope on stdout; diagnostics stay on stderr. A completed check with structural violations still exits `0` and reports `data.verdict: "violations"`. Exit `3` means unsupported syntax, insufficient evidence, or a resource limit. Exit `4` means an explicit-root or access-policy rejection. See [SPEC.md](SPEC.md) for the complete contract.

## Safety and boundaries

The checker never executes CFML or JavaScript from the inspected source, follows includes, reads directories as input, uses the network, installs packages, or modifies the inspected source tree. `check` reads exactly one regular UTF-8 source file under the explicit root; `inspect` reads only the explicitly selected files under that root. Both reject symlink escapes and report incomplete when the bounded profile cannot establish a result.

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

`package.json` includes `dist`, `README.md`, `SPEC.md`, `schema`, and `fixtures` in the package; the design, planning, progress, goal, prompt, changelog, and Agent Skill documents remain repository-maintainer documentation. The repository exposes the TypeScript library through `main`, `types`, and `exports`. The source package version is `0.6.0`.
