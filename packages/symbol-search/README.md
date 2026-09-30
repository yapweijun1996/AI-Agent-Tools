# agent-symbol-search

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Package version | 0.1.2 (agent integration documentation; no runtime changes) |

> Deterministic, local-first, read-only symbol navigation for AI coding agents.

## What it does

`agent-symbol-search` answers focused navigation questions without returning full source bodies:

- Where is `buildProject` defined?
- Who references `ProjectProfile`?
- Which class explicitly implements `StorageAdapter`?
- What symbols exist in this file?

The result is a bounded locator. [`agent-code-slice`](https://github.com/yapweijun1996/AI-Agent-Tools/tree/main/packages/code-slice) remains responsible for reading the returned source range.

## Current support

The V1.0 implementation supports TypeScript through the TypeScript compiler API:

| Operation | Support | Evidence boundary |
|---|---|---|
| `capabilities` | Full | Reports the operation-level matrix |
| `search` | Full | Exact, prefix, and substring declaration-name matching |
| `symbols` | Full | Normalized declarations in one TypeScript file |
| `definition` | Full | Compiler/checker definitions, aliases, overloads, and ambiguity |
| `references` | Full | Compiler/checker references and import aliases |
| `implementations` | Partial | Explicit `implements`, `extends`, and supported abstract-method overrides |

JavaScript, Python, and CFML are proposed future adapters, not shipped capabilities. Structural assignability, dynamic dispatch, mixins, and runtime monkey-patching are not confirmed implementation evidence.

## Quick start

Requirements: Node.js 22, Node.js 24, or Node.js 26 and npm. Node 20 and Node 23 are not supported release runtimes.

### Install from npm

Install the package in the repository where the agent will navigate:

```bash
npm install --save-dev agent-symbol-search
```

The package exposes the `agent-symbol-search` executable, a CommonJS/ESM library API, JSON schemas, and an agent skill at [`skills/agent-symbol-search/SKILL.md`](./skills/agent-symbol-search/SKILL.md). An agent runtime can load that skill file after npm installation to get the operation-selection and result-handling workflow.

Use `npx --no-install` after installation so a search never downloads an unpinned package implicitly:

```bash
npx --no-install agent-symbol-search capabilities --root /path/to/repository
```

For a global Codex CLI installation from any directory, use:

```bash
npm install --global agent-symbol-search@latest
agent-symbol-search capabilities --root /path/to/repository
```


```bash
npm ci
npm run build
node dist/cli.js capabilities --root .
node dist/cli.js definition --root ./path/to/repository --symbol resolveConfig
```

When a repository contains more than one `tsconfig*.json`, pass the project explicitly rather than guessing:

```bash
node dist/cli.js search --root . --project tsconfig.json --symbol SymbolSearchEngine
```

The CLI writes one JSON result to stdout. Human-readable diagnostics go to stderr, so stdout can be piped to a JSON parser safely. A complete or partial result exits `0`; invalid requests, invalid roots, and path/security failures exit non-zero.

The library uses the same request/result contract:

```js
const { findDefinition } = require("agent-symbol-search");

const result = findDefinition({
  root: "./path/to/repository",
  symbol: "resolveConfig"
});
console.log(result.data.matches);
```

Operation-specific helpers accept only their own optional `operation`; conflicting values return `INVALID_REQUEST` before repository access. Use `execute` for dynamic operation dispatch.

## AI agent workflow

Use the bundled [`agent-symbol-search` skill](./skills/agent-symbol-search/SKILL.md) when an agent needs a bounded TypeScript locator before editing code. The recommended sequence is:

1. Set one explicit repository `root`.
2. Call `capabilities` if supported operations are unknown.
3. Choose `search`, `symbols`, `definition`, `references`, or `implementations` for the narrow question.
4. Pass `--project <tsconfig*.json>` or `project` whenever the repository contains multiple TypeScript configurations; never guess.
5. Parse the JSON result and inspect `status`, `data.matches`, `diagnostics`, `truncation`, and `stats`.
6. Pass selected paths and ranges to `agent-code-slice` or another source reader when source text is needed.

The tool returns locations and evidence, not full source bodies. It is not a replacement for editing, testing, source extraction, or impact analysis.

## Determinism, bounds, and safety

- Every request has an explicit canonicalized root; explicit paths and symlinks cannot escape it.
- Directory symlinks, generated/vendor directories, ignored files, and secret-like files are excluded by default.
- Root and nested `.gitignore` rules use directory-relative matching and negation. TypeScript source discovery supports `.ts`, `.tsx`, `.mts`, `.cts`, and their declaration-file forms.
- `--exclude` always wins; `--include` is an allow-list that can override `.gitignore` and ordinary generated-directory filters, but never secret, `.git`, `node_modules`, symlink, or root boundaries.
- Results use stable POSIX-relative paths, 1-based lines, 0-based UTF-16 columns, versioned SHA-256 symbol IDs, deterministic ranking, and explicit ambiguity/truncation diagnostics.
- Default and maximum result limits are 50 and 500. Discovery limits are 10,000 files, 2 MiB per file, and 100 MiB parsed bytes. The 5-second budget is cooperative and returns partial evidence with `TIMEOUT` when reached.
- A guarded compiler reader independently enforces the same file/byte limits across configuration, source, package metadata, and type dependencies. Imports cannot re-admit ignored, excluded, secret-like, or symlinked repository sources. Blocked dependencies produce partial evidence, not a false complete result.
- Search reads project files as data. It does not import or execute project code, install dependencies, build, test, modify repositories, access the network, or call an LLM. `npm ci` is setup-time installation, not search behavior.

TypeScript project selection is deterministic: an explicit `project` must be a repository-relative `tsconfig*.json`; without one, exactly one discovered config is selected, multiple configs produce an actionable error, and no config uses fixed fallback compiler options. Project references are reported but not recursively built in V1. External package files are excluded from repository results.

External type resolution is limited to regular files beneath the root/ancestor `node_modules` directories and the installed TypeScript standard libraries and their package metadata. Symlinked workspace dependencies are not followed. `stats.filesScanned`/`bytesParsed` retain discovery measurements; `compilerFilesRead`/`compilerBytesRead` report compiler read attempts and actual bytes, including dependencies. Ignore-rule reads have a separate bounded discovery budget.

## Verification and packaging

Run the complete local verification contract:

```bash
npm run verify
npm run coverage
npm run schema:check
npm run smoke:pack
npm run capability:check
npm run benchmark:check
npm run docs:check
```

`coverage` rebuilds the test artifacts and runs serial Node native coverage over product sources only, enforcing lines ≥85%, functions ≥80%, and branches ≥75%. `smoke:pack` installs the npm tarball in a temporary directory outside the source checkout and exercises both the CLI and library API. `BENCHMARK.md` records cold and warm in-memory measurements for deterministic small, medium, and large generated fixtures; every release fixture must avoid `TIMEOUT`, but v0.1.0 makes no public latency SLO. `v0.1.1` is the published documentation patch, and `v0.1.2` adds the agent skill and npm integration documentation without altering runtime behavior. `RELEASE.md` records the completed publication and recovery checklist.

## Documentation

- [`DESIGN.md`](./DESIGN.md) — implemented architecture, boundaries, and trade-offs
- [`SPEC.md`](./SPEC.md) — normative request/result contract
- [`EPIC.md`](./EPIC.md) — TypeScript vertical-slice outcome
- [`ROADMAP.md`](./ROADMAP.md) — completed and future work
- [`TASK.md`](./TASK.md) — evidence-backed task status
- [`CHANGELOG.md`](./CHANGELOG.md) — published release and historical changes
- [`BENCHMARK.md`](./BENCHMARK.md) — reproducible performance baseline and release gate
- [`RELEASE.md`](./RELEASE.md) — v0.1.0/v0.1.1 release records and v0.1.2 checklist
- [`DOCUMENTATION_STANDARD.md`](./DOCUMENTATION_STANDARD.md) — documentation governance
