# ADR-019: Bounded Dynamic, Generated, and SQL Evidence

- **Status:** Accepted for the bounded T-033 scope
- **Date:** 2026-09-14
- **Decision owners:** Core analyzer boundary

## Context

Existing resolvers correctly refuse most dynamic paths and symbols, but the bounded scanner did not distinguish interpolated SQL table identifiers from literal identifiers, and opaque CFScript did not retain an explicit `evaluate` signal. Generated scope names and dynamic datasources therefore needed an evidence-preserving contract rather than target guessing.

## Decision

1. Detect only bounded CFML interpolation at a statically recognized SQL table position; skip SQL comments and quoted strings, retain the bounded expression, and never treat it as a table node. Static quoted/schema-qualified identifiers may be normalized, but declared CTE names are not treated as base-table Facts.
2. Retain dynamic datasource metadata on query facts and emit `QUERY_USES_DATASOURCE` as unresolved `DYNAMIC_EXPRESSION` evidence.
3. Classify dynamic scope assignment targets and opaque CFScript containing a code-level `evaluate(...)` call as `GENERATED_SYMBOL` evidence. Comments and strings do not create the signal.
4. Materialize dynamic/generated/SQL-dynamic facts in Graph IR as unresolved records with their source spans, relation types, expressions, and empty candidate lists. No dynamic target is promoted to an edge.
5. Keep parser incompleteness visible; this is a lexical preservation boundary, not full CFScript or SQL grammar support.

## Consequences

- Agents can inspect why a relationship is unresolved without mistaking an interpolated identifier for a confirmed table or symbol.
- Static SQL tables remain eligible for normal syntax edges when present alongside dynamic identifiers.
- `evaluate`, generated names, dynamic URLs/mappings, and dynamic SQL remain non-authoritative; runtime behavior and candidate inference remain outside this task.

## Verification

- `test/dynamic-evidence.test.js` uses the inert `fixtures/adversarial/dynamic-and-generated/` case to verify deterministic Fact/Graph output, dynamic/generated reason codes, dynamic SQL table and datasource evidence, comment/string filtering, no guessed SQL edges, and Graph validation.
- `npm test` reports 95 passed; syntax, JSON/manifest, Markdown-link, prompt-length, conservative credential-pattern, and diff checks remain required repository gates.
