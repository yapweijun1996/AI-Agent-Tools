# Negative case: ambiguity and out-of-root

> **Status: VERIFIED / INERT INPUT.** The bounded resolver preserves ambiguity and rejects path escape evidence without guessing.

Coverage: duplicate components, ambiguous mappings, and path escape attempts. `page.cfm`, the duplicate/mapped CFCs, and `expected-negative-v0.1.json` verify candidate-bearing `AMBIGUOUS_COMPONENT` records and `OUTSIDE_ROOT` include evidence.
