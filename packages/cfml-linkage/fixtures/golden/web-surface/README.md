# Web-surface golden fixture

> **Status: VERIFIED / T-022 BOUNDED SUBSET.** These inert mixed-language inputs exercise structural form, client-call, CSS, and visible SQL facts. They are never executed.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | HTML form/assets, JavaScript fetch/AJAX, CSS references, and visible SQL tables |
| Source of truth | These inputs and `expected-web-facts-v0.1.json` |
| Evidence | `test/web-scanner.test.js`, `test/fact-extractor.test.js`, and produced Fact IR schema validation |
| Verification | Mixed structural scanner and Fact IR expectations pass locally |
| Limitations | Dynamic client code, browser routing, SQL semantics, and cross-file resolution remain unresolved |

The files contain only static strings and inert syntax. The expected facts preserve targets as evidence; they do not assert that a browser request or database query succeeds.
