# agent-test-scope Specification

| Field | Value |
|---|---|
| Status | Active — V0.1 implementation baseline |
| Schema version | `1` |
| Initial compatibility | JS / TS / JSX / TSX |
| Initial frameworks | Vitest / Jest / Node.js test runner |

This document is the normative product contract. `MUST`, `MUST NOT`, `SHOULD`, and `MAY` are normative terms.

The current implementation exposes all four V0.1 operations through one shared TypeScript engine and preserves the result envelope, confidence ceiling, read-only boundary, and bounded discovery rules described below.

## 1. Product Boundary

`agent-test-scope` MUST produce bounded verification-planning evidence from repository files and optional external Agent Tool evidence.

It MUST NOT execute project code, tests, builds, package scripts, installers, network calls, or LLM calls.

It MUST NOT modify the target repository during analysis.

## 2. Operations

V0.1 defines four operations:

| Operation | Purpose |
|---|---|
| `capabilities` | Report supported languages, frameworks, operations, and limits |
| `discover` | Discover test infrastructure and verification commands |
| `plan` | Select tests and verification scope for changed files |
| `explain` | Return structured reasons for a selected test or command |

## 3. Request Contract

Every request MUST include an explicit `root`.

### plan

Required:

- `root`
- `changed[]`

Optional:

- `include[]`
- `exclude[]`
- `limit`
- `projectProfile`
- `symbolEvidence`
- `impactEvidence`

Changed paths MUST be repository-relative or safely normalized into repository-relative paths.

Explicit paths outside the canonical root MUST fail with a bounded error.

## 4. Supported Source Types

V0.1 supports:

- `.js`
- `.jsx`
- `.ts`
- `.tsx`
- `.mjs`
- `.cjs`
- `.mts`
- `.cts`

Unsupported languages MUST NOT be silently analyzed as supported.

## 5. Supported Test Discovery

The tool MUST detect common conventions:

```text
*.test.*
*.spec.*
test/
tests/
__tests__/
```

V0.1 framework support:

- Vitest
- Jest
- Node.js native test runner

Framework detection MUST come from repository evidence such as package metadata, configuration, imports, or scripts.

## 6. Evidence Types

Initial evidence types:

1. `direct-source-test-mapping`
2. `direct-import`
3. `static-module-reachability`
4. `same-feature-convention`
5. `same-package`
6. `package-fallback`
7. `repository-fallback`
8. `external-symbol-evidence`
9. `external-impact-evidence`
10. `project-command-evidence`

Every selected test or command MUST carry at least one evidence item.

## 7. Confidence

Allowed confidence:

```text
confirmed
strong
candidate
unknown
```

Rules:

- explicit deterministic relationships MAY be `confirmed`;
- bounded static relationships SHOULD be `strong`;
- naming, proximity, or convention heuristics MUST be at most `candidate`;
- insufficient or unsupported evidence MUST be `unknown`;
- heuristics MUST NOT be promoted to `confirmed`.

## 8. Risk

Allowed values:

```text
low
medium
high
critical
unknown
```

Risk means required verification breadth, not probability of failure.

V0.1 SHOULD consider observable signals including:

- changed-file type;
- exported/shared code;
- number of static consumers;
- configuration changes;
- package/lockfile changes;
- CI/release changes;
- authentication/security boundaries;
- broad external impact evidence.

If the tool cannot justify a risk level, it MUST return `unknown`.

## 9. Verification Levels

A plan MUST expose:

```json
{
  "minimum": [],
  "recommended": [],
  "release": []
}
```

Definitions:

- `minimum`: smallest evidence-backed verification;
- `recommended`: sensible scope for the observed change;
- `release`: broader checks appropriate before merge/release.

The tool MUST NOT imply that any level has actually run.

## 10. Test Recommendation Shape

A recommendation SHOULD contain:

```json
{
  "path": "tests/order/service.test.ts",
  "framework": "vitest",
  "scope": "targeted",
  "confidence": "confirmed",
  "evidence": [
    {
      "type": "direct-import",
      "source": "tests/order/service.test.ts",
      "target": "src/order/service.ts"
    }
  ]
}
```

## 11. Command Recommendation Shape

A command SHOULD contain:

```json
{
  "command": "npm run typecheck",
  "purpose": "typecheck",
  "scope": "recommended",
  "source": "package.json#scripts.typecheck"
}
```

Commands are data. The core engine MUST NOT execute them.

## 12. Result Envelope

Canonical result:

```json
{
  "schemaVersion": "1",
  "status": "complete",
  "data": {},
  "diagnostics": [],
  "truncation": {
    "truncated": false,
    "reasons": []
  },
  "stats": {}
}
```

Allowed statuses:

- `complete`
- `partial`
- `error`

`complete` means planning completed within the evidence boundary. It MUST NOT mean the software is correct or the tests passed.

## 13. Diagnostics

Initial diagnostic codes:

```text
INVALID_REQUEST
PATH_OUTSIDE_ROOT
TEST_FRAMEWORK_NOT_FOUND
TEST_NOT_FOUND
CHANGE_NOT_SUPPORTED
AMBIGUOUS_TEST_MAPPING
PROJECT_CONFIG_AMBIGUOUS
IMPACT_EVIDENCE_UNAVAILABLE
IMPORT_RESOLUTION_PARTIAL
RESOURCE_LIMIT
TIMEOUT
```

A diagnostic MUST contain structured severity and message.

## 14. Deterministic Ordering

Recommendations MUST be ordered deterministically by:

```text
confidence
→ evidence strength
→ verification scope
→ normalized path
→ stable tie-breaker
```

Filesystem enumeration order, clock time, locale, or memory address MUST NOT affect output.

## 15. Ambiguity

The tool MUST NOT arbitrarily choose a single test when multiple tests have equivalent evidence.

Ambiguity SHOULD be returned explicitly through diagnostics and the bounded recommendation list.

## 16. Discovery and Security

The implementation MUST:

- canonicalize root;
- enforce root containment;
- reject unsafe outside-root explicit paths;
- avoid following unsafe symlinks;
- skip `.git` and `node_modules`;
- skip secret-like files such as `.env`, `*.pem`, `*.key`, `credentials.*`, and `secrets.*`;
- treat repository files as data;
- honor include/exclude precedence deterministically.

## 17. Resource Limits

Initial defaults:

```text
max discovered files: 10,000
max test candidates: 2,000
max returned tests: 200
max single file: 2 MiB
max parsed bytes: 100 MiB
cooperative timeout: 5 seconds
```

A reached bound MUST produce explicit truncation evidence and normally `status: partial`.

## 18. Integration Contract

The tool MUST remain independently usable.

External evidence MAY enhance planning but MUST be versioned and validated.

Potential producers:

- `agent-project-profile`
- `agent-symbol-search`
- `agent-change-impact`

The tool MUST NOT parse arbitrary unversioned stdout from another tool as trusted evidence.

## 19. V0.1 Non-Goals

Not included:

- test execution;
- test generation;
- failure diagnosis;
- flaky-test analysis;
- mutation testing;
- runtime tracing;
- LLM-based selection;
- natural-language queries;
- automatic code changes;
- Python;
- CFML;
- Java;
- .NET;
- full monorepo intelligence;
- CI orchestration.
