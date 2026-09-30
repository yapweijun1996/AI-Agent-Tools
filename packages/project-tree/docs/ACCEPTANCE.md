# MVP Acceptance and Verification

Acceptance criteria:
- Public repository initialized without overwriting an existing repository.
- `aptree context --root .` emits valid JSON with `meta` and `graph`.
- Query paths outside root are rejected.
- Static package/test evidence is exposed without target command execution.
- Public JSON schema is packaged and representative command envelopes validate against it.
- Tests pass with `npm test`.
- Smoke validation passes with `npm run smoke`.
- Package can be packed and installed for a smoke run.

Latest verified MVP evidence:
- `npm test` — pass (10 tests).
- `npm run smoke` — pass; emitted valid `graph` + `meta`.
- `npm pack --dry-run` — pass; includes `schemas/aptree.schema.v1.json`, docs, bin, src; no large/sensitive junk observed.
- Local packed-package consumer smoke with `npm install --ignore-scripts` and installed `aptree context` — pass.
- Schema compatibility tests validate all public command envelope shapes and negative/additive fixtures — pass.
- `git diff --check` — pass.

No push, PR, merge, npm publish, release, or deployment has been performed for the MVP verification above.
