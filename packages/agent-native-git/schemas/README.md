# Effective machine contracts

Draft 2020-12 schemas are offline-addressed by reserved example.invalid IDs; the validator
registers local resources and rejects unknown references without network access.
The single source is [CONTRACT.md](../docs/CONTRACT.md). JSON Schemas constrain shapes;
SQL constrains transitions/provenance; actual Core/OS/Git proof remains a runtime gate.
Every journal intent and observation variant is closed. No arbitrary JSON payload can hide
missing per-kind recovery inputs. Observer authority is distinct from immutable origin.
Removed attempt states have no aliases. `task-create` permits queued version zero only;
read projections can represent completed tasks only with completion operation identity.

Patterns do not establish filesystem permission, scope, OID existence or authenticity.
Full tuple old/new equality, grant arithmetic, required-check set equality and environment
hash correctness require relational/semantic enforcement. Offline fixtures are not product
tests; use `python scripts/validate-contracts.py` from the destination after all slices land.
