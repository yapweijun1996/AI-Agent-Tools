# CLI Contract

Status: `Implemented local contract`
Last reconciled: 2026-09-16

## Commands

The package exposes `agent-cfml-policy-check` through `package.json`:

```text
agent-cfml-policy-check --help
agent-cfml-policy-check --version
agent-cfml-policy-check capabilities --json
agent-cfml-policy-check check --root ROOT --file FILE --profile PROFILE --json
```

The current implementation also runs directly with `node src/cli.js`. All modes
emit one JSON document plus newline; `--pretty` only changes indentation.

## AIT mode

```text
agent-cfml-policy-check ait
```

AIT mode reads exactly one JSON request from stdin. The request uses
`operation: capabilities` or `operation: check`. A check requires `root`,
`file`, and `profile`. The profile and source paths must be root-relative.

## Streams

- stdout contains one UTF-8 JSON document followed by a newline;
- stdout contains no banner, progress text, ANSI escape, or second object;
- diagnostics are represented in the JSON envelope;
- AIT mode never prompts interactively.

## Path and profile rules

- The root is explicit and resolved to a real directory.
- Source and profile paths must be relative to the root.
- Traversal and symlink escapes outside the root are rejected.
- Only the selected local profile is loaded.
- Profile code, commands, modules, URLs, and remote configuration are rejected
  or never interpreted.

## Limits

| Limit | Default | Hard maximum |
| --- | ---: | ---: |
| File bytes | 262,144 | 4,194,304 |
| Profile bytes | 65,536 | 1,048,576 |
| Tokens | 10,000 | 100,000 |
| Nesting depth | 64 | 512 |
| Findings | 1,000 | 10,000 |
| Output bytes | 1,048,576 | 4,194,304 |
| Processing time | 1,000 ms | 10,000 ms |

Limit exhaustion returns `incomplete` with exit code 3.

Source and profile files are checked for oversized regular-file metadata before
their bodies are read. Reading uses a verified regular-file descriptor and is
capped at the admitted size plus one byte to detect growth; it cannot exceed the
selected byte limit plus one. Oversized or over-limit growing input returns
`RESOURCE_LIMIT` before UTF-8 decoding. Other observed read-time changes use the
existing `FILE_READ_ERROR` or `PROFILE_READ_ERROR` result, and descriptors are
closed on success and rejection. This bounds the selected file bodies; it does
not make filesystem inspection an atomic snapshot.

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | Complete supported analysis, including completed findings |
| `1` | Unexpected internal failure |
| `2` | Invalid request, input, profile, or limit |
| `3` | Dynamic, malformed, unsupported, or resource-limited analysis |
| `4` | Explicit security boundary rejection |
