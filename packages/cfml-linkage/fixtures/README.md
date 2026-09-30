# Fixture baseline

> **Status: VERIFIED / INERT FIXTURE BASELINE.** This directory defines inert inputs and expected-behavior categories for scanner/Fact/parser/resolver tests. Nothing here is executed.

| Field | Value |
| --- | --- |
| Version | 0.1 |
| Last updated | 2026-09-14 |
| Scope | Golden, negative, and adversarial fixture organization |
| Source of truth | `manifest-v0.1.json` and each fixture's README |
| Evidence | T-006 layout/manifest invariant check plus T-021/T-022/T-032/T-033/T-034/T-041 bounded Fact/flow/dynamic-evidence/SQL-repository/adversarial fixture checks and T-023 immutable-index checks |
| Verification | Layout/manifest consistency, bounded CFML/web Fact behavior, T-032 web-flow/condition behavior, T-033 dynamic/generated/SQL-dynamic behavior, T-034 SQL/repository behavior, and T-041 adversarial safe-failure behavior checked; broader resolver/runtime behavior remains unverified |
| Limitations | Broader resolver golden outputs, SQL semantics, and engine/runtime behavior remain unverified |

## Layout

```text
fixtures/
  golden/       expected supported static relationships
  negative/     safe handling of malformed, ambiguous, or rejected input
  adversarial/  dynamic, misleading, resource, and boundary cases
  manifest-v0.1.json
```

Each case has a stable ID, category, input directory, expected analysis state, and covered contract requirements. Expected results must assert evidence, confidence, unresolved records, diagnostics, ordering, and completeness—not only edge counts.

The fixture corpus is inert test data. Future test runners must parse it as data and must never execute CFML, JavaScript, SQL, application hooks, or browser behavior.
