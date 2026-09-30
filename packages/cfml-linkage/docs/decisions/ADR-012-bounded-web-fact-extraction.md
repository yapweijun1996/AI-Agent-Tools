# ADR-012: Use explicit bounded scanners for web-surface facts

> **Status: PROVISIONAL / M2 PARTIAL.** Fixture-backed HTML, JavaScript, CSS, SQL, and CFML redirect facts are implemented and verified; language-complete parsing and resolution remain open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-15 |
| Scope | Forms, redirects, fetch/AJAX, bounded CFScript linkage forms, CSS imports/assets, visible SQL tables, selected SQL statement forms, and client script assets |
| Source of truth | `src/web-scanner.js`, `src/fact-extractor.js`, `test/web-scanner.test.js`, `fixtures/golden/web-surface/`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed; mixed fixture Fact IR is deterministic and validates against the Fact IR schema, including inert CFScript linkage, named-argument forms, and quoted/CTE-safe SQL table-form coverage |
| Verification | Static strings/comments, dynamic targets, bounded nodes, HTML forms/assets, JavaScript calls, CSS references, SQL tables, and CFML redirect/query cases pass locally |
| Limitations | No browser execution, JavaScript/CSS/SQL grammar completeness, route semantics, or cross-file resolution exists |

## Decision

Keep web-surface extraction behind an explicitly injected parser backend. `createMixedStructuralScannerBackend()` composes the existing bounded CFML scanner with read-only web scanners selected by file extension and embedded HTML regions. The scanners emit evidence nodes only; `extractFactBundle()` maps them to existing Fact IR kinds without resolving targets.

The verified subset is:

- HTML `form` actions, stylesheet links, and external script assets;
- static and dynamic `fetch`, jQuery-style `ajax`, and `xhr.open` targets;
- CSS `@import` and `url()` references;
- visible SQL table references from `FROM`, `JOIN`, `UPDATE`, `INTO`, `REFERENCES`, DDL, and bounded `MERGE ... USING` forms, with semicolon-separated statements emitted as bounded nodes, quoted/schema-qualified identifiers normalized, declared CTE names excluded, and selected dialect maintenance statements and SQL `GO` batches handled; procedure calls remain non-table negative evidence;
- bounded static CFScript `include`/`cfinclude`, positional/named `location`, qualified `new`, positional/named `createObject("component", ...)`, named `cfobject`/`cfmodule`, qualified calls, and positional/named `invoke`/`cfinvoke` forms; named/positional `queryExecute` SQL arguments are also recognized.
- CFML `cflocation` redirects and `cfquery` datasource/table facts.

Comments and quoted code are skipped for the applicable lexical scanners. Dynamic or empty targets become `DYNAMIC_REFERENCE`; bounded web scanners emit `UNSUPPORTED_SYNTAX` because their coverage is not language-complete. SQL output contains normalized table names, not source text or execution results.

## Consequences

The analyzer can expose useful mixed-language evidence while remaining local, non-executing, deterministic, and fail-closed. These scanners are deliberately not replacements for verified language parsers. Broader syntax, browser routing, SQL semantics, and cross-file target resolution require separate fixtures and verification.
