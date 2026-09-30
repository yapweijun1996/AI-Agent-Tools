# Design

Status: `Implemented local slice; target integration remains`
Last reconciled: 2026-09-16

## Evidence boundary

The repository now has an executable local implementation in `src/cli.js`,
package identity in `package.json`, an AIT-compatible local manifest,
schemas, generic fixtures, an owner-approved Globe3 profile/fixture set, and tests.
The implementation is deliberately smaller than
the full target design: it supports only the declared V1 rules and CFML
uncertainty subset. Cross-platform, release, and external AIT registration
evidence do not exist.

The trusted external `agent_cfml_check` Tool Registry contract was inspected
as a compatibility reference: it uses Node, read-only single-file operations,
`capabilities/check`, and a `1.0.0` envelope. That reference does not prove
this repository is registered or compatible in every consumer.

## Users and context

The users are AI coding agents and developers reviewing CFML templates for
project-specific source conventions. The local tool receives one explicit root,
one source file, and one local profile, then returns a bounded result suitable
for an agent or an AIT adapter.

## Implemented component boundaries

| Component | Current owner | Boundary |
| --- | --- | --- |
| CLI/AIT adapter | `src/cli.js` | Parses CLI or one JSON stdin request; emits one JSON result and process exit code |
| Profile loader | `src/cli.js` | Validates local JSON profile, rule IDs, versions, severity, and executable-field rejection; project applicability remains profile/owner input |
| Source reader | `src/cli.js` | Resolves explicit root-relative files, UTF-8, byte limits, symlink containment, and no-write reads |
| Tokenizer/model | `src/cli.js` | Parses bounded HTML tags, comments, locations, transparent `cfoutput`, and uncertainty barriers |
| Rule engine | `src/cli.js` | Evaluates the two table rules and stable finding order |
| Result renderer | `src/cli.js` | Emits envelope version `1.0.0`, bounded JSON, statuses, and exit codes |

## Implemented analysis flow

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

The model is intentionally conservative. It does not execute CFML, infer runtime
markup, traverse includes, or claim to diagnose the missing terminating `#`
language issue owned by `agent-cfml-check`.

## Trust and failure boundaries

Source, profile JSON, comments, messages, and repository metadata are untrusted
data. They never become commands, modules, network requests, or root overrides.
Traversal, symlink escape, unsupported encoding, resource exhaustion, malformed
profiles, and dynamic structure are represented by bounded error or incomplete
states.

There is no retry loop for source analysis: retrying cannot make an unsupported
static conclusion true. A future orchestrator must preserve request identity
when retrying.

## Observability and release

The local CLI exposes machine-readable status, error codes, scope, profile
identity, effective limits, and tool identity. Human output is not a separate
unbounded channel; JSON mode writes one document plus newline to stdout.

No network health endpoint, browser UI, deployment runtime, public artifact,
registry registration, or release exists yet.

`profiles/globe3-legacy-printform.json` is a sanitized, owner-approved profile
derived from the KB-MCP verified legacy table-based PrintForm context and the
explicit 2026-09-16 decision to enforce both table rules. It is not a second
policy authority; the explicit local profile remains the runtime authority for
any check.

## Open design decisions

1. Confirm maintainer and distributable license.
2. Confirm Node platform matrix and package/release policy.
3. Freeze the AIT registry registration path and consumer-specific metadata.
4. Expand parser coverage only when a fixture proves the need.
5. Decide whether `cfqueryparam` belongs in a separately reviewed security-rule
   family.
