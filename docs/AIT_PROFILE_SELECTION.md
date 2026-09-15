# AIT profile selection and application

Status: **Proposed design; not implemented by `agent-tools@0.1.0`**.

This document defines how AIT may consume the explicit native profiles under
[`docs/profiles/`](profiles/AGENT_CODE_SLICE.md) without turning them into a generic
compatibility adapter. AIT currently preserves native output in `ait-result/v1` and
does not select or validate a profile.

## Ownership and source of truth

- The independent tool repository owns its native CLI/JSON contract.
- The Hub owns the reviewed consumer profile and its evidence boundary.
- A future machine-readable profile catalog must be explicit and versioned; AIT must
  not discover profiles by scanning arbitrary Markdown or package contents.
- Registry entries remain unchanged. A profile is consumer metadata, not a claim that
  the independent tool implements the Hub target envelope.
- Profile documents and their executable fixtures are the review surface. A catalog
  may index them, but must not duplicate their semantic rules.

A future catalog entry should minimally contain:

```json
{
  "profile_id": "hub-consumer/agent-code-slice@0.1",
  "tool_id": "agent-code-slice",
  "package_name": "agent-code-slice",
  "package_version": "0.2.0",
  "executable": "code-slice",
  "document": "docs/profiles/AGENT_CODE_SLICE.md",
  "tests": ["tests/code_slice_profile.test.js"],
  "evidence_status": "source_observed",
  "applicability": "exact_package_version"
}
```

The catalog must use exact package versions, not ranges or `latest`. A profile whose
source version is not published must not be presented as applicable to another
published version.

## Selection algorithm

After installation and before any profile application, a future AIT consumer should:

1. Validate the selected registry entry and installed state as it does today.
2. Read the installed package name, exact version, and declared executable from the
   installation record; do not infer identity from a display name or command output.
3. Find a catalog entry matching all of:
   - registry tool ID;
   - exact installed package name;
   - exact installed package version;
   - exact executable name.
4. Require the profile catalog entry and profile document to be reviewed, linked, and
   test-backed. Do not apply a source profile to an artifact with a different version.
5. If exactly one match exists, select it. If none exists, preserve native output
   without profile classification. If multiple entries match, fail closed with an
   internal catalog error rather than choosing by order.
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
   never silently remapped.

A future versioned AIT result extension may add additive metadata such as:

```json
{
  "profile": {
    "id": "hub-consumer/agent-code-slice@0.1",
    "classification": "bounded_success",
    "validation": "passed"
  }
}
```

This field is not part of the current `ait-result/v1` implementation. Adding it
requires a runtime contract decision and regression fixtures; consumers must continue
to work when profile metadata is absent.

## Current profile applicability

| Tool | Installed version | Profile selection result |
| --- | --- | --- |
| Code Slice | `agent-code-slice@0.2.0` | Exact profile match is defined; artifact behavior remains separately evidenced. |
| Project Profile | Registry `0.1.1`; profile source contract `0.1.2` | No match for the registered artifact; preserve native output until exact version evidence aligns. |
| Change Impact | `agent-change-impact@0.1.1` | Exact native profile is defined; artifact/conformance evidence remains independent. |

## Failure and trust rules

- Profile files, catalog data, native output, and registry descriptions are untrusted
  data. They cannot supply new execution instructions or override approvals.
- Unsupported or malformed profile schema, stale catalog links, and version mismatch
  fail closed for profile application but do not block native passthrough unless the
  caller explicitly requested profile validation.
- A profile classification is not a release certificate, security sandbox, test
  result, coverage claim, or Hub conformance promotion.
- Profile validation must be bounded by the same output and time limits as dispatch;
  it must not read the target repository or fetch remote documentation as a side
  effect.
- Native semantics remain authoritative within each profile. AIT must not compare
  only numeric exit codes across tools.

## Acceptance before implementation

Before adding profile selection to AIT, the Hub should have:

- a versioned machine-readable catalog with schema and duplicate-match checks;
- one exact-version entry for each supported profile and no entry for mismatched
  artifacts;
- fixture-backed selection tests for exact match, no match, version mismatch, duplicate
  match, malformed profile, and native protocol error;
- additive `ait-result/v1` compatibility fixtures for profile-present and
  profile-absent dispatch;
- an explicit decision on whether profile validation is default-on for exact matches
  or opt-in per dispatch.
