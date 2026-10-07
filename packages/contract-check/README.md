# Contract Check

Deterministic offline JSON Schema input-acceptance comparison. Package/executable `agent-contract-check`, folder `contract-check`; implements the existing planned registry entry `agent-contract-diff`, avoiding a second overlapping tool. Private Apache-2.0 MVP, no npm release. Name collision lookup returned no npm package for this identity on 2026-09-30; that is not an ownership reservation.

After root `npm run bootstrap`:

```sh
node packages/contract-check/src/cli.js capabilities --json
node packages/contract-check/src/cli.js compare --before packages/contract-check/examples/before.json --after packages/contract-check/examples/after.json --samples packages/contract-check/examples/samples.json --json
node packages/contract-check/src/cli.js compare --before packages/contract-check/examples/mcp.json --after packages/contract-check/examples/mcp.json --before-pointer /tools/0/inputSchema --after-pointer /tools/0/inputSchema --json
```

`npm install -g ./packages/contract-check` exposes the CLI separately from AIT dispatch. Node 22.13+ in the 22 line or Node 24 supported. Actual files are required; JSON pointers can select API/MCP input schemas. This is schema acceptance checking, not complete OpenAPI/MCP protocol conformance or response compatibility. Direction: do inputs accepted before remain accepted after?

Implemented draft-07 subset: boolean schemas, type (including null and number/integer), required, properties, additionalProperties, items, enum/const, numeric bounds, string lengths, array/object counts and patterns. Narrowing is potential-breaking, broadening compatible; unsupported keywords such as refs, composition, format, dependencies and other drafts are unknown. Findings are conservative constraint-level risks; interactions may make a reported tightening unreachable. Unknown semantics prevent a complete compatibility claim, even when unchanged. Only selected schemas are traversed. Tuples and malformed constraints are rejected. No external reference resolution or network.

Pattern changes are unknown unless bounded sample probes prove a previously accepted sample is rejected. `--samples` accepts at most 32 strings of at most 512 characters, applied to root pattern changes only; nested pattern samples remain unknown. Samples report index and before/after substring/full-match booleans, never values. JSON Schema patterns use substring matching. Full-match evidence means the first regex match spans the whole string; it is a diagnostic observation, not a validator switch. The `\\S` versus anchored nonblank fixture demonstrates multiline risk and matching-mode differences; it does not claim a validator bug or regex equivalence. Probes run isolated fixed code, with a 750ms timeout and no environment secrets; failure/timeout remains unknown.

Results have stable JSON pointers, before/after constraints, status compatible/potential-breaking/unknown/error and complete flag. Enum/const/pattern evidence uses SHA-256 fingerprints (patterns include length), not private payload values. Sources are logical before/after identifiers and selected pointers, not raw file paths. Schema field names themselves are contract evidence and should be sanitized before input. Limits: 1 MiB input, depth 32, 4096 schema nodes, 512 findings, 64 KiB output. Truncation produces explicit unknown evidence. Exit 0 compatible, 1 potential-breaking, 2 invalid input, 3 unknown; breaking takes precedence but completeness remains false if any unknown exists. Input must be valid UTF-8 JSON; credential basenames rejected. No writes or credential reads.

ESM API `compareContracts(before,after,{samples?}?)`, `selectPointer(value,pointer?)`, `capabilities()`, `encodeResult(result)`, `exitCode(result)`. Result [schema](schema/result.schema.json), declarations `types/index.d.ts`; runtime validation is authoritative. Run `npm test`, `npm run build`, `npm run typecheck`, `npm run smoke:pack`.

Removing an explicit property makes its values subject to the resulting `additionalProperties` constraint. When that constraint is a schema, the comparator checks the removed property's schema against it, including nested constraints. Unproved pattern changes and unsupported semantics retain an incomplete result instead of a compatibility claim.
