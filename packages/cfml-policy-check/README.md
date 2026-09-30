# Agent CFML Policy Check

Status: `In progress`
Lifecycle: `Pre-prototype`

This repository contains a private Node.js/npm implementation of a
deterministic, read-only policy checker for mixed CFML/HTML source. It is
designed to be callable by an AI agent or AIT adapter through a CLI or a
single JSON request on stdin.

## Current implementation

The local tool is `agent-cfml-policy-check` version `0.1.0`. It supports:

- one explicit root;
- one root-relative `.cfm` or `.cfc` source file;
- one root-relative local JSON profile;
- direct table rules for `<colgroup>` and `<col>`;
- HTML/CFML comments and transparent `cfoutput`;
- fail-closed dynamic/malformed/unsupported structure;
- deterministic JSON with bounded limits;
- CLI and AIT stdin JSON invocation.

`profiles/globe3-legacy-printform.json` and the `globe3-*` fixtures capture a
sanitized, owner-approved policy for the legacy Globe3 table-based PrintForm
pattern. It applies only the two implemented table rules and does not claim
runtime or browser correctness.

The package is private and `UNLICENSED`. It is not a public npm release,
AIT registry registration, deployment, or Hub admission.

## CLI usage

```text
agent-cfml-policy-check --help
agent-cfml-policy-check --version
agent-cfml-policy-check capabilities --json
agent-cfml-policy-check check --root ROOT --file FILE --profile PROFILE --json
```

Example:

```powershell
node src/cli.js check --root . --file test/fixtures/missing-colgroup.cfm --profile profiles/example.json --json
```

The command emits one JSON document. Exit code 0 means a supported check
completed, even when the result verdict is `violations`. Exit 3 represents
incomplete static evidence.

## AIT invocation

The local AIT-compatible entrypoint reads one JSON request from stdin:

```powershell
'{"operation":"check","root":".","file":"test/fixtures/pass.cfm","profile":"profiles/example.json"}' | node src/cli.js ait
```

The contract is described in [AIT tool contract](docs/AIT_TOOL_CONTRACT.md).
The manifest's `registration_status` is intentionally
`local-contract-only`; no remote registration has been performed.

## Responsibility boundary

- `agent-cfml-policy-check` owns configurable project and mixed CFML/HTML
  rules, such as table structure conventions.
- `agent-cfml-check` remains the proposed owner of CFML language-structural
  findings, including a missing terminating `#`. That external contract is
  not verified here.
- AIT or another package manager may dispatch a future released tool, but it
  is not a runtime dependency of local analysis.

This tool must not execute CFML or claim to prove runtime syntax, database,
permission, tenant, accessibility, security, or business correctness.

## Documentation map

- [Goal](GOAL.md)
- [Design](DESIGN.md)
- [Specification](SPEC.md)
- [Delivery epic](EPIC.md)
- [Roadmap](ROADMAP.md)
- [Task status](TASK.md)
- [Progress](PROGRESS.md)
- [Goal prompt](GOAL_PROMPT.md)
- [AIT tool contract](docs/AIT_TOOL_CONTRACT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [CLI contract](docs/CLI_CONTRACT.md)
- [JSON contract](docs/JSON_SCHEMA.md)
- [Policy profiles](docs/POLICY_PROFILE.md)
- [Rule catalog](docs/RULE_CATALOG.md)
- [Test plan](docs/TEST_PLAN.md)
- [Security requirements](docs/SECURITY.md)

## Next step

Complete the remaining `T-009` security, platform, and AIT consumer
verification before discussing release or registration.
