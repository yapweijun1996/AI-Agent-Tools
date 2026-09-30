# Epic: TypeScript Symbol Navigation Vertical Slice

| Field | Value |
|---|---|
| Status | Active |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Epic ID | SS-V1-TS |
| Current state | V1 TypeScript vertical slice, release gates, CI, package metadata, and public npm releases for `0.1.1` and `0.1.2` are implemented and verified |

## Outcome

Deliver a usable `agent-symbol-search` vertical slice: a local, read-only TypeScript tool that returns small, deterministic, evidence-backed symbol locations for an AI coding agent.

The outcome is not a universal code-intelligence platform. It is a verified TypeScript foundation that later language adapters can reuse.

## Scope

### In scope

- Node.js/TypeScript package bootstrap with supported Node.js majors 22, 24, and 26; release metadata and public npm configuration;
- versioned request/result/capability types, JSON schemas, and runtime validation;
- repository discovery with canonical root, symlink, ignore, secret, and resource boundaries;
- TypeScript symbols, exact/prefix/substring search, definitions, references, and import aliases;
- explicit `implements`, `extends`, and supported abstract-method implementation relationships;
- CLI and library API over one core;
- bounded, deterministic results, ambiguity, truncation, diagnostics, and CLI exit behavior;
- golden, security, limit, package, read-only, capability, documentation, and benchmark verification.

### Out of scope

- Python, CFML, and JavaScript implementation;
- fuzzy or user-supplied regex search;
- persistent repository cache;
- code slicing, change impact, test selection, MCP runtime, or LLM integration;
- project code execution or dependency installation during search;
- structural TypeScript implementation inference beyond explicit `implements`, `extends`, and supported abstract-method overrides;
- arbitrary automatic selection among multiple `tsconfig*.json` files;
- recursive project-reference builds;
- hard timeout guarantees beyond cooperative cancellation;
- trusted publishing/provenance for this first local release, deployment, or a public performance SLO;

## Definition of done

This epic is complete for the current V1 boundary only when all of the following are true:

1. A clean checkout can install and run the documented package.
2. TypeScript fixtures pass exact search, definition, alias, method, implementation, ambiguity, and false-positive tests.
3. The result envelope, ranges, symbol IDs, confidence values, errors, limits, ordering, project selection, and CLI stdout/stderr/exit behavior are schema- or contract-tested.
4. Root validation, symlink handling, ignored/secrets handling, no-write, no-network, and no-execution invariants are verified.
5. `npm pack` installed-artifact smoke tests pass outside the source checkout.
6. Cold/warm benchmark output is recorded without claiming an unmeasured latency target.
7. README, DESIGN, SPEC, ROADMAP, TASK, CHANGELOG, and RELEASE agree with executable behavior.
8. CI covers Ubuntu Node 22/24/26, Node 24 package smoke on Ubuntu/macOS/Windows, and the Ubuntu/Node 24 benchmark gate; interactive npm publication, the annotated tag, and GitHub Release are completed after these gates.

## Workstreams

| Workstream | Status | Dependency | Closure evidence |
|---|---|---|---|
| Contract and schema | Completed | None | `npm run verify` schema and validation tests |
| Package/tool bootstrap | Completed | Contract decisions | `npm ci`, typecheck, build, and packaged smoke |
| Discovery and security | Completed | Package bootstrap | Boundary, ignore, secret, symlink, read-only, and limit tests |
| TypeScript adapter | Completed | Contract and TypeScript dependency | TypeScript golden fixtures and project-selection tests |
| CLI/library integration | Completed | Core adapter | CLI/library parity and stdout/stderr tests |
| Verification and fixtures | Completed | Each implemented operation | `npm run verify` |
| Packaging, benchmarks, and release gates | Completed | Passing tests | `npm run release:check`, CI matrix, npm registry, fresh install, tag, and `RELEASE.md` |

## Decisions recorded

- TypeScript is the V1.0 language priority.
- JavaScript, Python, and CFML are later adapters, not current capabilities.
- The tool is read-only, local-first, and does not execute project code during search.
- No persistent repository cache is planned for V1.0.
- `agent-code-slice` remains responsible for source extraction.
- Ambiguity and partial results are reported rather than hidden.
- V1.0 confirms only explicit TypeScript inheritance/implementation relationships; structural assignability and dynamic dispatch are not claimed.
- Supported release Node majors are 22, 24, and 26; Node 20 and Node 23 are not release evidence.
- Multiple TypeScript configs are never selected arbitrarily; search supports explicit `project` recovery.
- Project references are reported but not recursively built in V1.
- `--exclude` wins over ordinary matching; `--include` may override ordinary ignore filters but never security boundaries.

## Evidence required for closure

Every workstream has executable evidence in the current working tree. Documentation alone does not close an implementation task. The package, registry verification, annotated tag, and GitHub Release for v0.1.1 and v0.1.2 are complete; the v0.1.2 agent integration patch changes no implementation behavior. The local interactive publishes do not claim provenance.
