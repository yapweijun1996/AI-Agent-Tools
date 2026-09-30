# Adversarial fixtures

> **Status: VERIFIED / INERT ADVERSARIAL FIXTURES.** These cases exercise trust, resource, and dynamic-expression boundaries; no input is executed.

| Case | Coverage | Expected state |
| --- | --- | --- |
| `dynamic-and-generated` | `evaluate`, generated names, dynamic URLs, dynamic SQL identifiers, runtime mappings | Verified bounded unresolved records with preserved expressions; no guessed target |
| `misleading-and-limits` | Syntax-like text in comments/strings, include cycles, oversized files, graph/output budgets, snapshot drift | No false syntax facts; bounded incomplete result with explicit diagnostics |

The `dynamic-and-generated` case has an inert source and expected bounded output for T-033. The `misleading-and-limits` case now adds comment/string filtering and an include cycle; resource-limit behavior remains separately covered by bounded tests.
