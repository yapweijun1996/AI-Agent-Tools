# AI-Agent-Tools

Owned source for nineteen bounded AI coding tools, plus the dependency-free `ait` discovery, installation and dispatch CLI. Tool packages keep independent names, versions, native CLI/JSON contracts and releases.

## Install all CLIs

The complete source inventory now includes Windows-x64-only Agent-Native-Git, which requires exactly Node 24.21.0, npm, Git and the documented Windows build/runtime prerequisites. Use that host for installing all nineteen tool CLIs; incompatible declared package hosts are rejected before package builds, not silently omitted. AIT and the previously supported tools retain their own broader runtime contracts.

```sh
npm exec --yes --ignore-scripts --package=git+https://github.com/yapweijun1996/AI-Agent-Tools.git -- ait install-all --github https://github.com/yapweijun1996/AI-Agent-Tools --prefix ./ai-agent-tools-cli --allow-build --allow-experimental
```

This convenience command follows the repository default branch; use the same pinned commit in the bootstrap package and `--ref` for reproducible installation. It uses the source version of AIT from GitHub; published `ai-agent-tools@0.1.1` does not contain this new command. See [installation options, pinned revisions, PATH selection and rollback](docs/workflow/INSTALL_ALL.md). Planned registry entries are not installed. The result includes all installed CLI names, their source provenance and executable directory.

## Use from an AI agent

Point the agent to this repository's README, [tool index](migration-tools.md), and [optional workflow skill](skills/ai-agent-tools-workflow/SKILL.md). For example:

```text
Read https://github.com/yapweijun1996/AI-Agent-Tools and its workflow skill.
Install all implemented CLIs into a new isolated directory using the installation guide.
Report the installed CLI names and executable directory, then use only the tools relevant to my task.
```

The agent should inspect each tool's help/capabilities and native contract before use. Installation and ongoing task execution are separate operations.

## Develop

For the full nineteen-package gate, use Windows x64 with exactly Node 24.21.0 and Python 3.9+. AIT and compatible packages still support their own declared hosts; root orchestration reports unsupported package hosts as explicitly not applicable, not passed native acceptance. From a fresh clone:

```sh
npm run bootstrap
npm run verify
```

Bootstrap runs `npm ci --ignore-scripts` for each package using its own lockfile.
No hoisting or shared TypeScript version is imposed. Root `build`, `typecheck`,
`lint`, `test` and `pack` commands orchestrate the applicable native scripts;
missing scripts are reported as not applicable. `npm run verify` prepares build,
typecheck and lint once, then selects package-local `test:prepared` where declared
before packing. Independent `npm test` still performs each tool's full native
preparation. Tests check AIT, Hub documents and source coverage and use a canonical
temporary directory and writable npm cache. Direct script invocation locates npm's
JavaScript CLI on PATH, including when using a copied Windows Node executable.

For an opt-in comparison of existing tools with conventional inspection on four frozen repository tasks, run `node scripts/evaluate-task-value.mjs` after building. The [evaluation protocol](docs/evaluation/PROTOCOL.md) defines evidence criteria, interface costs and controls; [recorded results](docs/evaluation/RESULTS.md) distinguish scripted observations from unmeasured agent outcomes. This experiment is separate from root acceptance and does not install or publish tools. The subsequent [Test Scope refinement](docs/evaluation/TEST_SCOPE_REFINEMENT.md) records a separate frozen before/after measurement for candidate filtering and optional lossless compact output. [Earlier host observations](docs/evaluation/AGENT_RESULTS.md) preserve answer facts and withheld telemetry. The owner-authorized [Ubuntu CLI study](docs/evaluation/CLI_RESULTS.md) and [real-repository pilot](docs/evaluation/REAL_REPOSITORY_RESULTS.md) separately record actual emitted events/usage, treatment and grading limits. The [complete repair replay](docs/evaluation/REPAIR_WORKFLOW_RESULTS.md) adds six isolated historical fixes with native execution, independent acceptance and a separate scope audit. The [isolated interleaved math replay](docs/evaluation/REPAIR_MATH_RESULTS.md) adds a second six-session case with verified command read confinement. These development studies do not show a general token or latency advantage and introduce no agent runtime into AIT or tools.

Run a tool independently, for example:

```sh
npm --prefix packages/code-slice test
npm --prefix packages/code-slice run build
node packages/code-slice/dist/cli/index.js capabilities --json
node packages/project-tree/bin/aptree.js --help
node bin/ait.js --help
```

The current Test Scope source supports `plan --summary --compact` for all planning
decisions with explicitly omitted recommendation evidence bodies. Use the
[package contract](packages/test-scope/README.md) to choose full evidence or the
separate summary schema. [Recorded measurements](docs/evaluation/TEST_SCOPE_SUMMARY_2026-10-09.json)
preserve default/compact byte identity and the specific output reduction; agent
token savings and general speed gains remain unmeasured. This source addition
has no new npm release.

[Tool index and usage](migration-tools.md) lists every package, executable and source version. [Migration evidence and deletion checklist](docs/migration/README.md) records source commits, licenses, history recovery, validation and remaining external dependencies. The owner authorized consolidation on 2026-09-30; [architecture decision](docs/migration/DECISION.md) supersedes the previous independent-repository source restriction.

The root manifest explicitly declares `agentProjectProfile.independentPackages`
as `["packages/*"]`. Current Project Profile source reports these as a monorepo
inventory with member-local commands and runtime evidence, not as an npm
workspace. The declaration does not install dependencies, hoist packages or
change their independent lockfiles. Undeclared repositories are not scanned for
guessed package-folder conventions.

## Agent-Native-Git source import (2026-10-15)

[Agent-Native-Git](packages/agent-native-git/README.md) is an independent private MIT `angit` package at source version `0.0.0`. The owner authorized its committed source import into this monorepo, not a new AIT reasoning/runtime layer or an independent GitHub publication. It owns explicit approved Git/SQLite/process effects; AIT remains dependency-free discovery/install/dispatch. Current product scope is thirteen of eighteen native command leaves; Worker, integration and restore remain unavailable.

Start the next assignment at [the package handoff](packages/agent-native-git/docs/HANDOFF.md). [Import provenance](docs/migration/AGENT_NATIVE_GIT_IMPORT.json) binds the original source checkpoint and metadata/documentation changes; [migration evidence](docs/migration/AGENT_NATIVE_GIT_VERIFICATION.md) distinguishes fresh migrated-tree observations from historical package receipts. The original workspace and private all-ref bundle are recovery material, not a second active source. This local import has not been pushed or published.


## Contracts and releases

The current source includes compatible CLI usability fixes: all eighteen package
entrypoints accept standalone `--help`, CFML Linkage accepts optional `--json`,
and Patch Guard handles CRLF metadata without rewriting hunk source text. Test
Scope adds an opt-in `--max-output-bytes` ceiling that withholds oversized results
with an explicit diagnostic; narrow discovery scope before retrying. Native
JSON/exit semantics, package versions and published artifacts remain independent;
these changes introduce no new npm release.

Current CFML source also fails closed on Policy Check uncertainty even without a
literal table, with bounded causal reasons and source coordinates. Linkage adds
explicit `--mode cfml-structural` for bounded CFML tag/script declaration and link
stages; ordinary HTML/web flow remains outside that opt-in scope. Default mixed
mode now admits strict literal HTML structure while retaining unknown/recovery/
embedded-language incompleteness. Read the [Policy Check](packages/cfml-policy-check/README.md) and
[Linkage](packages/cfml-linkage/README.md) contracts before choosing the scope.
Existing installed snapshots do not acquire these unpublished changes.

AIT remains `ai-agent-tools@0.1.1` under Apache-2.0. Its published package and root pack allowlist contain AIT and registry/profile data; imported tools are not bundled into AIT. AIT installs explicit pinned registry releases and requires execution approval. It preserves native results and applies only existing exact-version consumer profiles. Importing newer source does not silently change those profiles or the recorded published versions.

MIT notices remain with their packages. CFML Linkage remains private with no package license declaration, and CFML Policy Check remains private/UNLICENSED. Root Apache-2.0 does not relicense imported source. Error Lens remains private. No package was published during consolidation.

[Registry](TOOL_REGISTRY.json) records ecosystem lifecycle and published evidence; [source manifest](docs/migration/SOURCE_MANIFEST.json) records imported source versions. Lifecycle conformance, owner-confirmed delivery and publication are distinct. The previous Hub observations remain in Git history and dated [validation](VALIDATION.md).

[Architecture](docs/ARCHITECTURE.md), [documentation index](DOCUMENTATION_INDEX.md), [task status](TASK.md), [roadmap](ROADMAP.md), and [AGENTS.md](AGENTS.md) describe repository responsibilities. Tools remain local-first and bounded; observation is read-only by default, while explicitly approved stateful tool effects stay within their owning package contracts. No LLM, API key or agent reasoning runtime is introduced into the Hub.

## Two additional source MVPs

[Environment Doctor](packages/environment-doctor/README.md) checks sanitized runtime/configuration evidence. [Contract Check](packages/contract-check/README.md) implements the existing Contract Diff registry responsibility using offline JSON Schema inputs. Both are private source packages, included by root bootstrap/build/test/typecheck/pack, with no npm publication or AIT npm installation identity. The repository now has eighteen package folders; original ten source provenance remains unchanged.

## Patch policy checks

[Agent Patch Guard](packages/patch-guard/README.md) checks explicit Git patch artifacts against machine-readable path, deletion/rename, size and literal content policy. It reports bounded redacted findings and withholds results for unsupported or incomplete evidence. The private, dependency-free source package is included by root verification and packed-consumer checks; the registry entry is Experimental with no npm release. Completed analysis can contain violations: consumers must inspect `data.verdict`.

```sh
node packages/patch-guard/src/cli.js check --diff packages/patch-guard/examples/safe.diff --policy packages/patch-guard/examples/policy.json --json
```

## Local instruction discovery

[Agent Rules Resolve](packages/rules-resolve/README.md) discovers a complete local ancestor instruction chain for an explicit root, target and `agents-chain-v1` profile. It returns ordered source provenance, ignored-file reasons and optional full rule text. References are not followed; semantic conflicts and hidden/global agent instructions remain outside its scope. The private, dependency-free package has no npm release.

```sh
node packages/rules-resolve/src/cli.js resolve --root . --target packages/rules-resolve/src/cli.js --target-kind file --profile agents-chain-v1 --json
```

## Task context assembly

[Agent Context Pack](packages/context-pack/README.md) assembles supplied Hub result artifacts from other tools into one provenance-bearing pack under a declared UTF-8 byte budget. Relevance is declared by the caller (`mandatory`, `priority`); it removes only exact duplicates, never clips a mandatory item and lists every omission with a reason. Snapshot identity is caller-declared and checked for consistency only. The private, dependency-free package has no npm release.

```sh
node packages/context-pack/src/cli.js pack --manifest examples/manifest.json --root packages/context-pack --json
```

## Deployment evidence verification

[Release Guard Deploy Verify](packages/release-guard/README.md) compares explicit deployment commit/build, CI, asset hashes and sanitized cache/browser evidence. It remains private source with no npm release or deployment service. It implements the existing Release Guard registry responsibility.

## Optional local workflow and UI evidence

[Isolated CLI installation and rollback](docs/workflow/LOCAL_CLI.md) preserve existing global tools and personal Codex settings. Read the [optional workflow skill](skills/ai-agent-tools-workflow/SKILL.md) only when a tool answers the task. Release Guard adds a bounded read-only collector; its offline verifier remains available. [Runtime Trace UI Regression Check](packages/runtime-trace/README.md) analyzes explicit responsive geometry, declared overlap, focus and Back observations. General business-event correlation remains planned. These private source packages have no npm publication.

## Test evidence acceptance

[Agent Test Evidence](packages/test-evidence/README.md) normalizes explicit Node reporter captures or unified JSON and checks required evidence against caller-declared source and environments. The private Experimental MVP does not execute tests. Strict verification withholds acceptance for skip/todo/cancelled, missing or mismatched evidence; complete analyses can report a failing verdict with exit 0. Root verification tests the new tool while existing native test commands and exit semantics remain unchanged. An explicit package-only pilot is available with `npm --prefix packages/test-evidence run pilot`. No npm release is recorded.
