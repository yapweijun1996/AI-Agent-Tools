# Contract fixtures and product acceptance

[Effective contract](../docs/CONTRACT.md) is the only normative source.
[test-cases.json](test-cases.json) retains all 64 baseline scenario IDs and invariants.
[acceptance-map.json](acceptance-map.json) maps every scenario and CR-T01..CR-T18.
The offline validator does not execute that full-product catalog. [Fault injection](FAULT_INJECTION.md)
preserves FI-01..FI-16; static schema and disposable SQL fixtures establish only bounded constraints.
Actual Stage 1/2 runtime regressions are separate `*.test.mjs` consumers, described below.

[Schema fixtures](schema-fixtures.json) and [review boundary fixtures](schema-review-fixtures.json)
are both mandatory validator inputs. Shared enum regressions resolve the actual common
definition, not a copied enum. Both [SQL fixtures](sql-fixtures.json) and
[SQL review boundaries](sql-review-fixtures.json) run in fresh disposable databases.
Review boundaries cover contradictory termination proofs; full-current-grant replacement
and renewal; promoted review retaining its slot/phase floor; pre-rotation settlement;
ordered/exact source membership; selected-evidence completeness; matching phase observations;
and bound cursor requests with rejected bare numerical replay options.

Parent run (existing Python with jsonschema/referencing; no installation/network):

```powershell
python scripts/validate-contracts.py
```

The validator rejects missing/invalid schemas, duplicate JSON keys, broken local references,
fixture expectation mismatches and SQL semantic guard failures. It uses NEW TemporaryDirectory
SQLite databases per case and always closes/cleans them. stdout is current run evidence only,
never a prewritten report. No product/Core/provider behavior is mocked as successful.

SQL negatives require a constraint rejection and unchanged logical database rows before
the harness rolls back its savepoint; syntax/driver errors do not count as rejection.
Internal trigger wording is not a consumer contract. Only normative consumer-visible
codes, such as IDEMPOTENCY_CONFLICT, have wording assertions. The immutable-intent case
first establishes an admissible observation/phase/version context and a successful
non-mutating projection update, then rejects mutation and checks the retained intent,
hash, phase and version.

## Actual runtime regressions

With the pinned Node24.21.0 Windows x64 runtime and built native assets:

```powershell
npm test
npm run verify
```

`npm test` compiles the owned inert native fixture and runs the actual behavioral
consumers serially. `npm run verify` also builds/typechecks the source, validates
offline contracts, and exercises an offline installed package with installer scripts
disabled. Neither command authorizes real Codex/Claude/Pi execution, network use,
services, publication, or changes to an existing owner repository.

Lifecycle consumers use newly allocated owner-private fixtures, actual Git
worktrees and actual native processes. Durable-start gates delay the real callback
or capture without replacing Git results or termination proof. Fresh read-only
SQLite projection observers avoid repeated native admission work on the same event
loop; public CLI assertions still verify the visible outcome.

Case, foreground-consumer and aggregate observation ceilings accommodate measured
native inspection cost. They do not increase production Git, lease, execution,
output or native watchdog budgets. A timeout is not termination evidence. Unknown
owned attempts, effects and interrupted consumers remain preserved rather than
being deleted, adopted or stopped by PID.

Current exercised outcomes, historical failures and remaining limits belong in
[VALIDATION](../VALIDATION.md), not in prewritten success reports or full-product
catalog completion claims.
