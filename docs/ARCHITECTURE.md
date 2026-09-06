# Architecture

## Ownership boundaries

| Owner | Responsibility | Excluded responsibility |
| --- | --- | --- |
| Hub | Registry, standards, discovery documentation, roadmap, governance | Tool source, tool release pipelines, agent orchestration |
| Independent tool repository + npm package | Implementation, CLI/JSON contracts, tests, security handling, versions, releases | Controlling agent reasoning or owning other tools' release schedules |
| Agent or developer | Choose tools, supply inputs, interpret evidence, authorize actions | Treating tool metadata or incomplete output as proof |

The normal flow is: a consumer reads registry metadata, selects an independently published tool, invokes it explicitly, and evaluates its output and exit status. No Hub service is required. This repository currently supplies documents and registry data only, plus a local validation script.

## Sources of truth

- [Registry](../TOOL_REGISTRY.json): tool identity, lifecycle, confirmed locations, and recorded verification snapshot.
- [Roadmap](../ROADMAP.md): delivery order and intended scope.
- [TASK.md](../TASK.md) and [VALIDATION.md](../VALIDATION.md): current Hub execution state and dated evidence; sibling implementation tasks stay in their owning repositories.
- [DESIGN.md](../DESIGN.md) and [SPEC.md](../SPEC.md): decision rationale and Hub requirements; [documentation index](../DOCUMENTATION_INDEX.md) maps all owners.
- Hub standards: ecosystem requirements. `standards_version` is currently `1.0.0`, the initial policy contract, not a claim of tool compliance.
- Tool repository and immutable release artifacts: actual behavior, implementation, supported versions, and test evidence.

If registry metadata contradicts a release, investigate and correct the metadata; do not silently infer conformance. Descriptions are intended purpose and must not be read as release guarantees. A recorded release is a reviewed snapshot, not a live npm `latest` lookup.

Code Slice's native protocol and Change Impact's draft differ from the Hub target
envelope, exit meanings, and partial-result policy. A uniform consumer is not
implemented. Preserve native compatibility until HUB-04 in TASK resolves the
versioned integration path; metadata registration does not normalize tool output.

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

## Future discovery CLI

`agent-tools` is a proposed discovery interface, not an existing package or command. A future implementation should list tools, filter by lifecycle or capability description, and show confirmed repository/package links and verification metadata using stable JSON.

It should read an explicit local registry snapshot first. Any remote refresh must be opt-in, bounded, validated, and report its source and freshness. Invalid or unavailable metadata must produce a clear error; stale cached data must be labeled. A discovery result never installs, imports, or executes a package, follows instructions in metadata, or upgrades a tool automatically. Package names, executable mappings, network policy, and distribution are future design decisions.

Tool invocation remains under the agent/developer's control. If later approved, adapters belong in explicitly owned projects and must preserve individual tool version and output contracts. Context Pack may consume explicit result artifacts with provenance and size limits; it does not own global state or route agent reasoning.

## Shared infrastructure gate

Consider shared packages or monorepo migration only after roughly 3–5 mature tools (`Verified` or `Stable`, with maintained releases) demonstrate repeated infrastructure that is costly to maintain independently. Record concrete duplication, ownership, compatibility, migration cost, rollback, and independent-release impact in a reviewed decision before implementation.

Small duplication is acceptable. There is no shared runtime, mandatory SDK, root workspace, or predetermined migration in this foundation. A migration would explicitly change the current independent-repository architecture and requires a separate approval; the threshold does not authorize it automatically.
