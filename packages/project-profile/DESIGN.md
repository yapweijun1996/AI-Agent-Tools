# V1 Architecture

Status: implemented V1 architecture under the Company KB's approved product boundary. [SPEC.md](SPEC.md) defines the external contract; this document records responsibility placement and data flow. The Company KB remains the authority for ecosystem scope and lifecycle status.

## Ecosystem boundary and reuse

Build this capability as one standalone repository and npm package. It must not depend on a hosted backend or add reasoning/orchestration that belongs to Codex/Claude/AGRUN. Hub-level registry, standards, compatibility, and roadmap responsibilities remain in the separate `AI-Agent-Tools` hub; Company KB source records are listed in [DECISIONS.md](DECISIONS.md).

The implementation inspected the installed `agent-code-slice@0.2.1` conventions for CLI/JSON envelopes, stable error codes, root-constrained paths, bounded output, ESM packaging, and Node test scripts. It reused only the applicable fail-closed conventions; its Tree-sitter parsers, AST adapters, and historic passing tests are not dependencies or verification evidence for this tool.

Prefer structured parsing for JSON/YAML metadata over regex-only field extraction, explicit finite filename rules over repository-specific exceptions, and direct modules over a generic framework. Defer a shared core or monorepo until roughly 3-5 mature ecosystem tools establish a demonstrated need.

## Pipeline

```text
Caller-selected directory
  -> Root boundary and budget setup
  -> Root sentinel inventory
  -> Safe manifest parsing
  -> Bounded workspace discovery
  -> Scoped runtime, script, entrypoint, instruction, CI/config detectors
  -> Conflict resolution
  -> Evidence deduplication
  -> Stable normalization and bounded projection
  -> JSON Schema and semantic validation
  -> JSON or text renderer
```

This is a fact-production pipeline. Nothing in it runs the declared commands or interprets source code. Detectors can discover evidence independently, but they must not independently decide shared package-manager policy or global status.

## Module ownership

The source layout is implemented as the following responsibility map:

| Module | Owns | Does not own |
| --- | --- | --- |
| `cli` | Arguments, format selection, JSON/text rendering, stdout/stderr, exit code | Detection or filesystem policy |
| `core/scanner` | Root confinement, safe file access, skip rules, deterministic enumeration, read budgets | Ecosystem interpretation |
| `core/profiler` | Pipeline orchestration, Git marker/project identity, scoped detection context, and status reduction | Rendering and command execution or Git subprocesses/history |
| `core/evidence` | Source locators, deduplication, stable reference assignment | Confidence policy |
| `core/normalize` | Stable sort, bounded projection, reference preservation | Inventing facts |
| `core/diagnostics` | Diagnostic registry and completeness signals | Raw error serialization |
| `detectors/node` | Validated Node manifest facts | Executing manifest scripts |
| `detectors/package-manager` | Manager declarations, lockfile-family evidence, selection conflicts | Installation or version queries |
| `detectors/workspace` | Workspace declarations and bounded member discovery | Dependency or build graph |
| `detectors/inventory` | Ecosystem sentinels, config/CI files, instruction paths, and discovery scopes | Loading configuration, parsing pipeline logic, or rule precedence |
| `schema` | Versioned external contract and validation | Discovery policy |

The concrete implementation is under `src/`; the external schema is under
`schema/profile.schema.json`; frozen fixture definitions and independent tests
are under `test/`. There is no runtime dependency or hosted service.

Runtime declaration extraction can initially remain in the Node detector; create another module only if responsibility warrants it. Avoid speculative plugin systems or a generic detector framework before V1 needs one.

## Data and dependency boundaries

All detector filesystem access goes through the scanner. No detector directly opens arbitrary paths or uses a command runner. Metadata parsers receive bounded buffers from the scanner and return validated inert data or sanitized diagnostics.

The scanner inventories known filenames first. Only manifest/workspace/runtime detectors request allowed file bodies. Workspace discovery expands declared patterns within fixed limits. Detectors then inspect the root, member roots, and explicitly allowed ancestor/sentinel locations. This avoids a recursive source-code crawl.

Parsed root and member manifests are shared immutable input records for that profiling run. Script names, runtime declarations, package-manager selection, and entrypoints refer back to the same parsed evidence. No persistent cache is required.

The package-manager resolver owns invocation eligibility. The command detector consumes that decision, so it cannot accidentally restore a command suppressed by conflicting evidence. The diagnostics reducer owns global status; individual detectors report their category completeness instead of declaring the entire profile complete.

## Evidence lifecycle

During discovery, use source keys `(path, kind, pointer)` rather than final numeric IDs. Normalize and trim complete facts before assigning final IDs. Retain only the evidence required by emitted facts and diagnostics, allocate IDs from the sorted source keys, and resolve references once.

Schema validation catches malformed shapes. Semantic checks catch missing evidence references, inconsistent `returned` counts, invocation eligibility violations, and impossible status/coverage combinations. Neither check proves the repository's commands work.

## Failure boundaries

| Failure | Result |
| --- | --- |
| Invalid root or invocation | Fatal structured result |
| Invalid root Node manifest | Preserve generic inventory; affected categories partial |
| Unreadable workspace member | Preserve independently verified scopes; member unresolved |
| Package-manager conflict | Retain declarations; suppress affected invocations |
| Scan or output limit | Preserve deterministic complete records and explicit incomplete coverage |
| Evidence/schema consistency failure | Emit minimal validated fatal envelope; never emit a misleading successful profile |

Filesystem errors are translated into bounded known diagnostic codes. Raw parser messages and file excerpts do not escape into output. The normalizer cannot silently drop the only warning explaining an unknown fact.

## Security boundaries

Repository files are untrusted data. They cannot direct the profiler to access the network, execute a script, import a config, read a secret file, or escape the selected root. Pattern matching, YAML parsing, and JSON decoding are data operations with finite budgets.

The read boundary handles links/reparse points, invalid paths, permission errors, oversized files, and practical concurrent-mutation detection. Metadata reads use bounded file descriptors and `O_NOFOLLOW` where the platform provides it, then compare file state after reading. Windows reparse behavior and concurrent replacement remain platform-dependent evidence items and are covered by the test/CI matrix rather than claimed universally from one host.

Protected directory names are rejected as the selected root as well as skipped below it, so relative-path rules cannot be bypassed by changing the caller's root.

The profile itself remains untrusted input for downstream agents. Names and paths are data, never instructions. Command discovery does not grant execution permission. Instruction inventory does not choose which instructions govern a later action.

## Determinism

Determinism is a property of the complete pipeline: bounded candidate selection, parser behavior, conflict policy, sort order, evidence IDs, diagnostics, truncation, and serialization must all be fixed. Sorting final JSON alone cannot repair nondeterministic discovery.

No profile timestamps, random IDs, machine-specific absolute paths, installed-tool probes, or locale-dependent collation are needed. Equivalent supported trees on Windows, macOS, and Linux should produce the same normalized facts when file naming and permissions permit equivalent access. Case-colliding or link-dependent trees are not assumed equivalent.

## Downstream integration

Consumers receive a versioned profile plus source locators and explicit limitations. They should reject unsupported major schema versions, honor `status` and `coverage`, and treat `argv: null` as unavailable. A downstream tool may independently inspect a source pointer, but must not treat it as proof of current file integrity after the profile was generated.

Execution, changed-file analysis, rule resolution, and context assembly stay with their respective tools. The profiler does not acquire these responsibilities merely because it already knows useful metadata.
