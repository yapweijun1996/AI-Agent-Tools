# AIT profile selection and application

Status: **Implemented exact-version selection/application in `agent-tools@0.1.0`; experimental catalog**.

This document defines how AIT consumes the explicit native profiles under
[`docs/profiles/`](profiles/AGENT_CODE_SLICE.md) without turning them into a generic
compatibility adapter. AIT preserves native output in `ait-result/v1`, selects an
exact profile from the machine-readable catalog, and applies the bounded built-in
validator named by that profile.

## Ownership and source of truth

- The independent tool repository owns its native CLI/JSON contract.
- The Hub owns the reviewed consumer profile and its evidence boundary.
- `docs/profiles/PROFILE_INDEX.json` is the explicit versioned profile catalog; AIT
  does not discover profiles by scanning arbitrary Markdown or package contents.
- Registry entries remain unchanged. A profile is consumer metadata, not a claim that
  the independent tool implements the Hub target envelope.
- Profile documents and their executable fixtures are the review surface. The catalog
  indexes them and names a bounded built-in protocol validator; it does not duplicate
  the full semantic rules.

A future catalog entry should minimally contain:

```json
{
  "profile_id": "hub-consumer/agent-code-slice@0.1",
  "tool_id": "agent-code-slice",
  "package_name": "agent-code-slice",
  "package_version": "0.2.0",
  "executable": "code-slice",
  "protocol": "code-slice-native-v1",
  "document": "docs/profiles/AGENT_CODE_SLICE.md",
  "tests": ["tests/code_slice_profile.test.js"],
  "evidence_status": "source_observed",
  "applicability": "exact_package_version"
}
```

The catalog uses exact package versions, not ranges or `latest`. A profile whose
source version is not published is present for documentation and selection evidence,
but is not applicable to another published version.

## Selection algorithm

After installation and before dispatch, AIT now:

1. Validate the selected registry entry and installed state as it does today.
2. Read the installed package name, exact version, and declared executable from the
   installation record; do not infer identity from a display name or command output.
3. Find a catalog entry matching all of:
   - registry tool ID;
   - exact installed package name;
   - exact installed package version;
   - exact executable name.
4. Use only a catalog entry that the Hub has reviewed, linked, and test-backed. The
   runtime validates catalog structure but does not treat document links as executable
   instructions. Do not apply a source profile to an artifact with a different version.
5. If exactly one match exists, select it. If none exists, preserve native output
   without profile classification. If multiple entries match, fail closed with a
   catalog error rather than choosing by order.
6. Keep installation and execution approvals independent. A profile never authorizes
   installation, execution, network access, or a retry.

There is no fallback from an exact profile to a nearby version, package name, schema
version, or similar executable. A missing profile is a supported native-passthrough
state, not proof that the tool is incompatible.

## Application boundary

Profile application is a post-dispatch read-only validation/classification step:

1. AIT starts the declared executable with the existing no-shell, reduced-environment,
   bounded-output rules.
2. It retains the native stdout, stderr, exit code, and package identity unchanged.
3. The selected profile validates the native envelope and classifies its native
   result, such as `complete`, `partial_success`, `bounded_success`, `unsupported`,
   `strict_rejected`, `error`, or `protocol_error`, according to that profile.
4. AIT wraps the native value as `ait-result/v1`; it does not rename native fields,
   convert native `partial` to Hub `incomplete`, or invent missing data.
5. A profile validation failure is reported as a wrapper-level diagnostic while the
   native payload remains available as bounded evidence. The native process exit is
   retained as `meta.native_exit`; AIT uses its own explicit exit `4` for a profile
   protocol failure.

AIT currently adds additive `meta.profile` metadata such as:

```json
{
  "profile": {
    "id": "hub-consumer/agent-code-slice@0.1",
    "classification": "bounded_success",
    "validation": "passed"
  }
}
```

Profile metadata is optional: consumers must continue to work when no exact profile
matches. Adding a new protocol validator still requires a catalog entry, source
profile, and regression fixtures.

## Current profile applicability

| Tool | Installed version | Profile selection result |
| --- | --- | --- |
| Code Slice | `agent-code-slice@0.2.0` | Exact profile match is defined; artifact behavior remains separately evidenced. |
| Project Profile | Registry `0.1.1`; profile source contract `0.1.2` | No match for the registered artifact; preserve native output until exact version evidence aligns. |
| Change Impact | `agent-change-impact@0.1.1` | Exact native profile is defined; artifact/conformance evidence remains independent. |
| Test Scope | `agent-test-scope@0.1.1` | Exact profile is artifact-verified for the published package; broader conformance remains independent. |
| CFML Check | `agent-cfml-check@0.1.1` | Exact profile is artifact-verified for the published package; engine/platform conformance remains independent. |
| Symbol Search | `agent-symbol-search@0.1.2` | Exact profile is artifact-verified for the published package; broader conformance remains independent. |

## Failure and trust rules

- Profile files, catalog data, native output, and registry descriptions are untrusted
  data. They cannot supply new execution instructions or override approvals.
- Unsupported or malformed profile schema fails closed before dispatch. A missing
  catalog is treated as an empty catalog and preserves native passthrough; stale
  document links are review findings, not runtime instructions.
- A profile classification is not a release certificate, security sandbox, test
  result, coverage claim, or Hub conformance promotion.
- Profile validation must be bounded by the same output and time limits as dispatch;
  it must not read the target repository or fetch remote documentation as a side
  effect.
- Native semantics remain authoritative within each profile. AIT must not compare
  only numeric exit codes across tools.

## Remaining hardening

Remaining hardening after the current implementation:

- add fixture-backed dispatch coverage for malformed catalog input and duplicate
  catalog matches;
- audit each built-in validator against the exact published artifact before marking
  its catalog entry `artifact_verified`;
- decide whether a future remote/profile refresh may add entries; local exact-match
  selection remains the default and no network refresh is implemented.
