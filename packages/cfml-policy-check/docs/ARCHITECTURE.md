# Architecture

Status: `Implemented local slice; target integration remains`
Last reconciled: 2026-09-16

## Current implementation boundary

The local implementation is in `src/cli.js` and is packaged by
`package.json`. It has no runtime dependencies beyond Node.js built-ins. The
manifest and stdin mode describe an AIT-callable contract, but no remote AIT
registration or release has occurred.

## Component ownership

| Component | Current owner | Boundary |
| --- | --- | --- |
| CLI/AIT adapter | `src/cli.js` | Parses CLI or one JSON stdin request; emits one JSON result and process exit code |
| Profile loader | `src/cli.js` | Validates local JSON profile, rule IDs, versions, severity, and executable-field rejection |
| Source reader | `src/cli.js` | Resolves explicit root-relative files, UTF-8, byte limits, symlink containment, and no-write reads |
| Tokenizer/model | `src/cli.js` | Parses bounded HTML tags, comments, locations, transparent `cfoutput`, and uncertainty barriers |
| Rule engine | `src/cli.js` | Evaluates the two table rules and stable finding order |
| Result renderer | `src/cli.js` | Emits envelope version `1.0.0`, bounded JSON, statuses, and exit codes |

## Data flow

```text
CLI argv or AIT JSON stdin
    -> request and limit validation
    -> explicit root and realpath containment
    -> bounded UTF-8 profile/source read
    -> mixed HTML/CFML tokenization
    -> known/unknown/malformed model
    -> table rule evaluation
    -> stable JSON envelope
```

Each stage is currently colocated in `src/cli.js` to keep the first slice small.
If the parser or rule engine grows, split only after a fixture or contract
requires a stable independent boundary.

## State, persistence, and authority

- The selected source and profile are immutable inputs for one run.
- The explicit root and local profile are the authority; no hidden global or
  remote policy is loaded.
- The implementation writes no source, cache, telemetry, or generated output.
- The JSON result is an output record, not a durable database.
- Tool version and profile version are separate identities.
- `ait-tool.manifest.json` declares `local-contract-only`; no registry write occurs.

## Mixed-template model

The implementation recognizes HTML tags, HTML comments, CFML comments, and
transparent `cfoutput`. Other CFML tags are uncertainty barriers. A dynamic
CFML tag, an unclosed/malformed structure, or a non-escaped hash expression
affecting a table causes `incomplete`. Escaped `##` remains literal.

The model intentionally does not execute CFML, infer runtime markup, traverse
includes, or diagnose the missing terminating `#` language issue owned by
`agent-cfml-check`.

## Dependencies and integration

The package declares Node `>=20` and uses only Node built-ins. Current local
verification is on Windows with Node `v25.2.1` and npm `11.6.2`. Lucee/Adobe
ColdFusion, LLMs, API keys, network services, and a runtime dependency on
`agent-cfml-check` are not required.

AIT/Hub is a consumer and release boundary. It does not own the local parser or
rule engine. The exact registration path remains unresolved.

## Failure and retry behavior

The tool fails closed for path escape, invalid profile/input, unsupported
extension, invalid UTF-8, resource limits, malformed structure, and dynamic
structure affecting a finding. Source analysis has no internal retry loop. A
future orchestrator may retry with the same request identity but must not turn
an incomplete result into a pass.

## Open design decisions

1. Confirm maintainer and distributable license.
2. Confirm Node platform matrix and package/release policy.
3. Freeze the AIT registry registration path and consumer-specific metadata.
4. Expand parser coverage only when a fixture proves the need.
5. Decide whether `cfqueryparam` belongs in a separately reviewed security-rule
   family.
