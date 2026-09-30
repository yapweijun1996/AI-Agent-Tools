# agent-test-scope Design

| Field | Value |
|---|---|
| Status | Active — V0.1 implementation baseline |
| Architecture style | Deterministic local analysis |
| Runtime | Node.js / TypeScript |
| API model | Shared core behind CLI + library |

## 1. Purpose

Implement the normative behavior in `SPEC.md` while keeping the tool read-only, bounded, auditable, and composable with the wider AI-Agent-Tools ecosystem.

## 2. Architecture

```text
CLI / Library API
        ↓
Request Schema Validation
        ↓
Canonical Root + Security Boundary
        ↓
Project / Test Framework Discovery
        ↓
Changed File Normalization
        ↓
Test Discovery
        ↓
Static Relationship Engine
        ↓
External Evidence Adapters
        ↓
Evidence Normalizer
        ↓
Evidence Ranker
        ↓
Risk Classifier
        ↓
Verification Planner
        ↓
Command Generator
        ↓
Stable Versioned JSON Result
```

## 3. Suggested Repository Layout

```text
src/
  cli.ts
  index.ts
  types.ts

  core/
    discovery.ts
    paths.ts
    validation.ts
    frameworks.ts
    tests.ts
    imports.ts
    mapping.ts
    evidence.ts
    ranking.ts
    risk.ts
    planner.ts
    commands.ts
    engine.ts

  adapters/
    vitest.ts
    jest.ts
    node-test.ts

  integrations/
    project-profile.ts
    symbol-search.ts
    change-impact.ts

schemas/
fixtures/
test/
scripts/
skills/
```

The implemented V0.1 slice currently uses `src/core/{bounded-reader,discovery,engine,frameworks,imports,mapping,paths,planner,risk,validation}.ts`. Framework-specific behavior is represented as bounded metadata detection in `frameworks.ts`; it does not invoke framework runtimes. Static relationships are parsed from local ESM imports and literal CommonJS `require()` calls in `imports.ts`.

## 4. Shared Core

CLI and library APIs MUST call the same engine.

The CLI is responsible for argument parsing and JSON/stdout behavior only.

The core engine owns:

- validation;
- discovery;
- evidence;
- ranking;
- planning;
- diagnostics;
- stats.

This prevents CLI/library divergence.

## 5. Discovery Engine

Discovery should:

1. canonicalize the explicit root;
2. apply hard security boundaries;
3. load ignore rules safely;
4. enumerate candidate project/test/config files;
5. classify framework and package context;
6. record bounded discovery statistics.

No project source is executed or imported at runtime.

## 6. Framework Adapters

Each framework adapter owns only framework-specific evidence.

Example:

```text
Vitest adapter
- config detection
- package dependency detection
- test-file convention
- safe command construction

Jest adapter
- config detection
- package dependency detection
- test-file convention
- safe command construction

Node test adapter
- node:test import detection
- script detection
- command construction
```

Framework adapters should not own risk or ranking.

## 7. Test Mapping Engine

The mapper should produce raw evidence, not final recommendations.

Potential mapping strategies:

1. direct filename convention;
2. test imports changed file;
3. changed module reaches test through bounded static imports;
4. same feature/package relationship;
5. broad fallback.

The mapper should preserve all evidence used.

## 8. Static Relationship Engine

For V0.1, static import resolution should be deliberately bounded.

Goals:

- ESM imports;
- CommonJS `require` where statically resolvable;
- TypeScript path evidence where practical;
- repository-local relationships only.

Unsupported dynamic imports, computed requires, runtime module loaders, and monkey patching should produce partial/unknown semantics rather than invented reachability.

## 9. External Evidence Adapters

Optional adapters MAY consume versioned outputs from:

- `agent-project-profile`;
- `agent-symbol-search`;
- `agent-change-impact`.

Rules:

- validate producer identity/schema version;
- treat external evidence as evidence, not authority over local security boundaries;
- never require another Agent Tool for standalone V0.1 operation.

## 10. Evidence Normalization

Normalize all raw relationships into a stable internal form:

```ts
type Evidence = {
  type: string;
  source?: string;
  target?: string;
  confidence: "confirmed" | "strong" | "candidate" | "unknown";
  details?: Record<string, unknown>;
};
```

Normalization should make ranking independent from adapter implementation details.

## 11. Ranking

Ranking should be a pure deterministic function.

Suggested priority:

```text
direct explicit evidence
→ static dependency evidence
→ feature/package evidence
→ fallback evidence
→ normalized path
```

No random, time-based, or locale-dependent ordering.

## 12. Risk Classifier

Risk should use observable policy signals.

Suggested initial signal groups:

```text
LOW
- isolated source
- direct test
- no broad static consumers

MEDIUM
- shared/exported module
- several consumers
- multiple related tests

HIGH
- public/shared contract
- config or dependency boundary
- broad downstream impact

CRITICAL
- release/CI/package/security-sensitive files
- only when explicit deterministic policy says so

UNKNOWN
- evidence insufficient
```

Risk and confidence are separate concepts.

## 13. Verification Planner

Planner converts ranked evidence + risk into:

- targeted tests;
- package tests;
- typecheck;
- build;
- broader release checks.

Output levels:

```text
minimum
recommended
release
```

Planner should never mark a command as executed or passed.

## 14. Command Generator

Prefer commands discovered from repository metadata.

Example priority:

1. explicit package script;
2. framework-safe targeted invocation;
3. bounded fallback.

Commands must be emitted as structured data with provenance.

No shell execution occurs in analysis.

## 15. Security

Hard boundaries:

- canonical root containment;
- unsafe symlink rejection;
- secret-file exclusions;
- `.git` and `node_modules` exclusions;
- bounded configuration reads;
- repository-safe diagnostics;
- no subprocesses in the analysis engine;
- no network;
- no LLM.

## 16. Bounds

Initial defaults should mirror ecosystem expectations:

```text
10,000 files
2,000 test candidates
200 returned tests
2 MiB single file
100 MiB parsed bytes
5-second cooperative deadline
```

All bounds should be configurable internally and observable in result stats/truncation.

## 17. CLI

Examples:

```bash
agent-test-scope capabilities --root .
agent-test-scope discover --root .
agent-test-scope plan --root . --changed src/order/service.ts
```

Multiple changed files:

```bash
agent-test-scope plan   --root .   --changed src/a.ts   --changed src/b.ts
```

Optional stdin integration:

```bash
git diff --name-only | agent-test-scope plan --root . --changed-stdin
```

The CLI should not execute `git diff` itself in V0.1.

## 18. Library API

Suggested API:

```ts
getCapabilities(request)
discoverTests(request)
planTestScope(request)
explainRecommendation(request)
execute(request)
```

Operation-specific helpers should reject conflicting operation names.

## 19. Verification Architecture

Required test layers:

- schema/contract tests;
- framework fixtures;
- mapping fixtures;
- import-resolution fixtures;
- deterministic repeated-output tests;
- security/root/symlink tests;
- resource-limit tests;
- CLI/library parity;
- package tarball smoke test;
- documentation/capability consistency checks.

## 20. Packaging

Recommended release commands:

```text
npm run verify
npm run coverage
npm run schema:check
npm run smoke:pack
npm run capability:check
npm run benchmark:check
npm run docs:check
```

Suggested coverage gates:

```text
lines >= 85%
functions >= 80%
branches >= 75%
```

The repository provides schema, capability, documentation, coverage, benchmark, release-configuration, and packaged-artifact smoke scripts. `prepack` builds both the ESM and CommonJS library outputs under `dist/` before packaging, while `prepublishOnly` runs verification and release checks. CI and publishing use `npm ci` against a committed lockfile; the tarball smoke extracts the generated archive, validates both public library entrypoints, and invokes its packaged CLI. Clean-install execution is enforced locally and in CI as a release check.

## 21. Rejected Alternatives

Rejected for V0.1:

- LLM choosing tests;
- runtime execution;
- hidden full-suite fallback;
- mega-tool architecture;
- persistent repository database;
- dynamic runtime dependency tracing;
- arbitrary natural-language requests.

## 22. Key Technical Rule

> Produce evidence first; ranking, risk, and verification planning must be deterministic functions over that evidence.
