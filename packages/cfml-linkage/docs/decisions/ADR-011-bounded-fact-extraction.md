# ADR-011: Extract only fixture-backed structural Fact IR

> **Status: PROVISIONAL / M2 PARTIAL.** Bounded CFML structural Fact IR extraction is implemented and verified; full language extraction and cross-file resolution remain open.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | FILE, CFML/CFC structural, mapping, include, invocation, instantiation, condition, control-flow, scope-write, and dynamic facts |
| Source of truth | `src/fact-extractor.js`, `src/cfml-scanner.js`, `test/fact-extractor.test.js`, `fixtures/golden/expected-facts-v0.1.json`, this ADR, and `SPEC.md` |
| Evidence | Produced fixture Fact IR validates against the Fact IR schema and repeats identically; current `npm test` includes the bounded extraction and query CLI regression suite |
| Verification | Golden structural expectations, dynamic/opaque cases, switch/case condition evidence, bounded control-flow facts, missing parser results, fact limits, and schema validation pass locally within the 95-test suite |
| Limitations | Full HTML/JavaScript/CSS/SQL grammar, full CFML grammar, broader cross-file resolution, and runtime semantics remain outside this bounded Fact slice |

## Decision

The Fact extractor consumes snapshot metadata and parser-adapter results only. It emits parser-independent Fact IR and never resolves a target across files. The verified bounded subset includes:

- `FILE` facts for discovered files;
- CFML/CFC `COMPONENT` and `METHOD` facts;
- literal `INCLUDE`, `CUSTOM_TAG`, `INSTANTIATE`, `INVOKE`, and `MAPPING` facts;
- structural `SCOPE_WRITE`, `CONTROL_FLOW`, and runtime `CONDITION` facts;
- `DYNAMIC_REFERENCE` facts when a required value is missing, interpolated, or truncated.

Facts use deterministic IDs derived from file, kind, extraction rule, source span, and local ordinal. Files, facts, and diagnostics are sorted by the contract keys. Parser diagnostics are retained, incomplete parser results make the bundle incomplete, dynamic facts are not promoted to resolved edges, and a fact limit is explicit incomplete evidence.

## Consequences

The current product can establish inspectable structural evidence from inert CFML fixtures without pretending to understand arbitrary CFScript or dynamic behavior. The bounded scanner and extractor are intentionally not a general language implementation. New language families and broader syntax require separate fixture-backed extraction rules and must preserve the Fact IR, evidence, and fail-closed contracts.
