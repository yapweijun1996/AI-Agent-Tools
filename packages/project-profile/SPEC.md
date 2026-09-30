# V1 Product Specification

Status: implemented V1 contract for release line `0.1.2`. The Company KB approves the product scope and invariants; this repository owns the executable field layout, schema, deterministic policies, and tests. The schema target is `1.0`; implementation and platform evidence remain lifecycle facts, not claims supplied by the normative text. Source locators and ownership are recorded in [DECISIONS.md](DECISIONS.md).

## 1. Product boundary

`agent-project-profile` reads allowlisted repository metadata and emits declared facts. It MUST NOT execute project code, invoke package managers or Git, install dependencies, access the network, evaluate executable configuration, or infer unknown facts through an LLM.

It operates without a hosted backend. These are profiler runtime restrictions. Development may build and test the profiler's own implementation using its inspected development tooling; it must never turn discovered commands in a target or fixture repository into commands to execute. Package publication remains a separate authorized action.

The profiler operates on one caller-supplied directory. It does not automatically switch to a parent Git root. This makes a workspace member a valid inspection target without reading outside the requested boundary.

## 2. Repository identity and paths

- `project.root` is always `"."`, relative to the selected inspection directory.
- `project.name` is the nonempty root `package.json` name or `null`; directory names are not substituted for a declared package name.
- `project.kind` is `single-package`, `workspace`, or `unknown`.
- A valid workspace declaration establishes `workspace`, even when member discovery is incomplete. Without a workspace declaration, a valid root Node manifest establishes `single-package`. Otherwise the kind is `unknown`.
- A `project.repository` record reports a `.git` directory/file marker as `git-marker`, or `unknown` without such evidence. A marker is not proof of a valid or healthy Git repository.
- The profiler inventories the `.git` marker using filesystem metadata only. It does not traverse `.git`, read a worktree pointer file, validate history, resolve remotes, or search ancestors.
- Output paths are root-relative, use `/`, preserve case and Unicode spelling, and never expose absolute host paths.

The input root itself is resolved once. Below that root, symbolic links and Windows junctions/reparse points are not followed. Skipped candidates are diagnosed. Workspace paths and exact metadata targets must remain inside the resolved root. Path traversal or an absolute path from repository metadata is never followed.

## 3. Output envelope and fact states

All top-level fields listed below are required. JSON uses UTF-8. Empty supported collections are emitted as empty arrays/objects with the defined shape; an empty collection is not proof of absence when coverage is incomplete.

| Field | Contract |
| --- | --- |
| `schemaVersion` | String `"1.0"` for this target contract |
| `toolVersion` | Actual producing tool release version; never a placeholder in production output |
| `status` | `complete`, `partial`, `unsupported`, or `error` |
| `project` | Name, normalized root, kind, repository marker, and evidence references |
| `ecosystems` | Evidence-backed `{name, support, evidence}` records; support is `first-class` or `detected_only` |
| `packageManager` | Root selection using the package-manager record below |
| `runtimes` | Declared runtime records, including package scope and declaration role |
| `workspace` | Declaration/discovery state and bounded member list |
| `commands` | All seven purpose arrays: `build`, `test`, `lint`, `typecheck`, `dev`, `start`, `format` |
| `scripts` | Records containing `cwd`, sorted script `names`, and evidence references |
| `entrypoints` | Declared entrypoint records |
| `configs` | Configuration inventory records |
| `instructions` | Instruction inventory records; no file bodies or resolved precedence |
| `ci` | CI inventory records |
| `evidence` | Deduplicated evidence records with stable IDs |
| `warnings` | Structured diagnostics of severity `info`, `warning`, or `error` |
| `coverage` | Global and per-category completeness and applied budgets |

Source-derived records MUST carry `evidence` references. The JSON Schema must enforce record shapes, required fields, nullable values, and enums. Semantic validation additionally enforces reference integrity and cross-field consistency.

Confidence is a discrete description of evidence, not execution safety or a statistical probability:

| State | Meaning |
| --- | --- |
| `confirmed` | Explicit valid declaration |
| `strong` | Unambiguous recognized file signal |
| `weak` | Indirect signal; never sufficient alone to create an invocation |
| `unknown` | No sufficient evidence, conflicting evidence, or unreadable evidence |

Unknown scalar facts use `null`, accompanied by a diagnostic where operationally relevant. Missing evidence cannot be reported as a successful check.

## 4. Package managers

Recognize `package.json#/packageManager`, `pnpm-lock.yaml`, `package-lock.json`, `npm-shrinkwrap.json`, and `yarn.lock` without reading lockfile bodies.

The selection record contains `name`, `version`, `confidence`, `invocationAvailable`, and `evidence`. Version is the declared version when supported and valid; it is not the locally installed version. Lockfile-only detection leaves version `null`. Package-manager declaration integrity suffixes must not become part of the version.

| Evidence | Selection and behavior |
| --- | --- |
| Valid supported declaration, no contradictory evidence | Select declaration with `confirmed`; invocation available |
| No declaration, lockfiles from exactly one manager family | Select that manager with `strong`; invocation available |
| No declaration, multiple manager families | Name/version `null`, confidence `unknown`, invocation unavailable, partial |
| Declaration disagrees with lockfile family | Preserve declared selection and its evidence; invocation unavailable, conflict diagnostic, partial |
| Declaration exists but is malformed or names an unsupported manager | Do not fall back silently to lockfiles; invocation unavailable, partial |
| No declaration or usable lockfile | Unknown manager; invocation unavailable; partial for a Node scope |

`package-lock.json` and `npm-shrinkwrap.json` are both npm signals; their coexistence alone does not establish a competing manager. Multiple recognized lockfiles produce `MULTIPLE_LOCKFILES`; competing families additionally produce `PACKAGE_MANAGER_CONFLICT`.

A workspace member inherits the root manager only when no member declaration or lockfile contradicts it. Relevant member-local metadata is checked. A member conflict suppresses invocations in that member's scope and makes the overall profile partial; unrelated proven scopes retain their commands.

Weak hints such as a pnpm workspace filename can be retained as evidence but cannot select an executable package manager. A dependency named `pnpm` is not a declaration to use pnpm.

## 5. Runtime and ecosystem detection

For each discovered Node package, retain `package.json#/engines/node` as a `supported-constraint`. Inventory `.nvmrc` and `.node-version` at the root and discovered package roots as `development-pin` declarations. Record `name`, `cwd`, `value`, `role`, `confidence`, and `evidence`.

Node `>=20` support and a development pin `22` are different roles and are not a conflict. V1 preserves declarations without resolving aliases, looking up versions, asserting compatibility, or querying an installed runtime. Malformed/oversized pin files are diagnosed and do not become confirmed values.

Generic ecosystem signals include `pyproject.toml`/`requirements.txt` for Python, `go.mod` for Go, `Cargo.toml` for Rust, and `pom.xml`/`build.gradle`/`build.gradle.kts` for Java. These are filename inventory only, with `support: "detected_only"` and `UNSUPPORTED_ECOSYSTEM`; their commands and runtime requirements are not inferred.

## 6. Workspaces

Support `package.json` workspaces as an array or an object with a `packages` array, and the `packages` sequence in `pnpm-workspace.yaml`. Use safe data parsers; no YAML custom tags, aliases, merge keys, or executable loaders.

V1 workspace patterns support root-relative literal segments, whole-segment `*`, whole-segment `**`, and leading `!` exclusions. Apply positive patterns as a union, then exclusions. Brace expansion, extglobs, character classes, embedded wildcards, absolute paths, and parent traversal are unsupported and produce `WORKSPACE_UNRESOLVED`; never reinterpret them approximately. The exact matching grammar must be frozen in implementation fixtures before release.

When both workspace declaration formats exist, retain both declarations and their evidence. If their resolved member sets agree, accept the set. If they disagree or comparison is incomplete, emit only the deterministically discovered inventory, identify the ambiguity, and return partial. Do not claim a canonical executable workspace graph.

`workspace` contains:

- `enabled`: `true` for a valid declaration, `false` for proven absence in an inspected valid root manifest, or `null` when unknown.
- `manager`: `npm`, `pnpm`, `yarn`, or `null`; never guessed from a directory name.
- `declarations`: source paths, pointers, and evidence references.
- `packages`: records with `name` (nullable), `path`, scoped package-manager record, and evidence references.
- `total`: exact matching package count only if discovery completed; otherwise `null`.
- `returned`: number of emitted package records.
- `truncated`: whether package output or discovery was capped.

Members are deduplicated by normalized path, not package name. Duplicate declared names are diagnosed. A matched directory without a readable valid manifest is unresolved, not a fabricated package. V1 does not recursively activate independent workspace declarations inside members; it reports that limitation when encountered.

## 7. Scripts and commands

Only string-valued entries of `package.json#/scripts` establish scripts. Script bodies are not emitted, logged, or interpreted. `scripts` groups script names by `cwd`, avoiding collisions between root and workspace scripts.

Purpose recognition is an exact allowlist matching the seven canonical purpose names. Other names, including `test:unit` and `check`, remain available script names; V1 does not guess their purpose or parse their shell bodies.

Each recognized command has `cwd`, `script`, `argv`, `source`, `confidence`, `declaredByProject: true`, `execution: "not_run"`, and `evidence`.

- With an unambiguous manager, `argv` is `[manager, "run", script]`.
- When invocation is unavailable, preserve the declared script fact but set `argv: null` and report the reason through diagnostics.
- A script can be confirmed while its invocation is unavailable; those are different facts.
- No direct tool command such as `vitest run` is invented from a dependency or configuration filename.
- No installation, installed-binary check, lifecycle hook analysis, environment validation, or assertion of successful execution occurs.

`NO_BUILD_COMMAND`, `NO_TEST_COMMAND`, and `NO_LINT_COMMAND` are emitted only for fully inspected valid Node manifests lacking the corresponding exact script name. They are informational notices and do not make an otherwise complete profile partial. A `test:unit` script does not establish the exact `test` purpose.

## 8. Declared entrypoints

Read `main`, `module`, string/object `bin`, and string targets within `exports` from Node manifests. Each record contains `cwd`, `kind`, `path`, an exact declaration pointer, evidence, and `existence` (`present`, `missing`, or `not_checked`). Conditional exports retain their pointer/condition context; no default branch is guessed. Null exports are blocked mappings, not entrypoints.

Do not search source files for likely entrypoints. A literal in-root declared target may receive one exact metadata-only existence check, including a target under `dist` or `build`; these directories are never recursively scanned or their contents read. Pattern targets remain `not_checked`. Out-of-root targets and links are not followed and produce diagnostics.

`ENTRYPOINT_MISSING` is informational: a declared `dist/index.js` can legitimately await a build. Missing output does not invalidate the declaration and must not trigger a build.

## 9. Inventories

Configuration inventory reports `{type, path, evidence}` for recognized regular files at the inspection root and discovered package roots. Recognize `tsconfig.json`, `tsconfig.*.json`, `vite.config.*`, `vitest.config.*`, `jest.config.*`, `eslint.config.*`, `.eslintrc*`, `.prettierrc*`, `prettier.config.*`, `turbo.json`, `nx.json`, `webpack.config.*`, and `rollup.config.*`. Limit extensions to a published finite detector table; executable files are never imported or evaluated.

Instruction inventory includes `AGENTS.md`, `CLAUDE.md`, and `.github/copilot-instructions.md`. Inspect the root, discovered package roots, and their intermediate ancestor directories within the selected root. Report `{type, path, scope, evidence}`; `scope` is the containing directory or project directory for `.github/copilot-instructions.md`, and is a discovery locator rather than a precedence decision. Other arbitrary source subdirectories are not recursively searched; the coverage record identifies the `workspace-ancestors` discovery strategy.

CI inventory includes regular `.yml`/`.yaml` files directly in `.github/workflows`, plus `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci/config.yml`, and `azure-pipelines.yml` at inspected project/package roots. Report `{provider, path, evidence}` without reading pipeline bodies or inferring commands.

Coexisting instructions do not establish a conflict. `INSTRUCTION_CONFLICT` is reserved for a future rules resolver and is not emitted by V1.

## 10. Evidence and diagnostics

Evidence records contain `id`, `kind` (`manifest` or `file`), `path`, and optional `pointer`. Manifest pointers use escaped JSON Pointer syntax, for example `/scripts/test` or `/exports/./import`. A path-only file signal never fabricates a manifest pointer. YAML evidence uses a file locator in V1 rather than pretending it is JSON Pointer evidence.

Deduplicate evidence by `(path, kind, pointer)`, sort it, then allocate sequential `ev-000001` IDs. Assign references after normalization so discovery order does not affect IDs. Every emitted reference must resolve; output truncation must never leave dangling references. Evidence identifies the inspected source location; it is not cryptographic attestation or permission to execute it.

Each diagnostic contains `code`, `severity`, `message`, nullable `path`, and `evidence` (possibly empty for read failures). Consumers branch on `code`, not message text. Messages must not include script bodies, file contents, absolute paths, or raw parser/OS error text.

| Code | Default effect |
| --- | --- |
| `PACKAGE_MANAGER_CONFLICT`, `PACKAGE_MANAGER_INVALID`, `PACKAGE_MANAGER_UNSUPPORTED`, `NO_PACKAGE_MANAGER` | Warning; affected Node scope partial |
| `MULTIPLE_LOCKFILES` | Warning; partial only if selection is ambiguous or contradictory |
| `NO_BUILD_COMMAND`, `NO_TEST_COMMAND`, `NO_LINT_COMMAND` | Info; valid manifest has no exact purpose declaration |
| `WORKSPACE_TRUNCATED`, `WORKSPACE_UNRESOLVED`, `WORKSPACE_NAME_CONFLICT` | Warning; partial |
| `UNSUPPORTED_ECOSYSTEM` | Warning; unsupported-only scope is unsupported, mixed Node scope partial |
| `MANIFEST_INVALID`, `METADATA_UNREADABLE`, `METADATA_TOO_LARGE`, `RUNTIME_DECLARATION_INVALID` | Warning; partial when a required detection category is affected |
| `SCAN_LIMIT_REACHED`, `OUTPUT_TRUNCATED`, `SYMLINK_SKIPPED`, `PATH_OUTSIDE_ROOT`, `REPOSITORY_CHANGED` | Warning; partial when relevant candidates cannot be inspected consistently |
| `ENTRYPOINT_MISSING` | Info; declaration preserved |
| `ROOT_UNREADABLE`, `INVALID_ARGUMENT`, `PROFILE_VALIDATION_FAILED` | Error; fatal |

## 11. Coverage and budgets

The following fixed defaults are implemented and exercised by the V1 fixtures. Changing a default that changes reported facts requires contract/release review.

| Budget | Default |
| --- | --- |
| Workspace packages returned | 100 |
| Directory depth below root | 12 |
| Directory entries examined | 10,000 total |
| Metadata file bodies read | 1,000 files |
| Single metadata file body | 256 KiB |
| Total metadata body bytes | 8 MiB |
| Total serialized output | 1 MiB, including pretty JSON |
| Single emitted source-derived string | 4 KiB UTF-8 |

`coverage` reports the fixed limits, discovery strategy, per-category `complete`/`partial`/`not_applicable` state, and truncation flags. It never records wall-clock timestamps, timing, absolute host paths, or filesystem modification times in the profile. No elapsed-time cutoff may select a nondeterministic subset of facts.

A workspace return cap does not authorize scanning forever to compute `total`. Exact totals are emitted only after bounded complete enumeration. If enumeration cannot complete within a directory budget, do not select an OS-order-dependent subset from that directory: discard that incomplete directory's candidates, report partial coverage, and retain independently completed scopes.

Budget handling must reserve room for the envelope, coverage, and diagnostics. Omit complete records with their exclusive evidence in a deterministic documented order: workspace member detail by descending path, then inventory records by descending category/path. Recompute evidence IDs and references. Preserve root operational facts where possible. Emit `OUTPUT_TRUNCATED`; never cut JSON bytes or source strings mid-value. If a valid minimal envelope cannot fit, emit a bounded fatal error envelope.

The profiler is not an atomic filesystem snapshot. Detect changes during reads where practical and report `REPOSITORY_CHANGED`; undetectable concurrent changes cannot be ruled out. Repeatability is promised for unchanged supported input trees under the same tool version, configuration, and platform-independent file semantics.

## 12. Security and filesystem behavior

Read bodies only of allowlisted manifests, workspace data, and runtime pin files. Inventory instruction, CI, configuration, and lockfiles without reading bodies.

Never read `.env`, `.env.*`, credential files/directories, SSH keys, API-key stores, or secret stores. Never traverse `node_modules`, `.git`, `dist`, `build`, `coverage`, or `.cache`. Additional secret-path deny rules take precedence over workspace patterns and metadata allowlists. A symlink with an allowlisted name must not expose its target.

The selected inspection root itself is also rejected when its final directory name is one of the protected directory names. This prevents a caller from turning a secret or generated directory into the effective root and bypassing relative skip rules.

File filtering cannot guarantee that an otherwise valid manifest contains no sensitive values. Minimize exposure: omit script bodies, raw manifests, dependency lists, and raw diagnostics. Do not claim universal secret redaction. Facts such as package names and declared entrypoints are intentionally exported and remain untrusted project data.

No subprocess is needed by the profiler, including `git rev-parse`, Node executable configuration loaders, package-manager version checks, or shell expansion. YAML/JSON parsing must use bounded, inert data parsers. Read boundaries must be enforced at actual file access, not only by a prior path check.

## 13. Status, CLI, and compatibility

Status precedence is `error` > `partial` > `unsupported` > `complete`, except that an otherwise successfully inventoried unsupported-only project receives `unsupported` without adding partial merely for its detection-only notice. Malformed/unreadable required metadata still produces partial.

- `complete`: all in-scope requested discovery completed without unresolved operational ambiguity. This does not mean tests pass, commands are safe, or the project is deployable.
- `partial`: usable facts exist, but ambiguity, unsupported content in a mixed project, unreadable required metadata, or limits prevent a complete profile.
- `unsupported`: a recognized detection-only ecosystem with no first-class ecosystem; generic inventory is still emitted.
- `error`: invalid invocation, unreadable root, internal failure, or invalid constructed profile prevents usable output.

An empty or generic directory may be complete with `project.kind: "unknown"`; absence of a Node manifest is not an error.

Default JSON output is compact and ends with one newline. `--pretty` changes whitespace only, and is valid only with JSON. Unsupported flags, formats, or extra positional arguments are fatal. `--strict` leaves profile facts and status unchanged but exits `2` for any warning/error diagnostic in a nonfatal profile. Info-only diagnostics do not fail strict mode. Partial/unsupported profiles always exit `2`; fatal failures exit `1`.

In JSON mode, stdout contains exactly one profile or bounded schema-valid error envelope using the same required top-level fields and unknown/empty defaults. Human diagnostics belong on stderr; no debug logs or stack traces enter stdout. Text mode renders the same normalized result.

Sort paths and names by a specified locale-independent code-point order; never use locale collation or silently case-fold. Runtime, command, and entrypoint records sort by scope, category, then source pointer. Warnings sort by code, path, and evidence identity. Serialize object keys in a fixed order. Internal counters/errors must not leak OS-dependent ordering.

Breaking field, type, enum, or semantic changes require a new major schema version. Additive optional fields require a minor schema version; consumers may ignore unknown optional fields within a supported major version. Changing deterministic heuristics, budgets, or fixture output requires release notes and explicit review even when the schema shape is unchanged. The implementation must publish the JSON Schema before any stable executable release.
