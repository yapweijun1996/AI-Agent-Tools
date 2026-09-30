# AI-Agent-Tools

Owned source for ten deterministic AI coding tools, plus the dependency-free `ait` discovery, installation and dispatch CLI. Tool packages keep independent names, versions, native CLI/JSON contracts and releases.

## Develop

Use Node 22.13+ or Node 24 and Python 3.9+. From a fresh clone:

```sh
npm run bootstrap
npm run verify
```

Bootstrap runs `npm ci --ignore-scripts` for each package using its own lockfile. No hoisting or shared TypeScript version is imposed. Root `build`, `typecheck`, `lint`, `test` and `pack` commands orchestrate the applicable native scripts; missing scripts are reported as not applicable. `npm test` also checks AIT, Hub documents and source coverage. Tests use a canonical local temporary directory and writable npm cache.

Run a tool independently, for example:

```sh
npm --prefix packages/code-slice test
npm --prefix packages/code-slice run build
node packages/code-slice/dist/cli/index.js capabilities --json
node packages/project-tree/bin/aptree.js --help
node bin/ait.js --help
```

[Tool index and usage](migration-tools.md) lists every package, executable and source version. [Migration evidence and deletion checklist](docs/migration/README.md) records source commits, licenses, history recovery, validation and remaining external dependencies. The owner authorized consolidation on 2026-09-30; [architecture decision](docs/migration/DECISION.md) supersedes the previous independent-repository source restriction.

## Contracts and releases

AIT remains `ai-agent-tools@0.1.1` under Apache-2.0. Its published package and root pack allowlist contain AIT and registry/profile data; imported tools are not bundled into AIT. AIT installs explicit pinned registry releases and requires execution approval. It preserves native results and applies only existing exact-version consumer profiles. Importing newer source does not silently change those profiles or the recorded published versions.

MIT notices remain with their packages. CFML Linkage remains private with no package license declaration, and CFML Policy Check remains private/UNLICENSED. Root Apache-2.0 does not relicense imported source. Error Lens remains private. No package was published during consolidation.

[Registry](TOOL_REGISTRY.json) records ecosystem lifecycle and published evidence; [source manifest](docs/migration/SOURCE_MANIFEST.json) records imported source versions. Lifecycle conformance, owner-confirmed delivery and publication are distinct. The previous Hub observations remain in Git history and dated [validation](VALIDATION.md).

[Architecture](docs/ARCHITECTURE.md), [documentation index](DOCUMENTATION_INDEX.md), [task status](TASK.md), [roadmap](ROADMAP.md), and [AGENTS.md](AGENTS.md) describe repository responsibilities. Tools remain local-first, bounded and read-only within their declared scopes; no LLM, API key or agent reasoning runtime is introduced.
