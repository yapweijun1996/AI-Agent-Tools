# Architecture

## Ownership boundaries

| Owner | Responsibility | Excluded responsibility |
| --- | --- | --- |
| Hub | Registry, standards, discovery, roadmap, governance, and the explicit AIT install/dispatch runtime | Tool source, tool release pipelines, agent reasoning/orchestration |
| Independent tool repository + npm package | Implementation, CLI/JSON contracts, tests, security handling, versions, releases | Controlling agent reasoning or owning other tools' release schedules |
| Agent or developer | Choose tools, supply inputs, interpret evidence, authorize actions | Treating tool metadata or incomplete output as proof |

The normal flow is: a consumer reads the local registry snapshot, explicitly installs a pinned independently released package with `ait install`, invokes it with an explicit execution approval through `ait dispatch`, and evaluates the wrapped output and native exit status. AIT is a local process, not a hosted service or agent reasoning layer. Independently owned tool source, tests, packages, and release pipelines remain outside this repository.

## Sources of truth

- [Registry](../TOOL_REGISTRY.json): tool identity, lifecycle, confirmed locations, and recorded verification snapshot.
- [Roadmap](../ROADMAP.md): delivery order and intended scope.
- [TASK.md](../TASK.md) and [VALIDATION.md](../VALIDATION.md): current Hub execution state and dated evidence; sibling implementation tasks stay in their owning repositories.
- [DESIGN.md](../DESIGN.md) and [SPEC.md](../SPEC.md): decision rationale and Hub requirements; [documentation index](../DOCUMENTATION_INDEX.md) maps all owners.
- Hub standards: ecosystem requirements. `standards_version` is currently `1.0.0`, the initial policy contract, not a claim of tool compliance.
- Tool repository and immutable release artifacts: actual behavior, implementation, supported versions, and test evidence.

The existing Company KB is the cross-session project knowledge source. Hub files
remain the version-controlled contract and registry artifacts; synchronize approved
changes rather than treating either stale copy as authoritative for every claim.
[KB synchronization](KB_SYNC.md) records owners, item IDs, hashes and readback.

If registry metadata contradicts a release, investigate and correct the metadata; do not silently infer conformance. Descriptions are intended purpose and must not be read as release guarantees. A recorded release is a reviewed snapshot, not a live npm `latest` lookup.

Code Slice's native protocol and Change Impact's draft differ from the Hub target
envelope, exit meanings, and partial-result policy. AIT wraps captured native
stdout/stderr in `ait-result/v1` but does not reinterpret native semantics or claim
Hub conformance. Preserve native compatibility; any versioned integration path must
use an explicit consumer profile or reviewed migration. Current profiles for [Code
Slice](profiles/AGENT_CODE_SLICE.md), [Project Profile](profiles/AGENT_PROJECT_PROFILE.md),
[Change Impact](profiles/AGENT_CHANGE_IMPACT.md), [Test Scope](profiles/AGENT_TEST_SCOPE.md),
[CFML Check](profiles/AGENT_CFML_CHECK.md), and [Symbol Search](profiles/AGENT_SYMBOL_SEARCH.md)
preserve native envelopes and do not normalize tool output.

## Registry contract

The registry is UTF-8 JSON. Top-level fields are `schema_version`, `standards_version`, and ordered `tools`. Both version fields use semantic versioning. Initial versions are `1.0.0`.

| Tool field | Meaning |
| --- | --- |
| `id` | Unique stable kebab-case ecosystem identifier; not an npm name or executable name. Never reuse it for a different tool. |
| `name`, `description` | Display name and concise intended purpose. |
| `status` | Exact lifecycle value from [Tool standard](TOOL_STANDARD.md#lifecycle). |
| `repository_url` | Confirmed canonical HTTPS repository URL, otherwise `null`. |
| `npm` | `null`, or `{ "name": "...", "url": "..." }` using the confirmed published package identity and canonical npm package URL. |
| `release_version` | Recorded published npm version, otherwise `null`; not automatically the newest release. |
| `verification` | `null`, or a release-specific evidence snapshot as defined below. |
| `deprecation` | `null`, or `{ "reason": "...", "replacement_id": null }`; replacement may instead reference another registered ID. |

A verification snapshot contains `version` (equal to `release_version`), `standards_version`, `verified_on` (UTC calendar date, `YYYY-MM-DD`), `evidence_urls` (nonempty HTTPS links to immutable release/commit and reproducible test evidence), `platforms` (a nonempty unique array drawn from `windows`, `macos`, `linux`), and `limitations` (an array of nonempty strings; empty only when no additional limitations were found within the declared scope). It records a reviewed assertion; the Hub validator cannot establish that assertion's truth.

Unknown values are `null`, never fabricated URLs or placeholder versions. Consumers must reject malformed data, duplicate IDs, invalid lifecycle values, and unsupported schema major versions. Same-major optional additions must be safe to ignore; incompatible changes require a schema major bump. This repository's validator checks the exact currently adopted schema to catch authoring mistakes.

## AIT discovery, installation, and dispatch runtime

`agent-tools` is the Hub-owned package and `ait` is its CLI. Version `0.1.0` is
implemented locally and is not yet published. It reads an explicit local registry
snapshot, lists lifecycle/package metadata, validates installed state, installs a
pinned registry release with an explicit command, and dispatches an installed tool
only after `--allow-execution` is supplied.

The runtime is intentionally explicit and fail-closed:

- `ait install TOOL_ID` requires a confirmed npm identity and release version;
  Experimental tools additionally require `--allow-experimental`.
- `--from-path` is available for a local package fixture or controlled development
  install; package identity must still match the registry entry.
- npm installation uses `--ignore-scripts`, `--no-audit`, `--no-fund`, and no shell;
  installation is the only operation that may use the network, and only because the
  caller explicitly requested it.
- `ait dispatch TOOL_ID --allow-execution -- ...` uses the installed package's
  declared executable, passes a reduced environment, never invokes a shell, and
  returns a bounded `ait-result/v1` wrapper around native output. This is process
  isolation, not a sandbox or a claim of filesystem/network confinement.
- No metadata, package lifecycle script, registry entry, or discovered command is
  treated as trusted instructions. No automatic install, upgrade, import, retry, or
  execution occurs.

The AIT implementation does not add a universal compatibility layer to external
tools. It preserves their package version and native output, records installation
state under the user's AIT home, and applies only the checked-in exact-version
profiles and bounded validators described in [AIT profile selection](AIT_PROFILE_SELECTION.md).
Unmatched tools remain native passthrough; profile selection does not authorize
execution or reinterpret native status. Context Pack may consume explicit result
artifacts with provenance and size limits; it does not own global state or route
agent reasoning. The current package is not publication-ready: its distribution
must retain the default registry snapshot, and publication still requires an
explicit license/ownership decision. The detailed policy gate for remote refresh,
signatures, dependencies, and sandboxing is recorded in [AIT runtime](AIT_RUNTIME.md).

## Shared infrastructure gate

Consider shared packages or monorepo migration only after roughly 3–5 mature tools (`Verified` or `Stable`, with maintained releases) demonstrate repeated infrastructure that is costly to maintain independently. Record concrete duplication, ownership, compatibility, migration cost, rollback, and independent-release impact in a reviewed decision before implementation.

Small duplication is acceptable. AIT is the one explicitly authorized Hub runtime;
it is not a shared implementation library, mandatory SDK, service, or tool source
workspace. Independent tools remain independently implemented, versioned, tested,
and released. Any future shared tool package still requires the maturity gate and a
separate reviewed decision.

## Planned evidence tools

The [three-tool expansion](TOOL_EXPANSION.md) adds structural checking, sanitized
artifact persistence and supplied-event analysis as independent responsibilities.
Result Store's explicit local writes stay inside its own allowed store; the Hub
does not own that storage. Runtime Trace receives event files and caller-defined
business evidence; application adapters own instrumentation and readback. No
automatic retries, service orchestration or mandatory inter-tool dependency follows.
