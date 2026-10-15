# Prospective SQL contract

These files are Stage 0 design fixtures, not an applied production migration.
Run only on NEW disposable SQLite databases. [Effective contract](../docs/CONTRACT.md)
requires strict schema validation before persistence plus actual observed runtime proof.
`001_initial.sql` enforces lifecycle, immutable identity, version increments, full origin
admission binding, typed required/closed intent fields, current recovery observations,
lease action arithmetic and same-operation completion joins. JSON Schema owns complete
nested-array item shape, lexical patterns, hashes and cross-field content checks beyond
these relational guards. SQL cannot authenticate OS processes, refs, signatures or facts.
Current recovery grants may differ in epoch/fence from immutable origin in the same
incarnation; backup activation starts a new domain and cannot transfer old live ownership.

The migration includes no provider/Core/Git behavior. Driver migration checksums,
registry/workflow atomic activation reconciliation and real persistence faults remain
runtime gates. Separate registry and guard databases must not be merged into workflow.
