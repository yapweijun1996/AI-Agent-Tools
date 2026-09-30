# Documentation Standard

| Field | Value |
|---|---|
| Status | Active |
| Applies to | `agent-symbol-search` and its repository documentation |
| Owner | Project maintainers |
| Last reviewed | 2026-09-08 |
| Review cadence | Every release and whenever a public contract changes |

## 1. Purpose

This document defines how the project documents its behavior, contracts, design decisions, development work, and release readiness.

The standard exists to keep documentation aligned with the product promise:

> `agent-symbol-search` is a deterministic, local-first, read-only symbol navigation tool for AI coding agents.

Documentation is part of the product contract. A claim that is not supported by executable behavior, a test, a schema, or an explicitly labelled proposal must not be presented as current capability.

## 2. Normative language

The terms **MUST**, **MUST NOT**, **SHOULD**, **SHOULD NOT**, and **MAY** are normative:

- **MUST / MUST NOT**: required for the documentation to be accepted.
- **SHOULD / SHOULD NOT**: the default expectation; deviations require a documented reason.
- **MAY**: optional and context-dependent.

## 3. Documentation map

Each document has one primary responsibility. Do not duplicate authoritative requirements across documents.

| Document | Responsibility | Source of truth |
|---|---|---|
| `README.md` | User-facing value proposition, installation, quick start, supported operations, and links | Public entry point; summarizes `SPEC.md` |
| `DESIGN.md` | Architecture, ownership boundaries, data flow, trade-offs, and rejected alternatives | Architecture decisions and design rationale |
| `SPEC.md` | Normative CLI/library behavior, request and result schemas, error semantics, limits, and compatibility | Public behavior and contracts |
| `EPIC.md` | Product outcome, scope, success criteria, and delivery stories | Approved product direction |
| `DOCUMENTATION_STANDARD.md` | Documentation rules, review gates, freshness, and ownership | Documentation governance |
| `ROADMAP.md` | Planned work, sequencing, and explicitly labelled non-commitments | Future intent only |
| `TASK.md` | Active implementation tasks and acceptance checks | Current delivery plan |
| `CHANGELOG.md` | Released user-visible changes and migration notes | Historical release record |
| `BENCHMARK.md` | Reproducible measured performance baseline, timeout gate, and limitations | Benchmark evidence, not a product guarantee |
| `RELEASE.md` | v0.1.0/v0.1.1/v0.1.2 release records and npm/skill checklists | Publication procedure and recovery rules |
| `skills/agent-symbol-search/SKILL.md` | Agent-facing npm installation, operation selection, result handling, and safety workflow | Reusable agent invocation guidance |

If two documents disagree, `SPEC.md` governs runtime behavior, executable schemas/tests govern exact machine-readable behavior, and `ROADMAP.md` never overrides either.

## 4. Document status and metadata

Every top-level project document MUST include:

```text
Status: Proposed | Active | Deprecated | Historical
Owner: <team or role>
Last reviewed: YYYY-MM-DD
```

Documents describing a proposed feature MUST NOT use present-tense capability language unless the capability is implemented and verified.

Use explicit labels:

- `Implemented`: available in the current package and covered by verification.
- `Partial`: available with documented limitations.
- `Candidate`: heuristic or parser-based evidence; not semantic confirmation.
- `Unsupported`: intentionally not provided.
- `Proposed`: planned but not available.
- `Unknown`: insufficient evidence to make a stronger claim.

## 5. Required content by document type

### 5.1 `README.md`

The README MUST answer, in this order:

1. What problem does the tool solve?
2. Who is it for?
3. What is the smallest working example?
4. What operations and languages are currently supported?
5. How are results bounded, ranked, and reported?
6. What does the tool explicitly not do?
7. How is it installed and verified?
8. Where are the full contract and architecture documents?

The README MUST distinguish current support from proposed support and MUST link to the relevant contract section instead of duplicating large schemas.

### 5.2 `DESIGN.md`

The design document MUST describe:

- module ownership and dependency direction;
- the boundary between symbol search, code slicing, project profiling, change impact, and test scope;
- read-only and execution boundaries;
- language adapter responsibilities;
- failure and partial-result boundaries;
- important trade-offs and rejected alternatives;
- integration assumptions and compatibility risks.

Architecture claims MUST identify whether they are implemented, tested, or proposed.

### 5.3 `SPEC.md`

The specification MUST define:

- operations and their inputs;
- normalized symbol kinds;
- request and result envelopes;
- range and path conventions;
- `symbolId` derivation;
- confidence and relation values;
- stable ordering;
- ambiguity and truncation semantics;
- failure codes;
- resource limits and timeout behavior;
- read-only guarantees;
- versioning and backward-compatibility rules.

Every JSON example MUST validate against the maintained schema or be labelled `illustrative`.

### 5.4 `EPIC.md`

The epic document MUST define:

- the user and agent outcome;
- in-scope and out-of-scope behavior;
- success criteria and non-functional requirements;
- dependencies and delivery risks;
- stories or milestones with status and acceptance checks.

An epic MUST distinguish approved direction from implemented behavior. It MUST NOT be used as a substitute for the normative `SPEC.md`.

### 5.5 `ROADMAP.md`

Roadmap items MUST include:

- user or agent outcome;
- scope and non-goals;
- dependencies;
- expected evidence of completion;
- status: `Proposed`, `Planned`, `In progress`, `Completed`, or `Dropped`.

The roadmap MUST NOT be used to imply that an unimplemented language or operation is supported.

### 5.6 `TASK.md`

Each active task MUST include a concrete first deliverable and at least two acceptance checks. Acceptance checks SHOULD be executable tests, schema validation, benchmark output, or reproducible CLI commands.

Tasks that change a public behavior MUST name the affected `SPEC.md` section and required changelog entry.

## 6. Current-state reporting

Each project status document MUST state:

- the repository revision or working-tree scope it describes;
- what is implemented and verified;
- what is documentation-only or proposed;
- pending work and its dependencies;
- blockers, with evidence and the condition that would unblock them;
- the next recommended action.

Uncommitted work MUST be labelled as `working tree` and MUST NOT be described as released or published.

## 7. Single source of truth

The following facts MUST have one authoritative source:

| Fact | Authoritative source |
|---|---|
| Supported operations and fields | Schema and contract tests |
| Language capability matrix | Capability registry or generated capability output |
| Failure codes | Error-code definition and contract tests |
| Default limits | Runtime configuration/constants and contract tests |
| Released behavior | Published package plus `CHANGELOG.md` |
| Planned work | `ROADMAP.md` |

Human-authored documents MAY summarize these facts, but MUST NOT maintain independent volatile lists or counts. Generated output SHOULD be used where drift could mislead users or agents.

## 8. Evidence and claims

Documentation MUST separate:

- **Verified fact**: backed by current code, test, schema, benchmark, or runtime output.
- **Design decision**: approved direction with rationale.
- **Assumption**: an input not yet verified.
- **Unknown**: evidence is insufficient.

Capability claims MUST include the evidence level. In particular:

- semantic resolver output may be `confirmed`;
- AST/import-based inference may be `strong`;
- lexical or heuristic matches MUST be `candidate`;
- unsupported or unresolved behavior MUST NOT be described as confirmed.

The project MUST prefer an honest `partial`, `candidate`, or `unsupported` result over an undocumented guess.

## 9. Examples and contracts

Examples MUST be:

- minimal and runnable where a command is shown;
- labelled when illustrative rather than executable;
- consistent with current field names, enum values, paths, and exit behavior;
- paired with expected output or an explicit statement of variable fields;
- free of secrets, real repository paths, and machine-specific assumptions.

When a contract changes, update the schema, implementation, tests, examples, README summary, and changelog in the same change unless the change is explicitly marked as a staged migration.

## 10. Security and operational documentation

Documentation MUST state that the tool:

- reads source as data and never executes project code;
- does not install dependencies, build, test, modify repositories, use an LLM, or access the network during search;
- validates the repository root and prevents paths outside it;
- excludes configured secrets and generated content by default;
- reports bounded or partial results instead of claiming completion after a limit is reached.

Security-sensitive examples MUST use placeholders. Logs and examples MUST NOT contain credentials, tokens, private keys, or secret file contents.

## 11. Review and change gates

A documentation change MUST be reviewed for:

1. **Ownership**: the requirement appears in the correct document.
2. **Truth**: current claims match executable and generated behavior.
3. **Completeness**: public changes include schemas, tests, examples, and migration notes where applicable.
4. **Consistency**: terminology, status values, paths, and field names are stable.
5. **Safety**: read-only, path-boundary, secret-handling, and resource-limit behavior is explicit.
6. **Usability**: a new contributor can find the first successful command without reading the whole repository.

Before release, maintainers MUST verify:

- clean checkout setup from the documented commands;
- package/installed-artifact smoke behavior;
- contract examples and schemas;
- capability output against the documented matrix;
- golden fixtures for supported language behavior;
- bounded-result and read-only invariants;
- platform-specific path examples where supported;
- Node 22/24/26 CI, Node 24 package smoke on Ubuntu/macOS/Windows, and the Ubuntu/Node 24 benchmark gate;
- product-source coverage thresholds and the explicit absence of benchmark `TIMEOUT` results;
- npm registry and fresh-install verification before creating the annotated tag or GitHub Release.

## 12. Documentation quality checklist

The change is ready when:

- [ ] every affected document has current metadata;
- [ ] current, partial, candidate, unsupported, and proposed behavior are distinguishable;
- [ ] no volatile capability list is maintained in more than one place;
- [ ] all public JSON examples are schema-valid or clearly labelled illustrative;
- [ ] at least two acceptance checks cover each new contract or task;
- [ ] security, limits, ambiguity, and partial-result behavior are documented;
- [ ] links and commands work from a clean checkout;
- [ ] the final diff contains no unrelated documentation churn.

## 13. Current implementation baseline

The V1 TypeScript vertical slice and v0.1.1/v0.1.2 repository release gates are implemented and verified in the current working tree. The v0.1.2 agent integration documentation patch is published. Supported release Node majors are 22, 24, and 26; local publications do not claim provenance or a public latency SLO. The following documents now describe the verified implementation and its boundaries:

- `README.md`: product overview, npm quick start, agent workflow, support matrix, and verification commands;
- `DESIGN.md`: implemented architecture, ownership boundaries, and trade-offs;
- `SPEC.md`: schema-backed V1 request/result contract;
- `EPIC.md`: completed TypeScript vertical-slice outcome and non-goals;
- `ROADMAP.md`: completed V1 phases and proposed future phases;
- `TASK.md`: evidence-backed delivery status;
- `CHANGELOG.md`: released runtime behavior and documentation history;
- `BENCHMARK.md`: measured baseline, no-timeout release gate, and explicit performance limitations;
- `RELEASE.md`: maintainer-controlled publication, verification, and recovery checklist;
- `skills/agent-symbol-search/SKILL.md`: reusable agent instructions distributed with the npm package.

Documentation for JavaScript, Python, and CFML MUST preserve the distinction between proposed/structured/heuristic support and confirmed semantic resolution. A future public release MUST repeat the clean-checkout, package, capability, schema, fixture, bounded-result, read-only, coverage, CI, registry, and platform-specific review gates. The next release SHOULD use npm trusted publishing and provenance rather than repeating the v0.1.0 local interactive process.
