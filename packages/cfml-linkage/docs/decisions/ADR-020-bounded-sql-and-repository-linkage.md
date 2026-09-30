# ADR-020: Bounded SQL and Structural Repository Linkage

- **Status:** Accepted for the bounded T-034 scope
- **Date:** 2026-09-15
- **Decision owners:** Core analyzer boundary

## Context

The bounded scanner already exposes visible SQL tables and literal datasources, while T-033 preserves interpolated identifiers and dynamic datasources as unresolved evidence. The graph contract also includes repository/action nodes and `CALLS_REPOSITORY`, but repository naming conventions cannot establish a safe relationship.

## Decision

Implement T-034 with two narrow boundaries:

1. Extract table identifiers and datasource metadata from bounded `cfquery` and literal-first-argument `queryExecute` structures. Emit bounded semicolon-separated statement nodes, normalize quoted/schema-qualified identifiers, exclude declared CTE names from table Facts, and keep SQL parsing lexical and syntax-only; do not access a database or claim joins, writes, authorization, tenant isolation, or runtime behavior.
2. Create `REPOSITORY_ACTION` Fact records only for CFC methods that contain one or more query Facts. Resolve `CALLS_REPOSITORY` only from an existing unique `CALLS_METHOD` resolution to exactly one such action. Require explicit call and query evidence; filenames, class names, and naming similarity are not evidence.
3. Retain dynamic SQL/datasource expressions as unresolved records, preserve source spans and bounded expressions, and never promote them to table, datasource, or repository edges.
4. Keep the resolver read-only, deterministic, capped by `maxRecords`, and independent of parser-specific ASTs or application execution.

## Consequences

- Literal `cfquery`/`queryExecute` tables and datasources can become evidence-backed Graph nodes and syntax edges; standalone SQL files expose one bounded query node per semicolon-separated statement or SQL Server-style `GO` batch; procedure calls are not promoted to table Facts.
- A repository action is an inspectable structural classification, not proof of repository semantics or runtime dispatch.
- A CFC named `Repository` without query evidence does not become a repository action.
- Incomplete parser evidence remains incomplete even when bounded SQL/repository edges are emitted.

## Verification

- `test/repository-resolver.test.js` uses the inert `fixtures/golden/sql-and-repository/` case to verify `cfquery` and `queryExecute` extraction, datasource separation, structural action Facts, unique method-call linkage, repeated Graph output, output limits, and filename-only non-evidence.
- `npm test` reports 95 passed; quoted/schema-qualified and CTE-safe SQL cases, produced Fact/Graph output, and local contracts pass, and no source is executed.

## Limitations

The implementation does not parse full CFML/CFScript or SQL grammar; T-057 only adds bounded static CFScript forms and selected SQL table keywords/identifier forms and bounded dialect maintenance statements. It does not infer repository methods from names, resolve dynamic SQL, access database metadata, or prove application behavior. Broader SQL semantics and query operations remain open.
