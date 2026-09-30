# ADR-008: Keep the CLI envelope stable and fail closed

> **Status: PROVISIONAL / M1/T-036/T-045/T-046 BOUNDED.** The private CLI boundary is implemented and tested; bounded `analyze`/`index` and query commands exist, while graph persistence and release/public API remain open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | CLI arguments, JSON stdout, stderr diagnostics, exit codes, and current capability reporting |
| Source of truth | `src/cli.js`, `bin/agent-cfml-linkage.js`, `test/cli.test.js`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed, including capabilities, invalid input, complete config shape/value validation, root rejection, bounded analysis, query command mapping/validation, output limits, and no-execution cases |
| Verification | Local Node subprocess tests pass; package-install, cross-platform, and released CLI checks remain unverified |
| Limitations | Query commands analyze the root afresh and do not persist or accept a prior graph; bounded orchestration uses the explicit mixed structural scanner and remains private/unreleased |

## Decision

The private CLI accepts one command and an optional `--config <path>`. `capabilities`, `--help`, and `--version` are available without a configuration. Analysis and recognized query commands require JSON configuration. `analyze` and `index` run the bounded private pipeline; each recognized query command runs the same fresh pipeline and maps to one bounded graph operation: `related`, `callers`, `callees`, `trace`, `unresolved`, `explain` (`explain-edge`), or `stats`. Query options are supplied under the optional `query` configuration object. Serialized analysis and query output is capped by `limits.max_output_bytes`; an exceeded cap returns `OUTPUT_LIMIT`, `data: null`, and exit code `3`.

Every invocation writes exactly one JSON object to stdout with this stable top-level shape:

```text
{ schema_version, tool, command, status, data, diagnostics }
```

Machine-readable diagnostics remain bounded in the envelope. Human-readable equivalents go to stderr. Exit meanings follow the v0.1 contract: `0` completed, `1` internal failure, `2` invalid input/configuration, `3` incomplete/unimplemented/limited, and `4` root/path/access rejection. No command executes analyzed source or accesses a network, database, shell, or browser.

The CLI resolves a configured relative root against the invocation working directory, admits it through the root guard, analyzes only admitted files, and does not claim query or analysis completion merely because input validation succeeded.

## Consequences

Agents can parse stdout without handling human log noise, while operators still receive actionable stderr. Incomplete implementation is observable and non-zero. The envelope and command names can evolve only through a versioned contract; public package/export, graph persistence, and full parser orchestration remain deferred.
