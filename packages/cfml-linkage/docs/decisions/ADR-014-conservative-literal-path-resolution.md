# ADR-014: Resolve literal paths conservatively and retain unresolved states

> **Status: PROVISIONAL / T-024 VERIFIED.** Literal path and basic Application governance resolution is implemented and tested; Graph IR construction and broader resolvers remain open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Includes, custom tags, forms, redirects, fetch/AJAX, CSS assets, Application ownership, and request hooks |
| Source of truth | `src/path-resolver.js`, `src/fact-extractor.js`, `test/path-resolver.test.js`, this ADR, and `SPEC.md` |
| Evidence | `npm test`: 95 passed; literal fixtures resolve deterministically, vanished snapshot targets remain unresolved, and unsafe/dynamic/ambiguous paths remain explicit |
| Verification | Relative/root-relative paths, extension fallback, Application governance/hooks, ambiguity, missing paths, external targets, and traversal cases pass locally |
| Limitations | Full route semantics, broad parser coverage, engine behavior, and runtime execution remain unimplemented |

## Decision

`resolveLiteralPaths()` consumes immutable project indexes and an explicitly supplied root guard. It resolves only file-like literal Fact expressions. Relative paths are tried from the source directory; root-relative web paths are tried beneath the admitted project root; extension and index-file fallbacks are bounded and deterministic. Every candidate passes the root guard with `mustExist: true` and must be present in the snapshot path index before it can resolve; a target that disappears after snapshot creation remains unresolved rather than becoming a confirmed edge.

The resolver emits `confirmed` results for exact unique paths and `strong` results for bounded extension fallbacks. It emits unresolved records for dynamic expressions, external URLs, missing paths, ambiguous candidates, and out-of-root/traversal values. It never selects one candidate from an ambiguous set.

Application files are recognized only by the explicit `Application.cfc`/`Application.cfm` convention among discovered paths. The nearest unique application governs files in its subtree; known hook methods produce bounded request-hook relations. This is static convention evidence, not proof of runtime engine behavior.

## Consequences

Basic linkage evidence is now available without crossing the root boundary or conflating unresolved paths with parser errors. URL normalization and Application ownership are intentionally limited; mappings, route semantics, reverse edges, and Graph IR remain later responsibilities. Unresolved records are normal output and do not by themselves make a complete fact bundle incomplete.
