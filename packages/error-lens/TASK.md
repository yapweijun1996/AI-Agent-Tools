# Agent Error Lens Task Backlog

Last reviewed: 2026-09-13

Statuses: `Ready`, `In progress`, `Blocked`, `Done`. A task is `Done` only when its acceptance criteria and listed verification are satisfied. Product delivery axes remain separate in `PROGRESS.md`.

## Active backlog

| ID | Priority | Status | Task | Depends on | Done when | Evidence |
| --- | --- | --- | --- | --- | --- | --- |
| T-000 | P0 | Done | Establish eight Core SSOT documents | None | All files exist, agree on scope/status, and pass the documentation audit | Eight files; 32-item/10-task/prompt-length/fence/whitespace/status checks passed |
| T-001 | P0 | Done | Freeze executable V0.1 contract | T-000 | Schemas/types/examples validate; IDs, offsets, redaction, paths, status, budgets, CLI exits, package and compatibility decisions are explicit | `contract/verify-contract.mjs`; Ajv draft-2020-12 validation; strict TypeScript compile; architecture/security review |
| T-002 | P0 | Done | Build Golden and adversarial fixture corpus | T-001 | Required producer, structural, failure, security, determinism, and agent-facing fixtures exist with expected outputs | `node scripts/check-fixtures.mjs`; 23 cases and 6 families pass inventory/shape checks |
| T-003 | P0 | Done | Scaffold npm library/CLI package | T-001 | Manifest, build, typecheck, lint, schema/type drift check, shared entry points, test harness, and dependency baseline pass | `npm test`; `npm run pack:check`; clean consumer import; packed CLI smoke |
| T-004 | P0 | Done | Implement bounded normalization core | T-002, T-003 | Validation, budgets, ANSI/newline mapping, paths, redaction, and generic structured parsing pass fixtures | `npm test`; bounded-core tests; packed CLI/library structured smoke |
| T-005 | P0 | Done | Implement V0.1 producer adapters | T-004 | TypeScript, Vitest, ESLint, generic fallback, and mixed producer cases pass positive and negative fixtures | `npm test`; 23 materialized fixture results schema-valid; adapter fixture assertions pass |
| T-006 | P0 | Done | Implement canonical output and interfaces | T-004, T-005 | IDs, dedup, ordering, serialization, summaries, statuses, CLI/library parity, and real exit codes pass | `npm test`; 18 tests; repeated-process byte parity; producer-outcome/CLI exit evidence |
| T-007 | P0 | Done | Complete source and package verification | T-006 | Full matrix, cross-platform CI, tarball inspection, clean consumer import, packed CLI, and agent E2E pass | Local capability/resource/package checks, Node 20.11/22/24 Alpine clean-install matrix, agent-facing CLI E2E, and exact-HEAD remote run `34731128500` pass |
| T-008 | P1 | In progress | Prepare and verify first release | T-007 | Authorized version/tag/release/registry state agree and integrity plus `gitHead` readback pass | README, CHANGELOG, ADR, release runbook/workflow, npm metadata, and 73-file package inspection are implemented and locally verified; npm ownership, tag, release, registry, and `gitHead` evidence remain required |
| T-009 | P1 | Done | Synchronize project and company KB status | T-000, T-001 | One canonical status record reflects current design state without claiming implementation | Existing company status item `51a18a7f-4b7a-4b7c-957f-75980ee7e640` updated in place with company sharing; status and ecosystem item `5e5c8c5e-c3e9-460d-a985-3165e0b83031` read back |

## T-001 — Completed contract-hardening task

Goal: convert the Draft specification into an executable, reviewable contract before parser code. This task is complete for the contract boundary; it does not claim parser/package implementation.

Work:

1. Define one JSON Schema source of truth for request, result, producers, diagnostics, evidence, issues, warnings, truncation, summaries, and stats.
2. Select JSON Schema as authoritative; keep TypeScript as a checked projection and add automated drift checking during package scaffolding.
3. Freeze full SHA-256 diagnostic IDs and fail-closed collision behavior.
4. Freeze deduplication identity, evidence union, null ordering, severity ordering, Unicode/newline policy, and canonical JSON key order.
5. Freeze UTF-16 raw offset mapping behavior for ANSI and CRLF transformations.
6. Freeze secondary work budgets for lines, matches, terminal sequences, producer candidates, and total evidence.
7. Freeze lexical path behavior for Unix, Windows, rootless, contained, escaping, and ambiguous paths.
8. Freeze redaction replacement `[REDACTED]`, bounded secret patterns, benign-neighbor behavior, and sanitized identity hashing.
9. Freeze CLI usage, stdin, stdout/stderr, process exits, and producer-outcome behavior.
10. Freeze ESM-only Node `>=20.11.0 <25`, zero runtime dependency target, package contents as a release allowlist, package-name ownership gate, and MIT license.

Verification:

- `node contract/verify-contract.mjs` validates positive/negative examples, cross-field invariants, ID hashing, UTF-16 evidence ranges, byte stats, and canonical key order;
- Ajv draft-2020-12 validation accepts both valid examples and rejects both invalid examples with `--strict=false` for the documented vendor metadata keyword;
- temporary TypeScript compiler validates the type projection and compile-time examples;
- deterministic serialization and package/compatibility decisions are recorded in `SPEC.md` and schema metadata;
- architecture/security review against `GOAL.md` and `DESIGN.md` completed;
- second-pass contradiction review across all eight Core SSOT files completed.

## T-002 — Completed fixture baseline

Goal: establish a deterministic Golden/adversarial input inventory before normalization and producer implementation.

Work:

1. Add 21 fixture cases covering TypeScript, Vitest, ESLint, generic structured/text input, mixed streams, ANSI/CRLF, paths, multiline/nested output, malformed/unsupported/truncated/oversized input, incomplete traces, redaction, benign token metrics, repeated determinism, and agent-facing location/evidence use.
2. Keep expected values as reviewed assertions rather than complete parser results, so the corpus cannot claim unimplemented behavior as verified.
3. Add deterministic repeat generators for long-line and excessive-diagnostic boundary cases without storing oversized raw fixtures.
4. Add a no-dependency corpus checker for unique IDs, required families, schema-shaped inputs, bounds, determinism partners, and security-safe placeholders.

Verification:

- `node scripts/check-fixtures.mjs` passes with 23 cases and 6 families;
- `npm test` includes the fixture check alongside contract, typecheck, lint, build, and package smoke checks;
- fixture documentation explicitly states that corpus validation is not parser behavior evidence.

## T-004 — Completed bounded normalization core

Goal: implement the smallest read-only core that validates bounded requests, normalizes terminal/newline input, preserves raw UTF-16 evidence, handles lexical paths, redacts exported values, and parses documented generic structured diagnostics.

Work:

1. Add strict runtime request validation for schema version, closed-world fields, artifact identity/streams, Unicode, UTF-8 byte ceilings, producer outcome, and explicit root options.
2. Add deterministic line, terminal-sequence, parser-match, producer-candidate, evidence-span/aggregate, and diagnostic ceilings with ordered truncation reasons.
3. Normalize CRLF/CR to LF and strip bounded terminal sequences while maintaining normalized-to-raw UTF-16 boundary maps.
4. Add lexical Unix/Windows path normalization and explicit-root containment without filesystem access.
5. Add bounded redaction for authorization, key/token/password/database/signed-URL values while preserving benign token metric names.
6. Parse a documented JSON diagnostics array as `generic-structured`, create contract-valid stable IDs, deduplicate repeated identities, and return explicit partial/unsupported results for malformed or unsupported text.

Verification:

- `npm test` passes contract/schema drift, fixture corpus, strict typecheck, lint, build, and 10 Node tests;
- bounded-core tests cover structured evidence, ANSI/CRLF mapping, rooted Unix/Windows paths, outside-root withholding, malformed input, line limits, redaction, benign metrics, envelope ordering, and invalid requests;
- temporary Ajv draft-2020-12 validation accepts a real generic-structured library result against the authoritative schema;
- packed CLI/library smoke returns the same structured diagnostic boundary and preserves machine-readable output.

## T-005 — Completed V0.1 producer adapters

Goal: extract evidence-backed diagnostics for the approved TypeScript, Vitest, ESLint, and generic-text families without adding execution or reasoning capabilities.

Work:

1. Add fixed-priority adapters for TypeScript location diagnostics and bare compiler diagnostics, Vitest assertion traces, ESLint file/line/rule output, and conservative generic text candidates.
2. Preserve `confirmed` confidence for exact producer syntax and use `candidate`/`unknown` only for generic text or incomplete/truncated evidence.
3. Treat npm/pnpm/yarn wrapper lines as non-producer context so nested Vitest remains attributed to Vitest.
4. Reuse the shared evidence mapping, diagnostic factory, path containment, redaction, budget, deduplication, and canonical ordering boundaries.
5. Recognize bounded metadata-only security/metric lines without exporting raw sensitive values or inventing diagnostics.

Verification:

- `npm test` passes contract/schema drift, fixture inventory, strict typecheck, lint, build, and 14 Node tests;
- adapter tests assert all five producer families, ANSI/CRLF, mixed streams, Windows paths, multiline/nested attribution, malformed/unsupported/truncated/incomplete failures, security, determinism, agent-facing location/evidence, long-line, and diagnostic caps;
- temporary Ajv draft-2020-12 validation accepts all 23 materialized fixture results;
- packed CLI/library smoke and representative fresh-process adapter runs pass.

## Deferred decisions that do not block implementation

T-001 closed the executable parser/package defaults. The following decisions are deliberately deferred because they affect legal or release authority rather than local contract implementation:

- MIT was selected by the user on 2026-09-13 and implemented in `LICENSE`, `package.json`, `package-lock.json`, and the authoritative contract metadata;
- final npm name ownership and availability remain a T-008 release check; registry lookup on 2026-09-13 returned 404 for `agent-error-lens`.

## T-006 — Completed canonical output and interfaces

Goal: make the existing parser result canonical at the library and CLI boundaries without adding producer or reasoning scope.

Work:

1. Add an explicit serializer with schema-defined object key order, NFC strings, compact JSON, LF, and one trailing newline.
2. Make producer, issue, warning, diagnostic, and evidence ordering explicit and locale-independent; preserve deterministic deduplication and evidence union.
3. Tighten CLI option handling so unknown and duplicate options are usage failures while valid parsing continues to share the library core.
4. Preserve the distinction between producer outcome and Error Lens process status: complete/partial results exit 0, parser errors exit 1, usage errors exit 2.

Verification:

- `npm test` passes contract/schema drift, fixture inventory, strict typecheck, lint, build, and 18 Node tests;
- interface tests cover duplicate identity/evidence union, NFC/key order/trailing newline, repeated-process byte equality, CLI/library byte parity, producer failure isolation, partial/error exits, and usage errors;
- representative producer, structural, failure, security, determinism, and agent-facing fixture assertions remain green;
- exact materialized fixture outputs remain schema-valid under temporary Ajv draft-2020-12 validation.

## T-007 — Completed source and package verification

Goal: close local security, resource, capability, and package-boundary evidence before relying on remote CI or release evidence.

Work completed:

1. Add fail-closed tests for CLI transport, per-artifact and aggregate byte budgets, processed lines, parser matches, terminal sequences, and evidence spans.
2. Add a static core capability audit rejecting network, subprocess, dynamic-code, and worker-thread imports/calls from the parsing path.
3. Add a deterministic package allowlist audit for private ESM metadata, zero runtime dependencies, required entrypoints, declarations, and packed contents.
4. Add Linux/macOS/Windows × Node 20.11/22/24 GitHub Actions verification configuration and make build/test/package scripts Windows-safe.
5. Diagnose the first remote matrix failure and make the npm test discovery and npm pack dry-run invocation portable under Windows PowerShell and npm lifecycle environments.
6. Harden the shared Unicode predicate and diagnostic factory so nested structured records reject lone surrogates and unsafe coordinates before stable identity creation.
7. Close the observed standalone `sk-proj-` provider-token redaction gap and extend the security fixture without broadening the parser boundary.
8. Convert package allowlist evidence into a real temporary tarball consumer/import/CLI smoke audit with deterministic cleanup.
9. Align structured/factory string bounds with the schema's Unicode code-point length semantics.
10. Cover both colon and equals delimiters for Bearer Authorization redaction.
11. Fix Vitest multi-failure fallback attribution so each locationless message uses the nearest preceding failed test file.
12. Fix ESLint file-header detection so slash-containing rule names cannot replace the current file path.
13. Preserve malformed CLI request options when applying `--root` so library validation remains authoritative.
14. Strip Vitest suite/test title suffixes from `FAIL` headers before locationless fallback attribution.
15. Apply redaction before final contract bounds so replacement expansion cannot produce invalid exported fields.
16. Cover common composite credential keys and non-Bearer Authorization schemes without leaking values.
17. Cover underscore-delimited environment credential keys and Authorization aliases without leaking values.
18. Enforce strict runtime stream types and keep error-result byte bounds sourced from the shared limits model.
19. Redact quoted Authorization scheme values while preserving the scheme and quote delimiter.
20. Redact JSON-style quoted credential keys inside exported diagnostic messages.
21. Aggregate all supported producer adapters within one artifact before generic fallback.
22. Mark incomplete terminal sequences as fail-closed mapping truncation.
23. Cover prefixed environment credential keys inside quoted JSON-style diagnostic messages.
24. Make quoted-key redaction idempotent without consuming JSON structural delimiters.
25. Pin the ESLint parser toolchain to a Node 20.11-compatible version after clean-install verification exposed a transitive engine mismatch.

Verification:

- `npm test` passes 29 Node tests, capability audit, package allowlist audit, typecheck, lint, build, contract drift, and fixture checks;
- the exact HEAD also passes `npm ci --ignore-scripts --no-audit --no-fund --offline` followed by the full suite in network-isolated `node:20.11.0-alpine`, `node:22-alpine`, and `node:24-alpine` Linux containers; the archived workspaces use the host npm cache only for offline package acquisition and a container-local writable cache for package smoke, so this still does not replace the GitHub Windows/macOS runners or the full approved matrix;
- after pinning `@typescript-eslint/parser` to `8.40.0`, the same Node 20.11.0/22/24 clean-install matrix resolves `eslint-visitor-keys@4.2.1` without the prior Node 20.11 engine warning; npm still reports the non-blocking deprecation notice for `eslint@9.39.5`;
- the Node 20.11.0/22/24 archived-workspace matrix also passes with `npm_config_engine_strict=true`, proving that the declared minimum Node version has no install-time engine mismatch; the ESLint deprecation notice remains non-blocking;
- `check-package` creates a real tarball in a temporary directory, installs it into a temporary consumer with scripts/audit disabled, imports the public package, runs the packed CLI, and cleans up on success or failure;
- the CLI-to-downstream-locator-to-raw-evidence handoff passes as a local agent-facing E2E;
- `npm run pack:check` and `npm audit --omit=dev` pass locally after the Windows remediation;
- bounded CLI stdin decoding rejects invalid UTF-8 and oversized input before JSON parsing;
- structured records reject escaped lone surrogates and unsafe line/column values with bounded partial results;
- standalone `sk-proj-` provider-token values are absent from exported diagnostics and their stable IDs are based on sanitized fields;
- Authorization scheme values, common composite credential keys, and underscore-delimited environment credential keys are redacted for both `Authorization:` and `Authorization=` forms;
- astral Unicode values at structured string bounds are accepted according to code-point limits, while evidence remains UTF-16-offset based;
- Vitest messages without location lines are attributed to the nearest preceding `FAIL` block, with a two-failure regression fixture;
- ESLint rule names containing `/` do not replace the current file header, with a slash-rule regression fixture;
- CLI `--root` injection does not overwrite malformed `options` values, and the shared library returns the expected request error;
- Vitest `FAIL file > suite > test` headers retain only the file path for locationless fallback diagnostics;
- redaction expansion beyond diagnostic bounds rejects the diagnostic, while oversized optional producer-outcome fields are omitted safely;
- direct library input rejects coercible non-string artifact streams, and error-result byte statistics use the shared request limit;
- quoted and unquoted Authorization values are redacted for both colon and equals delimiters while preserving the scheme and quote delimiter;
- JSON-style quoted `Authorization` and credential key names are redacted inside exported diagnostic messages;
- a single mixed artifact preserves TypeScript, ESLint, and Vitest producer identities and diagnostics in deterministic evidence order;
- an incomplete ANSI CSI/OSC sequence returns `partial` with `mapping-failure` rather than appearing complete;
- quoted environment keys such as `AWS_SECRET_ACCESS_KEY` are redacted even when the sensitive key segment has a prefix;
- repeated redaction passes preserve `[REDACTED]` markers and JSON closing delimiters without duplicating or truncating content;
- already sanitized quoted and unquoted marker forms remain byte-stable on a second parse;
- historical remote run `34709741735` at SHA `582c6901eea0e7131853e7af0837686184bbd53d` passed Linux/macOS jobs but failed Windows jobs: Node 20 could not resolve `test/*.test.mjs` under PowerShell, while Node 22/24 reported `npm pack dry-run failed`;
- the remediation changes `npm test` to `node --test` and invokes the lifecycle npm CLI through `npm_execpath` when available;
- exact-HEAD remote run `34731128500` at SHA `8a898718cee93c6046f4ec1d59bd7352cd73af8b` passed all 9 Node/OS jobs across Node 20.11.0, 22, and 24 on Ubuntu, macOS, and Windows, including the verification suite and MIT-aware package-boundary inspection: https://github.com/yapweijun1996/AI-Agent-Tools/actions/runs/34731128500.

## T-008 — In progress: release preparation

Goal: prepare a controlled first npm release without weakening the private-package accidental-publish guard or claiming external release evidence that has not been observed.

Work completed:

1. Add a root README with installation context, library/CLI usage, contract, limits, security boundary, exit semantics, and unreleased status.
2. Add a changelog policy that keeps the current work under `Unreleased` until registry and release readback agree.
3. Add ADR-0001 and a release runbook covering npm ownership, trusted publishing, tag/version identity, artifact readback, rollback, and credential handling.
4. Add a manual tag-bound GitHub Actions release workflow. It requires an existing `v<package.version>` tag, exact checked-out commit identity, `private: false`, the full suite, and a protected `npm-release` environment before npm publication.
5. Add exact repository and public npm registry/access metadata while retaining `private: true` on the current development line.
6. Extend the package audit to include README, CHANGELOG, declarations, source maps, exports/bin/package metadata, packed consumer import, CLI smoke, and stable dry-run tarball integrity.

Verification:

- npm registry lookup for `agent-error-lens` returned 404; `npm owner ls agent-error-lens` also returned 404; `npm whoami` returned 401, so npm ownership is not proven;
- read-only GitHub checks confirm `main` points at `f69167b` and the remote `release.yml` matches the local workflow; the `npm-release` environment and `main` branch protection are not configured, and no tags or GitHub releases exist;
- `npm run build` passes;
- `npm run check:package` passes with 73 files at the private boundary;
- `npm pack --dry-run --json --ignore-scripts` contains the required release files and returns stable `shasum`/`integrity` across repeated runs;
- release workflow markers and documentation checks pass locally;
- tag, release, registry artifact, registry integrity, `gitHead`, and publication remain unverified; external environment and npm trusted-publisher setup still require the release operator.

## Known gaps and defects

- README, CHANGELOG, ADR, release runbook, and release workflow are now implemented; the released artifact and external release readback remain absent.
- The historical company status dated 2026-09-07 remains evidence of its prior state, while the canonical company status item was synchronized in place on 2026-09-13 with `roadmap_state=queued`, `design_status=draft`, `development_status=complete`, `verification_status=verified`, `release_status=unreleased`, and `evidence_status=verified`. The current update references the exact-HEAD CI evidence and the final local implementation/contract commit; the ecosystem SSOT remains queued and no release claim was made.
- The earlier KB MVP envelope used a second top-level `diagnostics` collection. The current project report resolves this to `toolIssues`; implementation must follow the frozen Core SSOT.
- Existing fixed and secondary deterministic work budgets are frozen in the schema metadata and SPEC; bounded-core, approved-adapter, and complete M4 resource-limit enforcement are verified locally and in the exact-HEAD CI matrix.
- Node.js compatibility, module format, MIT license, package allowlist, release metadata, and pre-release package inspection are verified locally and the approved source/package matrix is verified in CI; npm ownership remains a release gate because the registry lookup is 404 and the npm session is unauthenticated.
- No browser/UI audit is applicable because this project has no user interface or running product.

## Definition of Done for any implementation task

An implementation task is complete only when:

- the smallest in-scope change is implemented;
- public contracts and architecture ownership remain consistent;
- targeted and affected regression checks pass;
- security, bounds, determinism, and failure cases are covered where applicable;
- package/runtime/release claims are verified at their own boundary;
- the final diff contains no unrelated work or secret material;
- `TASK.md`, `PROGRESS.md`, and affected Core SSOT documents are synchronized;
- a focused local commit is created; nothing is pushed or published without explicit authorization.
