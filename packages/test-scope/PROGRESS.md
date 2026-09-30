# agent-test-scope Progress

| Field | Current value |
|---|---|
| Overall | 100% of V0.1 release gates |
| Current phase | Phase 1 — Release Hardening |
| Current task | TS-070 — post-release verification for published `0.1.1` |
| Repository state | V0.1 implementation plus MIT licensing, committed npm lockfile, dependency-backed clean install, npm metadata, dual ESM/CommonJS outputs, prepack/publish gates, green Node 20/22 CI, configured npm Trusted Publishing, matching `v0.1.1` tag, published npm artifact with provenance, and registry-side agent pilot verification |
| Last verified release source commit | `455c3cc` — release source for `v0.1.1` |
| Blockers | None for the V0.1 release. P2 external evidence adapters, specific agent-host integrations, and routine post-release monitoring remain future work |
| Release readiness | `0.1.1` is published, latest, provenance-attested, dual-entrypoint verified, and pilot-verified |

## Capability Matrix

| Capability | Status |
|---|---|
| Goal / product boundary | DEFINED |
| Normative specification | DRAFT |
| Technical design | DRAFT |
| Package scaffold | PASS |
| Schema validation | PASS |
| Safe discovery | PASS |
| Vitest discovery | PASS |
| Jest discovery | PASS |
| Node test discovery | PASS |
| Direct test mapping | PASS |
| Static import evidence | PASS |
| Evidence ranking | PASS |
| Risk engine | PASS |
| Verification planner | PASS |
| CLI | PASS |
| Library API | PASS |
| Agent skill | PASS |
| Package smoke | PASS — extracted tarball ESM/CJS public-entrypoint smoke and clean install passed |
| Coverage gate | PASS |
| Benchmark | PASS |
| Release | PASS — `0.1.1` published through Trusted Publishing with provenance |

## Current Product Truth

Target V0.1:

```text
changed files
      ↓
safe project/test discovery
      ↓
static evidence
      ↓
test ranking
      ↓
risk
      ↓
minimum / recommended / release verification
      ↓
stable JSON
```

Supported target:

```text
JS / JSX / TS / TSX
Vitest / Jest / Node test
```

Core constraints:

```text
no LLM
no network
no test execution
no repository mutation
no hidden confidence
```

## Latest Evidence

The V0.1 runtime slice is implemented in `src/core/` with one shared CLI/library engine. It returns versioned JSON for all four operations and keeps commands as `executed: false` data. Ambiguous equally strong mappings are retained with an explicit warning, external impact-unavailable evidence is surfaced as `partial`, and the benchmark fixture verifies bounded discovery plus repeated-output equality.

TS-001 scaffold evidence now exists: package metadata, TypeScript configuration, CLI/library entrypoint declarations, package hygiene files, and design-specified directories. JSON parsing, scaffold-path assertions, whitespace validation, deterministic enumeration, and `npm pack --dry-run --json` passed.

Runtime evidence: the dependency-backed `npm ci`, declared `npm run verify`, 17 native tests, coverage (92.44% lines, 80.35% branches, 95.96% functions), schema, capability, extracted-tarball ESM/CJS smoke, benchmark, documentation, release, and both audit modes pass locally. GitHub Actions run `34695091122` completed the release workflow successfully, including `npm publish --provenance --access public`. npm now reports `agent-test-scope@0.1.1` as `latest`, with 88 files, dual ESM/CommonJS outputs, and a SLSA provenance attestation. The downloaded registry artifact passed ESM package import, CommonJS package require, CLI execution, and `scripts/pilot-published.mjs`; the Skill loaded, `capabilities/discover/plan` returned bounded results, commands stayed `executed: false`, and the fixture was byte-for-byte unchanged. Release hardening includes `prepack`, `prepublishOnly`, npm metadata, locked CI, a fail-closed release check, dual ESM/CommonJS entrypoints, and tag-triggered Trusted Publishing configuration.

## Next Best Move

The next move is normal post-release monitoring and adoption feedback. Future releases should use a new semver version, matching tag, green CI, and the existing Trusted Publishing workflow. The controlled pilot is sufficient for the package boundary; it is not evidence of model quality or a specific agent host's sandbox behavior.

Avoid implementing framework logic before the request/result envelope and safety boundaries exist.

## Known Risks

1. The package has no runtime dependencies, but release correctness still depends on the candidate's clean install and CI environment.
   - Mitigation: the committed lockfile, local `npm ci`, and full local gates pass; repeat them in the candidate GitHub run.

2. Test selection can easily become heuristic-heavy.
   - Mitigation: evidence classes + strict confidence ceiling.

3. Monorepo ambiguity may cause unsafe broad claims.
   - Mitigation: single-package full support first; ambiguous workspace behavior becomes partial/error.

4. Static imports cannot prove runtime behavior.
   - Mitigation: explicit partial/unknown semantics.

5. Command generation could be confused with execution.
   - Mitigation: commands are structured data only.

## Completion Evidence Required

Before V0.1 can be called complete:

```text
npm run verify
npm run coverage
npm run schema:check
npm run smoke:pack
npm run capability:check
npm run benchmark:check
npm run docs:check
npm run release:check
npm audit
```

All applicable checks must pass from the actual repository/package artifact.

For the implemented slice and published `0.1.1`, direct ESM/CJS typecheck, 17 runtime tests, schema check, capability check, extracted tarball CLI/library smoke, coverage thresholds, benchmark bound, docs check, deterministic repeated output, root/symlink/secret/resource fixtures, CLI/library parity, committed-lockfile `npm ci`, dependency-complete `npm run verify`, `npm audit`, release configuration checks, and the tag-triggered publish workflow passed. GitHub Actions run `34695091122` published `0.1.1` via Trusted Publishing with provenance. The registry-side `0.1.1` ESM/CJS/CLI smoke and host-like pilot passed.

## Progress Update Rule

Update this file after every coherent verified task slice.

Record:

- actual current task;
- actual pass/fail evidence;
- current repository state;
- last verified commit;
- blockers;
- next best move.

Do not copy the entire task history here. `TASK.md` owns the work inventory.
