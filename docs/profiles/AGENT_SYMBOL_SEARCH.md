# Symbol Search consumer profile

Profile ID: `hub-consumer/agent-symbol-search@0.1`.

This Hub-owned consumer profile applies only to package
`agent-symbol-search@0.1.2` and executable `agent-symbol-search`. The
independent repository owns the native TypeScript symbol-navigation contract
and schema version `1`.

## Native boundary

- Operations are `capabilities`, `search`, `definition`, `references`,
  `implementations`, and `symbols`.
- Every request requires an explicit canonical root. TypeScript project
  selection is explicit or deterministic when exactly one config is found.
- The tool returns bounded symbol locators and diagnostics, not full source
  bodies. It reads project files as data and does not execute code, modify the
  repository, install dependencies during search, use the network, or call an
  LLM.
- The V1 shipped language is TypeScript. JavaScript, Python, and CFML are not
  shipped adapters.

## Native result and exit semantics

The native JSON envelope has:

- `schemaVersion: "1"`;
- `status`: `complete`, `partial`, or `error`;
- `data.matches` plus optional capability/ambiguity fields;
- `diagnostics`, `truncation`, and `stats`.

Complete and partial operations exit `0`; operation errors exit `1`; CLI
argument parse errors exit `2`. A complete empty match set is still complete.
An ambiguity warning, `SYMBOL_NOT_FOUND`, semantic coverage limitation, or
resource limit remains native diagnostic/truncation evidence rather than a
universal failure.

| Native condition | Exit | Profile classification |
| --- | ---: | --- |
| `status: complete`, capabilities operation | 0 | `capabilities` |
| `status: complete` | 0 | `complete` |
| `status: partial` | 0 | `partial` |
| `status: error` | 1 or 2 | `error` |
| malformed or inconsistent envelope | any | `protocol_error` |

AIT uses the native status and exit contract. It does not infer that a complete
empty result proves a symbol is absent beyond the tool's declared evidence
boundary, and it does not convert partial results to a Hub completeness status.

## AIT application

When the exact registry ID, package name, package version, and executable match
the machine-readable profile catalog, AIT validates the bounded envelope and
adds optional `meta.profile` classification. A missing exact match remains
native passthrough.

## Evidence and non-goals

The published `0.1.2` artifact was audited on 2026-09-15: 50 files, unpacked
size 266,492 bytes, shasum `121d996f2fedee187cdfd7b56323ee533246a685`, and
integrity
`sha512-d1dn/VtGhdQ4DwQk3AndtqaF8+EWg/iSquqs2PYZtGc1GXqsKL9wz7MN+eXyUGDb+qZswZeUGNZ7fiFGp/Vrkg==`.
The package schema, README, and CLI were inspected. Artifact smoke checks
covered capabilities, a complete symbol search, and a bounded invalid-project
error.

This profile does not read source bodies, execute recommendations, certify
semantic correctness, or claim JavaScript/Python/CFML support. See the
independent package contract for authoritative behavior.
