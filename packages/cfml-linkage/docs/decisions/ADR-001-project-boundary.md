# ADR-001: Keep linkage CFML-first, static, and separate from generic impact analysis

> **Status: PROPOSED / BOUNDARY VERIFIED.** This decision remains design intent for the complete analyzer; the local foundation and bounded scanner controls are verified.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Product boundary and ownership of linkage evidence |
| Source of truth | This ADR for the decision; `SPEC.md` for the contract; Git history for implementation facts |
| Evidence | Initial commit `1b29c0b` contained only `.gitattributes`; current local source enforces the boundary in root, snapshot, parser/scanner, and Fact slices |
| Verification | Root containment, no-execution, deterministic, and bounded parser/scanner/Fact tests pass locally; full linkage verification remains open |
| Limitations | Parser coverage, resolver feasibility, integration contracts, and compatibility remain unknown |

## Context

CFML application behavior is distributed across `.cfm`, `.cfml`, `.cfc`, Application files, includes, custom tags, HTML, JavaScript, CSS, SQL, and shared scopes. Agents need cross-file relationships, but runtime execution and unconstrained inference would create safety and trust problems. A generic impact engine also needs a narrower evidence provider rather than another source of inferred business priority.

## Decision

Build `agent-cfml-linkage` as a **CFML-first, deterministic, read-only, local-first, non-executing static linkage analyzer**.

The first scope includes:

- CFML/CFC structure, includes, custom tags, Application governance, mappings, inheritance, methods, and shared scopes;
- statically visible HTML forms and redirects;
- JavaScript AJAX/fetch flows and known wrappers;
- bounded CSS imports/assets;
- statically visible SQL tables/datasources and structurally evidenced repository actions;
- explicit evidence, confidence, conditions, dynamic flags, and unresolved records;
- a stable Graph IR and bounded query interface.

The analyzer must not execute CFML/JavaScript/SQL, access networks or databases, use LLM output as authoritative linkage, guess dynamic targets, or own generic impact ranking and test selection.

## Alternatives considered

### Build a runtime tracer

Rejected for V1 because it requires execution, environment access, credentials, representative requests, and can miss unobserved paths. Runtime evidence may be a future complementary product, not the static analyzer's boundary.

### Analyze only single-file CFML

Rejected because includes, CFC calls, Application mappings, forms, AJAX, and shared scope are the relationships agents need most. Single-file structural checking remains a separate useful product boundary.

### Use regex and filename similarity as the primary resolver

Rejected because it produces false links around dynamic expressions, ambiguity, comments/strings, and framework conventions. Small lexical recognizers may supplement parser evidence but cannot override it.

### Merge with `agent-change-impact`

Rejected because linkage evidence and generic impact reasoning have different owners, contracts, and failure semantics. Integration may consume this graph later.

## Consequences

Positive:

- results are inspectable, reproducible, and safe to run on untrusted local source;
- ambiguity and missing runtime information remain visible;
- the Graph IR can support multiple downstream agent workflows;
- parser and resolver implementations can evolve behind stable boundaries.

Costs and risks:

- dynamic CFML and runtime-computed mappings will remain unresolved;
- correctness depends on parser and fixture coverage;
- mixed-language parsing and shared-scope flow are complex;
- static SQL and routes cannot establish runtime or security correctness;
- evidence and completeness metadata increase implementation and test cost.

## Revisit conditions

Revisit this ADR only if a separately authorized design demonstrates a need for runtime evidence, broader language scope, plugin execution, or a change in ownership. Any change must update the specification, architecture, security model, tests, roadmap, and release policy together.
