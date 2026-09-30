# Verification on 2026-09-30

Main pipeline: `npm run verify` exited 0 on macOS arm64 using the official checksum-verified Node **22.23.3** runtime. Build: 7 applicable packages passed, 3 had no build script. Typecheck: 8 passed, 2 had no script. Lint: 3 passed, 7 had no script. All 10 package tests passed: **380 tool tests**, plus **29 AIT/consumer tests** (409 Node tests total, zero failures/skips) and **7 Python validator tests**. Hub documents and registry checks passed. All ten package pack dry-runs passed. Final registry reconciliation adds Linkage and Project Tree for 17 entries; the 29 AIT tests, 7 Python tests, Hub validator and import hash check were rerun successfully after that change ([final Hub results](evidence/final-hub-results.json)). Test Scope release metadata validation and Symbol Search lint also passed after checker adaptations. Applicable/missing scripts are explicit in the [result JSON files](evidence/test-results.json); absence of a script is not reported as a test pass.

[Source manifest](SOURCE_MANIFEST.json) covers **716 original tracked paths**, with **698 imported files** and 18 reproducible CFML Check compiled outputs excluded. `python3 scripts/verify_migration.py` verifies every imported hash. All seven original MIT LICENSE files are byte-identical; Project Profile's manifest declares MIT but upstream has no LICENSE file. Private/no-license/UNLICENSED declarations remain intact.

## Baseline and corrections

All ten dependencies installed from their original lockfiles with scripts disabled. The initial baseline used actual Node 23.10.0: a Homebrew `node@22` alias unexpectedly resolved to Node 23, which was detected before final verification. Eight suites passed initially; Linkage's 18 failures were caused by macOS `/var` being a symlink in the default temp path, and Error Lens stopped at the unwritable default npm cache. Corrected canonical task-local temp/cache passed all 380 baseline tool tests. [Baseline](evidence/baseline-results.json) and [corrected environment results](evidence/baseline-corrected.json) preserve that distinction.

Error Lens's frozen package validator now accepts the monorepo repository URL/directory. Test Scope release metadata checks and Symbol Search repository/Git-path checks are similarly adapted; native engine/module/compiler/private fields are preserved. No analyzer behavior is changed. AIT's local `--from-path` npm installation now uses `--install-links` to copy the package inside AIT home rather than linking outside it. Existing containment checks reject escapes; the existing dispatch regression now additionally verifies a copied package. AIT native protocol/profile semantics and explicit install/execution approvals remain intact.

## Additional checks

- Code Slice: 23 golden cases, 6 CLI E2E tests, 8 grammar integrity checks passed.
- Project Profile: golden suite and clean packaged CLI JSON/version/help checks passed.
- Project Tree: native smoke passed.
- Test Scope: packaged tarball CLI/library smoke passed.
- Change Impact and Symbol Search: clean packaged CLI/library smoke passed; initial sandboxed installs failed DNS, then authorized network-enabled reruns passed ([results](evidence/smoke-final-results.json)).
- Root AIT: packed clean consumer `ait list --json` passed; no imported tool source was bundled ([result](evidence/root-pack-smoke.json)).
- All ten mirror-derived history bundles verify locally ([hashes](evidence/bundle-results.json)); bundles are not in public Git.
- Source credential-pattern scan: only the explicitly synthetic Error Lens EXAMPLE token fixture matched ([scan](evidence/secret-scan.json)); this heuristic does not prove absence of all secrets.

## Limits and release gates

No package publication, original-repository edits/deletion, PR merge, new tokens or production deployment occurred. Cross-platform Node 22/24 Actions jobs are configured but hosted results are not yet verified. CFML Linkage's optional native parser install/load is unverified; its 95 focused tests use bounded/fake parser coverage and do not certify native Fact coverage. The isolated bootstrap deliberately skips dependency lifecycle scripts. Project Profile's missing upstream MIT LICENSE file is preserved as a distribution gap.

Full package release-readiness suites, benchmarks and coverage thresholds are outside this source-location migration; published npm metadata, exact-version AIT profiles, existing release claims and native engine support are unchanged. Symbol Search's upstream documentation checker has a known engine/documentation discrepancy (the manifest allows Node 25 while its checker expects the narrower range) and is not part of the passing aggregate test claim. Package-local `.github` workflows are preserved historical configuration and do not execute from nested folders; the new root workflow verifies the monorepo and does not publish. npm trusted publishing and original release settings require a separate reviewed setup.

Deletion readiness remains gated by the [checklist](README.md#deletion-checklist), including durable private bundle copies, export of GitHub metadata/assets, fresh-head reconciliation and outstanding platform/native verification. Original immutable commit/CI evidence links remain dated historical dependencies, enumerated separately. Code migration cannot substitute for preserving those external records.
